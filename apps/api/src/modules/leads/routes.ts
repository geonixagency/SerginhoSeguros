// CRM de leads (kanban Novo → Em contato → Cotação enviada → Negociação → Fechado/Perdido).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { LeadConvertSchema, LeadCreateSchema, LeadListQuerySchema, LeadUpdateSchema } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { pageArgs, paginated } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { badRequest, notFound } from "../../lib/errors";
import { leadDTO } from "../../lib/serialize";
import { upsertClientByCpf } from "../clients/service";

const IdParams = z.object({ id: z.string().min(1) });
const include = { responsavel: { select: { id: true, nome: true } } } as const;

function leadData(input: z.infer<typeof LeadUpdateSchema>): Prisma.LeadUncheckedUpdateInput {
  return {
    ...input,
    proximoContato: input.proximoContato === undefined ? undefined : input.proximoContato ? new Date(input.proximoContato) : null,
  };
}

export default async function leadRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = parse(LeadListQuerySchema, req.query);
    const where: Prisma.LeadWhereInput = {
      ...(q.etapa ? { etapa: q.etapa } : {}),
      ...(q.responsavelId ? { responsavelId: q.responsavelId } : {}),
      ...(q.q
        ? { OR: [{ nome: { contains: q.q, mode: "insensitive" } }, { telefone: { contains: q.q.replace(/\D/g, "") || q.q } }, { email: { contains: q.q, mode: "insensitive" } }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.lead.findMany({ where, include, orderBy: [{ updatedAt: "desc" }], ...pageArgs(q) }),
      prisma.lead.count({ where }),
    ]);
    return paginated(rows.map(leadDTO), total, q);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const l = await prisma.lead.findUnique({ where: { id }, include });
    if (!l) throw notFound("Lead");
    return leadDTO(l);
  });

  app.post("/", async (req, reply) => {
    const input = parse(LeadCreateSchema, req.body);
    const l = await prisma.lead.create({
      data: { ...leadData(input), nome: input.nome, responsavelId: input.responsavelId ?? req.user.sub } as Prisma.LeadUncheckedCreateInput,
      include,
    });
    await audit(req, "CRIAR", "Lead", l.id, null, { nome: l.nome, etapa: l.etapa });
    return reply.status(201).send(leadDTO(l));
  });

  app.patch("/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(LeadUpdateSchema, req.body);
    const before = await prisma.lead.findUnique({ where: { id } });
    if (!before) throw notFound("Lead");
    if (input.etapa === "FECHADO" && !before.clientId) {
      throw badRequest("Para fechar o lead use POST /leads/:id/convert (ele vira cliente)");
    }
    const l = await prisma.lead.update({ where: { id }, data: leadData(input), include });
    await audit(req, "ATUALIZAR", "Lead", id, { etapa: before.etapa }, input);
    return leadDTO(l);
  });

  /** Lead fechado vira cliente (ou é anexado ao cliente existente pelo CPF/CNPJ). */
  app.post("/:id/convert", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(LeadConvertSchema, req.body ?? {});
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw notFound("Lead");
    if (lead.clientId) return { clientId: lead.clientId, clienteCriado: false, lead: leadDTO({ ...lead, responsavel: null }) };
    const cpfCnpj = input.cpfCnpj ?? lead.cpfCnpj;
    if (!cpfCnpj) throw badRequest("Informe o CPF/CNPJ para converter o lead em cliente");

    const result = await prisma.$transaction(async (tx) => {
      const c = await upsertClientByCpf(tx, {
        nome: lead.nome,
        cpfCnpj,
        telefone: lead.telefone,
        email: lead.email,
        nascimento: input.nascimento ?? null,
        endereco: input.endereco ?? null,
        origem: `LEAD${lead.origem ? `:${lead.origem}` : ""}`,
      });
      const l = await tx.lead.update({ where: { id }, data: { etapa: "FECHADO", clientId: c.id, cpfCnpj }, include });
      await tx.quote.updateMany({ where: { leadId: id, clientId: null }, data: { clientId: c.id } });
      return { clientId: c.id, clienteCriado: c.criado, lead: leadDTO(l) };
    });
    await audit(req, "CONVERTER_LEAD", "Lead", id, null, { clientId: result.clientId });
    return result;
  });
}
