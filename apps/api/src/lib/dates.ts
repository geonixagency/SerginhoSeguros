// Datas de calendário no fuso da corretora (America/Sao_Paulo).
// Colunas @db.Date chegam do Prisma como Date à meia-noite UTC; por isso tudo aqui
// trabalha com "dia UTC" representando o dia local de São Paulo.
const TZ = "America/Sao_Paulo";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "aaaa-mm-dd" do dia atual (ou do instante dado) em São Paulo. */
export function todayIso(now: Date = new Date()): string {
  return dayFmt.format(now);
}

/** Hora/minuto locais de São Paulo. */
export function localTime(now: Date = new Date()): { hour: number; minute: number } {
  const [h, m] = hourFmt.format(now).split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

/** Converte "aaaa-mm-dd" em Date (meia-noite UTC), formato esperado pelas colunas @db.Date. */
export function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function addDays(iso: string, days: number): string {
  const d = dateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Date de coluna @db.Date -> "aaaa-mm-dd" (ou null). */
export function toIsoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function diffDays(fromIso: string, toIso: string): number {
  return Math.round((dateOnly(toIso).getTime() - dateOnly(fromIso).getTime()) / 86_400_000);
}

export function startOfMonthIso(now: Date = new Date()): string {
  return `${todayIso(now).slice(0, 7)}-01`;
}

/**
 * Próximo instante em que a janela de envio abre (hora local `startHour`).
 * Brasil não tem horário de verão desde 2019, então UTC-3 fixo é exato.
 */
export function nextWindowOpen(now: Date, startHour: number): Date {
  const { hour } = localTime(now);
  const day = hour < startHour ? todayIso(now) : addDays(todayIso(now), 1);
  return new Date(`${day}T${String(startHour).padStart(2, "0")}:00:00.000-03:00`);
}

/** Formata para exibição em mensagens: dd/mm/aaaa. */
export function formatBr(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatMoneyBr(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}
