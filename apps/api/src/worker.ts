// Worker de filas + agendador. Pode rodar dentro do processo da API (RUN_WORKER=true,
// padrão) ou isolado: `node dist/worker.js` (escala horizontal sem duplicar envios,
// pois a fila de mensagens tem concorrência 1 por worker e o agendador é único no Redis).
import { Worker, type Job } from "bullmq";
import pino from "pino";
import type { FastifyBaseLogger } from "fastify";
import { createRedis } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { MESSAGES_QUEUE, SCHEDULER_QUEUE, enqueueMessage, getSchedulerQueue } from "./modules/messaging/queue";
import { markFailed, processMessage } from "./modules/messaging/sender";
import { runRulesTick } from "./modules/messaging/engine";
import { recalcAllStatuses } from "./modules/policies/rules";

const TZ = "America/Sao_Paulo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reenfileira mensagens AGENDADA que ficaram sem job (ex.: Redis reiniciado sem persistência). */
async function reconcileQueue(log: FastifyBaseLogger) {
  const pendentes = await prisma.message.findMany({ where: { status: "AGENDADA" }, select: { id: true, agendadaPara: true }, take: 5000 });
  for (const m of pendentes) await enqueueMessage(m.id, m.agendadaPara);
  if (pendentes.length) log.info({ total: pendentes.length }, "mensagens pendentes reconciliadas com a fila");
}

export async function startWorkers(log: FastifyBaseLogger) {
  const messages = new Worker(
    MESSAGES_QUEUE,
    async (job: Job<{ messageId: string }>) => {
      const r = await processMessage(job.data.messageId);
      // Intervalo aleatório entre envios (50–230 s por padrão): a fila tem concorrência 1,
      // então segurar o worker aqui espaça naturalmente as mensagens.
      if (r.pausaMs) await sleep(r.pausaMs);
      return r;
    },
    // Lock maior que o intervalo máximo permitido (540 s) para o job não ser dado como travado.
    { connection: createRedis(), concurrency: 1, lockDuration: 600_000 },
  );
  messages.on("failed", async (job, err) => {
    if (!job) return;
    log.warn({ err: err.message, messageId: job.data.messageId, tentativa: job.attemptsMade }, "envio falhou");
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) await markFailed(job.data.messageId, err.message);
  });

  const scheduler = new Worker(
    SCHEDULER_QUEUE,
    async (job) => {
      if (job.name === "rules-tick") return runRulesTick(log);
      if (job.name === "daily-status") return recalcAllStatuses();
      if (job.name === "reconcile") return reconcileQueue(log);
      throw new Error(`Job desconhecido: ${job.name}`);
    },
    { connection: createRedis(), concurrency: 1 },
  );
  scheduler.on("failed", (job, err) => log.error({ err, job: job?.name }, "job agendado falhou"));

  // upsertJobScheduler é idempotente: reiniciar a API não duplica os agendamentos.
  const q = getSchedulerQueue();
  await q.upsertJobScheduler("rules-tick", { pattern: "5 * * * *", tz: TZ }, { name: "rules-tick" });
  await q.upsertJobScheduler("daily-status", { pattern: "0 3 * * *", tz: TZ }, { name: "daily-status" });
  await q.upsertJobScheduler("reconcile", { pattern: "*/30 * * * *", tz: TZ }, { name: "reconcile" });
  await reconcileQueue(log);
  log.info("workers e agendador iniciados (réguas a cada hora, status diário às 03:00)");

  return async () => {
    await Promise.all([messages.close(), scheduler.close()]);
  };
}

// Execução isolada: `node dist/worker.js` / `tsx src/worker.ts`.
const isMain = process.argv[1] && /worker\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const log = pino({ level: process.env.LOG_LEVEL ?? "info" }) as unknown as FastifyBaseLogger;
  startWorkers(log).catch((err) => {
    log.error({ err }, "falha ao iniciar workers");
    process.exit(1);
  });
}
