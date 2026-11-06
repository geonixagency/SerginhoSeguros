// Regras de clientes: busca, ficha completa, timeline e criação/anexação por CPF.
import type { Prisma, PrismaClient } from "@prisma/client";
import { onlyDigits, type ClientCreateInput, type ClientDetailDTO, type TimelineEventDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { dateOnly, todayIso, toIsoDate } from "../../lib/dates";
import { notFound } from "../../lib/errors";
import {
  documentDTO,
  enderecoFromJson,
  installmentDTO,
  itemDTO,
  messageDTO,
  policyDTO,
} from "../../lib/serialize";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Monta o filtro de busca livre: nome, CPF/CNPJ, placa ou número de apólice/proposta. */
export function clientSearchWhere(q: string | undefined): Prisma.ClientWhereInput {
  if (!q) return {};
  const digits = onlyDigits(q);
  const placa = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const or: Prisma.ClientWhereInput[] = [{ nome: { contains: q, mode: "insensitive" } }];
  if (digits.length >= 3) or.push({ cpfCnpj: { contains: digits } }, { telefone: { contains: digits } });
  if (placa.length >= 3) or.push({ policies: { some: { items: { some: { placa: { contains: placa } } } } } });
  or.push({ policies: { some: { OR: [{ numero: { contains: q, mode: "insensitive" } }, { proposta: { contains: q, mode: "insensitive" } }] } } });
  if (q.includes("@")) or.push({ email: { contains: q, mode: "insensitive" } });
  return { OR: or };
}

export function clientData(input: Partial<ClientCreateInput>) {
  return {
    nome: input.nome,
    cpfCnpj: input.cpfCnpj,
    nascimento: input.nascimento === undefined ? undefined : input.nascimento ? dateOnly(input.nascimento) : null,
    cnh: input.cnh,
    telefone: input.telefone,
    email: input.email,
    endereco: input.endereco === undefined ? undefined : ((input.endereco ?? undefined) as Prisma.InputJsonValue | undefined),
    origem: input.origem,
    observacoes: input.observacoes,
  };
}

/**
 * Cria o cliente ou, se o CPF/CNPJ já existe, completa só os campos vazios
 * (não sobrescreve o que o operador já corrigiu manualmente).
 */
export async function upsertClientByCpf(tx: Tx, input: ClientCreateInput): Promise<{ id: string; criado: boolean }> {
  const existing = await tx.client.findUnique({ where: { cpfCnpj: input.cpfCnpj } });
  if (!existing) {
    const c = await tx.client.create({ data: { ...clientData(input), nome: input.nome, cpfCnpj: input.cpfCnpj } });
    return { id: c.id, criado: true };
  }
  const patch: Prisma.ClientUpdateInput = {};
  if (!existing.nascimento && input.nascimento) patch.nascimento = dateOnly(input.nascimento);
  if (!existing.telefone && input.telefone) patch.telefone = input.telefone;
  if (!existing.email && input.email) patch.email = input.email;
  if (!existing.cnh && input.cnh) patch.cnh = input.cnh;
  if (!existing.endereco && input.endereco) patch.endereco = input.endereco as Prisma.InputJsonValue;
  if (Object.keys(patch).length) await tx.client.update({ where: { id: existing.id }, data: patch });
  return { id: existing.id, criado: false };
}

export async function getClientDetail(id: string): Promise<ClientDetailDTO> {
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      policies: {
        include: { insurer: true, installments: { orderBy: { numero: "asc" } }, items: true },
        orderBy: [{ fimVigencia: "desc" }],
      },
      documents: { orderBy: { createdAt: "desc" } },
      messages: { orderBy: { createdAt: "desc" }, take: 50, include: { rule: { select: { nome: true } } } },
    },
  });
  if (!c) throw notFound("Cliente");
  return {
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpfCnpj,
    nascimento: toIsoDate(c.nascimento),
    cnh: c.cnh,
    telefone: c.telefone,
    email: c.email,
    endereco: enderecoFromJson(c.endereco),
    status: c.status,
    origem: c.origem,
    optOut: c.optOut,
    observacoes: c.observacoes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    apolices: c.policies.map((p) => ({ ...policyDTO(p), parcelas: p.installments.map(installmentDTO), itens: p.items.map(itemDTO) })),
    documentos: c.documents.map(documentDTO),
    mensagens: c.messages.map((m) => messageDTO({ ...m, client: { nome: c.nome } })),
  };
}

/** Linha do tempo do cliente: junta eventos de várias tabelas, mais recentes primeiro. */
export async function getClientTimeline(id: string): Promise<TimelineEventDTO[]> {
  const c = await prisma.client.findUnique({
    where: { id },
    include: {
      policies: { include: { insurer: true, installments: true } },
      documents: true,
      messages: { take: 200, orderBy: { createdAt: "desc" } },
      tasks: true,
    },
  });
  if (!c) throw notFound("Cliente");
  const audits = await prisma.auditLog.findMany({
    where: { entidade: "Client", entidadeId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { nome: true } } },
  });
  const today = todayIso();
  const ev: TimelineEventDTO[] = [{ tipo: "CLIENTE_CRIADO", data: c.createdAt.toISOString(), titulo: "Cliente cadastrado", descricao: c.origem ?? undefined }];
  for (const p of c.policies) {
    const nome = `${p.insurer.nome} · ${p.ramo}${p.numero ? ` · nº ${p.numero}` : ""}`;
    if (p.inicioVigencia) ev.push({ tipo: "APOLICE_INICIO", data: toIsoDate(p.inicioVigencia)!, titulo: "Início de vigência", descricao: nome, refId: p.id });
    if (p.fimVigencia) ev.push({ tipo: "APOLICE_FIM", data: toIsoDate(p.fimVigencia)!, titulo: (toIsoDate(p.fimVigencia)! < today ? "Vigência encerrada" : "Fim de vigência previsto"), descricao: nome, refId: p.id });
    for (const i of p.installments) {
      if (i.pagoEm) ev.push({ tipo: "PARCELA_PAGA", data: i.pagoEm.toISOString(), titulo: `Parcela ${i.numero} paga`, descricao: nome, refId: i.id });
      else if (i.status !== "PAGO") ev.push({ tipo: "PARCELA_VENCIMENTO", data: toIsoDate(i.vencimento)!, titulo: `Parcela ${i.numero} · ${i.status.toLowerCase()}`, descricao: nome, refId: i.id });
    }
  }
  for (const d of c.documents) ev.push({ tipo: "DOCUMENTO", data: d.createdAt.toISOString(), titulo: `Documento anexado (${d.tipo.toLowerCase()})`, descricao: d.nomeArquivo, refId: d.id });
  for (const m of c.messages) ev.push({ tipo: "MENSAGEM", data: (m.enviadaEm ?? m.createdAt).toISOString(), titulo: `WhatsApp · ${m.status.toLowerCase()}`, descricao: m.conteudo.slice(0, 140), refId: m.id });
  for (const t of c.tasks) ev.push({ tipo: "TAREFA", data: t.createdAt.toISOString(), titulo: `Tarefa: ${t.titulo}`, descricao: t.status.toLowerCase(), refId: t.id });
  for (const a of audits) ev.push({ tipo: "AUDITORIA", data: a.createdAt.toISOString(), titulo: `${a.acao.toLowerCase()} por ${a.user?.nome ?? "sistema"}`, refId: a.id });
  return ev.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}
