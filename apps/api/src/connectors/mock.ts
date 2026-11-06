// MockConnector: implementa todas as capacidades com dados FICTÍCIOS e determinísticos
// (derivados do número da apólice). Serve para demo e para testes da régua/ações
// sem depender de nenhuma seguradora real. Ativado por CONNECTORS_DEMO=true.
import { createHash } from "node:crypto";
import { addDays, todayIso } from "../lib/dates";
import type {
  ClaimDTO,
  ConnectorInstallmentDTO,
  ConnectorPolicyDTO,
  Credential,
  InsurerConnector,
  PolicyStatusDTO,
  QuoteRequest,
  QuoteResponse,
} from "./types";

const seed = (s: string) => parseInt(createHash("md5").update(s).digest("hex").slice(0, 8), 16);

/** PDF mínimo válido (1 página com texto) gerado à mão — sem dependências. */
export function buildFakeBoletoPdf(linhas: string[]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7E]/g, "?");
  const content = ["BT", "/F1 14 Tf", "50 780 Td", ...linhas.flatMap((l, i) => [i ? "0 -22 Td" : "", `(${esc(l)}) Tj`]), "ET"]
    .filter(Boolean)
    .join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export class MockConnector implements InsurerConnector {
  capabilities: InsurerConnector["capabilities"] = [
    "testConnection",
    "findPolicy",
    "listInstallments",
    "getBoletoPdf",
    "getPolicyStatus",
    "getClaims",
    "quote",
  ];

  constructor(public slug = "mock") {}

  async testConnection(_cred: Credential) {
    return { ok: true, detalhe: "Conector de demonstração (dados fictícios)" };
  }

  async findPolicy(_cred: Credential, q: { cpfCnpj?: string; numero?: string; placa?: string }): Promise<ConnectorPolicyDTO[]> {
    const numero = q.numero ?? `DEMO-${seed(q.cpfCnpj ?? q.placa ?? "x") % 100000}`;
    return [{ numero, ramo: "auto", fimVigencia: addDays(todayIso(), 120), status: "ATIVA", placa: q.placa }];
  }

  /** Regra fictícia: parcelas vencidas ficam "em aberto" quando o hash da apólice é par. */
  async listInstallments(_cred: Credential, policyNumero: string): Promise<ConnectorInstallmentDTO[]> {
    const s = seed(policyNumero);
    const today = todayIso();
    return Array.from({ length: 4 }, (_, i) => {
      const venc = addDays(today, (i - 1) * 30 - 1);
      const vencida = venc < today;
      const aberta = vencida && s % 2 === 0;
      return {
        numero: i + 1,
        valor: 100 + (s % 400),
        vencimento: venc,
        status: vencida ? (aberta ? "ATRASADO" : "PAGO") : "PENDENTE",
        boletoDisponivel: s % 3 !== 0,
      } satisfies ConnectorInstallmentDTO;
    });
  }

  async getBoletoPdf(_cred: Credential, policyNumero: string, parcela: number): Promise<Buffer> {
    return buildFakeBoletoPdf([
      "BOLETO DE DEMONSTRACAO - SEM VALOR",
      `Apolice ${policyNumero} - parcela ${parcela}`,
      `Gerado em ${todayIso()}`,
    ]);
  }

  async getPolicyStatus(_cred: Credential, policyNumero: string): Promise<PolicyStatusDTO> {
    const s = seed(policyNumero);
    return s % 2 === 0
      ? { numero: policyNumero, situacao: "PENDENTE_PAGAMENTO", parcelasEmAberto: 1, detalhe: "Parcela em aberto (demo)" }
      : { numero: policyNumero, situacao: "ATIVA", parcelasEmAberto: 0 };
  }

  async getClaims(_cred: Credential, policyNumero: string): Promise<ClaimDTO[]> {
    return seed(policyNumero) % 5 === 0
      ? [{ numero: `SIN-${seed(policyNumero) % 9999}`, data: addDays(todayIso(), -40), status: "EM_ANALISE", descricao: "Sinistro fictício (demo)" }]
      : [];
  }

  async quote(_cred: Credential, req: QuoteRequest): Promise<QuoteResponse> {
    const s = seed(JSON.stringify(req.dados) + req.ramo);
    const seguradoras = ["Porto", "Tokio Marine", "Bradesco", "Allianz", "Yelum", "HDI", "Mapfre", "Suhai"];
    const resultados = seguradoras
      .filter((_, i) => (s >> i) % 3 !== 0)
      .slice(0, 5)
      .map((seguradora, i) => ({
        seguradora,
        produto: `${req.ramo} completo`,
        premio: Math.round((1800 + ((s >> (i + 2)) % 2200)) * 100) / 100,
        franquia: req.ramo === "auto" ? 2500 + ((s >> i) % 3000) : null,
        parcelas: "até 10x sem juros",
        coberturas: ["Colisão", "Roubo e furto", "Terceiros R$ 100 mil"],
        observacao: "Cotação fictícia (demo)",
      }))
      .sort((a, b) => a.premio - b.premio);
    return { externoId: `MOCK-${s}`, status: "CONCLUIDA", resultados };
  }

  async getQuote(cred: Credential, externoId: string): Promise<QuoteResponse> {
    const r = await this.quote(cred, { ramo: "auto", dados: { externoId }, segurado: { nome: "Demo" } });
    return { ...r, externoId };
  }
}
