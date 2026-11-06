// Criação de mensagens (idempotente) e configurações globais de disparo.
import { Prisma, type MessagingSettings } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { todayIso } from "../../lib/dates";
import { enqueueMessage } from "./queue";

export async function getSettings(): Promise<MessagingSettings> {
  return prisma.messagingSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

/** Início do dia atual em São Paulo (instante UTC). */
export function startOfTodaySp(now = new Date()): Date {
  return new Date(`${todayIso(now)}T00:00:00.000-03:00`);
}

export async function countSentToday(now = new Date()): Promise<number> {
  return prisma.message.count({ where: { status: "ENVIADA", enviadaEm: { gte: startOfTodaySp(now) } } });
}

export interface NewMessage {
  /** null em mensagens para leads (ainda sem cadastro de cliente). */
  clientId: string | null;
  telefone: string;
  conteudo: string;
  ruleId?: string | null;
  installmentId?: string | null;
  templateId?: string | null;
  anexoDocumentId?: string | null;
  broadcastId?: string | null;
  dedupeKey?: string | null;
  agendadaPara?: Date;
}

/**
 * Cria a mensagem e enfileira. Se a chave de idempotência já existe, não faz nada
 * e devolve null — é isso que garante "uma mensagem por (régua, parcela)" mesmo
 * que o agendador rode várias vezes no mesmo dia.
 */
export async function createAndEnqueue(m: NewMessage): Promise<string | null> {
  // Checagem prévia evita ruído de log no caso comum (régua reavaliada no mesmo dia);
  // o unique do banco continua sendo a garantia real contra corrida entre processos.
  if (m.dedupeKey && (await prisma.message.findUnique({ where: { dedupeKey: m.dedupeKey }, select: { id: true } }))) return null;
  try {
    const msg = await prisma.message.create({
      data: { ...m, agendadaPara: m.agendadaPara ?? new Date() },
    });
    await enqueueMessage(msg.id, msg.agendadaPara);
    return msg.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}
