// Armazenamento de arquivos (PDFs) em disco, sob STORAGE_DIR.
// No banco guardamos o caminho RELATIVO; aqui resolvemos e bloqueamos path traversal.
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { storageRoot } from "../config/env";
import { AppError } from "./errors";
import { sha256 } from "./crypto";

export function resolveStoragePath(relative: string): string {
  const abs = path.resolve(storageRoot, relative);
  const rel = path.relative(storageRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AppError(400, "INVALID_PATH", "Caminho de arquivo fora do armazenamento");
  }
  return abs;
}

/** Converte caminho absoluto (ex.: importação) para relativo a STORAGE_DIR, com "/" como separador. */
export function toStorageRelative(absPath: string): string {
  const rel = path.relative(storageRoot, path.resolve(absPath));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new AppError(400, "INVALID_PATH", `Arquivo fora de STORAGE_DIR: ${path.basename(absPath)}`);
  }
  return rel.split(path.sep).join("/");
}

/** Grava um upload em _uploads/aaaa/mm/<hash>.pdf (nome por hash = dedupe natural). */
export async function saveUpload(buf: Buffer, ext = ".pdf"): Promise<{ caminho: string; hash: string; tamanho: number }> {
  const hash = sha256(buf);
  const now = new Date();
  const dir = path.posix.join("_uploads", String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const caminho = path.posix.join(dir, `${hash}${ext}`);
  await mkdir(resolveStoragePath(dir), { recursive: true });
  await writeFile(resolveStoragePath(caminho), buf);
  return { caminho, hash, tamanho: buf.length };
}

export async function openStorageFile(relative: string) {
  const abs = resolveStoragePath(relative);
  const st = await stat(abs).catch(() => null);
  if (!st?.isFile()) throw new AppError(404, "FILE_NOT_FOUND", "Arquivo não encontrado no armazenamento");
  return { stream: createReadStream(abs), size: st.size };
}

/** PDFs começam com "%PDF-". Checamos o conteúdo, não só a extensão/MIME declarados. */
export function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString("latin1") === "%PDF-";
}
