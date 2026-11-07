// Cliente HTTP do serviço portal-robot (canal "rpa").
//
// O robô roda na rede interna do docker e automatiza os portais da Tokio e da Porto
// usando a sessão logada da corretora. O backend decifra a credencial do cofre e a
// envia ao robô só no login; as consultas reaproveitam a sessão persistente.
//
// Segurança: comunicação autenticada por PORTAL_ROBOT_TOKEN; nunca logamos a senha.
import { env } from "../config/env";
import { HttpClient } from "./http";
import { ConnectorError, type Credential } from "./types";

/** Seguradoras atendidas pelo robô. O slug do catálogo é mapeado para este código. */
export type RobotInsurerCode = "tokio" | "porto";

export type RobotSessionStatus = "valid" | "expired" | "needs_human" | "invalid_credentials" | "error";

export interface RobotSessionResult {
  insurer: RobotInsurerCode;
  status: RobotSessionStatus;
  detalhe?: string;
  pagina?: string;
  headful?: boolean;
  vncUrl?: string;
  verificadoEm: string;
}

export interface RobotInstallment {
  numero: number;
  situacao: "PAGA" | "PENDENTE" | "VENCIDA" | "CANCELADA" | "PROCESSANDO" | "DESCONHECIDA";
  situacaoPortal?: string;
  vencimento: string | null;
  valor: number | null;
  dataPagamento: string | null;
  tipoCobranca: string | null;
  acaoPix: boolean;
  acaoSegundaVia: boolean;
}

export interface RobotPolicy {
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

export interface PortoInstallment extends RobotInstallment {
  apolice: string;
  endosso: string | null;
  proposta: string | null;
  cpfCnpj: string | null;
  nomeCliente: string | null;
  produtoId: number | null;
  debitoRecusado: boolean;
  chaveBoleto: PortoBilletKey | null;
}

export interface PortoInstallmentsResult {
  total: number;
  paginas: number;
  parcelas: PortoInstallment[];
}

export interface PortoFilters {
  vencidas?: boolean;
  debitoRecusado?: boolean;
  status?: Array<"OVERDUE" | "DUE" | "PROCESSING" | "PAID" | "CANCELLED">;
  de?: string;
  ate?: string;
  cpfCnpj?: string;
  suseps?: string[];
  pagina?: number;
  tamanhoPagina?: number;
  maxPaginas?: number;
}

/** Slug do catálogo -> sessão do robô. Azul e Itaú ficam na plataforma (e na sessão) da Porto. */
const ROBOT_SLUGS: Record<RobotInsurerCode, string[]> = { tokio: ["tokio-marine"], porto: ["porto", "azul", "itau"] };
export function robotCodeForSlug(slug: string): RobotInsurerCode | null {
  for (const [code, slugs] of Object.entries(ROBOT_SLUGS)) if (slugs.includes(slug)) return code as RobotInsurerCode;
  return null;
}
/** Seguradoras (slugs) atendidas por um código do robô (Porto, Azul e Itaú compartilham o portal). */
export const slugsForRobotCode = (code: RobotInsurerCode): string[] => ROBOT_SLUGS[code] ?? [];

/** Credencial de portal esperada no cofre para o canal rpa. */
export interface PortalLogin {
  usuario: string;
  senha: string;
  susep?: string;
}

export function loginFromCredential(cred: Credential): PortalLogin {
  const usuario = cred.valores.usuario ?? cred.valores.cpf ?? cred.valores.login ?? "";
  const senha = cred.valores.senha ?? cred.valores.password ?? "";
  if (!usuario || !senha) throw new ConnectorError("Credencial do portal incompleta (usuário e senha)");
  return { usuario, senha, ...(cred.valores.susep ? { susep: cred.valores.susep } : {}) };
}

/** Códigos de erro que o robô devolve no corpo ({ code, message }). */
export type RobotErrorCode = "SESSION_EXPIRED" | "NEEDS_HUMAN" | "PORTAL_ERROR" | "NOT_FOUND" | "BAD_REQUEST" | "BUSY" | "UNAUTHORIZED" | "UNKNOWN";

/** Erro de uma chamada ao robô, com o código de negócio para decidir (ex.: refazer login). */
export class RobotCallError extends ConnectorError {
  constructor(
    public readonly code: RobotErrorCode,
    message: string,
    status?: number,
  ) {
    super(message, code === "PORTAL_ERROR", status);
    this.name = "RobotCallError";
  }
}

export class PortalRobotClient {
  private readonly http: HttpClient;

  constructor(opts?: { baseUrl?: string; token?: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }) {
    const token = opts?.token ?? env.PORTAL_ROBOT_TOKEN ?? "";
    this.http = new HttpClient({
      baseUrl: opts?.baseUrl ?? env.PORTAL_ROBOT_URL,
      rps: 1,
      // Sem retry automático: repetir 409/429 só gastaria o orçamento diário do portal.
      retries: 0,
      timeoutMs: 120_000,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      ...(opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(opts?.sleep ? { sleep: opts.sleep } : {}),
    });
  }

  private async call<T>(req: { method?: "GET" | "POST"; path: string; body?: unknown }): Promise<T> {
    let res: Response;
    try {
      res = await this.http.raw(req);
    } catch (err) {
      // HttpClient converte 5xx/429 e falhas de rede em ConnectorError sem corpo.
      if (err instanceof ConnectorError && err.status === 429) throw new RobotCallError("BUSY", "Limite diário de consultas ao portal atingido", 429);
      if (err instanceof ConnectorError) throw new RobotCallError("PORTAL_ERROR", "Robô de portais indisponível ou o portal falhou", err.status);
      throw err;
    }
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new RobotCallError((body.code as RobotErrorCode) ?? "UNKNOWN", body.message ?? `Robô respondeu ${res.status}`, res.status);
  }

  status(insurer: RobotInsurerCode): Promise<RobotSessionResult> {
    return this.call<RobotSessionResult>({ path: `/status/${insurer}` });
  }

  /** Login automático no robô. A credencial vai só no corpo desta chamada (rede interna) e não é logada. */
  login(insurer: RobotInsurerCode, login: PortalLogin): Promise<RobotSessionResult> {
    return this.call<RobotSessionResult>({ method: "POST", path: `/login/${insurer}`, body: login });
  }

  tokioClient(cpfCnpj: string): Promise<TokioClientResult> {
    return this.call<TokioClientResult>({ method: "POST", path: "/tokio/client", body: { cpfCnpj } });
  }

  portoInstallments(filtros: PortoFilters): Promise<PortoInstallmentsResult> {
    return this.call<PortoInstallmentsResult>({ method: "POST", path: "/porto/installments", body: filtros });
  }

  async portoBillet(chaveBoleto: PortoBilletKey): Promise<Buffer> {
    const r = await this.call<{ base64: string }>({ method: "POST", path: "/porto/billet", body: { chaveBoleto } });
    return Buffer.from(r.base64, "base64");
  }
}

let shared: PortalRobotClient | null = null;
/** Instância compartilhada (lazy) do cliente do robô. */
export function portalRobot(): PortalRobotClient {
  if (!shared) shared = new PortalRobotClient();
  return shared;
}

/** Para testes: injeta um cliente (ou reseta com null). */
export function setPortalRobot(client: PortalRobotClient | null) {
  shared = client;
}
