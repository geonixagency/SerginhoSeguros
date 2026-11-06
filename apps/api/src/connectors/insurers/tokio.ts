// TokioConnector — canal "rpa" (via portal-robot).
//
// A Tokio consulta por CPF/CNPJ do cliente (BFF consulta-unica) e devolve as apólices
// com suas parcelas e contatos. Como o contrato pede consulta por número de apólice,
// buscamos pelo CPF/CNPJ (ctx) e filtramos a apólice pedida.
import type { ConnectorCapability, FormaPagamento } from "@ss/shared";
import type { ConnectorInstallmentDTO, ConnectorPolicyDTO, ConnectorQueryContext, Credential, InsurerConnector, PolicyStatusDTO } from "../types";
import { ConnectorError } from "../types";
import { portalRobot, type PortalRobotClient, type RobotPolicy, type TokioClientResult } from "../portalRobot";
import { ensureCredential, policyStatusFromInstallments, requireCpf, testFromSession, toInstallmentDTO, TtlCache, withSession } from "./rpaBase";

const FORMA: Record<string, FormaPagamento> = { BOLETO: "BOLETO", CARTAO: "CARTAO", "CARTÃO": "CARTAO", DEBITO: "DEBITO", "DÉBITO": "DEBITO", CARNE: "CARNE", "CARNÊ": "CARNE", PIX: "PIX" };

function toPolicyDTO(p: RobotPolicy, cpfCnpj: string): ConnectorPolicyDTO {
  const forma = p.formaPagamento ? FORMA[p.formaPagamento.toUpperCase()] : undefined;
  return {
    numero: p.numero,
    cpfCnpj,
    ramo: p.ramo ?? undefined,
    inicioVigencia: p.inicioVigencia ?? undefined,
    fimVigencia: p.fimVigencia ?? undefined,
    formaPagamento: forma,
    placa: p.placa ?? undefined,
    status: p.situacao ?? undefined,
  };
}

const sameNumber = (a: string, b: string) => a === b || a.replace(/\D/g, "") === b.replace(/\D/g, "");

export class TokioConnector implements InsurerConnector {
  readonly slug = "tokio-marine";
  readonly capabilities: ConnectorCapability[] = ["testConnection", "findPolicy", "listInstallments", "getPolicyStatus"];

  private readonly cache: TtlCache<TokioClientResult>;

  constructor(
    private readonly robot: PortalRobotClient = portalRobot(),
    cacheTtlMs = 10 * 60_000,
  ) {
    this.cache = new TtlCache(cacheTtlMs);
  }

  /** Consulta do cliente no portal, com login automático se a sessão caiu e cache curto por CPF. */
  private cliente(cred: Credential, cpf: string): Promise<TokioClientResult> {
    ensureCredential(cred, "Tokio Marine");
    return this.cache.get(cpf, () => withSession(this.robot, "tokio", cred, () => this.robot.tokioClient(cpf)));
  }

  async testConnection(cred: Credential): Promise<{ ok: boolean; detalhe?: string }> {
    ensureCredential(cred, "Tokio Marine");
    return testFromSession(await this.robot.status("tokio"));
  }

  async findPolicy(cred: Credential, q: { cpfCnpj?: string; numero?: string; placa?: string }): Promise<ConnectorPolicyDTO[]> {
    const cpf = requireCpf(q.cpfCnpj, "Tokio Marine");
    const r = await this.cliente(cred, cpf);
    let apolices = r.apolices;
    if (q.numero) apolices = apolices.filter((p) => sameNumber(p.numero, q.numero!));
    if (q.placa) apolices = apolices.filter((p) => (p.placa ?? "").replace(/\W/g, "").toUpperCase() === q.placa!.replace(/\W/g, "").toUpperCase());
    return apolices.map((p) => toPolicyDTO(p, r.cpfCnpj));
  }

  async listInstallments(cred: Credential, policyNumero: string, ctx?: ConnectorQueryContext): Promise<ConnectorInstallmentDTO[]> {
    const cpf = requireCpf(ctx?.cpfCnpj, "Tokio Marine");
    const r = await this.cliente(cred, cpf);
    const apolice = r.apolices.find((p) => sameNumber(p.numero, policyNumero));
    if (!apolice) throw new ConnectorError(`Apólice ${policyNumero} não encontrada no portal da Tokio para este cliente`, false, 404);
    return apolice.parcelas.map(toInstallmentDTO).filter((x): x is ConnectorInstallmentDTO => x !== null);
  }

  async getPolicyStatus(cred: Credential, policyNumero: string, ctx?: ConnectorQueryContext): Promise<PolicyStatusDTO> {
    const cpf = requireCpf(ctx?.cpfCnpj, "Tokio Marine");
    const r = await this.cliente(cred, cpf);
    const apolice = r.apolices.find((p) => sameNumber(p.numero, policyNumero));
    if (!apolice) return { numero: policyNumero, situacao: "DESCONHECIDA", detalhe: "Apólice não encontrada no portal" };
    return policyStatusFromInstallments(policyNumero, apolice.parcelas);
  }
}
