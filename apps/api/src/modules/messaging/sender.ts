// Envio de uma mensagem da fila: aplica pausa geral, janela 8–20h, limite diário e
// opt-out ANTES de chamar a Evolution. A decisão é uma função pura (testável).
import type { MessagingSettings } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { addDays, localTime, nextWindowOpen, todayIso } from "../../lib/dates";
import { resolveStoragePath } from "../../lib/storage";
import { readFile } from "node:fs/promises";
import { getEvolution } from "./evolution";
import { countSentToday, getSettings } from "./service";
import { enqueueMessage } from "./queue";
import { batchResumeAt, randomIntervalMs } from "./pacing";

export { randomIntervalMs };

export type SendDecision =
  | { tipo: "enviar" }
  | { tipo: "reagendar"; para: Date; motivo: string }
  | { tipo: "ignorar"; motivo: string };

export function decideSend(p: {
  now: Date;
  settings: Pick<MessagingSettings, "pausado" | "limiteDiario" | "janelaInicio" | "janelaFim">;
  enviadasHoje: number;
  optOut: boolean;
  telefone: string | null;
}): SendDecision {
  if (p.optOut) return { tipo: "ignorar", motivo: "Cliente pediu para não receber mensagens (opt-out)" };
  if (!p.telefone || p.telefone.replace(/\D/g, "").length < 10) return { tipo: "ignorar", motivo: "Cliente sem telefone válido" };
  if (p.settings.pausado) return { tipo: "reagendar", para: new Date(p.now.getTime() + 30 * 60_000), motivo: "Disparos pausados" };
  const { hour } = localTime(p.now);
  if (hour < p.settings.janelaInicio || hour >= p.settings.janelaFim) {
    return { tipo: "reagendar", para: nextWindowOpen(p.now, p.settings.janelaInicio), motivo: "Fora da janela de envio" };
  }
  if (p.enviadasHoje >= p.settings.limiteDiario) {
    // Amanhã, na abertura da janela.
    const amanha = new Date(`${addDays(todayIso(p.now), 1)}T${String(p.settings.janelaInicio).padStart(2, "0")}:00:00.000-03:00`);
    return { tipo: "reagendar", para: amanha, motivo: "Limite diário atingido" };
  }
  return { tipo: "enviar" };
}

export interface ProcessResult {
  status: "ENVIADA" | "REAGENDADA" | "IGNORADA" | "JA_PROCESSADA";
  pausaMs?: number;
}

/** Processa um job de envio. Lança erro em falha de envio (a fila faz retry). */
export async function processMessage(messageId: string, now = new Date()): Promise<ProcessResult> {
  const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { client: true, anexoDocument: true } });
  if (!msg || msg.status !== "AGENDADA") return { status: "JA_PROCESSADA" };

  const settings = await getSettings();
  const decision = decideSend({
    now,
    settings,
    enviadasHoje: await countSentToday(now),
    optOut: msg.client?.optOut ?? false,
    telefone: msg.telefone,
  });

  if (decision.tipo === "ignorar") {
    await prisma.message.update({ where: { id: msg.id }, data: { status: "IGNORADA", erro: decision.motivo } });
    return { status: "IGNORADA" };
  }
  if (decision.tipo === "reagendar") {
    await prisma.message.update({ where: { id: msg.id }, data: { agendadaPara: decision.para, erro: decision.motivo } });
    await enqueueMessage(msg.id, decision.para);
    return { status: "REAGENDADA" };
  }

  // Lotes: só para envios automáticos (réguas e disparo em massa). Mensagem avulsa não espera.
  if (msg.ruleId || msg.broadcastId) {
    const ultimas = await prisma.message.findMany({
      where: { status: "ENVIADA", enviadaEm: { not: null }, OR: [{ ruleId: { not: null } }, { broadcastId: { not: null } }] },
      orderBy: { enviadaEm: "desc" },
      take: settings.loteTamanho,
      select: { enviadaEm: true },
    });
    const retoma = batchResumeAt(
      ultimas.map((m) => m.enviadaEm!),
      settings.loteTamanho,
      settings.lotePausaMin * 60_000,
      now,
    );
    if (retoma) {
      await prisma.message.update({ where: { id: msg.id }, data: { agendadaPara: retoma, erro: "Pausa entre lotes" } });
      await enqueueMessage(msg.id, retoma);
      return { status: "REAGENDADA" };
    }
  }

  await prisma.message.update({ where: { id: msg.id }, data: { status: "ENVIANDO", tentativas: { increment: 1 } } });
  try {
    const evo = getEvolution();
    let res: { id: string | null };
    if (msg.anexoDocument) {
      const arquivo = await readFile(resolveStoragePath(msg.anexoDocument.caminho));
      res = await evo.sendDocument(msg.telefone, arquivo, msg.anexoDocument.nomeArquivo, msg.conteudo, msg.anexoDocument.mimeType);
    } else {
      res = await evo.sendText(msg.telefone, msg.conteudo);
    }
    await prisma.message.update({ where: { id: msg.id }, data: { status: "ENVIADA", enviadaEm: new Date(), evolutionId: res.id, erro: null } });
    // Avulsa também espaça (protege o número), mas sem lote.
    return { status: "ENVIADA", pausaMs: randomIntervalMs(settings.intervaloMinSeg, settings.intervaloMaxSeg) };
  } catch (err) {
    // Volta para AGENDADA para o retry da fila conseguir reprocessar.
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "AGENDADA", erro: err instanceof Error ? err.message.slice(0, 500) : "Falha no envio" },
    });
    throw err;
  }
}

/** Chamado quando a fila esgotou as tentativas. */
export async function markFailed(messageId: string, erro: string) {
  await prisma.message.updateMany({ where: { id: messageId, status: { in: ["AGENDADA", "ENVIANDO"] } }, data: { status: "FALHOU", erro: erro.slice(0, 500) } });
}
