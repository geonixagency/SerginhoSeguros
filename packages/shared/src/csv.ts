// CSV de contatos para disparo em massa: leitura tolerante (separador ; , ou TAB detectado,
// aspas, BOM, CRLF), nome de variável a partir do cabeçalho e telefone BR normalizado.
// Funções puras, usadas no navegador (prévia e mapeamento) e na API (validação final).

export interface CsvTable {
  separador: ";" | "," | "\t";
  cabecalho: string[];
  linhas: string[][];
}

/** Detecta o separador pela primeira linha (fora de aspas). Empate favorece ";" (Excel pt-BR). */
export function detectSeparator(firstLine: string): CsvTable["separador"] {
  const count = { ";": 0, ",": 0, "\t": 0 } as Record<CsvTable["separador"], number>;
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && (ch === ";" || ch === "," || ch === "\t")) count[ch]++;
  }
  if (count["\t"] > count[";"] && count["\t"] > count[","]) return "\t";
  return count[","] > count[";"] ? "," : ";";
}

/** Lê o texto do CSV (já decodificado). Linhas totalmente vazias são descartadas. */
export function parseCsv(text: string, maxLinhas = 20_000): CsvTable {
  const src = text.replace(/^﻿/, "");
  const firstEnd = src.search(/\r?\n/);
  const sep = detectSeparator(firstEnd === -1 ? src : src.slice(0, firstEnd));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxLinhas) break;
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const [cab = [], ...linhas] = rows;
  return { separador: sep, cabecalho: cab.map((c) => c.trim()), linhas: linhas.slice(0, maxLinhas).map((l) => l.map((c) => c.trim())) };
}

/** "Seguro Contratado" -> "seguro_contratado" (vira {{seguro_contratado}}). */
export function columnVar(header: string): string {
  return (
    header
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "coluna"
  );
}

/**
 * Telefone BR -> só dígitos com DDD (10 ou 11), sem o 55. Aceita "+55 (16) 99999-0000",
 * "016 99999 0000" etc. Devolve null se não der um número válido.
 */
export function normalizePhoneBr(v: string | null | undefined): string | null {
  let d = (v ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 || d.length === 12) d = d.replace(/^0/, ""); // 0 + DDD (operadora/interurbano)
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null; // celular com 9 dígitos começa com 9
  return d;
}

export interface CsvMapping {
  /** Índice da coluna com o telefone (obrigatória). */
  telefone: number;
  /** Índice da coluna com o nome (opcional). */
  nome: number | null;
}

export interface CsvContact {
  telefone: string;
  nome: string;
  vars: Record<string, string>;
}

/** Aplica o mapeamento: normaliza telefone, descarta inválidos e duplicados (mantém o primeiro). */
export function mapCsvContacts(t: CsvTable, m: CsvMapping): { contatos: CsvContact[]; invalidos: number; duplicados: number } {
  const vars = t.cabecalho.map(columnVar);
  const seen = new Set<string>();
  const contatos: CsvContact[] = [];
  let invalidos = 0;
  let duplicados = 0;
  for (const l of t.linhas) {
    const tel = normalizePhoneBr(l[m.telefone]);
    if (!tel) {
      invalidos++;
      continue;
    }
    if (seen.has(tel)) {
      duplicados++;
      continue;
    }
    seen.add(tel);
    const v: Record<string, string> = {};
    vars.forEach((k, i) => {
      if (l[i] !== undefined && !(k in v)) v[k] = l[i]!;
    });
    const nome = m.nome !== null ? (l[m.nome] ?? "") : "";
    if (nome) v.nome = nome;
    v.telefone = tel;
    contatos.push({ telefone: tel, nome, vars: v });
  }
  return { contatos, invalidos, duplicados };
}
