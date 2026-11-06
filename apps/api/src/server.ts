import { env } from "./config/env";
import { buildApp } from "./app";
import { prisma } from "./lib/prisma";
import { closeQueues } from "./modules/messaging/queue";
import { startWorkers } from "./worker";

async function main() {
  const app = await buildApp();
  let stopWorkers: (() => Promise<void>) | null = null;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "encerrando");
    await app.close();
    await stopWorkers?.();
    await closeQueues();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.PORT, host: env.HOST });
  if (env.RUN_WORKER) stopWorkers = await startWorkers(app.log);
  if (env.CONNECTORS_DEMO) app.log.warn("CONNECTORS_DEMO=true: seguradoras usam o MockConnector (dados fictícios)");
  if (env.EVOLUTION_MOCK) app.log.warn("EVOLUTION_MOCK=true: nenhuma mensagem real será enviada");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
