// Apólices e parcelas.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  InstallmentListQuerySchema,
  InstallmentUpdateSchema,
  PolicyCreateSchema,
  PolicyListQuerySchema,
  PolicyUpdateSchema,
  type PolicyDetailDTO,
  type PolicyListItemDTO,
} from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { pageArgs, paginated } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { notFound } from "../../lib/errors";
import { dateOnly } from "../../lib/dates";
import { installmentDTO, insurerSummary, itemDTO, policyDTO } from "../../lib/serialize";
import { createPolicyWithChildren } from "./service";
import { refreshClientStatus } from "./rules";

const IdParams = z.object({ id: z.string().min(1) });

async function policyDetail(id: string): Promise<PolicyDetailDTO> {
  const p = await prisma.policy.findUnique({
    where: { id },
    include: { insurer: true, installments: { orderBy: { numero: "asc" } }, items: true },
  });
  if (!p) throw notFound("Apólice");
  return { ...policyDTO(p), parcelas: p.installments.map(installmentDTO), itens: p.items.map(itemDTO) };
}

export default async function policyRoutes(app: FastifyInstance) {
  app.get("/policies", async (req) => {
    const q = parse(PolicyListQuerySchema, req.query);
    const placa = q.q?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const where: Prisma.PolicyWhereInput = {
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.insurerId ? { insurerId: q.insurerId } : {}),
      ...(q.ramo ? { ramo: q.ramo } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.formaPagamento ? { formaPagamento: q.formaPagamento } : {}),
      ...(q.fimAte || q.fimDe
        ? { fimVigencia: { ...(q.fimDe ? { gte: dateOnly(q.fimDe) } : {}), ...(q.fimAte ? { lte: dateOnly(q.fimAte) } : {}) } }
        : {}),
      ...(q.q
        ? {
            OR: [
              { numero: { contains: q.q, mode: "insensitive" } },
              { proposta: { contains: q.q, mode: "insensitive" } },
              { client: { nome: { contains: q.q, mode: "insensitive" } } },
              ...(placa && placa.length >= 3 ? [{ items: { some: { placa: { contains: placa } } } }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        include: { insurer: true, client: { select: { id: true, nome: true } }, items: { select: { placa: true } } },
        orderBy: [{ fimVigencia: "asc" }, { createdAt: "desc" }],
        ...pageArgs(q),
      }),
      prisma.policy.count({ where }),
    ]);
    const data: PolicyListItemDTO[] = rows.map((p) => ({
      ...policyDTO(p),
      client: p.client,
      placas: p.items.map((i) => i.placa).filter((x): x is string => !!x),
    }));
    return paginated(data, total, q);
  });

  app.get("/policies/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    return policyDetail(id);
  });

  app.post("/policies", async (req, reply) => {
    const input = parse(PolicyCreateSchema, req.body);
    const p = await prisma.$transaction((tx) => createPolicyWithChildren(tx, input, input.parcelas, input.itens));
    await refreshClientStatus(p.clientId);
    await audit(req, "CRIAR", "Policy", p.id, null, { clientId: p.clientId, numero: p.numero });
    return reply.status(201).send(await policyDetail(p.id));
  });

  app.patch("/policies/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(PolicyUpdateSchema, req.body);
    const before = await prisma.policy.findUnique({ where: { id }, include: { insurer: true } });
    if (!before) throw notFound("Apólice");
    // undefined = campo não enviado (Prisma ignora); null = limpar o campo.
    const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? dateOnly(v) : null);
    const patch: Prisma.PolicyUncheckedUpdateInput = {
      insurerId: input.insurerId,
      ramo: input.ramo,
      numero: input.numero,
      proposta: input.proposta,
      emissao: d(input.emissao),
      inicioVigencia: d(input.inicioVigencia),
      fimVigencia: d(input.fimVigencia),
      premioTotal: input.premioTotal,
      formaPagamento: input.formaPagamento,
      status: input.status,
      endossoDeId: input.endossoDeId,
    };
    await prisma.policy.update({ where: { id }, data: patch });
    await refreshClientStatus(before.clientId);
    await audit(req, "ATUALIZAR", "Policy", id, policyDTO(before), input);
    return policyDetail(id);
  });

  app.get("/installments", async (req) => {
    const q = parse(InstallmentListQuerySchema, req.query);
    const where: Prisma.InstallmentWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.policyId ? { policyId: q.policyId } : {}),
      ...(q.de || q.ate ? { vencimento: { ...(q.de ? { gte: dateOnly(q.de) } : {}), ...(q.ate ? { lte: dateOnly(q.ate) } : {}) } } : {}),
      policy: {
        ...(q.clientId ? { clientId: q.clientId } : {}),
        ...(q.insurerId ? { insurerId: q.insurerId } : {}),
        ...(q.formaPagamento ? { formaPagamento: q.formaPagamento } : {}),
      },
    };
    const [rows, total] = await Promise.all([
      prisma.installment.findMany({
        where,
        include: { policy: { include: { insurer: true, client: { select: { id: true, nome: true, telefone: true } } } } },
        orderBy: [{ vencimento: "asc" }, { numero: "asc" }],
        ...pageArgs(q),
      }),
      prisma.installment.count({ where }),
    ]);
    const data = rows.map((i) => ({
      ...installmentDTO(i),
      policy: { id: i.policy.id, numero: i.policy.numero, ramo: i.policy.ramo, formaPagamento: i.policy.formaPagamento, insurer: insurerSummary(i.policy.insurer) },
      client: i.policy.client,
    }));
    return paginated(data, total, q);
  });

  app.patch("/installments/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(InstallmentUpdateSchema, req.body);
    const before = await prisma.installment.findUnique({ where: { id } });
    if (!before) throw notFound("Parcela");
    const i = await prisma.installment.update({
      where: { id },
      data: {
        status: input.status,
        valor: input.valor,
        vencimento: input.vencimento ? dateOnly(input.vencimento) : undefined,
        ...(input.status === "PAGO" && before.status !== "PAGO" ? { pagoEm: new Date() } : {}),
        ...(input.status && input.status !== "PAGO" ? { pagoEm: null } : {}),
      },
    });
    await audit(req, "ATUALIZAR", "Installment", id, installmentDTO(before), input);
    return installmentDTO(i);
  });
}
