// Autenticação (JWT de acesso no header Authorization) e autorização por perfil.
import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Perfil } from "@ss/shared";
import { env } from "../config/env";
import { forbidden, unauthorized } from "../lib/errors";

export interface AccessTokenPayload {
  sub: string;
  perfil: Perfil;
  nome: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...perfis: Perfil[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  await app.register(fastifyJwt, { secret: env.JWT_SECRET, sign: { expiresIn: env.JWT_ACCESS_TTL } });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized("Sessão expirada ou inválida");
    }
  });

  app.decorate("requireRole", (...perfis: Perfil[]) => async (req: FastifyRequest) => {
    if (!req.user) throw unauthorized();
    if (!perfis.includes(req.user.perfil)) throw forbidden();
  });
});
