// Login, refresh com rotação, "me" (perfil) e redefinição de senha por link no e-mail.
// Access token (curto) vai no corpo; refresh token (longo) só em cookie httpOnly,
// para não ficar acessível a JavaScript no navegador.
import type { FastifyInstance, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { ForgotPasswordSchema, LoginSchema, ProfileUpdateSchema, ResetPasswordSchema, type LoginResponse } from "@ss/shared";
import type { User } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { badRequest, unauthorized, unavailable } from "../../lib/errors";
import { isMailConfigured, sendMail } from "../../lib/mailer";
import { sha256 } from "../../lib/crypto";
import { userDTO } from "../../lib/serialize";
import { audit } from "../../lib/audit";

const REFRESH_COOKIE = "ss_rt";
const RESET_TTL_MS = 60 * 60 * 1000; // 1 h
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

  app.patch("/me", { onRequest: [app.authenticate] }, async (req) => {
    const input = parse(ProfileUpdateSchema, req.body);
    const before = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!before || !before.ativo) throw unauthorized();
    const user = await prisma.user.update({
      where: { id: before.id },
      data: { ...(input.nome !== undefined ? { nome: input.nome } : {}), ...(input.avatar !== undefined ? { avatar: input.avatar } : {}) },
    });
    // A foto em si não vai para a auditoria (só se mudou).
    await audit(
      req,
      "ATUALIZAR_PERFIL",
      "User",
      user.id,
      { nome: before.nome, avatar: before.avatar ? "[foto]" : null },
      { nome: user.nome, avatar: input.avatar === undefined ? undefined : input.avatar ? "[foto nova]" : null },
    );
    return userDTO(user);
  });

  /**
   * Pede o link de redefinição. Responde igual exista ou não o e-mail (não revela usuários).
   * O token vai só no e-mail; no banco fica o hash. Uso único, expira em 1 h.
   */
  app.post(
    "/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const { email } = parse(ForgotPasswordSchema, req.body);
      if (!isMailConfigured()) {
        throw unavailable("O envio de e-mail ainda não foi configurado no servidor (SMTP). Fale com o administrador.");
      }
      const user = await prisma.user.findUnique({ where: { email } });
      if (user?.ativo) {
        const token = randomBytes(32).toString("base64url");
        await prisma.$transaction([
          // Pedido novo invalida links anteriores ainda não usados.
          prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
          prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
        ]);
        const link = `${env.WEB_URL.replace(/\/$/, "")}/redefinir-senha?token=${encodeURIComponent(token)}`;
        const primeiro = user.nome.split(/\s+/)[0] ?? "";
        // Envio fora do caminho da resposta: o tempo de resposta não indica se o e-mail existe.
        void sendMail({
          to: user.email,
          subject: "Redefinição de senha · Serginho Seguros",
          text: `Olá ${primeiro},

Recebemos um pedido para redefinir sua senha no sistema da Serginho Seguros.
Use o link abaixo em até 1 hora (ele só funciona uma vez):

${link}

Se não foi você, ignore este e-mail: sua senha continua a mesma.`,
          html: `<p>Olá ${escapeHtml(primeiro)},</p><p>Recebemos um pedido para redefinir sua senha no sistema da <strong>Serginho Seguros</strong>.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#eebd25;color:#09090a;border-radius:10px;text-decoration:none;font-weight:700">Criar nova senha</a></p><p style="color:#666;font-size:13px">O link vale por 1 hora e só funciona uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
        }).catch((err: unknown) => req.log.error({ err: err instanceof Error ? err.message : "falha" }, "falha ao enviar e-mail de redefinição"));
        await audit(req, "PEDIR_REDEFINICAO_SENHA", "User", user.id);
      }
      return { ok: true };
    },
  );

  app.post(
    "/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req) => {
      const { token, senha } = parse(ResetPasswordSchema, req.body);
      const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
      if (!stored || stored.usedAt || stored.expiresAt < new Date() || !stored.user.ativo) {
        throw badRequest("Link inválido ou expirado. Peça um novo link de redefinição.");
      }
      const senhaHash = await bcrypt.hash(senha, 12);
      const now = new Date();
      await prisma.$transaction([
        prisma.user.update({ where: { id: stored.userId }, data: { senhaHash } }),
        prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: now } }),
        // Senha nova derruba todas as sessões abertas.
        prisma.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: now } }),
      ]);
      req.user = { sub: stored.userId, perfil: stored.user.perfil, nome: stored.user.nome };
      await audit(req, "REDEFINIR_SENHA", "User", stored.userId);
      return { ok: true };
    },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
