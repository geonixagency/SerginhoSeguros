// Contrato de conector de seguradora (prompt pai §7). Cada seguradora/plataforma
// tem um adapter que declara só as capacidades que realmente implementa.
import type { ConnectorCapability, FormaPagamento, InstallmentStatus, QuoteResultItem } from "@ss/shared";

/** Credencial já decifrada — existe só em memória, nunca é logada nem devolvida ao frontend. */
export interface Credential {
  tipo: string;
  ambiente: string;
  valores: Record<string, string>;
}

export interface ConnectorPolicyDTO {
  numero: string;
  cpfCnpj?: string;
  ramo?: string;
  inicioVigencia?: string; // aaaa-mm-dd
  fimVigencia?: string;
  premioTotal?: number;
  formaPagamento?: FormaPagamento;
  placa?: string;
  status?: string;
}

export interface ConnectorInstallmentDTO {
  numero: number;
  valor: number | null;
  vencimento: string; // aaaa-mm-dd
  status: InstallmentStatus;
  /** true quando a seguradora consegue emitir 2ª via para esta parcela. */
  boletoDisponivel?: boolean;
}

export interface PolicyStatusDTO {
  numero: string;
  situacao: "ATIVA" | "CANCELADA" | "SUSPENSA" | "PENDENTE_PAGAMENTO" | "DESCONHECIDA";
  detalhe?: string;
  parcelasEmAberto?: number;
}

export interface ClaimDTO {
  numero: string;
  data: string;
  status: string;
  descricao?: string;
}

/**
 * Contexto opcional das consultas. Alguns canais (rpa) consultam o portal pelo
 * CPF/CNPJ do cliente, não pelo número da apólice; quem chama passa o que tiver.
 * Conectores de API ignoram o que não usam.
 */
export interface ConnectorQueryContext {
  cpfCnpj?: string | null;
}

export interface QuoteRequest {
  ramo: string;
  dados: Record<string, unknown>;
  segurado: { nome: string; cpfCnpj?: string | null; telefone?: string | null; email?: string | null };
}

export interface QuoteResponse {
  externoId: string | null;
  status: "PROCESSANDO" | "CONCLUIDA";
  resultados: QuoteResultItem[];
}

export interface InsurerConnector {
  slug: string;
  capabilities: ConnectorCapability[];
  testConnection(cred: Credential): Promise<{ ok: boolean; detalhe?: string }>;
  findPolicy?(cred: Credential, q: { cpfCnpj?: string; numero?: string; placa?: string }): Promise<ConnectorPolicyDTO[]>;
  listInstallments?(cred: Credential, policyNumero: string, ctx?: ConnectorQueryContext): Promise<ConnectorInstallmentDTO[]>;
  getBoletoPdf?(cred: Credential, policyNumero: string, parcela: number, ctx?: ConnectorQueryContext): Promise<Buffer>;
  getPolicyStatus?(cred: Credential, policyNumero: string, ctx?: ConnectorQueryContext): Promise<PolicyStatusDTO>;
  getClaims?(cred: Credential, policyNumero: string): Promise<ClaimDTO[]>;
  quote?(cred: Credential, req: QuoteRequest): Promise<QuoteResponse>;
  /** Consulta uma cotação já criada (par de `quote`). */
  getQuote?(cred: Credential, externoId: string): Promise<QuoteResponse>;
}

/**
 * Canal de integração declarado por seguradora (pesquisa 05/11/2026):
 *  api     = há API oficial (em geral B2B, sob contrato) — conector a implementar quando houver credencial;
 *  import  = carteira entra por importação de PDFs/relatórios (extrator); ações no portal, manualmente;
 *  rpa     = automação de navegador — NÃO usado (regra 3: sem login automatizado com senha);
 *  manual  = só ação manual guiada (abre o portal + tarefa).
 */
export type IntegrationChannel = "api" | "import" | "rpa" | "manual";

/** Erro de integração com mensagem segura para mostrar ao operador. */
export class ConnectorError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}
