// Catálogo de seguradoras, credenciais (criptografadas, sempre devolvidas mascaradas) e teste de conexão.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Insurer, InsurerCredential, Prisma } from "@prisma/client";
import { InsurerCredentialSchema, InsurerUpdateSchema, type InsurerCredentialMaskedDTO, type InsurerDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { encryptSecret } from "../../lib/secrets";
import { maskSecret } from "../../lib/crypto";
import { badRequest, notFound } from "../../lib/errors";
import { connectorChannel, getConnector, loadCredential } from "../../connectors/registry";
import { loginFromCredential, portalRobot, robotCodeForSlug as robotCodeFor } from "../../connectors/portalRobot";

const IdParams = z.object({ id: z.string().min(1) });

function credentialDTO(c: InsurerCredential | null): InsurerCredentialMaskedDTO | null {
  if (!c) return null;
  return {
    tipo: c.tipo,
    ambiente: c.ambiente,
    mascara: c.mascara as Record<string, string>,
    ultimoTeste: c.ultimoTeste?.toISOString() ?? null,
    ultimoErro: c.ultimoErro,
    atualizadoEm: c.updatedAt.toISOString(),
  };
}

function insurerDTO(i: Insurer & { credential: InsurerCredential | null; _count?: { policies: number } }): InsurerDTO {
  return {
    id: i.id,
    nome: i.nome,
    slug: i.slug,
    categoria: i.categoria,
    ramos: i.ramos,
    portalUrl: i.portalUrl,
    temApi: i.temApi,
    ativo: i.ativo,
    statusIntegracao: i.statusIntegracao,
    canal: connectorChannel(i.slug),
    // Capacidades reais vêm do conector registrado (fonte da verdade), não do banco.
    capacidades: getConnector(i.slug).capabilities,
    observacoes: i.observacoes,
    credencial: credentialDTO(i.credential),
    totalApolices: i._count?.policies,
  };
}

const include = { credential: true, _count: { select: { policies: true } } } satisfies Prisma.InsurerInclude;

export default async function insurerRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const q = parse(z.object({ categoria: z.enum(["SEGURADORA", "PLATAFORMA"]).optional(), ativo: z.enum(["true", "false"]).transform((v) => v === "true").optional() }), req.query);
    const rows = await prisma.insurer.findMany({
      where: { ...(q.categoria ? { categoria: q.categoria } : {}), ...(q.ativo !== undefined ? { ativo: q.ativo } : {}) },
      include,
      orderBy: { nome: "asc" },
    });
    return { data: rows.map(insurerDTO) };
  });

  app.get("/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const i = await prisma.insurer.findUnique({ where: { id }, include });
    if (!i) throw notFound("Seguradora");
    return insurerDTO(i);
  });

  app.patch("/:id", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(InsurerUpdateSchema, req.body);
    const before = await prisma.insurer.findUniqueOrThrow({ where: { id } });
    const i = await prisma.insurer.update({ where: { id }, data: input, include });
    await audit(req, "ATUALIZAR", "Insurer", id, before, input);
    return insurerDTO(i);
  });

  app.put("/:id/credentials", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(InsurerCredentialSchema, req.body);
    const insurer = await prisma.insurer.findUnique({ where: { id } });
    if (!insurer) throw notFound("Seguradora");
    const mascara = Object.fromEntries(Object.entries(input.valores).map(([k, v]) => [k, maskSecret(v)]));
    const data = {
      tipo: input.tipo,
      ambiente: input.ambiente,
      segredoCriptografado: encryptSecret(JSON.stringify(input.valores)),
      mascara,
      ultimoErro: null,
    };
    const cred = await prisma.insurerCredential.upsert({ where: { insurerId: id }, create: { insurerId: id, ...data }, update: data });
    await prisma.insurer.update({ where: { id }, data: { statusIntegracao: "CONFIGURADA" } });
    // Auditoria registra QUEM trocou e quais campos — nunca os valores.
    await audit(req, "CREDENCIAL_ATUALIZADA", "Insurer", id, null, { tipo: input.tipo, campos: Object.keys(input.valores) });
    return credentialDTO(cred);
  });

  app.delete("/:id/credentials", { onRequest: [app.requireRole("ADMIN")] }, async (req) => {
    const { id } = parse(IdParams, req.params);
    await prisma.insurerCredential.deleteMany({ where: { insurerId: id } });
    const i = await prisma.insurer.update({ where: { id }, data: { statusIntegracao: "NAO_CONFIGURADA" } });
    await audit(req, "CREDENCIAL_REMOVIDA", "Insurer", id);
    return { ok: true, statusIntegracao: i.statusIntegracao };
  });

  // ---------- canal rpa: status da sessão do robô e renovação (login)
  app.get("/:id/robot-session", async (req) => {
    const { id } = parse(IdParams, req.params);
    const insurer = await prisma.insurer.findUnique({ where: { id } });
    if (!insurer) throw notFound("Seguradora");
    const code = robotCodeFor(insurer.slug);
    if (!code) throw badRequest("Esta seguradora não usa o robô de portal");
    return portalRobot().status(code);
  });

  app.post("/:id/robot-session/renew", { onRequest: [app.requireRole("ADMIN")], config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const insurer = await prisma.insurer.findUnique({ where: { id } });
    if (!insurer) throw notFound("Seguradora");
    const code = robotCodeFor(insurer.slug);
    if (!code) throw badRequest("Esta seguradora não usa o robô de portal");
    const cred = await loadCredential(insurer);
    if (!cred) throw badRequest("Cadastre a credencial do portal (usuário e senha) antes de renovar a sessão");
    // A senha vai só para o robô; nunca é logada nem devolvida ao frontend.
    const result = await portalRobot().login(code, loginFromCredential(cred));
    await prisma.insurerCredential.updateMany({
      where: { insurerId: id },
      data: { ultimoTeste: new Date(), ultimoErro: result.status === "valid" ? null : (result.detalhe ?? result.status) },
    });
    await prisma.insurer.update({ where: { id }, data: { statusIntegracao: result.status === "valid" ? "OK" : "ERRO" } });
    await audit(req, "ROBO_RENOVAR_SESSAO", "Insurer", id, null, { status: result.status });
    return result;
  });

  app.post("/:id/test", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const { id } = parse(IdParams, req.params);
    const insurer = await prisma.insurer.findUnique({ where: { id } });
    if (!insurer) throw notFound("Seguradora");
    // Aggilizador não exige segredo (API pública): os IDs da corretora podem vir do .env.
    const cred = (await loadCredential(insurer)) ?? (insurer.slug === "aggilizador" ? { tipo: "ENV", ambiente: "PRODUCAO", valores: {} } : null);
    if (!cred) throw badRequest("Cadastre a credencial antes de testar a conexão");
    const started = Date.now();
    let result: { ok: boolean; detalhe?: string };
    try {
      result = await getConnector(insurer.slug).testConnection(cred);
    } catch (err) {
      req.log.warn({ err, insurer: insurer.slug }, "teste de conexão falhou");
      result = { ok: false, detalhe: err instanceof Error ? err.message : "Falha desconhecida" };
    }
    await prisma.insurerCredential.updateMany({
      where: { insurerId: id },
      data: { ultimoTeste: new Date(), ultimoErro: result.ok ? null : (result.detalhe ?? "Falha") },
    });
    await prisma.insurer.update({ where: { id }, data: { statusIntegracao: result.ok ? "OK" : "ERRO" } });
    await audit(req, "TESTAR_CONEXAO", "Insurer", id, null, { ok: result.ok });
    return { ...result, duracaoMs: Date.now() - started };
  });
}
