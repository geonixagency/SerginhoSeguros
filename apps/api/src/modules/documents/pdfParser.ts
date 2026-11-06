// Cliente do serviço interno services/pdf-parser (FastAPI). Rede interna do Docker;
// token opcional (PDF_PARSER_TOKEN) como defesa extra.
import { env } from "../../config/env";
import { AppError, unavailable } from "../../lib/errors";

export interface ParserField<T> {
  valor: T | null;
  confianca: number;
}

/** Formato devolvido por POST /parse do pdf-parser (ver services/pdf-parser/app/schemas.py). */
export interface ParserOutput {
  seguradora: ParserField<string>;
  ramo: ParserField<string>;
  cliente: Record<"nome" | "cpfCnpj" | "nascimento" | "telefone" | "email" | "cep" | "endereco", ParserField<string>>;
  apolice: {
    numero: ParserField<string>;
    proposta: ParserField<string>;
    emissao: ParserField<string>;
    inicioVigencia: ParserField<string>;
    fimVigencia: ParserField<string>;
    premioTotal: ParserField<number>;
    formaPagamento: ParserField<string>;
  };
  itens: Array<{ placa: string | null; modelo: string | null; ano: string | null; chassi: string | null; confianca: number }>;
  parcelas: Array<{ numero: number; valor: number | null; vencimento: string | null; confianca: number }>;
  avisos: string[];
  paginas: number;
}

export async function callPdfParser(pdf: Buffer, filename: string): Promise<ParserOutput> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), filename);
  let res: Response;
  try {
    res = await fetch(new URL("/parse", env.PDF_PARSER_URL), {
      method: "POST",
      body: form,
      headers: env.PDF_PARSER_TOKEN ? { "X-Parser-Token": env.PDF_PARSER_TOKEN } : {},
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw unavailable("Leitor de PDF indisponível no momento. Tente novamente em instantes.");
  }
  if (res.status === 422 || res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new AppError(422, "PDF_UNREADABLE", "Não foi possível ler este PDF", body.detail);
  }
  if (!res.ok) throw unavailable(`Leitor de PDF respondeu ${res.status}`);
  return (await res.json()) as ParserOutput;
}
