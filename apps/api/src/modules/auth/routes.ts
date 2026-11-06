// Login, refresh com rotação e "me".
// Access token (curto) vai no corpo; refresh token (longo) só em cookie httpOnly,
// para não ficar acessível a JavaScript no navegador.
import type { FastifyInstance, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { LoginSchema, type LoginResponse } from "@ss/shared";
import type { User } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { unauthorized } from "../../lib/errors";
import { sha256 } from "../../lib/crypto";
import { userDTO } from "../../lib/serialize";
import { audit } from "../../lib/audit";

const REFRESH_COOKIE = "ss_rt";
// Hash fixo para comparar quando o e-mail não existe (evita diferença de tempo que revelaria usuários).
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 12);

function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: "/api/auth",
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86400,
  });
}

async function issueTokens(app: FastifyInstance, reply: FastifyReply, user: User, familia: string): Promise<LoginResponse> {
  const refresh = randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refresh),
      familia,
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400_000),
    },
  });
  setRefreshCookie(reply, refresh);
  const accessToken = app.jwt.sign({ sub: user.id, perfil: user.perfil, nome: user.nome });
  return { accessToken, expiresIn: env.JWT_ACCESS_TTL, user: userDTO(user) };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { email, senha } = parse(LoginSchema, req.body);
      const user = await prisma.user.findUnique({ where: { email } });
      const ok = await bcrypt.compare(senha, user?.senhaHash ?? DUMMY_HASH);
      if (!user || !ok || !user.ativo) {
        req.log.warn({ email: email.replace(/(^.).*(@.*$)/, "$1***$2") }, "login recusado");
        throw unauthorized("E-mail ou senha incorretos");
      }
      await prisma.user.update({ where: { id: user.id }, data: { ultimoLogin: new Date() } });
      req.user = { sub: user.id, perfil: user.perfil, nome: user.nome };
      await audit(req, "LOGIN", "User", user.id);
      return issueTokens(app, reply, user, randomUUID());
    },
  );

  app.post(
    "/refresh",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const token = req.cookies[REFRESH_COOKIE];
      if (!token) throw unauthorized("Sessão expirada");
      const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
      if (!stored) throw unauthorized("Sessão expirada");
      if (stored.revokedAt) {
        // Reuso de refresh já rotacionado = possível roubo: revoga a família inteira.
        await prisma.refreshToken.updateMany({ where: { familia: stored.familia, revokedAt: null }, data: { revokedAt: new Date() } });
        req.log.warn({ userId: stored.userId }, "reuso de refresh token detectado; sessão revogada");
        throw unauthorized("Sessão revogada. Faça login novamente.");
      }
      if (stored.expiresAt < new Date() || !stored.user.ativo) throw unauthorized("Sessão expirada");
      await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
      return issueTokens(app, reply, stored.user, stored.familia);
    },
  );

  app.post("/logout", async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) {
      await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return { ok: true };
  });

  app.get("/me", { onRequest: [app.authenticate] }, async (req) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || !user.ativo) throw unauthorized();
    return userDTO(user);
  });
}
