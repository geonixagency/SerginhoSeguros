// Renderização de templates com {{variavel}}. Variável desconhecida ou sem valor
// vira string vazia (nunca deixa "{{x}}" cru chegar ao cliente).
import { TEMPLATE_VARIABLES, type TemplateVariable } from "@ss/shared";

export type TemplateVars = Partial<Record<TemplateVariable, string | null | undefined>>;

export function renderTemplate(conteudo: string, vars: TemplateVars): string {
  return conteudo
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => ((TEMPLATE_VARIABLES as readonly string[]).includes(k) ? (vars[k as TemplateVariable] ?? "") : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Para contatos de CSV: aceita qualquer {{coluna}} (nomes já normalizados em minúsculas).
 * Coluna inexistente ou vazia vira string vazia.
 */
export function renderLoose(conteudo: string, vars: Record<string, string | null | undefined>): string {
  return conteudo
    .replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k: string) => vars[k.toLowerCase()] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Primeiro nome com inicial maiúscula ("MARIA DA SILVA" -> "Maria"). */
export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p[0]!.toUpperCase() + p.slice(1).toLowerCase() : "";
}

/** Textos aprovados (prompt pai §8) — usados no seed como templates padrão editáveis. */
export const DEFAULT_TEMPLATES = {
  PRIMEIRA_PARCELA: {
    nome: "1ª parcela (2 dias antes)",
    conteudo:
      "Oi tudo bem? Passando para lembrar que a primeira parcela de seu seguro vence em 2 dias, é importante se atentar para que não haja problemas na vigência e cobertura de seu seguro, caso ainda não tenha recebido o boleto para pagamento favor nos contatar!",
    anexarBoleto: false,
  },
  PROBLEMA_SEM_BOLETO: {
    nome: "Problema no pagamento (sem boleto)",
    conteudo:
      "Olá tudo bem? Informação importante sobre seu seguro! Houve um problema com o pagamento e sua cobertura pode ser afetada, favor entre em contato para normalizar sua cobertura. Caso já tenha regularizado favor desconsiderar mensagem.",
    anexarBoleto: false,
  },
  PROBLEMA_COM_BOLETO: {
    nome: "Problema no pagamento (com boleto)",
    conteudo:
      "Olá tudo bem? Informação importante sobre seu seguro! Houve um problema com o pagamento e sua cobertura pode ser afetada, se ainda não regularizou você pode realizar o pagamento pelo boleto abaixo:",
    anexarBoleto: true,
  },
  ANIVERSARIO: {
    nome: "Aniversário",
    conteudo:
      "Bom dia tudo bem! Hoje é seu dia e a Serginho Seguros está passando para lhe desejar Feliz Aniversário, muitas felicidades!",
    anexarBoleto: false,
  },
} as const;
