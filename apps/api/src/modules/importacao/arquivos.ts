// PDFs da carteira no servidor: gravação dos lotes enviados (zip ou PDFs soltos) em STORAGE_DIR
// e resolução "PDF do extrator -> arquivo no armazenamento" usada pela importação dos JSON.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { prisma } from "../../lib/prisma";
import { resolveStoragePath } from "../../lib/storage";
import { sha256 } from "../../lib/crypto";
import { storageRoot } from "../../config/env";
import { looseKey, relFromExtractorPath, type ExtractedPolicy, type FileResolver } from "./carteira";

/** Índice "nome do arquivo -> caminho" do último policies.json recebido (para PDFs soltos). */
const INDEX_REL = "_import/indice-pdfs.json";
const SKIP_DIRS = new Set(["_uploads", "_import", "_avatars"]);

export function sha256File(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(abs)
      .on("data", (c) => h.update(c))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

/** Lista recursiva dos arquivos sob STORAGE_DIR (relativos, com "/"), sem as pastas internas. */
async function walk(dir = "", out: string[] = []): Promise<string[]> {
  const entries = await readdir(path.join(storageRoot, dir), { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!dir && SKIP_DIRS.has(e.name)) continue;
      await walk(rel, out);
    } else if (e.isFile() && /\.pdf$/i.test(e.name)) out.push(rel);
  }
  return out;
}

/**
 * Resolve o PDF do extrator para um arquivo já presente em STORAGE_DIR: primeiro pelo caminho
 * exato (base/seguradora/...), depois por uma chave tolerante a acentos/encoding.
 */
export async function storageResolver(): Promise<FileResolver> {
  let loose: Map<string, string | null> | null = null;
  const looseIndex = async () => {
    if (loose) return loose;
    loose = new Map();
    for (const rel of await walk()) {
      const k = looseKey(rel);
      loose.set(k, loose.has(k) ? null : rel); // null = ambíguo
    }
    return loose;
  };
  return async (p: ExtractedPolicy) => {
    let rel = relFromExtractorPath(p);
    let abs = resolveStoragePath(rel);
    let st = await stat(abs).catch(() => null);
    if (!st?.isFile()) {
      const alt = (await looseIndex()).get(looseKey(rel));
      if (!alt) return null;
      rel = alt;
      abs = resolveStoragePath(rel);
      st = await stat(abs).catch(() => null);
      if (!st?.isFile()) return null;
    }
    const size = st.size;
    return { rel, size, hash: () => sha256File(abs) };
  };
}

/** Guarda o índice de nomes de arquivo do policies.json (para casar PDFs enviados soltos). */
export async function saveFileIndex(policies: ExtractedPolicy[]): Promise<void> {
  const byName: Record<string, string[]> = {};
  for (const p of policies) {
    const rel = relFromExtractorPath(p);
    const k = looseKey(path.posix.basename(rel));
    (byName[k] ??= []).push(rel);
  }
  const abs = resolveStoragePath(INDEX_REL);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(byName));
}

async function loadFileIndex(): Promise<Record<string, string[]> | null> {
  try {
    return JSON.parse(await readFile(resolveStoragePath(INDEX_REL), "utf8")) as Record<string, string[]>;
  } catch {
    return null;
  }
}

/**
 * Caminho dentro do zip -> relativo a base/seguradora. Aceita zips com ou sem as pastas
 * "base/seguradora/" no início. Recusa caminhos absolutos e "..".
 */
export function relFromZipEntry(name: string): string | null {
  const parts = name.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..") || /^[a-z]:$/i.test(parts[0] ?? "")) return null;
  const i = parts.findIndex((s) => s.toLowerCase() === "seguradora");
  const rest = i >= 0 && i < 2 ? parts.slice(i + 1) : parts;
  if (rest.length < 2) return null; // precisa ao menos <cliente>/<arquivo>.pdf
  return rest.join("/");
}

export interface PdfBatchStats {
  recebidos: number;
  gravados: number;
  iguais: number;
  substituidos: number;
  semDestino: number;
  invalidos: number;
}

export function emptyBatchStats(): PdfBatchStats {
  return { recebidos: 0, gravados: 0, iguais: 0, substituidos: 0, semDestino: 0, invalidos: 0 };
}

const isPdf = (b: Uint8Array) => b.length > 5 && Buffer.from(b.subarray(0, 5)).toString("latin1") === "%PDF-";

async function storePdf(rel: string, buf: Buffer, s: PdfBatchStats) {
  s.recebidos++;
  if (!/\.pdf$/i.test(rel) || !isPdf(buf)) {
    s.invalidos++;
    return;
  }
  const abs = resolveStoragePath(rel);
  const hash = sha256(buf);
  const atual = await stat(abs).catch(() => null);
  if (atual?.isFile()) {
    if (atual.size === buf.length && (await sha256File(abs)) === hash) {
      s.iguais++;
      return;
    }
    s.substituidos++;
    // Documento já importado com esse caminho passa a apontar para o conteúdo novo.
    await prisma.document.updateMany({ where: { caminho: rel }, data: { hash, tamanho: buf.length } });
  } else {
    s.gravados++;
  }
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
}

/** Zip com a pasta base/seguradora (ou parte dela): grava cada PDF no caminho equivalente. */
export async function storeZip(buf: Buffer, s: PdfBatchStats): Promise<void> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf), { filter: (f) => /\.pdf$/i.test(f.name) && !f.name.startsWith("__MACOSX/") });
  } catch {
    throw new Error("Arquivo .zip inválido ou corrompido");
  }
  for (const [name, data] of Object.entries(files)) {
    const rel = relFromZipEntry(name);
    if (!rel) {
      s.recebidos++;
      s.semDestino++;
      continue;
    }
    await storePdf(rel, Buffer.from(data.buffer, data.byteOffset, data.byteLength), s);
  }
}

/**
 * PDF solto: o navegador só manda o nome. Se vier com pastas (seleção de pasta), usa o caminho;
 * senão procura o nome no índice do último policies.json (precisa ser único).
 */
export async function storeLoosePdf(filename: string, buf: Buffer, s: PdfBatchStats, index?: Record<string, string[]> | null): Promise<void> {
  const viaPasta = relFromZipEntry(filename);
  if (viaPasta) return storePdf(viaPasta, buf, s);
  const idx = index ?? (await loadFileIndex());
  const hits = idx?.[looseKey(path.posix.basename(filename.replace(/\\/g, "/")))] ?? [];
  if (hits.length !== 1) {
    s.recebidos++;
    s.semDestino++;
    return;
  }
  return storePdf(hits[0]!, buf, s);
}

export async function clearFileIndex(): Promise<void> {
  await rm(resolveStoragePath(INDEX_REL), { force: true });
}

export { loadFileIndex };
