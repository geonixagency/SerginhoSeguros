// Filas BullMQ. "messages" = envio individual (concorrência 1 para respeitar o
// intervalo aleatório entre mensagens); "scheduler" = jobs recorrentes (réguas e status).
import { Queue } from "bullmq";
import { createRedis } from "../../lib/redis";

export const MESSAGES_QUEUE = "messages";
export const SCHEDULER_QUEUE = "scheduler";

let messagesQueue: Queue | null = null;
let schedulerQueue: Queue | null = null;

export function getMessagesQueue(): Queue {
  messagesQueue ??= new Queue(MESSAGES_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { age: 7 * 86400, count: 5000 },
      removeOnFail: { age: 30 * 86400 },
    },
  });
  return messagesQueue;
}

export function getSchedulerQueue(): Queue {
  schedulerQueue ??= new Queue(SCHEDULER_QUEUE, { connection: createRedis() });
  return schedulerQueue;
}

/**
 * Enfileira o envio de uma mensagem. O jobId inclui o horário agendado: reenfileirar
 * a mesma mensagem para o mesmo horário é no-op (idempotente), e reagendar gera job novo.
 */
export async function enqueueMessage(messageId: string, agendadaPara: Date): Promise<void> {
  const delay = Math.max(0, agendadaPara.getTime() - Date.now());
  await getMessagesQueue().add("send", { messageId }, { jobId: `msg-${messageId}-${agendadaPara.getTime()}`, delay });
}

export async function closeQueues() {
  await Promise.all([messagesQueue?.close(), schedulerQueue?.close()]);
  messagesQueue = null;
  schedulerQueue = null;
}
