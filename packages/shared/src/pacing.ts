// Estimativa de término dos disparos com o ritmo configurado (intervalo sorteado, lotes,
// janela de envio e limite diário). Função pura: a API devolve na prévia, a tela e o modo demo
// usam a mesma conta. Fuso de São Paulo: o Brasil não tem horário de verão desde 2019,
// então UTC-3 fixo é exato.

export interface PacingSettings {
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  loteTamanho: number;
  /** Pausa entre lotes, em minutos (0 = sem pausa). */
  lotePausaMin: number;
  janelaInicio: number;
  janelaFim: number;
  limiteDiario: number;
}

export interface ScheduleEstimate {
  total: number;
  lotes: number;
  inicioPrevisto: string;
  terminoPrevisto: string;
}

const OFFSET_MS = 3 * 3600_000;
const spDay = (t: number) => new Date(t - OFFSET_MS).toISOString().slice(0, 10);
const spHour = (t: number) => new Date(t - OFFSET_MS).getUTCHours();
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const openAt = (iso: string, hour: number) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00.000-03:00`).getTime();

/**
 * Previsão para `n` mensagens a partir de `now`: intervalo médio entre envios, pausa após cada
 * lote, só dentro da janela e respeitando o limite diário (já descontadas as `enviadasHoje`).
 * Uma noite (ou espera do limite) maior que a pausa já conta como pausa e começa lote novo.
 */
export function estimateSchedule(n: number, s: PacingSettings, now: Date, enviadasHoje = 0): ScheduleEstimate {
  const media = ((s.intervaloMinSeg + s.intervaloMaxSeg) / 2) * 1000;
  const pausa = s.lotePausaMin * 60_000;
  const lote = Math.max(1, s.loteTamanho);
  const limite = Math.max(1, s.limiteDiario);
  let t = now.getTime();
  let noLote = 0;
  let dia = spDay(t);
  let noDia = enviadasHoje;
  let inicio: number | null = null;

  for (let i = 0; i < n; i++) {
    for (let guard = 0; guard < 400; guard++) {
      const d = spDay(t);
      if (d !== dia) {
        dia = d;
        noDia = 0;
      }
      const hour = spHour(t);
      let prox: number | null = null;
      if (hour < s.janelaInicio) prox = openAt(d, s.janelaInicio);
      else if (hour >= s.janelaFim || noDia >= limite) prox = openAt(nextDay(d), s.janelaInicio);
      if (prox === null) break;
      if (prox - t >= pausa) noLote = 0;
      t = prox;
    }
    inicio ??= t;
    noDia++;
    noLote++;
    if (i === n - 1) break;
    t += media;
    if (noLote >= lote) {
      t += pausa;
      noLote = 0;
    }
  }
  return {
    total: n,
    lotes: n > 0 ? Math.ceil(n / lote) : 0,
    inicioPrevisto: new Date(inicio ?? t).toISOString(),
    terminoPrevisto: new Date(t).toISOString(),
  };
}
