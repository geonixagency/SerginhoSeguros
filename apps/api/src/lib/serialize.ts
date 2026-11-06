// Conversão de registros Prisma -> DTOs de @ss/shared. Centralizado para que
// todas as rotas devolvam datas, dinheiro e relações no mesmo formato.
import type {
  Document,
  Installment,
  InsuredItem,
  Insurer,
  Lead,
  Message,
  MessageRule,
  MessageTemplate,
  Policy,
  Prisma,
  Quote,
  Task,
  User,
} from "@prisma/client";
import type {
  DocumentDTO,
  Endereco,
  InstallmentDTO,
  InsuredItemDTO,
  InsurerSummaryDTO,
  LeadDTO,
  MessageDTO,
  MessageRuleDTO,
  MessageTemplateDTO,
  PolicyDTO,
  QuoteDTO,
  QuoteResultItem,
  TaskDTO,
  UserDTO,
} from "@ss/shared";
import { diffDays, todayIso, toIsoDate } from "./dates";

export const money = (d: Prisma.Decimal | null | undefined): string | null => (d == null ? null : d.toFixed(2));

export const userDTO = (u: User): UserDTO => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo, avatar: u.avatar ?? null });

export const insurerSummary = (i: Pick<Insurer, "id" | "nome" | "slug">): InsurerSummaryDTO => ({
  id: i.id,
  nome: i.nome,
  slug: i.slug,
});

export const installmentDTO = (i: Installment): InstallmentDTO => ({
  id: i.id,
  policyId: i.policyId,
  numero: i.numero,
  valor: money(i.valor),
  vencimento: toIsoDate(i.vencimento) ?? "",
  status: i.status,
  boletoDocumentId: i.boletoDocumentId,
  verificadoEm: i.verificadoEm?.toISOString() ?? null,
  pagoEm: i.pagoEm?.toISOString() ?? null,
});

export const itemDTO = (i: InsuredItem): InsuredItemDTO => ({
  id: i.id,
  tipo: i.tipo,
  placa: i.placa,
  modelo: i.modelo,
  ano: i.ano,
  chassi: i.chassi,
  endereco: i.endereco,
  descricao: i.descricao,
});

export const documentDTO = (d: Document): DocumentDTO => ({
  id: d.id,
  tipo: d.tipo,
  nomeArquivo: d.nomeArquivo,
  tamanho: d.tamanho,
  policyId: d.policyId,
  createdAt: d.createdAt.toISOString(),
  url: `/api/documents/${d.id}/file`,
});

export function policyDTO(p: Policy & { insurer: Pick<Insurer, "id" | "nome" | "slug"> }): PolicyDTO {
  const fim = toIsoDate(p.fimVigencia);
  return {
    id: p.id,
    clientId: p.clientId,
    insurer: insurerSummary(p.insurer),
    ramo: p.ramo,
    numero: p.numero,
    proposta: p.proposta,
    emissao: toIsoDate(p.emissao),
    inicioVigencia: toIsoDate(p.inicioVigencia),
    fimVigencia: fim,
    premioTotal: money(p.premioTotal),
    formaPagamento: p.formaPagamento,
    status: p.status,
    documentId: p.documentId,
    endossoDeId: p.endossoDeId,
    diasParaVencer: fim ? diffDays(todayIso(), fim) : null,
    createdAt: p.createdAt.toISOString(),
  };
}

export const messageDTO = (
  m: Message & { client?: { nome: string } | null; rule?: { nome: string } | null },
): MessageDTO => ({
  id: m.id,
  clientId: m.clientId,
  clientNome: m.client?.nome ?? null,
  telefone: m.telefone,
  conteudo: m.conteudo,
  status: m.status,
  erro: m.erro,
  ruleId: m.ruleId,
  ruleNome: m.rule?.nome ?? null,
  installmentId: m.installmentId,
  templateId: m.templateId,
  broadcastId: m.broadcastId,
  anexoDocumentId: m.anexoDocumentId,
  agendadaPara: m.agendadaPara.toISOString(),
  enviadaEm: m.enviadaEm?.toISOString() ?? null,
  createdAt: m.createdAt.toISOString(),
});

export const templateDTO = (t: MessageTemplate): MessageTemplateDTO => ({
  id: t.id,
  nome: t.nome,
  conteudo: t.conteudo,
  gatilho: t.gatilho,
  anexarBoleto: t.anexarBoleto,
  ativo: t.ativo,
  updatedAt: t.updatedAt.toISOString(),
});

export const ruleDTO = (r: MessageRule & { template?: { id: string; nome: string } }): MessageRuleDTO => ({
  id: r.id,
  nome: r.nome,
  gatilho: r.gatilho,
  templateId: r.templateId,
  template: r.template ? { id: r.template.id, nome: r.template.nome } : undefined,
  antecedenciaDias: r.antecedenciaDias,
  horario: r.horario,
  formasPagamento: r.formasPagamento,
  seguradoras: r.seguradoras,
  ativo: r.ativo,
  ultimaExecucao: r.ultimaExecucao?.toISOString() ?? null,
});

export const leadDTO = (l: Lead & { responsavel?: { id: string; nome: string } | null }): LeadDTO => ({
  id: l.id,
  nome: l.nome,
  telefone: l.telefone,
  email: l.email,
  cpfCnpj: l.cpfCnpj,
  produto: l.produto,
  origem: l.origem,
  etapa: l.etapa,
  responsavel: l.responsavel ? { id: l.responsavel.id, nome: l.responsavel.nome } : null,
  proximoContato: l.proximoContato?.toISOString() ?? null,
  valorEstimado: money(l.valorEstimado),
  notas: l.notas,
  motivoPerda: l.motivoPerda,
  clientId: l.clientId,
  createdAt: l.createdAt.toISOString(),
  updatedAt: l.updatedAt.toISOString(),
});

export const quoteDTO = (q: Quote): QuoteDTO => ({
  id: q.id,
  leadId: q.leadId,
  clientId: q.clientId,
  ramo: q.ramo,
  dados: (q.dados ?? {}) as Record<string, unknown>,
  aggilizadorId: q.aggilizadorId,
  status: q.status,
  resultados: (Array.isArray(q.resultados) ? q.resultados : []) as unknown as QuoteResultItem[],
  erro: q.erro,
  createdAt: q.createdAt.toISOString(),
});

export const taskDTO = (t: Task & { insurer?: { portalUrl: string | null } | null }): TaskDTO => ({
  id: t.id,
  titulo: t.titulo,
  descricao: t.descricao,
  status: t.status,
  clientId: t.clientId,
  insurerId: t.insurerId,
  portalUrl: t.insurer?.portalUrl ?? null,
  createdAt: t.createdAt.toISOString(),
});

export const enderecoFromJson = (v: Prisma.JsonValue | null): Endereco | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Endereco) : null;
