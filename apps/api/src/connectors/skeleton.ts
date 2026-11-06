// Esqueleto de conector para seguradoras ainda sem integração implementada.
// Declara capacidades vazias (=> UI oferece só "ação manual guiada": abre o portal e
// cria tarefa). Quando chegar a documentação/credencial oficial de uma seguradora,
// crie um arquivo próprio em connectors/insurers/<slug>.ts estendendo esta classe,
// use HttpClient (rate limit + retry) e adicione fixtures gravadas em test/fixtures.
//
// IMPORTANTE (regra inegociável 3): nada de automatizar login em portal com senha.
import type { ConnectorCapability } from "@ss/shared";
import type { Credential, InsurerConnector, IntegrationChannel } from "./types";

export class SkeletonConnector implements InsurerConnector {
  capabilities: ConnectorCapability[] = [];

  constructor(
    public readonly slug: string,
    /** Resumo da pesquisa de APIs, mostrado ao testar a conexão. */
    protected readonly nota: string,
    /** Canal previsto para esta seguradora (api|import|rpa|manual). */
    public readonly canal: IntegrationChannel = "manual",
  ) {}

  async testConnection(_cred: Credential): Promise<{ ok: boolean; detalhe?: string }> {
    return { ok: false, detalhe: `Integração ainda não implementada. ${this.nota}` };
  }
}
