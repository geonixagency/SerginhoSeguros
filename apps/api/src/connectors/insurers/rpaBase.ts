// Base dos conectores por robô de portal (canal "rpa"): Tokio e Porto.
//
// Traduz o resultado do portal-robot para os DTOs do contrato de conector e trata o
// status de sessão: quando o robô diz que a sessão caiu (ou precisa de humano), o
// teste de conexão devolve ok:false com uma dica — a renovação é feita pelo botão
// "Renovar sessão" (rota dedicada), nunca em silêncio aqui.
import type { InstallmentStatus } from "@ss/shared";
import { ConnectorError, type Credential, type PolicyStatusDTO, type ConnectorInstallmentDTO } from "../types";
import { prisma } from "../../lib/prisma";
import { loginFromCredential, RobotCallError, slugsForRobotCode, type PortalRobotClient, type RobotInsurerCode, type RobotInstallment, type RobotSessionResult, type RobotSessionStatus } from "../portalRobot";

/**
 * A sessão do portal não pôde ser restabelecida automaticamente (captcha/2FA, credencial
 * recusada, limite diário). Não adianta tentar de novo agora: o job D+1 para de consultar
 * esta seguradora no ciclo e o SaaS pede login assistido.
 */
export class RobotSessionError extends ConnectorError {
  constructor(
    public readonly sessionStatus: RobotSessionStatus | "budget",
    message: string,
  ) {
    super(message, false, 409);
    this.name = "RobotSessionError";
  }
}

/**
 * Executa uma consulta no robô; se a sessão do portal caiu, faz login automático com a
 * credencial decifrada do cofre (só em memória, neste escopo) e tenta UMA vez de novo.
 */
export async function withSession<T>(robot: PortalRobotClient, insurer: RobotInsurerCode, cred: Credential, op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof RobotCallError && err.code === "NEEDS_HUMAN") throw new RobotSessionError("needs_human", err.message);
    if (err instanceof RobotCallError && err.code === "BUSY") throw new RobotSessionError("budget", err.message);
    if (!(err instanceof RobotCallError) || err.code !== "SESSION_EXPIRED") throw err;
  }
  const r = await robot.login(insurer, loginFromCredential(cred));
  if (r.status !== "valid") {
    const detalhe = testFromSession(r).detalhe ?? "Sessão do portal indisponível";
    // Senha recusada no login automático: marca o acesso para aparecer em Configurações > Acessos.
    if (r.status === "invalid_credentials") await markAccessRejected(insurer, detalhe).catch(() => undefined);
    throw new RobotSessionError(r.status, detalhe);
  }
  return op();
}

/**
 * Cache curto por chave (CPF/CNPJ): várias parcelas do mesmo cliente no mesmo ciclo viram
 * uma consulta só no portal ("poucas execuções por dia"). Só em memória; expira em minutos.
 */
export class TtlCache<T> {
  private readonly m = new Map<string, { exp: number; v: Promise<T> }>();
  constructor(
    private readonly ttlMs: number,
    private readonly agora: () => number = Date.now,
  ) {}
  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.agora();
    const hit = this.m.get(key);
    if (hit && hit.exp > now) return hit.v;
    const v = load();
    this.m.set(key, { exp: now + this.ttlMs, v });
    v.catch(() => this.m.delete(key)); // erro não fica em cache
    for (const [k, e] of this.m) if (e.exp <= now) this.m.delete(k);
    return v;
  }
}

/** Situação da parcela no portal -> status do nosso domínio. CANCELADA não vira parcela ativa. */
export function toInstallmentStatus(s: RobotInstallment["situacao"]): InstallmentStatus | null {
  switch (s) {
    case "PAGA":
      return "PAGO";
    case "VENCIDA":
      return "ATRASADO";
    case "PENDENTE":
    case "PROCESSANDO":
      return "PENDENTE";
    case "CANCELADA":
      return null; // ignoramos parcelas canceladas
    default:
      return "PENDENTE";
  }
}

export function toInstallmentDTO(p: RobotInstallment): ConnectorInstallmentDTO | null {
  const status = toInstallmentStatus(p.situacao);
  if (!status) return null;
  return {
    numero: p.numero,
    valor: p.valor,
    vencimento: p.vencimento ?? "",
    status,
    boletoDisponivel: p.acaoSegundaVia,
  };
}

export function policyStatusFromInstallments(numero: string, parcelas: RobotInstallment[]): PolicyStatusDTO {
  const abertas = parcelas.filter((p) => p.situacao === "VENCIDA" || p.situacao === "PENDENTE" || p.situacao === "PROCESSANDO");
  const vencidas = parcelas.filter((p) => p.situacao === "VENCIDA").length;
  return {
    numero,
    situacao: vencidas > 0 ? "PENDENTE_PAGAMENTO" : parcelas.length ? "ATIVA" : "DESCONHECIDA",
    parcelasEmAberto: abertas.length,
    detalhe: vencidas > 0 ? `${vencidas} parcela(s) vencida(s) no portal` : undefined,
  };
}

/** Converte o status de sessão do robô no resultado de testConnection. */
export function testFromSession(r: RobotSessionResult): { ok: boolean; detalhe?: string } {
  switch (r.status) {
    case "valid":
      return { ok: true, detalhe: "Sessão do robô ativa no portal" };
    case "expired":
      return { ok: false, detalhe: "Sessão do portal expirou. Use \"Renovar sessão\" para logar novamente." };
    case "needs_human":
      return { ok: false, detalhe: r.detalhe ?? "O login do portal exige captcha/2FA. Conclua pelo acesso assistido (noVNC)." };
    case "invalid_credentials":
      return { ok: false, detalhe: "Usuário ou senha do portal recusados. Revise a credencial." };
    default:
      return { ok: false, detalhe: r.detalhe ?? "Não foi possível falar com o portal pelo robô." };
  }
}

/** Erro padronizado quando o canal rpa precisa do CPF/CNPJ e ele não veio. */
export function requireCpf(cpfCnpj: string | null | undefined, portal: string): string {
  const cpf = (cpfCnpj ?? "").replace(/\D/g, "");
  if (!cpf) throw new ConnectorError(`A consulta no portal da ${portal} é feita por CPF/CNPJ do cliente; cadastre o CPF/CNPJ na ficha.`);
  return cpf;
}

/** Garante que a credencial do cofre existe (o robô precisa dela para logar). */
export function ensureCredential(cred: Credential | null | undefined, portal: string): Credential {
  if (!cred) throw new ConnectorError(`Cadastre a credencial do portal da ${portal} (usuário e senha) antes de usar o robô.`);
  return cred;
}

/** Registra no cofre que o portal recusou o acesso (usuário/senha desatualizados). */
export async function markAccessRejected(code: RobotInsurerCode, detalhe: string): Promise<void> {
  const insurers = await prisma.insurer.findMany({ where: { slug: { in: slugsForRobotCode(code) } }, select: { id: true } });
  const ids = insurers.map((i) => i.id);
  if (!ids.length) return;
  await prisma.insurerCredential.updateMany({ where: { insurerId: { in: ids } }, data: { ultimoTeste: new Date(), ultimoErro: detalhe } });
  await prisma.insurer.updateMany({ where: { id: { in: ids } }, data: { statusIntegracao: "ERRO" } });
}
