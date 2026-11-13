// Importação da carteira a partir da saída do extrator (clients.json + policies.json).
// Usada pelo script (scripts/import, lendo os PDFs direto do disco) e pela tela
// Configurações > Importar carteira (PDFs enviados antes para STORAGE_DIR).
//
// Regras (iguais às do script original):
// - Idempotente: cliente pela PASTA da base (nome da pasta = nome do cliente; o CPF/CNPJ pode
//   repetir entre pastas, ex.: esposa com apólice no CPF do marido), upsert que só completa campos vazios, documento por
//   caminho (ou mesmo hash no mesmo cliente), apólice por seguradora+número dentro do cliente.
// - PDF sem arquivo disponível é pulado e contado; reimportar depois vincula os que chegaram.
// - Parcelas vencidas entram como PAGO (carteira histórica), futuras como PENDENTE.
// - Endosso vira Document ligado à apólice (número > chassi > placa); sem apólice na pasta, a apólice
//   é criada a partir do endosso. Endosso de cancelamento marca a apólice como CANCELADA.
// - Reimportar corrige o que já entrou: liga endossos soltos, refaz número truncado e seguradora.
// - Carta verde, CRLV, CNH etc. só Document.
// - Ao final recalcula ATIVO/INATIVO de todos os clientes.
// - O relatório traz só contagens (nada de nome/CPF/telefone).
import path from "node:path";
import { z } from "zod";
import type { DocumentTipo, FormaPagamento, Prisma } from "@prisma/client";
import { isValidCpfCnpj, onlyDigits } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { dateOnly, todayIso } from "../../lib/dates";
import { resolveInsurerSlug } from "../../connectors/catalog";
import { recalcAllStatuses } from "../policies/rules";
import { findPolicyForDocument, samePolicyNumber } from "../policies/match";

// ------------------------------------------------------------------ formato do extrator
const isoOrNull = z.string().nullable().optional();
export const ExtractedPolicySchema = z
  .object({
    arquivo: z.string().min(1),
    cliente_pasta: z.string().min(1),
    tipo_documento: z.string().nullable().optional(),
    seguradora: z.string().nullable().optional(),
    ramo: z.string().nullable().optional(),
    numero_apolice: z.string().nullable().optional(),
    proposta: z.string().nullable().optional(),
    data_emissao: isoOrNull,
    inicio_vigencia: isoOrNull,
    fim_vigencia: isoOrNull,
    premio_total: z.number().nullable().optional(),
    forma_pagamento: z.string().nullable().optional(),
    parcelas: z
      .array(z.object({ parcela: z.number(), valor: z.number().nullable().optional(), vencimento: z.string().nullable().optional() }).passthrough())
      .nullable()
      .optional(),
    placa: z.string().nullable().optional(),
    chassi: z.string().nullable().optional(),
    veiculo: z.string().nullable().optional(),
    ano_modelo: z.union([z.string(), z.number()]).nullable().optional(),
    pasta_vencidas: z.boolean().nullable().optional(),
    confianca: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();
export type ExtractedPolicy = z.infer<typeof ExtractedPolicySchema>;

export const ExtractedClientSchema = z
  .object({
    cliente: z.string().min(1),
    nome_segurado: z.string().nullable().optional(),
    cpf_cnpj: z.string().nullable().optional(),
    data_nascimento: z.string().nullable().optional(),
    cnh: z.string().nullable().optional(),
    telefone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    endereco: z.string().nullable().optional(),
    bairro: z.string().nullable().optional(),
    cidade: z.string().nullable().optional(),
    uf: z.string().nullable().optional(),
    cep: z.string().nullable().optional(),
  })
  .passthrough();
export type ExtractedClient = z.infer<typeof ExtractedClientSchema>;

export const CarteiraSchema = z.object({
  clients: z.array(ExtractedClientSchema).min(1, "clients.json vazio"),
  policies: z.array(ExtractedPolicySchema),
});

/** Arquivo do PDF já disponível: caminho relativo a STORAGE_DIR, hash e tamanho. */
export interface ResolvedFile {
  rel: string;
  hash: () => Promise<string>;
  size: number;
}
/** null = arquivo ainda não está no armazenamento; "fora" = caminho fora de STORAGE_DIR. */
export type FileResolver = (p: ExtractedPolicy) => Promise<ResolvedFile | null | "fora">;

export interface ImportStats {
  clientesLidos: number;
  clientesCriados: number;
  clientesAtualizados: number;
  clientesSemCpf: number;
  apolicesCriadas: number;
  apolicesDuplicadas: number;
  apolicesSemSeguradora: number;
  /** Reimportação: apólices com número/seguradora corrigidos pela nova leitura. */
  apolicesCorrigidas: number;
  /** Endossos ligados a uma apólice (ou que viraram a apólice, quando ela não estava na pasta). */
  endossosVinculados: number;
  endossosSemApolice: number;
  apolicesCanceladas: number;
  documentosCriados: number;
  documentosJaExistentes: number;
  arquivosForaDoStorage: number;
  arquivosInexistentes: number;
  parcelas: number;
  itens: number;
}

export interface ImportResult {
  stats: ImportStats;
  seguradorasNaoMapeadas: Record<string, number>;
  status?: { ativos: number; inativos: number } | Record<string, number>;
  dryRun: boolean;
}

const FORMA: Record<string, FormaPagamento> = { cartao: "CARTAO", boleto: "BOLETO", debito: "DEBITO", carne: "CARNE", pix: "PIX", a_vista: "OUTRO" };
const DOC_TIPO: Record<string, DocumentTipo> = { apolice: "APOLICE", endosso: "ENDOSSO", proposta: "PROPOSTA", boleto: "BOLETO" };
const isIso = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function telefone(v: string | null | undefined): string | null {
  if (!v) return null;
  let d = onlyDigits(v);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/**
 * Caminho do PDF relativo à pasta base/seguradora, a partir do caminho absoluto que o extrator
 * gravou (máquina Windows do corretor). Ex.: "C:\...\base\seguradora\Cliente\Vencidas\x.pdf"
 * -> "Cliente/Vencidas/x.pdf". Sem o marcador, usa "<cliente_pasta>/<arquivo>".
 */
export function relFromExtractorPath(p: Pick<ExtractedPolicy, "arquivo" | "cliente_pasta">): string {
  const norm = p.arquivo.replace(/\\/g, "/");
  const m = /(?:^|\/)(?:seguradora|baseAtualizada)\/(.+)$/i.exec(norm);
  const rel = m?.[1] ?? `${p.cliente_pasta}/${path.posix.basename(norm)}`;
  return rel
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

/**
 * Chave tolerante para casar nomes vindos de máquinas/encodings diferentes (o extrator às vezes
 * grava "�" no lugar de letras acentuadas): minúsculas, só [a-z0-9/.].
 */
export function looseKey(rel: string): string {
  return rel.normalize("NFC").toLowerCase().replace(/[^a-z0-9/.]/g, "");
}

function emptyStats(): ImportStats {
  return {
    clientesLidos: 0,
    clientesCriados: 0,
    clientesAtualizados: 0,
    clientesSemCpf: 0,
    apolicesCriadas: 0,
    apolicesDuplicadas: 0,
    apolicesSemSeguradora: 0,
    apolicesCorrigidas: 0,
    endossosVinculados: 0,
    endossosSemApolice: 0,
    apolicesCanceladas: 0,
    documentosCriados: 0,
    documentosJaExistentes: 0,
    arquivosForaDoStorage: 0,
    arquivosInexistentes: 0,
    parcelas: 0,
    itens: 0,
  };
}

export async function importCarteira(
  input: { clients: ExtractedClient[]; policies: ExtractedPolicy[] },
  opts: { resolveFile: FileResolver; dryRun?: boolean; onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> {
  const dryRun = Boolean(opts.dryRun);
  const stats = emptyStats();
  const naoMapeadas = new Map<string, number>();

  const insurers = new Map((await prisma.insurer.findMany({ select: { id: true, slug: true } })).map((i) => [i.slug, i.id]));
  if (!insurers.size) throw new Error("Nenhuma seguradora no banco: rode o seed antes (pnpm db:seed)");

  const byPasta = new Map<string, ExtractedPolicy[]>();
  for (const p of input.policies) byPasta.set(p.cliente_pasta, [...(byPasta.get(p.cliente_pasta) ?? []), p]);
  const today = todayIso();
  const total = input.clients.length;

  for (const [idx, c] of input.clients.entries()) {
    stats.clientesLidos++;
    opts.onProgress?.(idx, total);
    const cpf = c.cpf_cnpj ? onlyDigits(c.cpf_cnpj) : "";
    if (!cpf || !isValidCpfCnpj(cpf)) {
      stats.clientesSemCpf++;
      continue;
    }
    const pdfs = [...(byPasta.get(c.cliente) ?? [])];
    if (dryRun) {
      const existe = await prisma.client.findUnique({ where: { pasta: c.cliente }, select: { id: true } });
      if (existe) stats.clientesAtualizados++;
      else stats.clientesCriados++;
      stats.apolicesCriadas += pdfs.filter((p) => p.tipo_documento === "apolice" || p.tipo_documento === "proposta").length;
      for (const p of pdfs) {
        const f = await opts.resolveFile(p);
        if (f === "fora") stats.arquivosForaDoStorage++;
        else if (!f) stats.arquivosInexistentes++;
      }
      continue;
    }

    const endereco = c.endereco || c.cidade || c.cep ? { logradouro: c.endereco, bairro: c.bairro, cidade: c.cidade, uf: c.uf, cep: c.cep } : null;
    const dados = {
      // Critério das pastas: o nome do cliente é o nome da pasta.
      nome: c.cliente.trim(),
      nascimento: isIso(c.data_nascimento) ? dateOnly(c.data_nascimento) : null,
      cnh: c.cnh ?? null,
      telefone: telefone(c.telefone),
      email: c.email?.toLowerCase() ?? null,
      endereco: endereco as Prisma.InputJsonValue | null,
    };

    // Cliente: cria ou completa só campos vazios (não sobrescreve correção manual).
    let client = await prisma.client.findUnique({ where: { pasta: c.cliente } });
    if (!client) {
      client = await prisma.client.create({ data: { ...dados, endereco: dados.endereco ?? undefined, cpfCnpj: cpf, pasta: c.cliente, origem: "IMPORTACAO" } });
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

    // Ordem importa: apólices/propostas (mais recentes primeiro: em duplicata fica a mais nova)
    // ANTES dos endossos, senão o endosso chega antes da apólice e fica sem vínculo.
    const rank = (p: ExtractedPolicy) => (p.tipo_documento === "apolice" || p.tipo_documento === "proposta" ? 0 : p.tipo_documento === "endosso" ? 1 : 2);
    const quando = (p: ExtractedPolicy) => p.data_emissao ?? p.inicio_vigencia ?? p.fim_vigencia ?? "";
    pdfs.sort((a, b) => rank(a) - rank(b) || quando(b).localeCompare(quando(a)));
    for (const p of pdfs) await importPdf(client.id, p);
  }
  opts.onProgress?.(total, total);

  const status = dryRun ? undefined : await recalcAllStatuses();
  return { stats, seguradorasNaoMapeadas: Object.fromEntries(naoMapeadas), status: status as ImportResult["status"], dryRun };

  async function importPdf(clientId: string, p: ExtractedPolicy) {
    const file = await opts.resolveFile(p);
    if (file === "fora") {
      stats.arquivosForaDoStorage++;
      return;
    }
    if (!file) {
      stats.arquivosInexistentes++;
      return;
    }
    const tipoDoc = DOC_TIPO[p.tipo_documento ?? ""] ?? "OUTRO";
    const slug = resolveInsurerSlug(p.seguradora ?? null);
    const insurerId = slug ? insurers.get(slug) : undefined;

    // PDF já importado (reimportação): não duplica o arquivo, mas corrige o que a leitura
    // anterior errou (endosso solto, número de apólice truncado, seguradora trocada).
    let doc = await prisma.document.findFirst({ where: { caminho: file.rel }, select: { id: true, policyId: true, clientId: true } });
    if (!doc) {
      const hash = await file.hash();
      // Mesmo arquivo já importado com outro caminho (pasta renomeada/movida): não duplica.
      doc = await prisma.document.findFirst({ where: { clientId, hash }, select: { id: true, policyId: true, clientId: true } });
    }
    if (doc) {
      stats.documentosJaExistentes++;
      if (doc.clientId !== clientId) return;
      await prisma.document.update({ where: { id: doc.id }, data: { extraido: p as unknown as Prisma.InputJsonValue, ...(tipoDoc !== "OUTRO" ? { tipo: tipoDoc } : {}) } });
      await reconcile(clientId, doc, p, tipoDoc, insurerId);
      return;
    }

    const hash = await file.hash();
    const created = await prisma.document.create({
      data: {
        clientId,
        tipo: tipoDoc,
        nomeArquivo: path.posix.basename(file.rel),
        caminho: file.rel,
        hash,
        tamanho: file.size,
        extraido: p as unknown as Prisma.InputJsonValue,
        confianca: (p.confianca ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    stats.documentosCriados++;
    await reconcile(clientId, { id: created.id, policyId: null }, p, tipoDoc, insurerId);
  }

  /** Liga o documento à apólice certa, criando/corrigindo a apólice quando preciso. */
  async function reconcile(clientId: string, doc: { id: string; policyId: string | null }, p: ExtractedPolicy, tipoDoc: DocumentTipo, insurerId: string | undefined) {
    if (tipoDoc === "ENDOSSO") return linkEndosso(clientId, doc, p, insurerId);
    if (tipoDoc !== "APOLICE" && tipoDoc !== "PROPOSTA") return;
    if (!insurerId) {
      if (!doc.policyId) {
        stats.apolicesSemSeguradora++;
        const k = p.seguradora ?? "(vazia)";
        naoMapeadas.set(k, (naoMapeadas.get(k) ?? 0) + 1);
      }
      return;
    }

    if (doc.policyId) {
      const atual = await prisma.policy.findUnique({ where: { id: doc.policyId }, select: { id: true, documentId: true, numero: true, insurerId: true } });
      if (atual?.documentId === doc.id) {
        // PDF principal da apólice: corrige número truncado ("0531") e seguradora (ex.: Porto -> Itaú).
        const patch: Prisma.PolicyUncheckedUpdateInput = {};
        if (p.numero_apolice && p.numero_apolice !== atual.numero && !samePolicyNumber(atual.numero, p.numero_apolice) && onlyDigits(atual.numero ?? "").length <= 4) patch.numero = p.numero_apolice;
        if (atual.insurerId !== insurerId) patch.insurerId = insurerId;
        if (Object.keys(patch).length) {
          await prisma.policy.update({ where: { id: atual.id }, data: patch });
          stats.apolicesCorrigidas++;
        }
        return;
      }
      // Estava ligado como "cópia" de outra apólice: só continua assim se for mesmo a mesma.
      if (atual && atual.insurerId === insurerId && (!p.numero_apolice || samePolicyNumber(atual.numero, p.numero_apolice))) return;
      await prisma.document.update({ where: { id: doc.id }, data: { policyId: null } });
    }

    if (p.numero_apolice) {
      const dup = await findPolicyForDocument(prisma, clientId, { insurerId, numero: p.numero_apolice });
      if (dup?.via === "numero") {
        // Mesma apólice em outro PDF (cópia/2ª via): guarda o arquivo ligado a ela.
        await prisma.document.update({ where: { id: doc.id }, data: { policyId: dup.id } });
        stats.apolicesDuplicadas++;
        return;
      }
    }
    await createPolicy(clientId, doc.id, p, tipoDoc, insurerId);
  }

  async function linkEndosso(clientId: string, doc: { id: string; policyId: string | null }, p: ExtractedPolicy, insurerId: string | undefined) {
    const cancela = Boolean((p as { endosso_cancelamento?: boolean }).endosso_cancelamento);
    let polId = doc.policyId;
    // Só cancela com certeza do vínculo (número da apólice, ou apólice criada do próprio endosso):
    // pela placa poderia cair na renovação da mesma seguradora.
    let certo = Boolean(polId);
    if (!polId) {
      const alvo = await findPolicyForDocument(prisma, clientId, { insurerId, numero: p.numero_apolice, placa: p.placa, chassi: p.chassi });
      if (alvo) {
        polId = alvo.id;
        certo = alvo.via === "numero";
        await prisma.document.update({ where: { id: doc.id }, data: { policyId: alvo.id } });
        stats.endossosVinculados++;
      } else if (insurerId) {
        // Endosso sem a apólice original na pasta: o endosso traz os dados da apólice, então
        // ela entra na carteira a partir dele (senão o seguro some da ficha do cliente).
        await createPolicy(clientId, doc.id, p, "ENDOSSO", insurerId);
        stats.endossosVinculados++;
        return;
      } else {
        stats.endossosSemApolice++;
        return;
      }
    } else {
      // Apólice criada a partir deste endosso numa leitura antiga: corrige número truncado e seguradora.
      const atual = await prisma.policy.findUnique({ where: { id: polId }, select: { id: true, documentId: true, numero: true, insurerId: true } });
      if (atual?.documentId === doc.id) {
        const patch: Prisma.PolicyUncheckedUpdateInput = {};
        if (p.numero_apolice && !samePolicyNumber(atual.numero, p.numero_apolice) && onlyDigits(atual.numero ?? "").length <= 4) patch.numero = p.numero_apolice;
        if (insurerId && atual.insurerId !== insurerId) patch.insurerId = insurerId;
        if (Object.keys(patch).length) {
          await prisma.policy.update({ where: { id: atual.id }, data: patch });
          stats.apolicesCorrigidas++;
        }
      }
    }
    if (cancela && polId && certo) {
      const r = await prisma.policy.updateMany({ where: { id: polId, status: { not: "CANCELADA" } }, data: { status: "CANCELADA" } });
      stats.apolicesCanceladas += r.count;
    }
  }

  async function createPolicy(clientId: string, docId: string, p: ExtractedPolicy, tipoDoc: DocumentTipo, insurerId: string) {
    const fim = isIso(p.fim_vigencia) ? p.fim_vigencia : null;
    const vencida = fim ? fim < today : Boolean(p.pasta_vencidas);
    const cancela = tipoDoc === "ENDOSSO" && Boolean((p as { endosso_cancelamento?: boolean }).endosso_cancelamento);
    const seen = new Set<number>();
    const parcelas = (p.parcelas ?? []).filter((x) => x.parcela >= 1 && isIso(x.vencimento) && !seen.has(x.parcela) && seen.add(x.parcela));
    const temItem = Boolean(p.placa || p.chassi || p.veiculo);

    const policy = await prisma.policy.create({
      data: {
        clientId,
        insurerId,
        ramo: p.ramo ?? "outros",
        numero: p.numero_apolice ?? null,
        proposta: p.proposta ?? null,
        emissao: isIso(p.data_emissao) ? dateOnly(p.data_emissao) : null,
        inicioVigencia: isIso(p.inicio_vigencia) ? dateOnly(p.inicio_vigencia) : null,
        fimVigencia: fim ? dateOnly(fim) : null,
        premioTotal: p.premio_total ?? null,
        formaPagamento: FORMA[p.forma_pagamento ?? ""] ?? "OUTRO",
        status: cancela ? "CANCELADA" : tipoDoc === "PROPOSTA" && !vencida ? "EM_EMISSAO" : vencida ? "VENCIDA" : "VIGENTE",
        documentId: docId,
        installments: {
          create: parcelas.map((x) => ({
            numero: x.parcela,
            valor: x.valor ?? null,
            vencimento: dateOnly(x.vencimento!),
            status: x.vencimento! < today ? "PAGO" : "PENDENTE",
          })),
        },
        items: temItem
          ? {
              create: {
                tipo: "VEICULO",
                placa: p.placa?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
                chassi: p.chassi ?? null,
                modelo: p.veiculo ?? null,
                ano: p.ano_modelo == null ? null : String(p.ano_modelo),
              },
            }
          : undefined,
      },
    });
    await prisma.document.update({ where: { id: docId }, data: { policyId: policy.id } });
    stats.apolicesCriadas++;
    if (cancela) stats.apolicesCanceladas++;
    stats.parcelas += parcelas.length;
    if (temItem) stats.itens++;
    return policy;
  }
}
