// Tipos das RESPOSTAS da API (o que o frontend recebe).
// Convenções: datas de calendário = "aaaa-mm-dd"; instantes = ISO 8601 com fuso;
// dinheiro = string decimal ("1234.56"); CPF/CNPJ e telefone = só dígitos.
import type {
  ClientStatus,
  ConnectorCapability,
  DocumentTipo,
  FormaPagamento,
  InstallmentStatus,
  LeadEtapa,
  MessageStatus,
  Perfil,
  PolicyStatus,
  QuoteStatus,
  RuleGatilho,
  StatusIntegracao,
  TaskStatus,
} from "./enums";
import type { Endereco } from "./schemas";

export interface UserDTO {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
}

export interface LoginResponse {
  accessToken: string;
  /** Segundos até o access token expirar. O refresh token vai em cookie httpOnly. */
  expiresIn: number;
  user: UserDTO;
}

export interface InsurerSummaryDTO {
  id: string;
  nome: string;
  slug: string;
}

export interface InsurerDTO extends InsurerSummaryDTO {
  categoria: "SEGURADORA" | "PLATAFORMA";
  ramos: string[];
  portalUrl: string | null;
  temApi: boolean;
  ativo: boolean;
  statusIntegracao: StatusIntegracao;
  /** Canal de integração declarado: api | import (PDF/relatórios) | rpa (não usado) | manual. */
  canal: "api" | "import" | "rpa" | "manual";
  /** Capacidades implementadas pelo conector atual (vazio = só ação manual). */
  capacidades: ConnectorCapability[];
  observacoes: string | null;
  credencial: InsurerCredentialMaskedDTO | null;
  totalApolices?: number;
}

export interface InsurerCredentialMaskedDTO {
  tipo: string;
  ambiente: string;
  /** Ex.: { clientId: "abc•••••xyz", clientSecret: "•••••••• (32)" } */
  mascara: Record<string, string>;
  ultimoTeste: string | null;
  ultimoErro: string | null;
  atualizadoEm: string;
}

export interface InsuredItemDTO {
  id: string;
  tipo: string;
  placa: string | null;
  modelo: string | null;
  ano: string | null;
  chassi: string | null;
  endereco: string | null;
  descricao: string | null;
}

export interface InstallmentDTO {
  id: string;
  policyId: string;
  numero: number;
  valor: string | null;
  vencimento: string;
  status: InstallmentStatus;
  boletoDocumentId: string | null;
  verificadoEm: string | null;
  pagoEm: string | null;
}

export interface InstallmentWithContextDTO extends InstallmentDTO {
  policy: { id: string; numero: string | null; ramo: string; formaPagamento: FormaPagamento; insurer: InsurerSummaryDTO };
  client: { id: string; nome: string; telefone: string | null };
}

export interface DocumentDTO {
  id: string;
  tipo: DocumentTipo;
  nomeArquivo: string;
  tamanho: number;
  policyId: string | null;
  createdAt: string;
  /** URL relativa para baixar (GET autenticado). */
  url: string;
}

export interface PolicyDTO {
  id: string;
  clientId: string;
  insurer: InsurerSummaryDTO;
  ramo: string;
  numero: string | null;
  proposta: string | null;
  emissao: string | null;
  inicioVigencia: string | null;
  fimVigencia: string | null;
  premioTotal: string | null;
  formaPagamento: FormaPagamento;
  status: PolicyStatus;
  documentId: string | null;
  endossoDeId: string | null;
  /** Dias até o fim da vigência (negativo = vencida). */
  diasParaVencer: number | null;
  createdAt: string;
}

export interface PolicyDetailDTO extends PolicyDTO {
  parcelas: InstallmentDTO[];
  itens: InsuredItemDTO[];
}

export interface PolicyListItemDTO extends PolicyDTO {
  client: { id: string; nome: string };
  placas: string[];
}

export interface ClientListItemDTO {
  id: string;
  nome: string;
  cpfCnpj: string;
  telefone: string | null;
  email: string | null;
  status: ClientStatus;
  optOut: boolean;
  totalApolices: number;
  proximoVencimento: string | null;
  seguradoras: string[];
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  clientId: string | null;
  clientNome?: string | null;
  telefone: string;
  conteudo: string;
  status: MessageStatus;
  erro: string | null;
  ruleId: string | null;
  ruleNome?: string | null;
  installmentId: string | null;
  templateId: string | null;
  broadcastId: string | null;
  anexoDocumentId: string | null;
  agendadaPara: string;
  enviadaEm: string | null;
  createdAt: string;
}

export interface ClientDetailDTO {
  id: string;
  nome: string;
  cpfCnpj: string;
  nascimento: string | null;
  cnh: string | null;
  telefone: string | null;
  email: string | null;
  endereco: Endereco | null;
  status: ClientStatus;
  origem: string | null;
  optOut: boolean;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
  apolices: PolicyDetailDTO[];
  documentos: DocumentDTO[];
  mensagens: MessageDTO[];
}

export type TimelineEventType =
  | "CLIENTE_CRIADO"
  | "APOLICE_INICIO"
  | "APOLICE_FIM"
  | "PARCELA_VENCIMENTO"
  | "PARCELA_PAGA"
  | "DOCUMENTO"
  | "MENSAGEM"
  | "AUDITORIA"
  | "TAREFA";

export interface TimelineEventDTO {
  tipo: TimelineEventType;
  data: string;
  titulo: string;
  descricao?: string;
  refId?: string;
}

// ---------------------------------------------------------------- PDF
export interface ParsedField<T = string | number | null> {
  valor: T;
  /** 0..1 — o frontend mostra selo: >=0.85 alta, >=0.6 média, <0.6 baixa. */
  confianca: number;
}

export interface ParsedPolicyDTO {
  seguradora: ParsedField<string | null> & { insurerId: string | null };
  ramo: ParsedField<string | null>;
  cliente: {
    nome: ParsedField<string | null>;
    cpfCnpj: ParsedField<string | null>;
    nascimento: ParsedField<string | null>;
    telefone: ParsedField<string | null>;
    email: ParsedField<string | null>;
    cep: ParsedField<string | null>;
    endereco: ParsedField<string | null>;
  };
  apolice: {
    numero: ParsedField<string | null>;
    proposta: ParsedField<string | null>;
    emissao: ParsedField<string | null>;
    inicioVigencia: ParsedField<string | null>;
    fimVigencia: ParsedField<string | null>;
    premioTotal: ParsedField<number | null>;
    formaPagamento: ParsedField<FormaPagamento | null>;
  };
  itens: Array<{ placa: string | null; modelo: string | null; ano: string | null; chassi: string | null; confianca: number }>;
  parcelas: Array<{ numero: number; valor: number | null; vencimento: string | null; confianca: number }>;
  avisos: string[];
  paginas: number;
  /** Se já existe cliente com o CPF/CNPJ lido, o cadastro será anexado a ele. */
  clienteExistente: { id: string; nome: string } | null;
  /** Hash SHA-256 do arquivo — se já foi importado, `documentoExistenteId` vem preenchido. */
  hash: string;
  documentoExistenteId: string | null;
}

export interface FromPdfResponse {
  clientId: string;
  policyId: string;
  documentId: string;
  clienteCriado: boolean;
}

// ---------------------------------------------------------------- ações
export interface ClientActionDTO {
  action: string;
  label: string;
  policyId: string;
  policyNumero: string | null;
  insurer: InsurerSummaryDTO;
  /** API = executa via conector; MANUAL = abre o portal e cria tarefa. */
  modo: "API" | "MANUAL";
  portalUrl: string | null;
}

export interface ClientActionResultDTO {
  modo: "API" | "MANUAL";
  ok: boolean;
  mensagem: string;
  documentId?: string;
  messageId?: string;
  taskId?: string;
  portalUrl?: string | null;
  dados?: unknown;
}

export interface TaskDTO {
  id: string;
  titulo: string;
  descricao: string | null;
  status: TaskStatus;
  clientId: string | null;
  insurerId: string | null;
  portalUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- mensageria
export interface MessagingInstanceDTO {
  instanceName: string;
  configurado: boolean;
  /** open = conectado; close = desconectado; connecting = aguardando QR. */
  estado: "open" | "close" | "connecting" | "unconfigured" | "unknown";
  mock: boolean;
}

export interface MessagingConnectDTO {
  estado: MessagingInstanceDTO["estado"];
  /** data:image/png;base64,... para exibir o QR. */
  qrcode: string | null;
  pairingCode: string | null;
}

export interface MessageTemplateDTO {
  id: string;
  nome: string;
  conteudo: string;
  gatilho: RuleGatilho | null;
  anexarBoleto: boolean;
  ativo: boolean;
  updatedAt: string;
}

export interface MessageRuleDTO {
  id: string;
  nome: string;
  gatilho: RuleGatilho;
  templateId: string;
  template?: { id: string; nome: string };
  antecedenciaDias: number;
  horario: string;
  formasPagamento: FormaPagamento[];
  seguradoras: string[];
  ativo: boolean;
  ultimaExecucao: string | null;
}

export interface MessagingSettingsDTO {
  pausado: boolean;
  limiteDiario: number;
  janelaInicio: number;
  janelaFim: number;
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  enviadasHoje: number;
}

export interface MessagingQueueDTO {
  contagem: { aguardando: number; atrasadas: number; ativas: number; falhas: number };
  mensagens: MessageDTO[];
}

export interface BroadcastResponse {
  broadcastId: string | null;
  total: number;
  ignorados: { semTelefone: number; optOut: number };
  dryRun: boolean;
}

// ---------------------------------------------------------------- CRM e cotações
export interface LeadDTO {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  cpfCnpj: string | null;
  produto: string | null;
  origem: string | null;
  etapa: LeadEtapa;
  responsavel: { id: string; nome: string } | null;
  proximoContato: string | null;
  valorEstimado: string | null;
  notas: string | null;
  motivoPerda: string | null;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteResultItem {
  seguradora: string;
  produto?: string;
  premio: number;
  franquia?: number | null;
  parcelas?: string;
  coberturas?: string[];
  observacao?: string;
}

export interface QuoteDTO {
  id: string;
  leadId: string | null;
  clientId: string | null;
  ramo: string;
  dados: Record<string, unknown>;
  aggilizadorId: string | null;
  status: QuoteStatus;
  resultados: QuoteResultItem[];
  erro: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------- dashboard
export interface DashboardSummaryDTO {
  clientesAtivos: number;
  clientesInativos: number;
  novosNoMes: number;
  apolicesVigentes: number;
  premioCarteira: string;
  parcelasAtrasadas: number;
  vencendo: { d7: number; d15: number; d30: number; d60: number };
  alertas: Array<{ tipo: string; nivel: "info" | "atencao" | "critico"; mensagem: string; total?: number }>;
}

export interface ExpiringPolicyDTO {
  id: string;
  numero: string | null;
  ramo: string;
  fimVigencia: string;
  diasParaVencer: number;
  premioTotal: string | null;
  insurer: InsurerSummaryDTO;
  client: { id: string; nome: string; telefone: string | null };
  placas: string[];
}

export interface DashboardChartsDTO {
  porSeguradora: Array<{ insurerId: string; nome: string; apolices: number; premio: string }>;
  porRamo: Array<{ ramo: string; apolices: number; premio: string }>;
  /** Últimos 12 meses (aaaa-mm). */
  novosPorMes: Array<{ mes: string; apolices: number; clientes: number }>;
}

export interface BirthdayDTO {
  id: string;
  nome: string;
  nascimento: string;
  idade: number;
  telefone: string | null;
  status: ClientStatus;
  optOut: boolean;
}

export interface MessageSendResponse {
  /** null quando a mensagem não foi criada (ex.: idempotência). */
  messageId: string | null;
  agendadaPara: string;
}

export interface QuoteSendResponse {
  messageId: string | null;
  telefone: string;
  texto: string;
}

/** PATCH /messaging/instance: estado da instância + configurações de envio, numa resposta só. */
export interface MessagingInstanceStatusDTO extends MessagingInstanceDTO {
  settings: MessagingSettingsDTO;
}
