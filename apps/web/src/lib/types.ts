/**
 * Tipos de VIEW-MODEL usados pelas telas. O contrato da API real (app/docs/API.md,
 * DTOs em @ss/shared) é convertido para estes tipos em lib/api/real.ts; o modo demo
 * (lib/api/demo.ts) já produz estes formatos diretamente.
 */

export type ISODate = string;

export type Ramo = "AUTO" | "VIDA" | "RESIDENCIAL" | "EMPRESARIAL" | "IMOBILIARIO" | "CONSORCIO";
export const RAMOS: Ramo[] = ["AUTO", "VIDA", "RESIDENCIAL", "EMPRESARIAL", "IMOBILIARIO", "CONSORCIO"];
export const RAMO_LABEL: Record<Ramo, string> = {
  AUTO: "Auto",
  VIDA: "Vida",
  RESIDENCIAL: "Residencial",
  EMPRESARIAL: "Empresarial",
  IMOBILIARIO: "Imóveis",
  CONSORCIO: "Consórcio",
};

export type FormaPagamento = "BOLETO" | "CARTAO" | "DEBITO" | "CARNE" | "PIX" | "OUTRO";
export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  BOLETO: "Boleto",
  CARTAO: "Cartão",
  DEBITO: "Débito em conta",
  CARNE: "Carnê",
  PIX: "Pix",
  OUTRO: "Outro",
};

export type Perfil = "ADMIN" | "OPERADOR";
export interface User {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  /** Data URL da foto de perfil (null/ausente = iniciais). */
  avatar?: string | null;
  ativo?: boolean;
  /** ISO. null = nunca entrou (convite pendente). */
  ultimoLogin?: string | null;
}
export interface InviteInput {
  nome: string;
  email: string;
  perfil: Perfil;
}
export interface InviteResult {
  user: User;
  emailEnviado: boolean;
  /** Só quando o e-mail não pôde ser enviado: o ADMIN repassa o link manualmente. */
  link?: string;
}
export interface ProfileUpdate {
  nome?: string;
  avatar?: string | null;
}

/* ---------- Importação da carteira (Configurações, só ADMIN) ---------- */
export interface ImportEstado {
  clientes: number;
  apolices: number;
  documentos: number;
  /** Nomes de PDF conhecidos pelo último policies.json enviado (para casar PDFs soltos). */
  indicePdfs: number;
  importacaoEmAndamento: string | null;
}
export interface PdfBatchStats {
  recebidos: number;
  gravados: number;
  iguais: number;
  substituidos: number;
  semDestino: number;
  invalidos: number;
}
export interface ImportStats {
  clientesLidos: number;
  clientesCriados: number;
  clientesAtualizados: number;
  clientesSemCpf: number;
  apolicesCriadas: number;
  apolicesDuplicadas: number;
  apolicesSemSeguradora: number;
  documentosCriados: number;
  documentosJaExistentes: number;
  arquivosForaDoStorage: number;
  arquivosInexistentes: number;
  parcelas: number;
  itens: number;
}
export interface ImportJob {
  id: string;
  status: "processando" | "concluido" | "erro";
  dryRun: boolean;
  feitos: number;
  total: number;
  iniciadoEm: string;
  concluidoEm: string | null;
  resultado: { stats: ImportStats; seguradorasNaoMapeadas: Record<string, number>; status?: Record<string, number>; dryRun: boolean } | null;
  erro: string | null;
}
export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Endereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

export type ClientStatus = "ATIVO" | "INATIVO";
export interface Client {
  id: string;
  nome: string;
  cpfCnpj: string;
  nascimento: ISODate | null;
  cnh?: string | null;
  telefone: string;
  email: string | null;
  endereco: Endereco | null;
  status: ClientStatus;
  origem: string;
  optOut: boolean;
  criadoEm: ISODate;
}
export interface ClientListItem extends Client {
  apolicesVigentes: number;
  seguradoras: string[];
  ramos: Ramo[];
  placas: string[];
  proximoVencimento: ISODate | null;
  premioTotal: number;
}
export interface ClientDetail extends ClientListItem {
  apolices: Policy[];
  parcelas: Installment[];
  documentos: DocumentFile[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Capability =
  | "testConnection"
  | "findPolicy"
  | "listInstallments"
  | "getBoletoPdf"
  | "getPolicyStatus"
  | "getClaims"
  | "quote";
export const CAPABILITY_LABEL: Record<Capability, string> = {
  testConnection: "Testar conexão",
  findPolicy: "Buscar apólice",
  listInstallments: "Listar parcelas",
  getBoletoPdf: "2ª via de boleto",
  getPolicyStatus: "Status da apólice",
  getClaims: "Sinistros",
  quote: "Cotação",
};

export type IntegrationStatus = "CONECTADA" | "ERRO" | "NAO_CONFIGURADA" | "MANUAL";
/** Canal de integração: api, import (PDF), rpa (robô de portal) ou manual. */
export type IntegrationChannel = "api" | "import" | "rpa" | "manual";
export interface Insurer {
  id: string;
  nome: string;
  slug: string;
  ramos: Ramo[];
  portalUrl: string;
  temApi: boolean;
  canal: IntegrationChannel;
  statusIntegracao: IntegrationStatus;
  capacidades: Capability[];
  /** null quando a API não informa (a tela mostra os ramos no lugar). */
  clientes: number | null;
  apolices: number;
  ultimoTeste: ISODate | null;
  cor: string;
}
/** Estado da sessão do robô no portal (canal rpa). */
export type RobotSessionStatus = "valid" | "expired" | "needs_human" | "invalid_credentials" | "error";
export interface RobotSession {
  status: RobotSessionStatus;
  detalhe?: string;
  /** true quando o robô está em modo janela (login assistido). */
  headful?: boolean;
  vncUrl?: string;
  verificadoEm: ISODate;
}
export type CredentialTipo = "API_KEY" | "OAUTH_CLIENT" | "TOKEN" | "USUARIO_SENHA_API" | "CERTIFICADO";
export interface SaveCredentialInput {
  tipo: CredentialTipo;
  /** Todos os campos da credencial (a API substitui o conjunto inteiro). */
  valores: Record<string, string>;
  ambiente?: "PRODUCAO" | "HOMOLOGACAO";
}
export interface InsurerCredential {
  id: string;
  insurerId: string;
  tipo: string;
  rotulo: string;
  valorMascarado: string;
  ultimoTeste: ISODate | null;
  ultimoErro: string | null;
}
/** Configurações > Acessos dos portais: estado do acesso de cada plataforma (nunca traz senha). */
export interface PortalAccess {
  insurerId: string;
  nome: string;
  slug: string;
  categoria: "SEGURADORA" | "PLATAFORMA";
  portalUrl: string | null;
  ativo: boolean;
  /** O robô entra neste portal com o acesso cadastrado. */
  usaRobo: boolean;
  canal: string;
  statusIntegracao: string;
  credencial: {
    tipo: string;
    /** Campo -> valor mascarado (senha sempre "••••••••"). */
    campos: Record<string, string>;
    atualizadoEm: ISODate;
    ultimoTeste: ISODate | null;
    ultimoErro: string | null;
  } | null;
}
export interface PatchCredentialInput {
  /** Só os campos que mudaram; vazio = mantém o valor atual. */
  valores: Record<string, string>;
  remover?: string[];
}
export interface TestConnectionResult {
  ok: boolean;
  detalhe?: string;
  latenciaMs?: number;
}

export type PolicyStatus = "VIGENTE" | "VENCIDA" | "CANCELADA" | "RENOVADA";
export interface InsuredItem {
  tipo: "VEICULO" | "IMOVEL" | "PESSOA" | "EMPRESA" | "COTA";
  descricao: string;
  placa?: string;
  modelo?: string;
  ano?: number;
  chassi?: string;
  endereco?: string;
}
export interface Policy {
  id: string;
  clientId: string;
  clientNome: string;
  insurerId: string;
  seguradora: string;
  ramo: Ramo;
  numero: string;
  proposta: string;
  emissao: ISODate;
  inicioVigencia: ISODate;
  fimVigencia: ISODate;
  premioTotal: number;
  formaPagamento: FormaPagamento;
  status: PolicyStatus;
  item: InsuredItem | null;
  documentId: string | null;
}

export type InstallmentStatus = "PENDENTE" | "PAGO" | "ATRASADO" | "FALHOU";
export interface Installment {
  id: string;
  policyId: string;
  apoliceNumero: string;
  clientId: string;
  clientNome: string;
  telefone: string;
  seguradora: string;
  numero: number;
  total: number;
  valor: number;
  vencimento: ISODate;
  status: InstallmentStatus;
  formaPagamento: FormaPagamento;
}

export type DocumentType = "APOLICE" | "BOLETO" | "ENDOSSO" | "PROPOSTA" | "CNH" | "OUTRO";
export interface DocumentFile {
  id: string;
  clientId: string;
  policyId: string | null;
  tipo: DocumentType;
  nome: string;
  tamanho: number;
  criadoEm: ISODate;
  /** application/pdf ou image/* (anexos manuais). Ausente = PDF. */
  mimeType?: string;
}

/** Cadastro/edição manual do cliente. */
export interface ClientInput {
  nome: string;
  cpfCnpj: string;
  nascimento: ISODate | null;
  cnh: string | null;
  telefone: string | null;
  email: string | null;
  endereco: Endereco | null;
  optOut?: boolean;
}
export interface InstallmentInput {
  numero: number;
  valor: number | null;
  vencimento: ISODate;
  status: InstallmentStatus;
}
/** Cadastro/edição manual da apólice (sem leitor de PDF). */
export interface PolicyInput {
  clientId: string;
  insurerId: string;
  ramo: Ramo;
  numero: string | null;
  proposta: string | null;
  inicioVigencia: ISODate | null;
  fimVigencia: ISODate | null;
  premioTotal: number | null;
  formaPagamento: FormaPagamento;
  status: PolicyStatus;
  item: { placa: string | null; modelo: string | null; ano: string | null } | null;
  parcelas: InstallmentInput[];
}
export type AttachTipo = "APOLICE" | "ENDOSSO" | "PROPOSTA" | "BOLETO" | "OUTRO";

export type TimelineType = "CADASTRO" | "APOLICE" | "PAGAMENTO" | "MENSAGEM" | "DOCUMENTO" | "ACAO" | "NOTA" | "ALERTA";
export interface TimelineEvent {
  id: string;
  tipo: TimelineType;
  titulo: string;
  descricao?: string;
  data: ISODate;
  autor?: string;
}

export interface DashboardSummary {
  ativos: number;
  inativos: number;
  novosMes: number;
  apolicesVigentes: number;
  premioCarteira: number;
  /** Variação percentual vs. período anterior. null = API não informa (não exibe). */
  variacao: { ativos: number; novosMes: number; apolicesVigentes: number; premioCarteira: number } | null;
  parcelasAtrasadas?: number;
  vencendo?: { d7: number; d15: number; d30: number; d60: number };
  alertas: DashboardAlert[];
}
export interface DashboardAlert {
  id: string;
  nivel: "critico" | "atencao" | "info";
  titulo: string;
  descricao: string;
  href?: string;
  /** Quantidade por trás do alerta (ex.: contatos novos do site). */
  total?: number;
}
export interface ExpiringPolicy extends Policy {
  diasRestantes: number;
  telefone: string;
  cpfCnpj: string;
  placas: string[];
  /** Sinistros registrados nesta apólice. */
  sinistros: number;
}
/** Filtro de "apólices a vencer": próximos N dias ou período personalizado (aaaa-mm-dd, inclusive). */
export type ExpiringFilter = { days: number } | { de: ISODate; ate: ISODate };

export type ClaimStatus = "ABERTO" | "EM_ANALISE" | "INDENIZADO" | "NEGADO" | "ENCERRADO";
export interface Claim {
  id: string;
  clientId: string;
  clientNome: string;
  policyId: string;
  policyNumero: string | null;
  ramo: string;
  seguradora: string;
  placa: string | null;
  dataOcorrencia: ISODate;
  tipo: string;
  descricao: string;
  local: string | null;
  protocolo: string | null;
  valor: string | null;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
}
export interface ClaimInput {
  clientId: string;
  policyId: string;
  dataOcorrencia: ISODate;
  tipo: string;
  descricao: string;
  local?: string | null;
  protocolo?: string | null;
  valor?: number | null;
  status?: ClaimStatus;
}
export interface ClaimsQuery {
  clientId?: string;
  status?: ClaimStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}
export interface InstallmentsDue {
  hoje: Installment[];
  semana: Installment[];
  atrasadas: Installment[];
}
export interface DashboardCharts {
  porSeguradora: { nome: string; apolices: number; premio: number }[];
  porRamo: { ramo: Ramo; apolices: number; premio: number }[];
  novosPorMes: { mes: string; novos: number; renovacoes: number }[];
}
export interface Birthday {
  clientId: string;
  nome: string;
  telefone: string;
  data: ISODate;
  idade: number;
  hoje: boolean;
  mensagemEnviada: boolean;
}

export type Confianca = "alto" | "medio" | "baixo";
export interface ParsedField {
  chave: string;
  rotulo: string;
  valor: string;
  confianca: number; // 0..1
  grupo: "cliente" | "apolice" | "item" | "pagamento";
}
export interface ParseResult {
  documentId: string;
  arquivo: string;
  paginas: number;
  seguradora: string | null;
  ramo: Ramo | null;
  campos: ParsedField[];
  clienteExistente: { id: string; nome: string } | null;
  duracaoMs: number;
}
export interface CreateFromPdfInput {
  documentId: string;
  campos: Record<string, string>;
  anexarAoCliente?: string | null;
}

export type ActionId = "BOLETO_2VIA" | "STATUS_APOLICE" | "STATUS_PARCELAS" | "SINISTROS";
export interface ClientAction {
  id: ActionId;
  rotulo: string;
  descricao: string;
  policyId: string;
  apoliceNumero: string;
  seguradora: string;
  disponivel: boolean;
  motivo?: string;
}
export interface ActionResult {
  acao: ActionId;
  titulo: string;
  sucesso: boolean;
  resumo: string;
  dados: { rotulo: string; valor: string }[];
  parcelas?: Installment[];
  documento?: { id: string; nome: string; url: string };
  linhaDigitavel?: string;
  /** Ação manual guiada: link do portal da seguradora (tarefa criada no sistema). */
  portalUrl?: string | null;
  executadoEm: ISODate;
}

export type WhatsappStatus = "CONECTADO" | "DESCONECTADO" | "AGUARDANDO_QR";
export interface WhatsappInstance {
  status: WhatsappStatus;
  numero: string | null;
  nome: string | null;
  qrCode: string | null;
  atualizadoEm: ISODate;
  enviadasHoje: number;
  limiteDiario: number;
  pausado: boolean;
}
export interface MessageTemplate {
  id: string;
  nome: string;
  texto: string;
  /** Templates com boleto anexo só servem às réguas (não ao disparo em massa). */
  anexarBoleto?: boolean;
}
export interface CreateTemplateInput {
  nome: string;
  texto: string;
}
/** Origem do texto do disparo em massa: um template salvo ou uma mensagem escrita na hora. */
export type BroadcastSource = { templateId: string } | { conteudo: string };
/** Ritmo dos envios automáticos (Disparos → Conexão). */
export interface MessagingPacing {
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  loteTamanho: number;
  /** Minutos de pausa entre lotes. */
  lotePausaMin: number;
  janelaInicio: number;
  janelaFim: number;
  limiteDiario: number;
  enviadasHoje: number;
}
/** Arquivo enviado junto da mensagem (até 10 MB). */
export interface MessageAttachment {
  documentId: string;
  nome: string;
  mimeType: string;
  tamanho: number;
}
/** Contato vindo de CSV: as colunas viram variáveis {{coluna}}. */
export interface BroadcastContact {
  telefone: string;
  nome: string;
  vars: Record<string, string>;
}
export interface BroadcastOptions {
  contatos?: BroadcastContact[];
  anexoDocumentId?: string | null;
}
export interface BroadcastResult {
  enfileiradas: number;
  lotes: number;
  terminoPrevisto: ISODate | null;
}
export type RuleTrigger = "PRIMEIRA_PARCELA" | "PROBLEMA_SEM_BOLETO" | "PROBLEMA_COM_BOLETO" | "ANIVERSARIO" | "RENOVACAO";
export interface MessageRule {
  id: string;
  nome: string;
  gatilho: RuleTrigger;
  descricaoGatilho: string;
  antecedenciaDias: number;
  horario: string;
  formasPagamento: FormaPagamento[];
  seguradoras: string[];
  ativo: boolean;
  texto: string;
  anexarBoleto: boolean;
  enviadas30d: number;
}
export type MessageStatus = "NA_FILA" | "ENVIANDO" | "ENVIADA" | "ENTREGUE" | "LIDA" | "FALHOU" | "CANCELADA";
export interface Message {
  id: string;
  clientId: string;
  clientNome: string;
  telefone: string;
  regra: string | null;
  texto: string;
  anexo: string | null;
  status: MessageStatus;
  criadoEm: ISODate;
  agendadoPara: ISODate | null;
  enviadoEm: ISODate | null;
  erro: string | null;
}
export interface BroadcastFilter {
  status?: ClientStatus | "TODOS";
  ramo?: Ramo | "TODOS";
  /** id da seguradora, ou "TODAS". */
  seguradora?: string | "TODAS";
}
export interface BroadcastPreview {
  total: number;
  optOut: number;
  /** Só no CSV: telefones inválidos e repetidos descartados. */
  invalidos: number;
  duplicados: number;
  amostra: { clientId: string; nome: string; telefone: string; texto: string }[];
  lotes: number;
  inicioPrevisto: ISODate;
  terminoPrevisto: ISODate;
}

export type LeadStage = "NOVO" | "EM_CONTATO" | "COTACAO_ENVIADA" | "NEGOCIACAO" | "FECHADO" | "PERDIDO";
export const LEAD_STAGES: { id: LeadStage; label: string }[] = [
  { id: "NOVO", label: "Novo" },
  { id: "EM_CONTATO", label: "Em contato" },
  { id: "COTACAO_ENVIADA", label: "Cotação enviada" },
  { id: "NEGOCIACAO", label: "Negociação" },
  { id: "FECHADO", label: "Fechado" },
  { id: "PERDIDO", label: "Perdido" },
];
export type LeadOrigem = "site" | "whatsapp" | "indicacao" | "instagram" | "telefone";
export const LEAD_ORIGEM_LABEL: Record<LeadOrigem, string> = {
  site: "Site",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  instagram: "Instagram",
  telefone: "Telefone",
};
export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  produto: Ramo;
  origem: LeadOrigem;
  etapa: LeadStage;
  responsavel: string | null;
  proximoContato: ISODate | null;
  notas: string;
  valorEstimado: number | null;
  criadoEm: ISODate;
  clientId?: string | null;
}
export interface CreateLeadInput {
  nome: string;
  telefone: string;
  email?: string;
  produto: Ramo;
  origem: LeadOrigem;
  mensagem?: string;
}

export type QuoteStatus = "PROCESSANDO" | "CONCLUIDA" | "ENVIADA" | "ERRO";
export interface QuoteResult {
  seguradora: string;
  premio: number;
  parcelas: string;
  franquia: number | null;
  coberturas: string[];
  destaque?: "melhor_preco" | "melhor_custo_beneficio" | null;
}
export interface Quote {
  id: string;
  leadId: string | null;
  clientId: string | null;
  nome: string;
  ramo: Ramo;
  status: QuoteStatus;
  aggilizadorId: string | null;
  criadoEm: ISODate;
  descricao: string;
  resultados: QuoteResult[];
}
export interface CreateQuoteInput {
  leadId?: string;
  clientId?: string;
  nome: string;
  ramo: Ramo;
  cpfCnpj: string;
  cep: string;
  veiculo?: { placa?: string; modelo?: string; ano?: number };
  observacoes?: string;
}
