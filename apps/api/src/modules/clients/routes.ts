// Rotas de clientes (lista com busca, ficha, edição, timeline e LGPD).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ClientCreateSchema, ClientListQuerySchema, ClientUpdateSchema, type ClientListItemDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { pageArgs, paginated } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { conflict } from "../../lib/errors";
import { dateOnly, todayIso, toIsoDate } from "../../lib/dates";
import { clientData, clientSearchWhere, getClientDetail, getClientTimeline } from "./service";

const IdParams = z.object({ id: z.string().min(1) });

export default async function clientRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = parse(ClientListQuerySchema, req.query);
    const where: Prisma.ClientWhereInput = {
      AND: [
        clientSearchWhere(q.q),
        q.status ? { status: q.status } : {},
        q.insurerId || q.ramo
          ? { policies: { some: { ...(q.insurerId ? { insurerId: q.insurerId } : {}), ...(q.ramo ? { ramo: q.ramo } : {}) } } }
          : {},
      ],
    };
    const orderBy: Prisma.ClientOrderByWithRelationInput =
      q.sort === "createdAt" ? { createdAt: "asc" } : q.sort === "-createdAt" ? { createdAt: "desc" } : { nome: "asc" };
    const today = dateOnly(todayIso());
    const [rows, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: {
          policies: {
            select: { fimVigencia: true, status: true, insurer: { select: { nome: true } } },
          },
        },
      }),
      prisma.client.count({ where }),
    ]);
    const data: ClientListItemDTO[] = rows.map((c) => {
      const futuras = c.policies
        .filter((p) => p.status !== "CANCELADA" && p.fimVigencia && p.fimVigencia >= today)
        .map((p) => p.fimVigencia!)
        .sort((a, b) => a.getTime() - b.getTime());
      return {
        id: c.id,
        nome: c.nome,
        cpfCnpj: c.cpfCnpj,
        telefone: c.telefone,
        email: c.email,
        status: c.status,
        optOut: c.optOut,
        totalApolices: c.policies.length,
        proximoVencimento: toIsoDate(futuras[0]),
        seguradoras: [...new Set(c.policies.map((p) => p.insurer.nome))],
        createdAt: c.createdAt.toISOString(),
      };
    });
    return paginated(data, total, q);
  });

  app.post("/", async (req, reply) => {
    const input = parse(ClientCreateSchema, req.body);
    const exists = await prisma.client.findUnique({ where: { cpfCnpj: input.cpfCnpj }, select: { id: true } });
    if (exists) throw conflict("Já existe cliente com este CPF/CNPJ");
    const c = await prisma.client.create({ data: { ...clientData(input), nome: input.nome, cpfCnpj: input.cpfCnpj, origem: input.origem ?? "MANUAL" } });
    await audit(req, "CRIAR", "Client", c.id, null, { nome: c.nome });
    return reply.status(201).send(await getClientDetail(c.id));
  });

  app.get("/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    return getClientDetail(id);
  });

  app.patch("/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(ClientUpdateSchema, req.body);
    const before = await prisma.client.findUniqueOrThrow({ where: { id } });
    if (input.cpfCnpj && input.cpfCnpj !== before.cpfCnpj) {
      const dup = await prisma.client.findUnique({ where: { cpfCnpj: input.cpfCnpj }, select: { id: true } });
      if (dup) throw conflict("Já existe cliente com este CPF/CNPJ");
    }
    const data: Prisma.ClientUpdateInput = { ...clientData(input) };
    if (input.optOut !== undefined) {
      data.optOut = input.optOut;
      data.optOutEm = input.optOut ? new Date() : null;
    }
    const after = await prisma.client.update({ where: { id }, data });
    // Guarda só os campos alterados (antes/depois) para a trilha de auditoria.
    const changed = Object.keys(input) as Array<keyof typeof before>;
    const pick = (o: typeof before) => Object.fromEntries(changed.map((k) => [k, o[k]]));
    await audit(req, "ATUALIZAR", "Client", id, pick(before), pick(after));
    return getClientDetail(id);
  });

  app.get("/:id/timeline", async (req) => {
    const { id } = parse(IdParams, req.params);
    return { data: await getClientTimeline(id) };
  });

  // LGPD: exportação dos dados do titular (JSON).
  app.get("/:id/export", { onRequest: [app.requireRole("ADMIN")] }, async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const detail = await getClientDetail(id);
    await audit(req, "EXPORTAR_LGPD", "Client", id);
    reply.header("Content-Disposition", `attachment; filename="titular-${id}.json"`);
    return detail;
  });

  // LGPD: exclusão do titular. Apaga em cascata apólices, parcelas, documentos (registro) e mensagens ficam sem vínculo.
  app.delete("/:id", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const before = await prisma.client.findUniqueOrThrow({ where: { id }, select: { id: true, nome: true } });
    await prisma.$transaction([
      prisma.message.updateMany({ where: { clientId: id }, data: { telefone: "", conteudo: "[removido a pedido do titular]" } }),
      prisma.client.delete({ where: { id } }),
    ]);
    await audit(req, "EXCLUIR_LGPD", "Client", id, before, null);
    return { ok: true };
  });
}
