// Contratos do robô de portais (respostas da API HTTP interna).
// Datas de calendário em "aaaa-mm-dd"; dinheiro em número (reais).

export const INSURERS = ["tokio", "porto"] as const;
export type RobotInsurer = (typeof INSURERS)[number];

/**
 * valid               sessão aberta, o robô consegue consultar
 * expired             caiu na tela de login (precisa de login)
 * needs_human         login pede captcha/2FA/verificação — alguém precisa concluir no noVNC/desktop
 * invalid_credentials o portal recusou usuário/senha
 * error               falha técnica (portal fora, timeout, navegador)
 */
export type SessionStatus = "valid" | "expired" | "needs_human" | "invalid_credentials" | "error";

export interface SessionResult {
  insurer: RobotInsurer;
  status: SessionStatus;
  /** Mensagem curta e segura para o operador (sem dados de cliente nem segredos). */
  detalhe?: string;
  /** Só host + caminho da página final (sem query string, que pode ter tokens). */
  pagina?: string;
  /** true quando o navegador está em modo janela (login manual). */
  headful?: boolean;
  vncUrl?: string;
  verificadoEm: string;
}

export interface LoginCredential {
  usuario: string;
  senha: string;
  /** Porto: SUSEP a escolher quando o login oferece mais de uma. */
  susep?: string;
}

export type ParcelaSituacao = "PAGA" | "PENDENTE" | "VENCIDA" | "CANCELADA" | "PROCESSANDO" | "DESCONHECIDA";

export interface RobotInstallment {
  numero: number;
  situacao: ParcelaSituacao;
  /** Texto original da situação no portal (ex.: "Pago", "Débito recusado"). */
  situacaoPortal?: string;
  vencimento: string | null;
  valor: number | null;
  dataPagamento: string | null;
  tipoCobranca: string | null;
  /** O portal oferece PIX / 2ª via para esta parcela. */
  acaoPix: boolean;
  acaoSegundaVia: boolean;
}

export interface RobotPolicy {
  /** Identificador interno do portal (usado nas chamadas de detalhe). */
  idPortal: string;
  numero: string;
  ramo: string | null;
  produto: string | null;
  situacao: string | null;
  inicioVigencia: string | null;
  fimVigencia: string | null;
  formaPagamento: string | null;
  placa: string | null;
  parcelas: RobotInstallment[];
}

export interface RobotContact {
  nome: string | null;
  telefones: string[];
  emails: string[];
}

export interface TokioClientResult {
  cpfCnpj: string;
  apolices: RobotPolicy[];
  contato: RobotContact | null;
  /** Estrutura (sem valores) do JSON do portal, só com ROBOT_DEBUG_SHAPES=true. */
  estrutura?: unknown;
}

export interface PortoInstallment extends RobotInstallment {
  apolice: string;
  endosso: string | null;
  proposta: string | null;
  cpfCnpj: string | null;
  nomeCliente: string | null;
  produtoId: number | null;
  debitoRecusado: boolean;
  /** Campos que a 2ª via (billet-download) precisa — opacos para a API. */
  chaveBoleto: PortoBilletKey | null;
}

export interface PortoBilletKey {
  paymentTitle: string;
  companyCode: string;
  paymentTypeCode: string;
  policy: string;
  productId: string;
  system: string;
  proposal: string;
  installmentNumber: string;
}

export interface PortoInstallmentsResult {
  total: number;
  paginas: number;
  parcelas: PortoInstallment[];
  estrutura?: unknown;
}

/** Erro com código HTTP e código de negócio para a API decidir (ex.: refazer login). */
export class RobotError extends Error {
  constructor(
    public readonly code: "SESSION_EXPIRED" | "NEEDS_HUMAN" | "PORTAL_ERROR" | "NOT_FOUND" | "BAD_REQUEST" | "BUSY",
    message: string,
    public readonly httpStatus = code === "SESSION_EXPIRED" || code === "NEEDS_HUMAN" ? 409 : code === "BAD_REQUEST" ? 400 : code === "NOT_FOUND" ? 404 : 502,
  ) {
    super(message);
    this.name = "RobotError";
  }
}
