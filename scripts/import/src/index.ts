// Importação da carteira a partir da saída do extrator (../_dados/clients.json + policies.json).
//
//   pnpm import:carteira            (raiz do monorepo)
//   pnpm --filter @ss/import dry-run   -> só valida e conta, não grava
//   opções: --dados <pasta>  (padrão: ../_dados ao lado de app/)
//
// Regras:
// - PDFs NÃO são copiados: o Document guarda o caminho RELATIVO a STORAGE_DIR (a pasta
//   base/seguradora). Arquivo fora de STORAGE_DIR é ignorado e contado.
// - Idempotente: reexecutar não duplica (cliente por CPF/CNPJ, documento por caminho,
//   apólice por seguradora+número dentro do cliente).
// - Parcelas com vencimento no passado entram como PAGO (premissa: carteira histórica;
//   o status real só é conhecido via conector/baixa manual). Futuras entram PENDENTE.
// - Endosso, carta verde, CRLV, CNH etc. viram só Document (não somam prêmio).
// - O relatório final traz apenas contagens (nada de nome/CPF/telefone no console).
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocumentTipo, FormaPagamento, Prisma } from "@prisma/client";
import { isValidCpfCnpj, onlyDigits } from "@ss/shared";
import { prisma } from "../../../apps/api/src/lib/prisma";
import { storageRoot } from "../../../apps/api/src/config/env";
import { dateOnly, todayIso } from "../../../apps/api/src/lib/dates";
import { resolveInsurerSlug } from "../../../apps/api/src/connectors/catalog";
import { recalcAllStatuses } from "../../../apps/api/src/modules/policies/rules";

// ------------------------------------------------------------------ formato do extrator
interface ExtractedPolicy {
  arquivo: string;
  cliente_pasta: string;
  tipo_documento: string | null;
  status_texto?: string;
  seguradora: string | null;
  ramo: string | null;
  numero_apolice: string | null;
  proposta: string | null;
  data_emissao: string | null;
  inicio_vigencia: string | null;
  fim_vigencia: string | null;
  premio_total: number | null;
  forma_pagamento: string | null;
  parcelas: Array<{ parcela: number; valor: number | null; vencimento: string | null }> | null;
  placa: string | null;
  chassi: string | null;
  veiculo: string | null;
  ano_modelo: string | null;
  pasta_vencidas?: boolean;
  confianca?: Record<string, unknown>;
  avisos?: string[];
}

interface ExtractedClient {
  cliente: string;
  nome_segurado: string | null;
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  cnh: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}

const FORMA: Record<string, FormaPagamento> = { cartao: "CARTAO", boleto: "BOLETO", debito: "DEBITO", carne: "CARNE", pix: "PIX", a_vista: "OUTRO" };
const DOC_TIPO: Record<string, DocumentTipo> = { apolice: "APOLICE", endosso: "ENDOSSO", proposta: "PROPOSTA", boleto: "BOLETO" };
const isIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function telefone(v: string | null): string | null {
  if (!v) return null;
  let d = onlyDigits(v);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

function sha256File(p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(p).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

function relToStorage(abs: string): string | null {
  const rel = path.relative(storageRoot, path.resolve(abs));
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel.split(path.sep).join("/");
}

const stats = {
  clientesLidos: 0,
  clientesCriados: 0,
  clientesAtualizados: 0,
  clientesSemCpf: 0,
  apolicesCriadas: 0,
  apolicesDuplicadas: 0,
  apolicesSemSeguradora: 0,
  documentosCriados: 0,
  documentosJaExistentes: 0,
  arquivosForaDoStorage: 0,
  arquivosInexistentes: 0,
  parcelas: 0,
  itens: 0,
};
const seguradorasNaoMapeadas = new Map<string, number>();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dadosDir = path.resolve(arg("--dados") ?? path.resolve(here, "../../../../_dados"));
  const clients = JSON.parse(await readFile(path.join(dadosDir, "clients.json"), "utf8")) as ExtractedClient[];
  const policies = JSON.parse(await readFile(path.join(dadosDir, "policies.json"), "utf8")) as ExtractedPolicy[];
  console.log(`Lidos: ${clients.length} clientes, ${policies.length} PDFs. STORAGE_DIR=${storageRoot}${dryRun ? " (dry-run)" : ""}`);

  const insurers = new Map((await prisma.insurer.findMany({ select: { id: true, slug: true } })).map((i) => [i.slug, i.id]));
  if (!insurers.size) throw new Error("Nenhuma seguradora no banco: rode o seed antes (pnpm db:seed)");

  const byPasta = new Map<string, ExtractedPolicy[]>();
  for (const p of policies) byPasta.set(p.cliente_pasta, [...(byPasta.get(p.cliente_pasta) ?? []), p]);
  const today = todayIso();

  for (const c of clients) {
    stats.clientesLidos++;
    const cpf = c.cpf_cnpj ? onlyDigits(c.cpf_cnpj) : "";
    if (!cpf || !isValidCpfCnpj(cpf)) {
      stats.clientesSemCpf++;
      continue;
    }
    const endereco = c.endereco || c.cidade || c.cep ? { logradouro: c.endereco, bairro: c.bairro, cidade: c.cidade, uf: c.uf, cep: c.cep } : null;
    const dados = {
      nome: (c.nome_segurado ?? c.cliente).trim(),
      nascimento: isIso(c.data_nascimento) ? dateOnly(c.data_nascimento) : null,
      cnh: c.cnh,
      telefone: telefone(c.telefone),
      email: c.email?.toLowerCase() ?? null,
      endereco: endereco as Prisma.InputJsonValue | undefined,
    };
    if (dryRun) {
      stats.apolicesCriadas += (byPasta.get(c.cliente) ?? []).filter((p) => p.tipo_documento === "apolice" || p.tipo_documento === "proposta").length;
      continue;
    }

    // Cliente: cria ou completa só campos vazios (não sobrescreve correção manual).
    let client = await prisma.client.findUnique({ where: { cpfCnpj: cpf } });
    if (!client) {
      client = await prisma.client.create({ data: { ...dados, endereco: dados.endereco ?? undefined, cpfCnpj: cpf, origem: "IMPORTACAO" } });
      stats.clientesCriados++;
    } else {
      const patch: Prisma.ClientUpdateInput = {};
      for (const k of ["nascimento", "cnh", "telefone", "email"] as const) if (!client[k] && dados[k]) patch[k] = dados[k] as never;
      if (!client.endereco && dados.endereco) patch.endereco = dados.endereco;
      if (Object.keys(patch).length) {
        await prisma.client.update({ where: { id: client.id }, data: patch });
        stats.clientesAtualizados++;
      }
    }

    // Apólices mais recentes primeiro: em duplicata (mesma seguradora+número), fica a mais nova.
    const pdfs = [...(byPasta.get(c.cliente) ?? [])].sort((a, b) =>
      (b.data_emissao ?? b.inicio_vigencia ?? b.fim_vigencia ?? "").localeCompare(a.data_emissao ?? a.inicio_vigencia ?? a.fim_vigencia ?? ""),
    );
    for (const p of pdfs) await importPdf(client.id, p, insurers, today);
  }

  if (!dryRun) {
    const st = await recalcAllStatuses();
    console.log(`Status recalculado: ${JSON.stringify(st)}`);
  }
  console.log("Resumo:", JSON.stringify(stats, null, 1));
  if (seguradorasNaoMapeadas.size) console.log("Seguradoras não mapeadas:", Object.fromEntries(seguradorasNaoMapeadas));
}

async function importPdf(clientId: string, p: ExtractedPolicy, insurers: Map<string, string>, today: string) {
  const rel = relToStorage(p.arquivo);
  if (!rel) {
    stats.arquivosForaDoStorage++;
    return;
  }
  if (await prisma.document.findFirst({ where: { caminho: rel }, select: { id: true } })) {
    stats.documentosJaExistentes++;
    return;
  }
  const st = await stat(p.arquivo).catch(() => null);
  if (!st?.isFile()) {
    stats.arquivosInexistentes++;
    return;
  }
  const tipoDoc = DOC_TIPO[p.tipo_documento ?? ""] ?? "OUTRO";
  const doc = await prisma.document.create({
    data: {
      clientId,
      tipo: tipoDoc,
      nomeArquivo: path.basename(p.arquivo),
      caminho: rel,
      hash: await sha256File(p.arquivo),
      tamanho: st.size,
      extraido: p as unknown as Prisma.InputJsonValue,
      confianca: (p.confianca ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  stats.documentosCriados++;

  const slug = resolveInsurerSlug(p.seguradora);
  const insurerId = slug ? insurers.get(slug) : undefined;

  // Endosso: anexa à apólice de mesmo número, sem criar nova apólice.
  if (tipoDoc === "ENDOSSO") {
    if (insurerId && p.numero_apolice) {
      const pol = await prisma.policy.findFirst({ where: { clientId, insurerId, numero: p.numero_apolice }, select: { id: true } });
      if (pol) await prisma.document.update({ where: { id: doc.id }, data: { policyId: pol.id } });
    }
    return;
  }
  if (tipoDoc !== "APOLICE" && tipoDoc !== "PROPOSTA") return;
  if (!insurerId) {
    stats.apolicesSemSeguradora++;
    const k = p.seguradora ?? "(vazia)";
    seguradorasNaoMapeadas.set(k, (seguradorasNaoMapeadas.get(k) ?? 0) + 1);
    return;
  }
  if (p.numero_apolice) {
    const dup = await prisma.policy.findFirst({ where: { clientId, insurerId, numero: p.numero_apolice }, select: { id: true } });
    if (dup) {
      // Mesma apólice em outro PDF (cópia/2ª via): guarda o arquivo ligado a ela.
      await prisma.document.update({ where: { id: doc.id }, data: { policyId: dup.id } });
      stats.apolicesDuplicadas++;
      return;
    }
  }
  const fim = isIso(p.fim_vigencia) ? p.fim_vigencia : null;
  const vencida = fim ? fim < today : Boolean(p.pasta_vencidas);
  const seen = new Set<number>();
  const parcelas = (p.parcelas ?? []).filter((x) => x.parcela >= 1 && isIso(x.vencimento) && !seen.has(x.parcela) && seen.add(x.parcela));
  const temItem = Boolean(p.placa || p.chassi || p.veiculo);

  const policy = await prisma.policy.create({
    data: {
      clientId,
      insurerId,
      ramo: p.ramo ?? "outros",
      numero: p.numero_apolice,
      proposta: p.proposta,
      emissao: isIso(p.data_emissao) ? dateOnly(p.data_emissao) : null,
      inicioVigencia: isIso(p.inicio_vigencia) ? dateOnly(p.inicio_vigencia) : null,
      fimVigencia: fim ? dateOnly(fim) : null,
      premioTotal: p.premio_total ?? null,
      formaPagamento: FORMA[p.forma_pagamento ?? ""] ?? "OUTRO",
      status: tipoDoc === "PROPOSTA" && !vencida ? "EM_EMISSAO" : vencida ? "VENCIDA" : "VIGENTE",
      documentId: doc.id,
      installments: {
        create: parcelas.map((x) => ({
          numero: x.parcela,
          valor: x.valor,
          vencimento: dateOnly(x.vencimento!),
          status: x.vencimento! < today ? "PAGO" : "PENDENTE",
        })),
      },
      items: temItem
        ? { create: { tipo: "VEICULO", placa: p.placa?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null, chassi: p.chassi, modelo: p.veiculo, ano: p.ano_modelo } }
        : undefined,
    },
  });
  await prisma.document.update({ where: { id: doc.id }, data: { policyId: policy.id } });
  stats.apolicesCriadas++;
  stats.parcelas += parcelas.length;
  if (temItem) stats.itens++;
}

main()
  .catch((err) => {
    console.error("Falha na importação:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
