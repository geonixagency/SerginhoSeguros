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
  normalizePhoneBr,
  type BroadcastResponse,
  type MessageAttachmentDTO,
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
import { AppError, badRequest, notFound } from "../../lib/errors";
import { saveUpload } from "../../lib/storage";
import { estimateSchedule } from "./pacing";
import { ANEXO_DIR, ANEXO_MAX_MB, sniffAttachment } from "./attachments";
import { pageArgs, paginated } from "../../lib/pagination";
import { messageDTO, ruleDTO, templateDTO } from "../../lib/serialize";
import { getEvolution } from "./evolution";
import { countSentToday, createAndEnqueue, getSettings } from "./service";
import { getMessagesQueue } from "./queue";
import { primeiroNome, renderLoose, renderTemplate, type TemplateVars } from "./template";
import { runRulesTick } from "./engine";
import { formatBr, formatMoneyBr, toIsoDate } from "../../lib/dates";
import { vigenteWhere } from "../policies/rules";

const IdParams = z.object({ id: z.string().min(1) });

type BroadcastClient = {
  nome: string;
  policies: {
    numero: string | null;
    proposta: string | null;
    insurer: { nome: string };
    items: { placa: string | null }[];
    installments: { valor: Prisma.Decimal | null; vencimento: Date }[];
  }[];
};

/** Variáveis do disparo em massa: nome + dados da apólice vigente mais próxima do vencimento. */
export function broadcastVars(c: BroadcastClient): TemplateVars {
  const p = c.policies[0];
  const inst = p?.installments[0];
  return {
    nome: primeiroNome(c.nome),
    seguradora: p?.insurer.nome ?? "",
    apolice: p?.numero ?? p?.proposta ?? "",
    placa: p?.items[0]?.placa ?? "",
    valor: formatMoneyBr(inst?.valor?.toFixed(2)),
    vencimento: inst ? formatBr(toIsoDate(inst.vencimento)) : "",
  };
}

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

  // ------------------------------------------------------------ anexos
  /**
   * Sobe um arquivo para mandar no WhatsApp (até 10 MB: PDF, imagem, Word/Excel).
   * Guardado uma vez em STORAGE_DIR/_anexos; o disparo em massa referencia o mesmo documento.
   * Multipart: "arquivo" e, opcional, "clientId" (envio avulso: o anexo fica na ficha do cliente).
   */
  app.post("/attachments", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply): Promise<MessageAttachmentDTO> => {
    if (!req.isMultipart()) throw badRequest("Envie o arquivo como multipart/form-data (campo 'arquivo')");
    let file: { buf: Buffer; name: string } | null = null;
    const fields: Record<string, string> = {};
    for await (const part of req.parts({ limits: { fileSize: ANEXO_MAX_MB * 1024 * 1024, files: 1, fields: 3 } })) {
      if (part.type === "file") {
        const buf = await part.toBuffer();
        if (part.file.truncated) throw new AppError(413, "FILE_TOO_LARGE", `O anexo passa de ${ANEXO_MAX_MB} MB`);
        file = { buf, name: part.filename.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f]/g, "").slice(0, 200) || "arquivo" };
      } else if (typeof part.value === "string") fields[part.fieldname] = part.value;
    }
    if (!file) throw badRequest("Nenhum arquivo enviado (campo 'arquivo')");
    const tipo = sniffAttachment(file.buf, file.name);
    if (!tipo) throw badRequest("Formato não aceito. Envie PDF, imagem (JPG, PNG, WebP) ou documento do Word/Excel.");
    const clientId = fields.clientId || null;
    if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) throw notFound("Cliente");
    const saved = await saveUpload(file.buf, tipo.ext, ANEXO_DIR);
    const doc = await prisma.document.create({
      data: { clientId, tipo: "OUTRO", nomeArquivo: file.name, caminho: saved.caminho, hash: saved.hash, tamanho: saved.tamanho, mimeType: tipo.mime },
    });
    await audit(req, "ANEXO_MENSAGEM", "Document", doc.id, null, { nome: doc.nomeArquivo, tamanho: doc.tamanho, clientId });
    return reply.status(201).send({ documentId: doc.id, nome: doc.nomeArquivo, mimeType: doc.mimeType, tamanho: doc.tamanho });
  });

  /** Anexo válido para a mensagem: documento do próprio cliente ou anexo avulso de mensagem. */
  async function checkAnexo(id: string | null | undefined, clientId: string | null) {
    if (!id) return null;
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, clientId: true, caminho: true, tamanho: true } });
    const avulso = doc && doc.clientId === null && doc.caminho.startsWith(`${ANEXO_DIR}/`);
    if (!doc || (!avulso && doc.clientId !== clientId)) throw badRequest("Anexo não pertence a este cliente");
    if (doc.tamanho > ANEXO_MAX_MB * 1024 * 1024) throw badRequest(`O WhatsApp aceita anexos de até ${ANEXO_MAX_MB} MB`);
    return doc.id;
  }

  // ------------------------------------------------------------ envio avulso
  /** Mensagem avulsa para um cliente: passa pela mesma fila (janela 8h–20h, limite diário, opt-out). */
  app.post("/send", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply): Promise<MessageSendResponse> => {
    const input = parse(MessageSendSchema, req.body);
    const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true, telefone: true, optOut: true } });
    if (!client) throw notFound("Cliente");
    if (!client.telefone) throw badRequest("Cliente sem telefone cadastrado");
    if (client.optOut) throw badRequest("Cliente pediu para não receber mensagens (opt-out)");
    await checkAnexo(input.anexoDocumentId, client.id);
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
  app.post("/broadcast", { onRequest: [app.requireRole("ADMIN")], bodyLimit: 8 * 1024 * 1024 /* CSV com até 5.000 contatos */ }, async (req): Promise<BroadcastResponse> => {
    const input = parse(BroadcastSchema, req.body);
    let conteudoBase: string;
    let templateId: string | null = null;
    if (input.templateId) {
      const template = await prisma.messageTemplate.findUnique({ where: { id: input.templateId } });
      if (!template || !template.ativo) throw notFound("Template");
      if (template.anexarBoleto) throw badRequest("Templates com boleto anexo só podem ser usados pelas réguas");
      conteudoBase = template.conteudo;
      templateId = template.id;
    } else {
      conteudoBase = input.conteudo!;
    }
    const anexoDocumentId = await checkAnexo(input.anexoDocumentId, null);
    const settings = await getSettings();
    const estimar = async (n: number) => estimateSchedule(n, settings, new Date(), await countSentToday());

    // ---- origem: CSV de contatos
    if (input.contatos) {
      const seen = new Set<string>();
      let invalidos = 0;
      let duplicados = 0;
      const lista: { telefone: string; nome: string; vars: Record<string, string> }[] = [];
      for (const c of input.contatos) {
        const tel = normalizePhoneBr(c.telefone);
        if (!tel) invalidos++;
        else if (seen.has(tel)) duplicados++;
        else {
          seen.add(tel);
          lista.push({ ...c, telefone: tel });
        }
      }
      // Opt-out: telefone de cliente que pediu para sair não recebe, mesmo vindo do CSV.
      const clientes = await prisma.client.findMany({ where: { telefone: { in: [...seen] } }, select: { id: true, telefone: true, optOut: true } });
      const porTel = new Map(clientes.map((c) => [c.telefone!, c]));
      const alvo = lista.filter((c) => !porTel.get(c.telefone)?.optOut);
      const ignorados = { semTelefone: 0, optOut: lista.length - alvo.length, invalidos, duplicados };
      if (input.dryRun) return { broadcastId: null, total: alvo.length, ignorados, dryRun: true, estimativa: await estimar(alvo.length) };

      const broadcastId = randomUUID();
      for (const c of alvo) {
        const vars = { ...c.vars, nome: primeiroNome(c.nome || c.vars.nome || ""), nome_completo: c.nome || c.vars.nome || "", telefone: c.telefone };
        await createAndEnqueue({
          clientId: porTel.get(c.telefone)?.id ?? null,
          telefone: c.telefone,
          conteudo: renderLoose(conteudoBase, vars),
          templateId,
          anexoDocumentId,
          broadcastId,
          dedupeKey: `broadcast-${broadcastId}-${c.telefone}`,
        });
      }
      await audit(req, "DISPARO_EM_MASSA", "MessageTemplate", templateId ?? broadcastId, null, { broadcastId, total: alvo.length, origem: "csv", ignorados, anexo: Boolean(anexoDocumentId) });
      return { broadcastId, total: alvo.length, ignorados, dryRun: false, estimativa: await estimar(alvo.length) };
    }

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
    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        nome: true,
        telefone: true,
        optOut: true,
        // apólice vigente mais próxima do fim (respeitando o filtro) para preencher as {{variaveis}}
        policies: {
          where: policyFilter,
          orderBy: { fimVigencia: "asc" },
          take: 1,
          select: {
            numero: true,
            proposta: true,
            insurer: { select: { nome: true } },
            items: { where: { placa: { not: null } }, select: { placa: true }, take: 1 },
            installments: { where: { status: { in: ["PENDENTE", "ATRASADO"] } }, orderBy: { vencimento: "asc" }, take: 1, select: { valor: true, vencimento: true } },
          },
        },
      },
    });
    const semTelefone = clients.filter((c) => !c.telefone).length;
    const optOut = clients.filter((c) => c.telefone && c.optOut).length;
    const alvo = clients.filter((c) => c.telefone && !c.optOut);
    if (input.dryRun) return { broadcastId: null, total: alvo.length, ignorados: { semTelefone, optOut }, dryRun: true, estimativa: await estimar(alvo.length) };

    const broadcastId = randomUUID();
    for (const c of alvo) {
      await createAndEnqueue({
        clientId: c.id,
        telefone: c.telefone!,
        conteudo: renderTemplate(conteudoBase, broadcastVars(c)),
        templateId,
        anexoDocumentId,
        broadcastId,
        dedupeKey: `broadcast-${broadcastId}-${c.id}`,
      });
    }
    await audit(req, "DISPARO_EM_MASSA", "MessageTemplate", templateId ?? broadcastId, null, {
      broadcastId,
      total: alvo.length,
      filtro: f,
      anexo: Boolean(anexoDocumentId),
      ...(templateId ? {} : { personalizado: true }),
    });
    return { broadcastId, total: alvo.length, ignorados: { semTelefone, optOut }, dryRun: false, estimativa: await estimar(alvo.length) };
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
