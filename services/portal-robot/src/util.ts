// Utilitários puros de normalização dos JSONs dos portais.
//
// Os BFFs dos portais não têm contrato público. Por isso os mapeadores leem cada campo
// por uma lista de nomes candidatos (pick) e toleram formatos de data/valor variados.
// Quando o login real for validado, ajuste as listas de candidatos (veja ROBOT_DEBUG_SHAPES).
import type { ParcelaSituacao } from "./types";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export const isObj = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);

/** Valor do primeiro caminho existente ("a.b.c"), comparando chaves sem caixa. */
export function pick(obj: unknown, paths: string[]): Json | undefined {
  for (const p of paths) {
    let cur: unknown = obj;
    for (const part of p.split(".")) {
      if (!isObj(cur)) {
        cur = undefined;
        break;
      }
      const key = Object.keys(cur).find((k) => k.toLowerCase() === part.toLowerCase());
      cur = key === undefined ? undefined : cur[key];
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur as Json;
  }
  return undefined;
}

export const str = (v: Json | undefined): string | null => (v === undefined || v === null ? null : typeof v === "object" ? null : String(v).trim() || null);

export function num(v: Json | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  // "R$ 1.234,56" | "1234.56" | "1234,56"
  let s = v.replace(/[^\d,.-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
}

export function int(v: Json | undefined): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

/** Aceita "dd/mm/aaaa", "aaaa-mm-dd", ISO com hora e epoch ms. Devolve "aaaa-mm-dd". */
export function isoDate(v: Json | undefined): string | null {
  if (typeof v === "number") return new Date(v).toISOString().slice(0, 10);
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Traduz a situação textual da parcela no portal para o nosso vocabulário. */
export function situacaoParcela(texto: string | null): ParcelaSituacao {
  if (!texto) return "DESCONHECIDA";
  const t = norm(texto);
  if (/cancel|estorn/.test(t)) return "CANCELADA";
  if (/^pag|quitad|liquidad|baixad|paid/.test(t)) return "PAGA";
  if (/process/.test(t)) return "PROCESSANDO";
  if (/vencid|atras|inadimpl|recusad|overdue|nao pag/.test(t)) return "VENCIDA";
  if (/pendent|aberto|a vencer|aguard|due|emitid/.test(t)) return "PENDENTE";
  return "DESCONHECIDA";
}

/** Primeiro array encontrado nos caminhos (ou o próprio valor, se já for array). */
export function arrayAt(obj: unknown, paths: string[]): Json[] {
  if (Array.isArray(obj)) return obj as Json[];
  const v = pick(obj, paths);
  return Array.isArray(v) ? v : [];
}

/**
 * Estrutura de um JSON SEM os valores (só chaves e tipos), para depurar mapeamentos
 * com o portal real sem expor dados de clientes. Arrays mostram só o 1º item.
 */
export function shapeOf(v: unknown, depth = 0): unknown {
  if (depth > 6) return "…";
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0], depth + 1)] : [];
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  return v === null ? "null" : typeof v;
}

/** Só host + caminho (query/hash podem carregar tokens de SSO). */
export function safePage(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "";
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
