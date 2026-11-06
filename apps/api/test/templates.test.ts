// Templates de mensagem e disparo personalizado (mensagem escrita na hora, sem template salvo).
// Unitários sempre rodam; a integração usa o banco de dev com dados FICTÍCIOS criados e
// apagados aqui (é pulada sem INTEGRATION_DB). A fila é simulada: nada é enviado de verdade.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { BroadcastSchema, TemplateCreateSchema } from "@ss/shared";

vi.mock("../src/modules/messaging/queue", () => ({
  enqueueMessage: vi.fn(async () => {}),
  getMessagesQueue: vi.fn(() => ({ getJobCounts: async () => ({}) })),
  getSchedulerQueue: vi.fn(),
  closeQueues: vi.fn(),
}));

describe("schemas de template e disparo personalizado", () => {
  it("TemplateCreateSchema exige nome e conteúdo e aplica padrões", () => {
    expect(TemplateCreateSchema.safeParse({ nome: "X", conteudo: "Oi" }).success).toBe(false);
    expect(TemplateCreateSchema.safeParse({ nome: "Promo", conteudo: "   " }).success).toBe(false);
    const ok = TemplateCreateSchema.parse({ nome: "Revisão", conteudo: "Oi {{nome}}" });
    expect(ok).toMatchObject({ anexarBoleto: false, ativo: true });
  });

  it("BroadcastSchema aceita template OU conteúdo, nunca os dois nem nenhum", () => {
    expect(BroadcastSchema.safeParse({ templateId: "t1" }).success).toBe(true);
    expect(BroadcastSchema.safeParse({ conteudo: "Oi {{nome}}" }).success).toBe(true);
    expect(BroadcastSchema.safeParse({}).success).toBe(false);
    expect(BroadcastSchema.safeParse({ templateId: "t1", conteudo: "Oi" }).success).toBe(false);
    expect(BroadcastSchema.safeParse({ conteudo: "  " }).success).toBe(false);
  });

  it("broadcastVars preenche as variáveis a partir da apólice", async () => {
    const { broadcastVars } = await import("../src/modules/messaging/routes");
    const v = broadcastVars({
      nome: "MARIA TESTE",
      policies: [
        {
          numero: "AP-1",
          proposta: null,
          insurer: { nome: "Seguradora Teste" },
          items: [{ placa: "TST1A23" }],
          installments: [{ valor: new Prisma.Decimal("250.5"), vencimento: new Date("2026-12-10T00:00:00Z") }],
        },
      ],
    });
    expect(v).toMatchObject({ nome: "Maria", seguradora: "Seguradora Teste", apolice: "AP-1", placa: "TST1A23", vencimento: "10/12/2026" });
    expect(v.valor).toMatch(/^R\$\s250,50$/);
    expect(broadcastVars({ nome: "joão", policies: [] })).toMatchObject({ nome: "João", seguradora: "", valor: "" });
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const CPF = "11144477735"; // CPF de teste (gerador público), não pertence a cliente
const TEL = "11900000088";
const NOME_TPL = "Teste automatizado de template";

describe.skipIf(!enabled)("templates e disparo personalizado (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let clientId = "";

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const admin = await prisma.user.findFirstOrThrow({ where: { perfil: "ADMIN", ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: admin.id, perfil: admin.perfil, nome: admin.nome })}` };
    await prisma.messageTemplate.deleteMany({ where: { nome: NOME_TPL } });
    await prisma.message.deleteMany({ where: { telefone: TEL } });
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
    clientId = (await prisma.client.create({ data: { nome: "CLIENTE TESTE TEMPLATE", cpfCnpj: CPF, telefone: TEL, status: "ATIVO", origem: "TESTE" } })).id;
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { telefone: TEL } });
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
    await prisma.messageTemplate.deleteMany({ where: { nome: NOME_TPL } });
    await app?.close();
  });

  it("POST /messaging/templates cria template reutilizável", async () => {
    const r = await app.inject({ method: "POST", url: "/api/messaging/templates", headers: auth, payload: { nome: NOME_TPL, conteudo: "Oi {{nome}}, tudo bem?" } });
    expect(r.statusCode).toBe(201);
    const t = r.json() as { id: string; nome: string; ativo: boolean; anexarBoleto: boolean };
    expect(t).toMatchObject({ nome: NOME_TPL, ativo: true, anexarBoleto: false });
    const list = await app.inject({ method: "GET", url: "/api/messaging/templates", headers: auth });
    expect((list.json() as { data: { id: string }[] }).data.some((x) => x.id === t.id)).toBe(true);
  });

  it("POST /messaging/templates valida o corpo", async () => {
    const r = await app.inject({ method: "POST", url: "/api/messaging/templates", headers: auth, payload: { nome: NOME_TPL, conteudo: "" } });
    expect(r.statusCode).toBe(400);
  });

  it("POST /messaging/broadcast aceita mensagem personalizada (prévia e envio)", async () => {
    const filtro = { clientIds: [clientId] };
    const dry = await app.inject({ method: "POST", url: "/api/messaging/broadcast", headers: auth, payload: { conteudo: "Olá {{nome}}!", filtro, dryRun: true } });
    expect(dry.statusCode).toBe(200);
    expect(dry.json()).toMatchObject({ total: 1, dryRun: true });

    const r = await app.inject({ method: "POST", url: "/api/messaging/broadcast", headers: auth, payload: { conteudo: "Olá {{nome}}! {{placa}}", filtro } });
    expect(r.statusCode).toBe(200);
    const m = await prisma.message.findFirstOrThrow({ where: { telefone: TEL } });
    expect(m.conteudo).toBe("Olá Cliente!");
    expect(m.templateId).toBeNull();
  });

  it("POST /messaging/broadcast recusa template e conteúdo juntos", async () => {
    const r = await app.inject({ method: "POST", url: "/api/messaging/broadcast", headers: auth, payload: { templateId: "x", conteudo: "Oi", filtro: { clientIds: [clientId] }, dryRun: true } });
    expect(r.statusCode).toBe(400);
  });
});
