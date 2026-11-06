// Gestão da equipe (usuários do escritório).
// Convite: cria o usuário sem senha utilizável e manda por e-mail o link "defina sua senha"
// (mesma tabela/fluxo da redefinição, validade de 72 h). Remover = desativar (soft delete).
import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { UserCreateSchema, UserInviteSchema, UserUpdateSchema } from "@ss/shared";
import type { User } from "@prisma/client";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { userDTO } from "../../lib/serialize";
import { audit } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { sha256 } from "../../lib/crypto";
import { isMailConfigured, sendMail } from "../../lib/mailer";

const IdParams = z.object({ id: z.string().min(1) });
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/** Versão enxuta para a auditoria (sem a foto). */
const auditView = (u: User) => ({ nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo });

async function activeAdmins(exceptId?: string) {
  return prisma.user.count({ where: { perfil: "ADMIN", ativo: true, ...(exceptId ? { id: { not: exceptId } } : {}) } });
}

/** Gera o link de primeiro acesso e tenta mandar por e-mail. Sem SMTP (ou se o envio falhar), devolve o link ao ADMIN. */
async function sendInvite(req: FastifyRequest, user: User): Promise<{ emailEnviado: boolean; link?: string }> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) } }),
  ]);
  const link = `${env.WEB_URL.replace(/\/$/, "")}/redefinir-senha?convite=1&token=${encodeURIComponent(token)}`;
  if (!isMailConfigured()) return { emailEnviado: false, link };
  const primeiro = user.nome.split(/\s+/)[0] ?? "";
  try {
    await sendMail({
      to: user.email,
      subject: "Seu acesso ao sistema da Serginho Seguros",
      text: `Olá ${primeiro},

Você foi convidado(a) para usar o sistema da Serginho Seguros.
Crie sua senha pelo link abaixo (vale por 72 horas e só funciona uma vez):

${link}

Depois é só entrar com este e-mail (${user.email}) e a senha que você criou.`,
      html: `<p>Olá ${escapeHtml(primeiro)},</p><p>Você foi convidado(a) para usar o sistema da <strong>Serginho Seguros</strong>.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#eebd25;color:#09090a;border-radius:10px;text-decoration:none;font-weight:700">Criar minha senha</a></p><p style="color:#666;font-size:13px">O link vale por 72 horas e só funciona uma vez. Depois, entre com o e-mail ${escapeHtml(user.email)} e a senha que você criou.</p>`,
    });
    return { emailEnviado: true };
  } catch (err) {
    req.log.error({ err: err instanceof Error ? err.message : "falha" }, "falha ao enviar convite");
    return { emailEnviado: false, link };
  }
}

export default async function userRoutes(app: FastifyInstance) {
  // Lista (também usada para escolher responsável de lead): qualquer perfil vê nome e perfil;
  // e-mail e último acesso só para ADMIN.
  app.get("/", async (req) => {
    const users = await prisma.user.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
    const admin = req.user.perfil === "ADMIN";
    return users.map((u) => (admin ? userDTO(u) : { ...userDTO(u), email: "", ultimoLogin: undefined }));
  });

  app.post("/", { onRequest: [app.requireRole("ADMIN")] }, async (req, reply) => {
    const input = parse(UserCreateSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: input.email } })) throw conflict("Já existe um usuário com este e-mail");
    const user = await prisma.user.create({
      data: { nome: input.nome, email: input.email, perfil: input.perfil, senhaHash: await bcrypt.hash(input.senha, 12) },
    });
    await audit(req, "CRIAR", "User", user.id, null, auditView(user));
    return reply.status(201).send(userDTO(user));
  });

  /** Convida (ou reenvia o convite de quem ainda não entrou). */
  app.post("/invite", { onRequest: [app.requireRole("ADMIN")], config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const input = parse(UserInviteSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    let user: User;
    if (existing) {
      if (existing.ultimoLogin && existing.ativo) throw conflict("Este e-mail já tem acesso ao sistema");
      user = await prisma.user.update({ where: { id: existing.id }, data: { nome: input.nome, perfil: input.perfil, ativo: true } });
      await audit(req, "REENVIAR_CONVITE", "User", user.id, auditView(existing), auditView(user));
    } else {
      // Senha aleatória descartada: a conta só fica utilizável depois do link.
      user = await prisma.user.create({
        data: { nome: input.nome, email: input.email, perfil: input.perfil, senhaHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) },
      });
      await audit(req, "CONVIDAR", "User", user.id, null, auditView(user));
    }
    const envio = await sendInvite(req, user);
    return reply.status(existing ? 200 : 201).send({ user: userDTO(user), ...envio });
  });

  app.patch("/:id", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(UserUpdateSchema, req.body);
    if (id === req.user.sub && (input.ativo === false || (input.perfil && input.perfil !== "ADMIN"))) {
      throw badRequest("Você não pode desativar nem rebaixar o próprio usuário");
    }
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound("Usuário");
    const perdeAdmin = before.perfil === "ADMIN" && before.ativo && (input.ativo === false || (input.perfil && input.perfil !== "ADMIN"));
    if (perdeAdmin && (await activeAdmins(id)) === 0) throw badRequest("É preciso manter ao menos um administrador ativo");
    const user = await prisma.user.update({
      where: { id },
      data: {
        nome: input.nome,
        perfil: input.perfil,
        ativo: input.ativo,
        ...(input.senha ? { senhaHash: await bcrypt.hash(input.senha, 12) } : {}),
      },
    });
    if (input.senha || input.ativo === false) {
      // Troca de senha/desativação encerra as sessões abertas.
      await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(req, "ATUALIZAR", "User", id, auditView(before), auditView(user));
    return userDTO(user);
  });

  /** Remove da equipe = desativa (histórico e auditoria continuam apontando para o usuário). */
  app.delete("/:id", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    if (id === req.user.sub) throw badRequest("Você não pode remover o próprio usuário");
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw notFound("Usuário");
    if (before.perfil === "ADMIN" && before.ativo && (await activeAdmins(id)) === 0) throw badRequest("É preciso manter ao menos um administrador ativo");
    const now = new Date();
    const [user] = await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { ativo: false } }),
      prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.passwordResetToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: now } }),
    ]);
    await audit(req, "REMOVER", "User", id, auditView(before), auditView(user));
    return userDTO(user);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
