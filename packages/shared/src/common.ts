import { z } from "zod";

/** Data ISO sem hora (aaaa-mm-dd). A API sempre devolve datas "de calendário" neste formato. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato aaaa-mm-dd");

/** Valor monetário: a API devolve string decimal ("1234.56") para não perder precisão. */
export const MoneySchema = z.union([z.number(), z.string().regex(/^-?\d+(\.\d{1,2})?$/)]);

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Formato padrão de erro devolvido pela API. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Remove tudo que não é dígito (CPF, CNPJ, telefone, CEP). */
export const onlyDigits = (v: string) => v.replace(/\D/g, "");

function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

function cnpjValido(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const n of [12, 13]) {
    const w = pesos.slice(13 - n);
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (w[i] ?? 0);
    const r = s % 11;
    if ((r < 2 ? 0 : 11 - r) !== Number(d[n])) return false;
  }
  return true;
}

export function isValidCpfCnpj(v: string): boolean {
  const d = onlyDigits(v);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

/** CPF/CNPJ: aceita com ou sem máscara, valida dígito verificador e normaliza para só dígitos. */
export const CpfCnpjSchema = z
  .string()
  .transform(onlyDigits)
  .refine(isValidCpfCnpj, { message: "CPF/CNPJ inválido" });

/** Telefone BR: normaliza para dígitos (DDD + número, 10 ou 11 dígitos; aceita prefixo 55). */
export const TelefoneSchema = z
  .string()
  .transform(onlyDigits)
  .transform((d) => (d.length >= 12 && d.startsWith("55") ? d.slice(2) : d))
  .refine((d) => d.length === 10 || d.length === 11, { message: "Telefone deve ter DDD + número" });

export const PlacaSchema = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .refine((v) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(v), { message: "Placa inválida" });

/** Mascara CPF/CNPJ para exibição em listas e logs (LGPD). */
export function maskCpfCnpj(v: string | null | undefined): string {
  if (!v) return "";
  const d = onlyDigits(v);
  if (d.length === 11) return `${d.slice(0, 3)}.***.***-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-${d.slice(12)}`;
  return "***";
}

export function maskTelefone(v: string | null | undefined): string {
  if (!v) return "";
  const d = onlyDigits(v);
  return d.length < 6 ? "***" : `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
}
