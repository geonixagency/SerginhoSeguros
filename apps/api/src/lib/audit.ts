import type { FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Campos que nunca devem ir para o log de auditoria em claro.
const SENSITIVE = new Set(["senha", "senhaHash", "segredoCriptografado", "valores", "token", "accessToken"]);

function scrub(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (k, val) => (SENSITIVE.has(k) ? "[omitido]" : typeof val === "bigint" ? String(val) : val)),
  ) as Prisma.InputJsonValue;
}

/**
 * Registra ação no AuditLog (LGPD). Falha de auditoria é logada mas não derruba a
 * requisição do usuário — o erro fica visível no log da aplicação.
 */
export async function audit(
  req: FastifyRequest | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  antes?: unknown,
  depois?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req?.user?.sub ?? null,
        acao,
        entidade,
        entidadeId,
        antes: scrub(antes),
        depois: scrub(depois),
        ip: req?.ip ?? null,
      },
    });
  } catch (err) {
    req?.log.error({ err, acao, entidade, entidadeId }, "falha ao gravar auditoria");
  }
}
