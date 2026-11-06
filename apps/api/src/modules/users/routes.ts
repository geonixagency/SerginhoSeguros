// Gestão de usuários do escritório (só ADMIN).
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { UserCreateSchema, UserUpdateSchema } from "@ss/shared";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { userDTO } from "../../lib/serialize";
import { audit } from "../../lib/audit";
import { badRequest } from "../../lib/errors";

const IdParams = z.object({ id: z.string().min(1) });

export default async function userRoutes(app: FastifyInstance) {
  // Lista simples (usada também para escolher responsável de lead) — qualquer perfil.
  app.get("/", async () => {
    const users = await prisma.user.findMany({ orderBy: { nome: "asc" } });
    return users.map(userDTO);
  });

  app.post("/", { onRequest: [app.requireRole("ADMIN")] }, async (req, reply) => {
    const input = parse(UserCreateSchema, req.body);
    const user = await prisma.user.create({
      data: { nome: input.nome, email: input.email, perfil: input.perfil, senhaHash: await bcrypt.hash(input.senha, 12) },
    });
    await audit(req, "CRIAR", "User", user.id, null, userDTO(user));
    return reply.status(201).send(userDTO(user));
  });

  app.patch("/:id", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(UserUpdateSchema, req.body);
    if (id === req.user.sub && (input.ativo === false || (input.perfil && input.perfil !== "ADMIN"))) {
      throw badRequest("Você não pode desativar nem rebaixar o próprio usuário");
    }
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
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
    await audit(req, "ATUALIZAR", "User", id, userDTO(before), userDTO(user));
    return userDTO(user);
  });
}
