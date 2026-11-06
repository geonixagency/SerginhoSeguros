// Ritmo dos envios automáticos (réguas e disparo em massa), para evitar bloqueio do número:
// intervalo sorteado entre mensagens e lotes (ex.: 25 mensagens, depois 4 h de pausa).
// Tudo aqui é função pura (testável); o sender aplica, e a tela mostra a estimativa.
// A estimativa de término mora em @ss/shared (a tela e o modo demo usam a mesma conta).
export { estimateSchedule, type PacingSettings, type ScheduleEstimate as Estimate } from "@ss/shared";

/** Intervalo sorteado (ms) entre min e max segundos. `rand` injetável para teste. */
export function randomIntervalMs(min: number, max: number, rand: () => number = Math.random): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.round((lo + rand() * (hi - lo)) * 1000);
}

/**
 * Se o último lote está completo, devolve quando o próximo pode começar.
 * `enviadasDesc`: instantes dos últimos envios automáticos (mais recente primeiro), ao menos `lote` itens.
 * Um lote é uma sequência de envios sem pausa >= `pausaMs` entre eles; ao completar `lote`
 * envios seguidos, o próximo espera `pausaMs` a partir do último.
 */
export function batchResumeAt(enviadasDesc: Date[], lote: number, pausaMs: number, now: Date): Date | null {
  if (lote <= 0 || pausaMs <= 0 || enviadasDesc.length < lote) return null;
  const ultimos = enviadasDesc.slice(0, lote);
  for (let i = 0; i < ultimos.length - 1; i++) {
    if (ultimos[i]!.getTime() - ultimos[i + 1]!.getTime() >= pausaMs) return null; // já houve pausa dentro desta janela
  }
  const retoma = new Date(ultimos[0]!.getTime() + pausaMs);
  return retoma > now ? retoma : null;
}
