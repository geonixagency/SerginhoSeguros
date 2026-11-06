// Schemas de entrada (body/query) da API. O backend valida com eles; o frontend
// pode reutilizá-los nos formulários (react-hook-form + zodResolver).
import { z } from "zod";
import { CpfCnpjSchema, IsoDateSchema, PaginationQuerySchema, PlacaSchema, TelefoneSchema } from "./common";
import {
  ClientStatusSchema,
  DocumentTipoSchema,
  FormaPagamentoSchema,
  InstallmentStatusSchema,
  LeadEtapaSchema,
  MessageStatusSchema,
  PerfilSchema,
  PolicyStatusSchema,
  RuleGatilhoSchema,
  StatusIntegracaoSchema,
  TaskStatusSchema,
} from "./enums";

const optStr = (max = 500) => z.string().trim().max(max).optional().nullable();

// ---------------------------------------------------------------- auth
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha").max(200),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const UserCreateSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(10, "A senha deve ter ao menos 10 caracteres").max(200),
  perfil: PerfilSchema.default("OPERADOR"),
});
export const UserUpdateSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  senha: z.string().min(10).max(200).optional(),
  perfil: PerfilSchema.optional(),
  ativo: z.boolean().optional(),
});

// ---------------------------------------------------------------- clientes
export const EnderecoSchema = z.object({
  logradouro: optStr(200),
  numero: optStr(20),
  complemento: optStr(100),
  bairro: optStr(100),
  cidade: optStr(100),
  uf: z.string().trim().length(2).toUpperCase().optional().nullable(),
  cep: optStr(9),
});
export type Endereco = z.infer<typeof EnderecoSchema>;

export const ClientCreateSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(200),
  cpfCnpj: CpfCnpjSchema,
  nascimento: IsoDateSchema.optional().nullable(),
  cnh: optStr(20),
  telefone: TelefoneSchema.optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  endereco: EnderecoSchema.optional().nullable(),
  origem: optStr(60),
  observacoes: optStr(4000),
});
export type ClientCreateInput = z.infer<typeof ClientCreateSchema>;

export const ClientUpdateSchema = ClientCreateSchema.partial().extend({
  optOut: z.boolean().optional(),
});
export type ClientUpdateInput = z.infer<typeof ClientUpdateSchema>;

export const ClientListQuerySchema = PaginationQuerySchema.extend({
  /** Busca por nome, CPF/CNPJ, placa ou número de apólice. */
  q: z.string().trim().max(100).optional(),
  status: ClientStatusSchema.optional(),
  insurerId: z.string().optional(),
  ramo: z.string().optional(),
  sort: z.enum(["nome", "createdAt", "-createdAt"]).default("nome"),
});
export type ClientListQuery = z.infer<typeof ClientListQuerySchema>;

// ---------------------------------------------------------------- apólices
export const InsuredItemInputSchema = z.object({
  tipo: z.enum(["VEICULO", "IMOVEL", "PESSOA", "OUTRO"]).default("VEICULO"),
  placa: PlacaSchema.optional().nullable(),
  modelo: optStr(120),
  ano: optStr(20),
  chassi: optStr(30),
  endereco: optStr(300),
  descricao: optStr(500),
});
export type InsuredItemInput = z.infer<typeof InsuredItemInputSchema>;

export const InstallmentInputSchema = z.object({
  numero: z.number().int().min(1).max(120),
  valor: z.number().nonnegative().optional().nullable(),
  vencimento: IsoDateSchema,
  status: InstallmentStatusSchema.default("PENDENTE"),
});
export type InstallmentInput = z.infer<typeof InstallmentInputSchema>;

// Campos editáveis SEM defaults: no Zod 4, .default() é aplicado mesmo dentro de
// .partial(), o que faria um PATCH parcial resetar campos. Por isso os schemas de
// atualização derivam destes "Fields" e só os de criação acrescentam defaults.
const PolicyFieldsSchema = z.object({
  insurerId: z.string().min(1),
  ramo: z.string().trim().min(2).max(40),
  numero: optStr(60),
  proposta: optStr(60),
  emissao: IsoDateSchema.optional().nullable(),
  inicioVigencia: IsoDateSchema.optional().nullable(),
  fimVigencia: IsoDateSchema.optional().nullable(),
  premioTotal: z.number().nonnegative().optional().nullable(),
  formaPagamento: FormaPagamentoSchema,
  status: PolicyStatusSchema,
  endossoDeId: z.string().optional().nullable(),
});

export const PolicyCreateSchema = PolicyFieldsSchema.extend({
  clientId: z.string().min(1),
  formaPagamento: FormaPagamentoSchema.default("OUTRO"),
  status: PolicyStatusSchema.default("VIGENTE"),
  parcelas: z.array(InstallmentInputSchema).max(120).default([]),
  itens: z.array(InsuredItemInputSchema).max(50).default([]),
});
export type PolicyCreateInput = z.infer<typeof PolicyCreateSchema>;

export const PolicyUpdateSchema = PolicyFieldsSchema.partial();
export type PolicyUpdateInput = z.infer<typeof PolicyUpdateSchema>;

export const PolicyListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  clientId: z.string().optional(),
  insurerId: z.string().optional(),
  ramo: z.string().optional(),
  status: PolicyStatusSchema.optional(),
  formaPagamento: FormaPagamentoSchema.optional(),
  /** Apólices com fim de vigência até esta data (aaaa-mm-dd). */
  fimAte: IsoDateSchema.optional(),
  fimDe: IsoDateSchema.optional(),
});

export const InstallmentListQuerySchema = PaginationQuerySchema.extend({
  status: InstallmentStatusSchema.optional(),
  clientId: z.string().optional(),
  policyId: z.string().optional(),
  insurerId: z.string().optional(),
  formaPagamento: FormaPagamentoSchema.optional(),
  de: IsoDateSchema.optional(),
  ate: IsoDateSchema.optional(),
});

export const InstallmentUpdateSchema = z.object({
  status: InstallmentStatusSchema.optional(),
  valor: z.number().nonnegative().optional().nullable(),
  vencimento: IsoDateSchema.optional(),
});

// ---------------------------------------------------------------- cadastro por PDF
/** Body (campo `data`, JSON) do POST /clients/from-pdf — o cadastro já revisado pelo operador. */
export const ClientFromPdfSchema = z.object({
  cliente: ClientCreateSchema,
  apolice: PolicyCreateSchema.omit({ clientId: true, parcelas: true, itens: true }),
  parcelas: z.array(InstallmentInputSchema).max(120).default([]),
  itens: z.array(InsuredItemInputSchema).max(50).default([]),
  tipoDocumento: DocumentTipoSchema.default("APOLICE"),
  /** Saída original do parser, guardada para auditoria/treino. */
  extraido: z.record(z.string(), z.unknown()).optional(),
  confianca: z.record(z.string(), z.number().min(0).max(1)).optional(),
});
export type ClientFromPdfInput = z.infer<typeof ClientFromPdfSchema>;

// ---------------------------------------------------------------- seguradoras
export const InsurerUpdateSchema = z.object({
  nome: z.string().trim().min(2).max(80).optional(),
  ramos: z.array(z.string().trim().min(2).max(40)).max(30).optional(),
  portalUrl: z.string().url().optional().nullable(),
  temApi: z.boolean().optional(),
  ativo: z.boolean().optional(),
  statusIntegracao: StatusIntegracaoSchema.optional(),
  observacoes: optStr(2000),
});

/** Credenciais: pares chave/valor livres (ex.: clientId, clientSecret, apiKey, usuarioApi). */
export const InsurerCredentialSchema = z.object({
  tipo: z.enum(["API_KEY", "OAUTH_CLIENT", "TOKEN", "USUARIO_SENHA_API", "CERTIFICADO"]),
  valores: z
    .record(z.string().min(1).max(60), z.string().min(1).max(8000))
    .refine((v) => Object.keys(v).length > 0 && Object.keys(v).length <= 10, "Informe de 1 a 10 campos"),
  ambiente: z.enum(["PRODUCAO", "HOMOLOGACAO"]).default("PRODUCAO"),
});
export type InsurerCredentialInput = z.infer<typeof InsurerCredentialSchema>;

// ---------------------------------------------------------------- ações por API
export const ClientActionSchema = z.object({
  policyId: z.string().min(1),
  parcela: z.number().int().min(1).optional(),
});
export const CLIENT_ACTIONS = [
  "segunda-via-boleto",
  "enviar-boleto-whatsapp",
  "status-apolice",
  "sincronizar-parcelas",
  "sinistros",
] as const;
export type ClientActionId = (typeof CLIENT_ACTIONS)[number];

export const TaskUpdateSchema = z.object({ status: TaskStatusSchema });

// ---------------------------------------------------------------- mensageria
const TemplateFieldsSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  conteudo: z.string().trim().min(1).max(4000),
  gatilho: RuleGatilhoSchema.optional().nullable(),
  anexarBoleto: z.boolean(),
  ativo: z.boolean(),
});
export const TemplateCreateSchema = TemplateFieldsSchema.extend({
  anexarBoleto: z.boolean().default(false),
  ativo: z.boolean().default(true),
});
export const TemplateUpdateSchema = TemplateFieldsSchema.partial();

const HorarioSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato HH:mm");

const RuleFieldsSchema = z.object({
  nome: z.string().trim().min(2).max(80),
  gatilho: RuleGatilhoSchema,
  templateId: z.string().min(1),
  /** Dias antes do vencimento (positivo) ou depois (negativo, ex.: -1 = D+1). */
  antecedenciaDias: z.number().int().min(-60).max(60),
  horario: HorarioSchema,
  formasPagamento: z.array(FormaPagamentoSchema),
  /** Slugs de seguradoras; vazio = todas. */
  seguradoras: z.array(z.string()),
  ativo: z.boolean(),
});
export const RuleCreateSchema = RuleFieldsSchema.extend({
  antecedenciaDias: z.number().int().min(-60).max(60).default(0),
  horario: HorarioSchema.default("09:00"),
  formasPagamento: z.array(FormaPagamentoSchema).default([]),
  seguradoras: z.array(z.string()).default([]),
  ativo: z.boolean().default(true),
});
export const RuleUpdateSchema = RuleFieldsSchema.partial();

export const BroadcastFilterSchema = z.object({
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  insurerIds: z.array(z.string()).optional(),
  ramos: z.array(z.string()).optional(),
  formasPagamento: z.array(FormaPagamentoSchema).optional(),
  clientIds: z.array(z.string()).max(5000).optional(),
});
export const BroadcastSchema = z
  .object({
    /** Template salvo (ativo, sem boleto)... */
    templateId: z.string().min(1).optional(),
    /** ...ou uma mensagem personalizada escrita na hora (aceita as mesmas {{variaveis}}). */
    conteudo: z.string().trim().min(1).max(4000).optional(),
    filtro: BroadcastFilterSchema.default({}),
    /** true = só conta destinatários, não enfileira nada. */
    dryRun: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.templateId) !== Boolean(v.conteudo), { message: "Informe um template ou uma mensagem personalizada", path: ["templateId"] });
export type BroadcastInput = z.infer<typeof BroadcastSchema>;

export const MessageHistoryQuerySchema = PaginationQuerySchema.extend({
  status: MessageStatusSchema.optional(),
  clientId: z.string().optional(),
  ruleId: z.string().optional(),
  de: IsoDateSchema.optional(),
  ate: IsoDateSchema.optional(),
});

export const MessagingSettingsUpdateSchema = z.object({
  pausado: z.boolean().optional(),
  limiteDiario: z.number().int().min(1).max(5000).optional(),
  janelaInicio: z.number().int().min(0).max(23).optional(),
  janelaFim: z.number().int().min(1).max(24).optional(),
  intervaloMinSeg: z.number().int().min(5).max(600).optional(),
  intervaloMaxSeg: z.number().int().min(5).max(900).optional(),
});

// ---------------------------------------------------------------- CRM
const LeadFieldsSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  telefone: TelefoneSchema.optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  cpfCnpj: CpfCnpjSchema.optional().nullable(),
  produto: optStr(60),
  origem: optStr(60),
  etapa: LeadEtapaSchema,
  responsavelId: z.string().optional().nullable(),
  proximoContato: z.string().datetime({ offset: true }).optional().nullable(),
  valorEstimado: z.number().nonnegative().optional().nullable(),
  notas: optStr(8000),
});
export const LeadCreateSchema = LeadFieldsSchema.extend({ etapa: LeadEtapaSchema.default("NOVO") });
export const LeadUpdateSchema = LeadFieldsSchema.partial().extend({ motivoPerda: optStr(500) });
export const LeadListQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  etapa: LeadEtapaSchema.optional(),
  responsavelId: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});
export const LeadConvertSchema = z.object({
  cpfCnpj: CpfCnpjSchema.optional(),
  nascimento: IsoDateSchema.optional().nullable(),
  endereco: EnderecoSchema.optional().nullable(),
});

// ---------------------------------------------------------------- cotações
export const QuoteCreateSchema = z
  .object({
    leadId: z.string().optional(),
    clientId: z.string().optional(),
    ramo: z.string().trim().min(2).max(40),
    /** Dados do risco (veículo, CEP de pernoite, condutor...), repassados ao Aggilizador. */
    dados: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((q) => Boolean(q.leadId) !== Boolean(q.clientId), "Informe leadId OU clientId");
export const QuoteListQuerySchema = PaginationQuerySchema.extend({
  leadId: z.string().optional(),
  clientId: z.string().optional(),
});

// ---------------------------------------------------------------- dashboard
export const ExpiringQuerySchema = z.object({
  days: z.coerce.number().int().refine((d) => [7, 15, 30, 60].includes(d), "days deve ser 7, 15, 30 ou 60").default(30),
});
export const InstallmentsDueQuerySchema = z.object({ range: z.enum(["today", "week"]).default("today") });
export const BirthdaysQuerySchema = z.object({ scope: z.enum(["today", "month"]).default("today") });

// ---------------------------------------------------------------- envio avulso / site
/** POST /messaging/send — mensagem avulsa para um cliente (respeita opt-out, janela e fila). */
export const MessageSendSchema = z.object({
  clientId: z.string().min(1),
  conteudo: z.string().trim().min(1, "Escreva a mensagem").max(4000),
  /** Documento do próprio cliente para anexar (ex.: boleto em PDF). */
  anexoDocumentId: z.string().min(1).optional().nullable(),
});
export type MessageSendInput = z.infer<typeof MessageSendSchema>;

/** POST /public/leads — formulário de cotação do site (sem login). */
export const PublicLeadSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(200),
  telefone: TelefoneSchema,
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  produto: optStr(60),
  mensagem: optStr(2000),
  /** Honeypot: humanos deixam vazio. */
  site: z.string().max(0).optional(),
});
export type PublicLeadInput = z.infer<typeof PublicLeadSchema>;
