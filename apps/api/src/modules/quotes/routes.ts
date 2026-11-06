// Cotações via Aggilizador (multicálculo). Enquanto a API da Agger não existir,
// a cotação é registrada com status ERRO e a mensagem explica o motivo; no modo
// demo (CONNECTORS_DEMO=true) o MockConnector devolve resultados fictícios.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { QuoteCreateSchema, QuoteListQuerySchema } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { pageArgs, paginated } from "../../lib/pagination";
import { audit } from "../../lib/audit";
import { badRequest, notFound } from "../../lib/errors";
import { quoteDTO } from "../../lib/serialize";
import { getConnector, loadCredential } from "../../connectors/registry";
import type { QuoteResultItem, QuoteSendResponse } from "@ss/shared";
import { createAndEnqueue } from "../messaging/service";
import { buildQuoteComparison } from "./compare";

export default async function quoteRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = parse(QuoteListQuerySchema, req.query);
    const where: Prisma.QuoteWhereInput = { ...(q.leadId ? { leadId: q.leadId } : {}), ...(q.clientId ? { clientId: q.clientId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.quote.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(q) }),
      prisma.quote.count({ where }),
    ]);
    return paginated(rows.map(quoteDTO), total, q);
  });

  app.get("/:id", async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const qt = await prisma.quote.findUnique({ where: { id } });
    if (!qt) throw notFound("Cotação");
    return quoteDTO(qt);
  });

  app.post("/", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const input = parse(QuoteCreateSchema, req.body);
    const segurado = input.leadId
      ? await prisma.lead.findUnique({ where: { id: input.leadId }, select: { nome: true, cpfCnpj: true, telefone: true, email: true } })
      : await prisma.client.findUnique({ where: { id: input.clientId! }, select: { nome: true, cpfCnpj: true, telefone: true, email: true } });
    if (!segurado) throw badRequest(input.leadId ? "Lead não encontrado" : "Cliente não encontrado");

    const quote = await prisma.quote.create({
      data: {
        leadId: input.leadId ?? null,
        clientId: input.clientId ?? null,
        ramo: input.ramo,
        dados: input.dados as Prisma.InputJsonValue,
        createdById: req.user.sub,
      },
    });

    const aggilizador = await prisma.insurer.findUnique({ where: { slug: "aggilizador" } });
    const connector = getConnector("aggilizador");
    let update: Prisma.QuoteUpdateInput;
    try {
      if (!aggilizador || !connector.quote || !connector.capabilities.includes("quote")) {
        throw new Error("Conector do Aggilizador indisponível.");
      }
      // API pública: a "credencial" só carrega os IDs da corretora (ou vem do .env).
      const cred = (await loadCredential(aggilizador)) ?? { tipo: "ENV", ambiente: "PRODUCAO", valores: {} };
      const r = await connector.quote(cred, { ramo: input.ramo, dados: input.dados, segurado });
      update = { status: r.status, aggilizadorId: r.externoId, resultados: r.resultados as unknown as Prisma.InputJsonValue, erro: null };
    } catch (err) {
      req.log.warn({ err }, "cotação não concluída");
      update = { status: "ERRO", erro: err instanceof Error ? err.message : "Falha na cotação" };
    }
    const saved = await prisma.quote.update({ where: { id: quote.id }, data: update });
    if (input.leadId && saved.status === "CONCLUIDA") {
      await prisma.lead.updateMany({ where: { id: input.leadId, etapa: { in: ["NOVO", "EM_CONTATO"] } }, data: { etapa: "COTACAO_ENVIADA" } });
    }
    await audit(req, "CRIAR", "Quote", saved.id, null, { status: saved.status, ramo: saved.ramo });
    return reply.status(201).send(quoteDTO(saved));
  });

  /** Reconsulta a cotação no Aggilizador (GET /Quotation/{id}) e atualiza os resultados. */
  app.post("/:id/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const qt = await prisma.quote.findUnique({ where: { id } });
    if (!qt) throw notFound("Cotação");
    if (!qt.aggilizadorId) throw badRequest("Cotação sem ID no Aggilizador (não foi criada lá)");
    const connector = getConnector("aggilizador");
    if (!connector.getQuote) throw badRequest("Conector não suporta consulta de cotação");
    const aggilizador = await prisma.insurer.findUnique({ where: { slug: "aggilizador" } });
    const cred = (aggilizador && (await loadCredential(aggilizador))) ?? { tipo: "ENV", ambiente: "PRODUCAO", valores: {} };
    try {
      const r = await connector.getQuote(cred, qt.aggilizadorId);
      const saved = await prisma.quote.update({
        where: { id },
        data: { status: r.status, resultados: r.resultados as unknown as Prisma.InputJsonValue, erro: null },
      });
      return quoteDTO(saved);
    } catch (err) {
      req.log.warn({ err }, "falha ao reconsultar cotação");
      throw badRequest(err instanceof Error ? err.message : "Falha ao consultar o Aggilizador");
    }
  });

  /** Envia o comparativo (3 menores prêmios) ao lead/cliente pelo WhatsApp, via fila de mensagens. */
  app.post("/:id/send", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply): Promise<QuoteSendResponse> => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const qt = await prisma.quote.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, nome: true, telefone: true, etapa: true } },
        client: { select: { id: true, nome: true, telefone: true, optOut: true } },
      },
    });
    if (!qt) throw notFound("Cotação");
    if (qt.status !== "CONCLUIDA") throw badRequest("A cotação ainda não tem resultados para enviar");
    const destino = qt.client ?? qt.lead;
    if (!destino?.telefone) throw badRequest("Sem telefone para enviar o comparativo");
    if (qt.client?.optOut) throw badRequest("Cliente pediu para não receber mensagens (opt-out)");
    let texto: string;
    try {
      texto = buildQuoteComparison({ nome: destino.nome, ramo: qt.ramo, resultados: (qt.resultados ?? []) as unknown as QuoteResultItem[] });
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Cotação sem resultados");
    }
    const messageId = await createAndEnqueue({ clientId: qt.client?.id ?? null, telefone: destino.telefone, conteudo: texto });
    if (qt.lead && ["NOVO", "EM_CONTATO"].includes(qt.lead.etapa)) {
      await prisma.lead.update({ where: { id: qt.lead.id }, data: { etapa: "COTACAO_ENVIADA" } });
    }
    await audit(req, "ENVIAR_COMPARATIVO", "Quote", id, null, { messageId });
    return reply.status(201).send({ messageId, telefone: destino.telefone, texto });
  });
}
