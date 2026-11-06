// API HTTP interna do robô de portais (rede do docker; nunca exposta na internet).
// A API do backend chama com Authorization: Bearer <ROBOT_TOKEN>.
//
// Rotas:
//   GET  /health                      vivacidade
//   GET  /status/:insurer             a sessão está válida? (detecta redirect para o login)
//   POST /login/:insurer              { usuario, senha, susep? } -> login automático / needs_human
//   POST /tokio/client                { cpfCnpj } -> apólices + parcelas + contatos
//   POST /porto/installments          { filtros } -> parcelas (vencidas, débito recusado, período, cpf)
//   POST /porto/billet                { chaveBoleto } -> { base64 } (2ª via / PIX, se disponível)
import Fastify from "fastify";
import { z } from "zod";
import { loadEnv } from "./config";
import { SessionManager } from "./session";
import { fetchClient } from "./insurers/tokio";
import { getBilletBase64, listInstallments, type PortoFilters } from "./insurers/porto";
import { INSURERS, RobotError, type RobotInsurer } from "./types";

const InsurerParam = z.object({ insurer: z.enum(INSURERS) });
const LoginBody = z.object({ usuario: z.string().min(1), senha: z.string().min(1), susep: z.string().optional() });
const TokioBody = z.object({ cpfCnpj: z.string().min(1) });
const PortoBody = z.object({
  vencidas: z.boolean().optional(),
  debitoRecusado: z.boolean().optional(),
  status: z.array(z.enum(["OVERDUE", "DUE", "PROCESSING", "PAID", "CANCELLED"])).optional(),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cpfCnpj: z.string().optional(),
  suseps: z.array(z.string()).optional(),
  pagina: z.number().int().min(1).optional(),
  tamanhoPagina: z.number().int().min(1).max(200).optional(),
  maxPaginas: z.number().int().min(1).max(50).optional(),
});
const BilletBody = z.object({
  chaveBoleto: z.object({
    paymentTitle: z.string(),
    companyCode: z.string(),
    paymentTypeCode: z.string(),
    policy: z.string(),
    productId: z.string(),
    system: z.string(),
    proposal: z.string(),
    installmentNumber: z.string(),
  }),
});

function errorStatus(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof RobotError) return { status: err.httpStatus, code: err.code, message: err.message };
  if (err instanceof z.ZodError) return { status: 400, code: "BAD_REQUEST", message: err.issues.map((i) => i.message).join("; ") };
  return { status: 502, code: "PORTAL_ERROR", message: err instanceof Error ? err.message : "Falha inesperada" };
}

export async function buildServer(envOverride?: NodeJS.ProcessEnv) {
  const env = loadEnv(envOverride);
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, bodyLimit: 1_000_000 });
  const sessions = new SessionManager(env);

  // Autenticação por token compartilhado (a senha do portal nunca passa por aqui em claro além do body do /login).
  app.addHook("onRequest", async (req, reply) => {
    if (req.url === "/health") return;
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (token !== env.ROBOT_TOKEN) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Token do robô inválido" });
  });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  app.get("/status/:insurer", async (req) => {
    const { insurer } = InsurerParam.parse(req.params);
    return sessions.status(insurer);
  });

  // Uso do orçamento diário (logins e consultas) — sem dados sensíveis.
  app.get("/budget/:insurer", async (req) => {
    const { insurer } = InsurerParam.parse(req.params);
    return sessions.budget.resumo(insurer);
  });

  app.post("/login/:insurer", async (req) => {
    const { insurer } = InsurerParam.parse(req.params);
    const cred = LoginBody.parse(req.body);
    // Não logamos o corpo (contém senha): só o resultado.
    const r = await sessions.login(insurer, cred);
    req.log.info({ insurer, status: r.status }, "login do robô");
    return r;
  });

  app.post("/tokio/client", async (req) => {
    const { cpfCnpj } = TokioBody.parse(req.body);
    return sessions.runLogged("tokio", (page) => fetchClient(page, cpfCnpj, env.ROBOT_DEBUG_SHAPES));
  });

  app.post("/porto/installments", async (req) => {
    const filtros = PortoBody.parse(req.body) as PortoFilters;
    return sessions.runLogged("porto", (page) => listInstallments(page, filtros, env.ROBOT_DEBUG_SHAPES));
  });

  app.post("/porto/billet", async (req) => {
    const { chaveBoleto } = BilletBody.parse(req.body);
    const base64 = await sessions.runLogged("porto", (page) => getBilletBase64(page, chaveBoleto));
    return { base64 };
  });

  app.setErrorHandler((err, req, reply) => {
    const { status, code, message } = errorStatus(err);
    req.log.warn({ code, message }, "erro no robô");
    reply.code(status).send({ code, message });
  });

  app.addHook("onClose", async () => {
    await sessions.closeAll();
  });

  return { app, env, sessions };
}

// Execução direta: tsx src/server.ts / node dist/server.js
const isMain = process.argv[1] && /server\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  buildServer()
    .then(async ({ app, env }) => {
      await app.listen({ host: env.ROBOT_HOST, port: env.ROBOT_PORT });
      const stop = async () => {
        await app.close();
        process.exit(0);
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    })
    .catch((err) => {
      console.error("falha ao iniciar o robô de portais:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
