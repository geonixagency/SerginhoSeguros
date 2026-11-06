// PortoConnector — canal "rpa" (via portal-robot). Cobre também Azul e Itaú (mesma plataforma).
//
// A Porto lista parcelas por filtros (vencidas, débito recusado, período, CPF/CNPJ). Para
// o contrato por número de apólice, listamos pelo CPF/CNPJ (ctx) e filtramos a apólice.
// A 2ª via usa a chave que vem em cada parcela.
import type { ConnectorCapability } from "@ss/shared";
import type { ConnectorInstallmentDTO, ConnectorPolicyDTO, ConnectorQueryContext, Credential, InsurerConnector, PolicyStatusDTO } from "../types";
import { ConnectorError } from "../types";
import { portalRobot, type PortalRobotClient, type PortoFilters, type PortoInstallment } from "../portalRobot";
import { ensureCredential, policyStatusFromInstallments, requireCpf, testFromSession, toInstallmentDTO, TtlCache, withSession } from "./rpaBase";

const digits = (s: string) => s.replace(/\D/g, "");
const samePolicy = (a: string, b: string) => digits(a) === digits(b);

export class PortoConnector implements InsurerConnector {
  readonly capabilities: ConnectorCapability[] = ["testConnection", "findPolicy", "listInstallments", "getPolicyStatus", "getBoletoPdf"];

  private readonly cache: TtlCache<PortoInstallment[]>;

  constructor(
    readonly slug = "porto",
    private readonly robot: PortalRobotClient = portalRobot(),
    cacheTtlMs = 10 * 60_000,
  ) {
    this.cache = new TtlCache(cacheTtlMs);
  }

  async testConnection(cred: Credential): Promise<{ ok: boolean; detalhe?: string }> {
    ensureCredential(cred, "Porto Seguro");
    return testFromSession(await this.robot.status("porto"));
  }

  /** Parcelas de um cliente (todas), agrupadas por apólice vêm no próprio item. */
  /** Com login automático se a sessão caiu e cache curto por CPF/CNPJ. */
  private porCliente(cred: Credential, cpfCnpj: string, extra: Partial<PortoFilters> = {}): Promise<PortoInstallment[]> {
    ensureCredential(cred, "Porto Seguro");
    return this.cache.get(`${cpfCnpj}|${JSON.stringify(extra)}`, async () =>
      (await withSession(this.robot, "porto", cred, () => this.robot.portoInstallments({ cpfCnpj, ...extra }))).parcelas,
    );
  }

  async findPolicy(cred: Credential, q: { cpfCnpj?: string; numero?: string; placa?: string }): Promise<ConnectorPolicyDTO[]> {
    const cpf = requireCpf(q.cpfCnpj, "Porto Seguro");
    const parcelas = await this.porCliente(cred, cpf);
    const porApolice = new Map<string, PortoInstallment[]>();
    for (const p of parcelas) {
      if (!p.apolice) continue;
      (porApolice.get(p.apolice) ?? porApolice.set(p.apolice, []).get(p.apolice)!).push(p);
    }
    const dtos: ConnectorPolicyDTO[] = [];
    for (const [apolice, lista] of porApolice) {
      if (q.numero && !samePolicy(apolice, q.numero)) continue;
      dtos.push({ numero: apolice, cpfCnpj: lista[0]?.cpfCnpj ?? cpf, status: lista.some((x) => x.situacao === "VENCIDA") ? "PENDENTE_PAGAMENTO" : "ATIVA" });
    }
    return dtos;
  }

  async listInstallments(cred: Credential, policyNumero: string, ctx?: ConnectorQueryContext): Promise<ConnectorInstallmentDTO[]> {
    const cpf = requireCpf(ctx?.cpfCnpj, "Porto Seguro");
    const parcelas = (await this.porCliente(cred, cpf)).filter((p) => samePolicy(p.apolice, policyNumero));
    return parcelas.map(toInstallmentDTO).filter((x): x is ConnectorInstallmentDTO => x !== null);
  }

  async getPolicyStatus(cred: Credential, policyNumero: string, ctx?: ConnectorQueryContext): Promise<PolicyStatusDTO> {
    const cpf = requireCpf(ctx?.cpfCnpj, "Porto Seguro");
    const parcelas = (await this.porCliente(cred, cpf)).filter((p) => samePolicy(p.apolice, policyNumero));
    if (!parcelas.length) return { numero: policyNumero, situacao: "DESCONHECIDA", detalhe: "Apólice não encontrada no portal" };
    return policyStatusFromInstallments(policyNumero, parcelas);
  }

  async getBoletoPdf(cred: Credential, policyNumero: string, parcela: number, ctx?: ConnectorQueryContext): Promise<Buffer> {
    const cpf = requireCpf(ctx?.cpfCnpj, "Porto Seguro");
    const alvo = (await this.porCliente(cred, cpf)).find((p) => samePolicy(p.apolice, policyNumero) && p.numero === parcela);
    if (!alvo) throw new ConnectorError(`Parcela ${parcela} da apólice ${policyNumero} não encontrada no portal da Porto`, false, 404);
    if (!alvo.chaveBoleto) throw new ConnectorError("O portal não oferece 2ª via para esta parcela", false, 409);
    return withSession(this.robot, "porto", cred, () => this.robot.portoBillet(alvo.chaveBoleto!));
  }
}
