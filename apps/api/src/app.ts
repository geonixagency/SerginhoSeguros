// Monta a instância Fastify (plugins, tratamento de erro e rotas). Separado do
// server.ts para os testes poderem usar app.inject() sem abrir porta.
import Fastify, { type FastifyError } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { Prisma } from "@prisma/client";
import { corsOrigins, env } from "./config/env";
import { AppError } from "./lib/errors";
import authPlugin from "./plugins/auth";
import authRoutes from "./modules/auth/routes";
import userRoutes from "./modules/users/routes";
import dashboardRoutes from "./modules/dashboard/routes";
import clientRoutes from "./modules/clients/routes";
import documentRoutes from "./modules/documents/routes";
import policyRoutes from "./modules/policies/routes";
import insurerRoutes from "./modules/insurers/routes";
import actionRoutes from "./modules/actions/routes";
import messagingRoutes from "./modules/messaging/routes";
import leadRoutes from "./modules/leads/routes";
import publicRoutes from "./modules/public/routes";
import quoteRoutes from "./modules/quotes/routes";
import taskRoutes from "./modules/tasks/routes";
import { webhookRoutes } from "./modules/messaging/webhook";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Nunca logar credenciais/tokens que passem por headers ou body.
      redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.apikey", "*.senha", "*.valores"],
      ...(env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : {}),
    },
    trustProxy: true, // atrás do Caddy
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } });
  await app.register(cors, { origin: corsOrigins, credentials: true, methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10 } });
  await app.register(authPlugin);

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return reply.status(409).send({ error: { code: "CONFLICT", message: "Registro duplicado", details: err.meta } });
      }
      if (err.code === "P2025") {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Registro não encontrado" } });
      }
      if (err.code === "P2003") {
        return reply.status(400).send({ error: { code: "INVALID_REFERENCE", message: "Referência inválida" } });
      }
    }
    const fe = err as FastifyError;
    if (fe.statusCode && fe.statusCode < 500) {
      const code = fe.code === "FST_REQ_FILE_TOO_LARGE" ? "FILE_TOO_LARGE" : (fe.code ?? "BAD_REQUEST");
      return reply.status(fe.statusCode).send({ error: { code, message: fe.message } });
    }
    req.log.error({ err }, "erro não tratado");
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Erro interno. Tente novamente." } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: "ROUTE_NOT_FOUND", message: `Rota ${req.method} ${req.url} não existe` } }),
  );

  app.get("/api/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: "/auth" });
      await api.register(publicRoutes, { prefix: "/public" });
      // Tudo abaixo exige usuário autenticado.
      await api.register(async (priv) => {
        priv.addHook("onRequest", priv.authenticate);
        await priv.register(userRoutes, { prefix: "/users" });
        await priv.register(dashboardRoutes, { prefix: "/dashboard" });
        await priv.register(clientRoutes, { prefix: "/clients" });
        await priv.register(actionRoutes, { prefix: "/clients" });
        await priv.register(documentRoutes);
        await priv.register(policyRoutes);
        await priv.register(insurerRoutes, { prefix: "/insurers" });
        await priv.register(messagingRoutes, { prefix: "/messaging" });
        await priv.register(leadRoutes, { prefix: "/leads" });
        await priv.register(quoteRoutes, { prefix: "/quotes" });
        await priv.register(taskRoutes, { prefix: "/tasks" });
      });
      // Webhook da Evolution: autenticado por token próprio, não por JWT.
      await api.register(webhookRoutes, { prefix: "/webhooks" });
    },
    { prefix: "/api" },
  );

  return app;
}
