// Sinistros: registro do ocorrido (cliente + apólice), histórico no perfil do cliente.
//   GET    /claims          lista (filtros: clientId, policyId, status, q = nome do cliente)
//   POST   /claims          registra
//   PATCH  /claims/:id      atualiza (status, protocolo, valor...)
//   DELETE /claims/:id      remove
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ClaimCreateSchema, ClaimListQuerySchema, ClaimUpdateSchema, type ClaimDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { pageArgs, paginated } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { badRequest, notFound } from "../../lib/errors";
import { dateOnly, toIsoDate } from "../../lib/dates";
import { money } from "../../lib/serialize";

const IdParams = z.object({ id: z.string().min(1) });
const include = {
  client: { select: { id: true, nome: true } },
  policy: { select: { id: true, numero: true, ramo: true, insurer: { select: { nome: true } }, items: { select: { placa: true } } } },
} satisfies Prisma.ClaimInclude;
type Row = Prisma.ClaimGetPayload<{ include: typeof include }>;

export function claimDTO(c: Row): ClaimDTO {
  return {
    id: c.id,
    clientId: c.client.id,
    clientNome: c.client.nome,
    policyId: c.policy.id,
    policyNumero: c.policy.numero,
    ramo: c.policy.ramo,
    seguradora: c.policy.insurer.nome,
    placa: c.policy.items.find((i) => i.placa)?.placa ?? null,
    dataOcorrencia: toIsoDate(c.dataOcorrencia) ?? "",
    tipo: c.tipo,
    descricao: c.descricao,
    local: c.local,
    protocolo: c.protocolo,
    valor: money(c.valor),
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export default async function claimRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = parse(ClaimListQuerySchema, req.query);
    const where: Prisma.ClaimWhereInput = {
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.policyId ? { policyId: q.policyId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { client: { nome: { contains: q.q, mode: "insensitive" } } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.claim.findMany({ where, include, orderBy: [{ dataOcorrencia: "desc" }, { createdAt: "desc" }], ...pageArgs(q) }),
      prisma.claim.count({ where }),
    ]);
    return paginated(rows.map(claimDTO), total, q);
  });

  app.post("/", async (req, reply) => {
    const input = parse(ClaimCreateSchema, req.body);
    const policy = await prisma.policy.findUnique({ where: { id: input.policyId }, select: { clientId: true } });
    if (!policy) throw notFound("Apólice");
    if (policy.clientId !== input.clientId) throw badRequest("A apólice escolhida não é deste cliente");
    const c = await prisma.claim.create({
      data: { ...input, dataOcorrencia: dateOnly(input.dataOcorrencia), valor: input.valor ?? null, createdBy: req.user.sub },
      include,
    });
    await audit(req, "CRIAR", "Claim", c.id, null, { clientId: c.clientId, policyId: c.policyId, tipo: c.tipo });
    return reply.status(201).send(claimDTO(c));
  });

  app.patch("/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(ClaimUpdateSchema, req.body);
    const before = await prisma.claim.findUnique({ where: { id } });
    if (!before) throw notFound("Sinistro");
    if (input.policyId && input.policyId !== before.policyId) {
      const p = await prisma.policy.findUnique({ where: { id: input.policyId }, select: { clientId: true } });
      if (!p || p.clientId !== before.clientId) throw badRequest("A apólice escolhida não é deste cliente");
    }
    const { dataOcorrencia, ...rest } = input;
    const c = await prisma.claim.update({
      where: { id },
      data: { ...rest, ...(dataOcorrencia ? { dataOcorrencia: dateOnly(dataOcorrencia) } : {}) },
      include,
    });
    await audit(req, "ATUALIZAR", "Claim", id, { status: before.status }, input);
    return claimDTO(c);
  });

  app.delete("/:id", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const c = await prisma.claim.findUnique({ where: { id }, select: { id: true, clientId: true, tipo: true } });
    if (!c) throw notFound("Sinistro");
    await prisma.claim.delete({ where: { id } });
    await audit(req, "EXCLUIR", "Claim", id, c, null);
    return reply.status(204).send();
  });
}
