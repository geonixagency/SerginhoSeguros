// Enums do domínio. Espelham os enums do Prisma (apps/api/prisma/schema.prisma) —
// se mudar aqui, mude lá também (e vice-versa).
import { z } from "zod";

export const PerfilSchema = z.enum(["ADMIN", "OPERADOR"]);
export type Perfil = z.infer<typeof PerfilSchema>;

export const ClientStatusSchema = z.enum(["ATIVO", "INATIVO"]);
export type ClientStatus = z.infer<typeof ClientStatusSchema>;

export const FormaPagamentoSchema = z.enum(["BOLETO", "CARTAO", "DEBITO", "CARNE", "PIX", "OUTRO"]);
export type FormaPagamento = z.infer<typeof FormaPagamentoSchema>;

export const PolicyStatusSchema = z.enum(["VIGENTE", "VENCIDA", "CANCELADA", "RENOVADA", "EM_EMISSAO"]);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const InstallmentStatusSchema = z.enum(["PENDENTE", "PAGO", "ATRASADO", "FALHOU"]);
export type InstallmentStatus = z.infer<typeof InstallmentStatusSchema>;

export const StatusIntegracaoSchema = z.enum(["SEM_API", "NAO_CONFIGURADA", "CONFIGURADA", "OK", "ERRO"]);
export type StatusIntegracao = z.infer<typeof StatusIntegracaoSchema>;

export const LeadEtapaSchema = z.enum(["NOVO", "EM_CONTATO", "COTACAO_ENVIADA", "NEGOCIACAO", "FECHADO", "PERDIDO"]);
export type LeadEtapa = z.infer<typeof LeadEtapaSchema>;

export const QuoteStatusSchema = z.enum(["PROCESSANDO", "CONCLUIDA", "ERRO"]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

export const MessageStatusSchema = z.enum(["AGENDADA", "ENVIANDO", "ENVIADA", "FALHOU", "CANCELADA", "IGNORADA"]);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const RuleGatilhoSchema = z.enum([
  "PRIMEIRA_PARCELA",
  "PROBLEMA_SEM_BOLETO",
  "PROBLEMA_COM_BOLETO",
  "ANIVERSARIO",
]);
export type RuleGatilho = z.infer<typeof RuleGatilhoSchema>;

export const DocumentTipoSchema = z.enum(["APOLICE", "PROPOSTA", "ENDOSSO", "BOLETO", "OUTRO"]);
export type DocumentTipo = z.infer<typeof DocumentTipoSchema>;

export const TaskStatusSchema = z.enum(["ABERTA", "CONCLUIDA", "CANCELADA"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Capacidades que um conector de seguradora pode declarar (contrato do prompt pai §7). */
export const ConnectorCapabilitySchema = z.enum([
  "testConnection",
  "findPolicy",
  "listInstallments",
  "getBoletoPdf",
  "getPolicyStatus",
  "getClaims",
  "quote",
]);
export type ConnectorCapability = z.infer<typeof ConnectorCapabilitySchema>;

/** Variáveis aceitas nos templates de mensagem. */
export const TEMPLATE_VARIABLES = ["nome", "seguradora", "apolice", "valor", "vencimento", "placa"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
