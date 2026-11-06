// Texto do comparativo de cotação enviado ao cliente pelo WhatsApp.
import type { QuoteResultItem } from "@ss/shared";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

const RAMO_TXT: Record<string, string> = {
  auto: "seguro auto",
  moto: "seguro moto",
  residencial: "seguro residencial",
  empresarial: "seguro empresarial",
  vida: "seguro de vida",
  viagem: "seguro viagem",
};

/** Monta o comparativo com as 3 melhores propostas (menor prêmio primeiro). */
export function buildQuoteComparison(p: { nome: string; ramo: string; resultados: QuoteResultItem[]; limite?: number }): string {
  const validos = p.resultados.filter((r) => Number.isFinite(r.premio) && r.premio > 0);
  if (!validos.length) throw new Error("Cotação sem resultados para comparar");
  const top = [...validos].sort((a, b) => a.premio - b.premio).slice(0, p.limite ?? 3);
  const linhas = top.map((r, i) => {
    const extras = [r.parcelas, r.franquia ? `franquia ${brl(r.franquia)}` : null].filter(Boolean).join(" · ");
    return `${i + 1}. *${r.seguradora}*: ${brl(r.premio)}${extras ? ` (${extras})` : ""}`;
  });
  const primeiro = p.nome.trim().split(/\s+/)[0] ?? "";
  return [
    `Olá ${primeiro}, tudo bem? Aqui está o comparativo do seu ${RAMO_TXT[p.ramo] ?? `seguro ${p.ramo}`}:`,
    "",
    ...linhas,
    "",
    "Os valores podem mudar até a contratação. Quer que a gente siga com alguma delas?",
    "Serginho Seguros",
  ].join("\n");
}
