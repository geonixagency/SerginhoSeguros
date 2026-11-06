// Rotas públicas (sem login): só o formulário de cotação do site institucional.
// Limite de taxa apertado + honeypot (campo `site` precisa vir vazio, senão 400); o lead entra no CRM na etapa NOVO com origem "site".
import type { FastifyInstance } from "fastify";
import { PublicLeadSchema } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";

export default async function publicRoutes(app: FastifyInstance) {
  app.post("/leads", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const input = parse(PublicLeadSchema, req.body);
    await prisma.lead.create({
      data: {
        nome: input.nome,
        telefone: input.telefone,
        email: input.email ?? null,
        produto: input.produto ?? null,
        origem: "site",
        etapa: "NOVO",
        notas: input.mensagem ?? null,
      },
    });
    // Não devolve o id nem ecoa os dados: a rota é pública.
    return reply.status(201).send({ ok: true });
  });
}
