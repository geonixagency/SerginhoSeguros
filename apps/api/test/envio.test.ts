// Envio avulso, comparativo de cotação, PATCH /messaging/instance e lead público do site.
// Unitários sempre rodam; a integração usa o banco de dev com dados FICTÍCIOS criados e
// apagados aqui (é pulada sem DATABASE_URL). A fila é simulada: nada é enviado de verdade.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MessageSendSchema, PublicLeadSchema } from "@ss/shared";
import { buildQuoteComparison } from "../src/modules/quotes/compare";

vi.mock("../src/modules/messaging/queue", () => ({
  enqueueMessage: vi.fn(async () => {}),
  getMessagesQueue: vi.fn(() => ({ getJobCounts: async () => ({}) })),
  getSchedulerQueue: vi.fn(),
  closeQueues: vi.fn(),
}));

describe("comparativo de cotação (texto)", () => {
  const resultados = [
    { seguradora: "Porto", premio: 3400.5, parcelas: "10x sem juros" },
    { seguradora: "Azul", premio: 2980, franquia: 4200 },
    { seguradora: "Allianz", premio: 3120 },
    { seguradora: "HDI", premio: 3900 },
    { seguradora: "Inválida", premio: 0 },
  ];

  it("ordena pelo menor prêmio, limita a 3 e formata em R$", () => {
    const t = buildQuoteComparison({ nome: "Maria Teste da Silva", ramo: "auto", resultados });
    const linhas = t.split("\n").filter((l) => /^\d\./.test(l));
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain("*Azul*");
    expect(linhas[0]).toContain("R$ 2.980,00");
    expect(linhas[0]).toContain("franquia R$ 4.200,00");
    expect(linhas[2]).toContain("*Porto*");
    expect(t).toMatch(/^Olá Maria, tudo bem\? Aqui está o comparativo do seu seguro auto:/);
    expect(t).not.toContain("HDI");
  });

  it("falha sem resultados válidos", () => {
    expect(() => buildQuoteComparison({ nome: "X", ramo: "vida", resultados: [{ seguradora: "A", premio: 0 }] })).toThrow();
  });
});

describe("schemas de envio e lead público", () => {
  it("MessageSendSchema exige conteúdo", () => {
    expect(MessageSendSchema.safeParse({ clientId: "c1", conteudo: "  " }).success).toBe(false);
    expect(MessageSendSchema.safeParse({ clientId: "c1", conteudo: "Oi" }).success).toBe(true);
  });

  it("PublicLeadSchema normaliza telefone e recusa honeypot com conteúdo", () => {
    const ok = PublicLeadSchema.parse({ nome: "Fulano", telefone: "+55 (16) 99999-0000" });
    expect(ok.telefone).toBe("16999990000");
    expect(PublicLeadSchema.safeParse({ nome: "Bot", telefone: "16999990000", site: "spam" }).success).toBe(false);
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const CPF = "52998224725"; // CPF de teste (gerador público), não pertence a cliente
const TEL = "11900000077";

describe.skipIf(!enabled)("rotas de envio (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let clientId = "";
  let leadId = "";

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const admin = await prisma.user.findFirstOrThrow({ where: { perfil: "ADMIN", ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: admin.id, perfil: admin.perfil, nome: admin.nome })}` };
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
    await prisma.lead.deleteMany({ where: { telefone: TEL } });
    clientId = (await prisma.client.create({ data: { nome: "Cliente Teste Envio", cpfCnpj: CPF, telefone: TEL, status: "ATIVO", origem: "TESTE" } })).id;
    leadId = (await prisma.lead.create({ data: { nome: "Lead Teste Envio", telefone: TEL, etapa: "NOVO", origem: "TESTE" } })).id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { telefone: TEL } });
    await prisma.quote.deleteMany({ where: { leadId } });
    await prisma.lead.deleteMany({ where: { telefone: TEL } });
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
    await app?.close();
  });

  it("POST /messaging/send enfileira a mensagem avulsa", async () => {
    const r = await app.inject({ method: "POST", url: "/api/messaging/send", headers: auth, payload: { clientId, conteudo: "Teste avulso" } });
    expect(r.statusCode).toBe(201);
    const { messageId } = r.json() as { messageId: string };
    const m = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    expect(m.clientId).toBe(clientId);
    expect(m.status).toBe("AGENDADA");
  });

  it("POST /messaging/send respeita o opt-out", async () => {
    await prisma.client.update({ where: { id: clientId }, data: { optOut: true } });
    const r = await app.inject({ method: "POST", url: "/api/messaging/send", headers: auth, payload: { clientId, conteudo: "Não deve sair" } });
    expect(r.statusCode).toBe(400);
    await prisma.client.update({ where: { id: clientId }, data: { optOut: false } });
  });

  it("POST /quotes/:id/send envia o comparativo e move o lead", async () => {
    const q = await prisma.quote.create({
      data: { leadId, ramo: "auto", status: "CONCLUIDA", resultados: [{ seguradora: "Azul", premio: 2000 }, { seguradora: "Porto", premio: 2500 }] },
    });
    const r = await app.inject({ method: "POST", url: `/api/quotes/${q.id}/send`, headers: auth });
    expect(r.statusCode).toBe(201);
    expect((r.json() as { texto: string }).texto).toContain("*Azul*");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).etapa).toBe("COTACAO_ENVIADA");
  });

  it("POST /quotes/:id/send recusa cotação sem resultados", async () => {
    const q = await prisma.quote.create({ data: { leadId, ramo: "auto", status: "PROCESSANDO" } });
    const r = await app.inject({ method: "POST", url: `/api/quotes/${q.id}/send`, headers: auth });
    expect(r.statusCode).toBe(400);
  });

  it("PATCH /messaging/instance devolve estado + configurações", async () => {
    const before = await prisma.messagingSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const r = await app.inject({ method: "PATCH", url: "/api/messaging/instance", headers: auth, payload: { pausado: !before.pausado } });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { estado: string; settings: { pausado: boolean } };
    expect(body.settings.pausado).toBe(!before.pausado);
    expect(typeof body.estado).toBe("string");
    await prisma.messagingSettings.update({ where: { id: 1 }, data: { pausado: before.pausado } });
  });

  it("POST /public/leads cria lead sem login; honeypot preenchido é recusado", async () => {
    const r = await app.inject({ method: "POST", url: "/api/public/leads", payload: { nome: "Visitante Teste", telefone: TEL, produto: "auto" } });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ ok: true });
    const bot = await app.inject({ method: "POST", url: "/api/public/leads", payload: { nome: "Bot", telefone: TEL, site: "http://spam" } });
    expect(bot.statusCode).toBe(400);
    expect(await prisma.lead.count({ where: { telefone: TEL, origem: "site" } })).toBe(1);
  });

  it("rotas privadas continuam exigindo login", async () => {
    const r = await app.inject({ method: "POST", url: "/api/messaging/send", payload: { clientId, conteudo: "x" } });
    expect(r.statusCode).toBe(401);
  });
});
