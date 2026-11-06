// Disparos: instância WhatsApp, templates, réguas, disparo em massa, histórico e fila.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  BroadcastSchema,
  MessageHistoryQuerySchema,
  MessageSendSchema,
  MessagingSettingsUpdateSchema,
  RuleCreateSchema,
  RuleUpdateSchema,
  TemplateCreateSchema,
  TemplateUpdateSchema,
  type BroadcastResponse,
  type MessagingConnectDTO,
  type MessageSendResponse,
  type MessagingInstanceDTO,
  type MessagingInstanceStatusDTO,
  type MessagingQueueDTO,
  type MessagingSettingsDTO,
} from "@ss/shared";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { badRequest, notFound } from "../../lib/errors";
import { pageArgs, paginated } from "../../lib/pagination";
import { messageDTO, ruleDTO, templateDTO } from "../../lib/serialize";
import { getEvolution } from "./evolution";
import { countSentToday, createAndEnqueue, getSettings } from "./service";
import { getMessagesQueue } from "./queue";
import { primeiroNome, renderTemplate } from "./template";
import { runRulesTick } from "./engine";
import { vigenteWhere } from "../policies/rules";

const IdParams = z.object({ id: z.string().min(1) });

export default async function messagingRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------ instância
  async function instanceState(): Promise<MessagingInstanceDTO> {
    const evo = getEvolution();
    let estado: MessagingInstanceDTO["estado"];
    try {
      estado = await evo.connectionState();
    } catch (err) {
      app.log.warn({ err }, "falha ao consultar estado da Evolution");
      estado = "unknown";
    }
    return { instanceName: env.EVOLUTION_INSTANCE, configurado: evo.configured, estado, mock: evo.mock };
  }

  /** Valida e grava as configurações de envio (usado por PATCH /settings e PATCH /instance). */
  async function updateSettings(req: FastifyRequest): Promise<MessagingSettingsDTO> {
    const input = parse(MessagingSettingsUpdateSchema, req.body);
    const before = await getSettings();
    const merged = { ...before, ...input };
    if (merged.janelaInicio >= merged.janelaFim) throw badRequest("O início da janela deve ser antes do fim");
    if (merged.intervaloMinSeg > merged.intervaloMaxSeg) throw badRequest("Intervalo mínimo maior que o máximo");
    const s = await prisma.messagingSettings.update({ where: { id: 1 }, data: input });
    await audit(req, "ATUALIZAR", "MessagingSettings", "1", before, input);
    return { ...s, enviadasHoje: await countSentToday() };
  }

  app.get("/instance", async (): Promise<MessagingInstanceDTO> => instanceState());

  /** Pausa/retoma e limite diário da instância: devolve estado + configurações numa resposta só. */
  app.patch("/instance", { onRequest: [app.requireRole("ADMIN")] }, async (req): Promise<MessagingInstanceStatusDTO> => {
    const settings = await updateSettings(req);
    return { ...(await instanceState()), settings };
  });

  app.post("/instance/connect", { onRequest: [app.requireRole("ADMIN")] }, async (req): Promise<MessagingConnectDTO> => {
    const r = await getEvolution().connect();
    await audit(req, "WHATSAPP_CONECTAR", "Messaging", env.EVOLUTION_INSTANCE);
    return { estado: r.state, qrcode: r.qrcode, pairingCode: r.pairingCode };
  });

  app.post("/instance/logout", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    await getEvolution().logout();
    await audit(req, "WHATSAPP_DESCONECTAR", "Messaging", env.EVOLUTION_INSTANCE);
    return { ok: true };
  });

  // ------------------------------------------------------------ templates
  app.get("/templates", async () => ({ data: (await prisma.messageTemplate.findMany({ orderBy: { nome: "asc" } })).map(templateDTO) }));

  app.post("/templates", async (req, reply) => {
    const input = parse(TemplateCreateSchema, req.body);
    const t = await prisma.messageTemplate.create({ data: input });
    await audit(req, "CRIAR", "MessageTemplate", t.id, null, input);
    return reply.status(201).send(templateDTO(t));
  });

  app.patch("/templates/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(TemplateUpdateSchema, req.body);
    const before = await prisma.messageTemplate.findUniqueOrThrow({ where: { id } });
    const t = await prisma.messageTemplate.update({ where: { id }, data: input });
    await audit(req, "ATUALIZAR", "MessageTemplate", id, templateDTO(before), input);
    return templateDTO(t);
  });

  /** Pré-visualização com dados de exemplo (sem enviar). */
  app.post("/templates/preview", async (req) => {
    const { conteudo } = parse(z.object({ conteudo: z.string().max(4000) }), req.body);
    return {
      texto: renderTemplate(conteudo, {
        nome: "Maria",
        seguradora: "Porto",
        apolice: "123456789",
        valor: "R$ 250,00",
        vencimento: "10/12/2026",
        placa: "ABC1D23",
      }),
    };
  });

  // ------------------------------------------------------------ réguas
  app.get("/rules", async () => ({
    data: (await prisma.messageRule.findMany({ include: { template: true }, orderBy: { createdAt: "asc" } })).map(ruleDTO),
  }));

  app.post("/rules", async (req, reply) => {
    const input = parse(RuleCreateSchema, req.body);
    const r = await prisma.messageRule.create({ data: input, include: { template: true } });
    await audit(req, "CRIAR", "MessageRule", r.id, null, input);
    return reply.status(201).send(ruleDTO(r));
  });

  app.patch("/rules/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(RuleUpdateSchema, req.body);
    const before = await prisma.messageRule.findUniqueOrThrow({ where: { id } });
    const r = await prisma.messageRule.update({ where: { id }, data: input, include: { template: true } });
    await audit(req, "ATUALIZAR", "MessageRule", id, ruleDTO(before), input);
    return ruleDTO(r);
  });

  /** Executa as réguas agora (mesma lógica do agendador horário; idempotente). */
  app.post("/rules/run", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const reports = await runRulesTick(req.log);
    await audit(req, "REGUAS_EXECUTADAS", "MessageRule", null, null, reports);
    return { data: reports };
  });

  // ------------------------------------------------------------ configurações
  app.get("/settings", async (): Promise<MessagingSettingsDTO> => {
    const s = await getSettings();
    return { ...s, enviadasHoje: await countSentToday() };
  });

  app.patch("/settings", { onRequest: [app.requireRole("ADMIN")] }, async (req): Promise<MessagingSettingsDTO> => updateSettings(req));

  // ------------------------------------------------------------ envio avulso
  /** Mensagem avulsa para um cliente: passa pela mesma fila (janela 8h–20h, limite diário, opt-out). */
  app.post("/send", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply): Promise<MessageSendResponse> => {
    const input = parse(MessageSendSchema, req.body);
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true, telefone: true, optOut: true } });
    if (!client) throw notFound("Cliente");
    if (!client.telefone) throw badRequest("Cliente sem telefone cadastrado");
    if (client.optOut) throw badRequest("Cliente pediu para não receber mensagens (opt-out)");
    if (input.anexoDocumentId) {
      const doc = await prisma.document.findFirst({ where: { id: input.anexoDocumentId, clientId: client.id }, select: { id: true } });
      if (!doc) throw badRequest("Anexo não pertence a este cliente");
    }
    const agendadaPara = new Date();
    const messageId = await createAndEnqueue({
      clientId: client.id,
      telefone: client.telefone,
      conteudo: input.conteudo,
      anexoDocumentId: input.anexoDocumentId ?? null,
      agendadaPara,
    });
    await audit(req, "MENSAGEM_AVULSA", "Message", messageId, null, { clientId: client.id, anexo: Boolean(input.anexoDocumentId) });
    return reply.status(201).send({ messageId, agendadaPara: agendadaPara.toISOString() });
  });

  // ------------------------------------------------------------ disparo em massa
  app.post("/broadcast", { onRequest: [app.requireRole("ADMIN")] }, async (req): Promise<BroadcastResponse> => {
    const input = parse(BroadcastSchema, req.body);
    const template = await prisma.messageTemplate.findUnique({ where: { id: input.templateId } });
    if (!template || !template.ativo) throw notFound("Template");
    if (template.anexarBoleto) throw badRequest("Templates com boleto anexo só podem ser usados pelas réguas");
    const f = input.filtro;
    const policyFilter: Prisma.PolicyWhereInput = {
      ...vigenteWhere(),
      ...(f.insurerIds?.length ? { insurerId: { in: f.insurerIds } } : {}),
      ...(f.ramos?.length ? { ramo: { in: f.ramos } } : {}),
      ...(f.formasPagamento?.length ? { formaPagamento: { in: f.formasPagamento } } : {}),
    };
    const usaFiltroApolice = Boolean(f.insurerIds?.length || f.ramos?.length || f.formasPagamento?.length);
    const where: Prisma.ClientWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.clientIds?.length ? { id: { in: f.clientIds } } : {}),
      ...(usaFiltroApolice ? { policies: { some: policyFilter } } : {}),
    };
    const clients = await prisma.client.findMany({ where, select: { id: true, nome: true, telefone: true, optOut: true } });
    const semTelefone = clients.filter((c) => !c.telefone).length;
    const optOut = clients.filter((c) => c.telefone && c.optOut).length;
    const alvo = clients.filter((c) => c.telefone && !c.optOut);
    if (input.dryRun) return { broadcastId: null, total: alvo.length, ignorados: { semTelefone, optOut }, dryRun: true };

    const broadcastId = randomUUID();
    for (const c of alvo) {
      await createAndEnqueue({
        clientId: c.id,
        telefone: c.telefone!,
        conteudo: renderTemplate(template.conteudo, { nome: primeiroNome(c.nome) }),
        templateId: template.id,
        broadcastId,
        dedupeKey: `broadcast-${broadcastId}-${c.id}`,
      });
    }
    await audit(req, "DISPARO_EM_MASSA", "MessageTemplate", template.id, null, { broadcastId, total: alvo.length, filtro: f });
    return { broadcastId, total: alvo.length, ignorados: { semTelefone, optOut }, dryRun: false };
  });

  // ------------------------------------------------------------ histórico e fila
  app.get("/history", async (req) => {
    const q = parse(MessageHistoryQuerySchema, req.query);
    const where: Prisma.MessageWhereInput = {
      ...(q.status ? { status: q.status } : { status: { notIn: ["AGENDADA", "ENVIANDO"] } }),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.ruleId ? { ruleId: q.ruleId } : {}),
      ...(q.de || q.ate
        ? { createdAt: { ...(q.de ? { gte: new Date(`${q.de}T00:00:00-03:00`) } : {}), ...(q.ate ? { lte: new Date(`${q.ate}T23:59:59-03:00`) } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: { client: { select: { nome: true } }, rule: { select: { nome: true } } },
        orderBy: { createdAt: "desc" },
        ...pageArgs(q),
      }),
      prisma.message.count({ where }),
    ]);
    return paginated(rows.map(messageDTO), total, q);
  });

  app.get("/queue", async (): Promise<MessagingQueueDTO> => {
    const rows = await prisma.message.findMany({
      where: { status: { in: ["AGENDADA", "ENVIANDO"] } },
      include: { client: { select: { nome: true } }, rule: { select: { nome: true } } },
      orderBy: { agendadaPara: "asc" },
      take: 200,
    });
    let counts = { waiting: 0, delayed: 0, active: 0, failed: 0 };
    try {
      counts = { ...counts, ...(await getMessagesQueue().getJobCounts("waiting", "delayed", "active", "failed")) };
    } catch (err) {
      app.log.warn({ err }, "não foi possível ler contadores da fila (Redis)");
    }
    return {
      contagem: { aguardando: counts.waiting, atrasadas: counts.delayed, ativas: counts.active, falhas: counts.failed },
      mensagens: rows.map(messageDTO),
    };
  });

  /** Cancela uma mensagem ainda não enviada. */
  app.post("/messages/:id/cancel", async (req) => {
    const { id } = parse(IdParams, req.params);
    const r = await prisma.message.updateMany({ where: { id, status: "AGENDADA" }, data: { status: "CANCELADA" } });
    if (!r.count) throw badRequest("Mensagem não está mais na fila");
    await audit(req, "CANCELAR", "Message", id);
    return { ok: true };
  });
}
