import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.INTEGRATION_DB);
const CPF = "98765432100"; // CPF de teste (gerador público), não pertence a cliente

describe.skipIf(!enabled)("sinistros e vencimentos por período (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let clientId = "";
  let outroId = "";
  let policyId = "";
  let outraPolicy = "";

  const limpar = () => prisma.client.deleteMany({ where: { nome: { startsWith: "ZZ Teste Sinistro" } } });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const admin = await prisma.user.findFirstOrThrow({ where: { perfil: "ADMIN", ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: admin.id, perfil: admin.perfil, nome: admin.nome })}` };
    await limpar();
    const insurer = await prisma.insurer.findFirstOrThrow({ select: { id: true } });
    const mk = async (nome: string, numero: string) => {
      const c = await prisma.client.create({ data: { nome, cpfCnpj: CPF } });
      const p = await prisma.policy.create({
        data: { clientId: c.id, insurerId: insurer.id, ramo: "auto", numero, fimVigencia: new Date("2031-03-15T00:00:00Z"), items: { create: { tipo: "VEICULO", placa: "ZZT1A23" } } },
      });
      return [c.id, p.id] as const;
    };
    [clientId, policyId] = await mk("ZZ Teste Sinistro Esposa", "ZZ-SIN-1");
    [outroId, outraPolicy] = await mk("ZZ Teste Sinistro Marido", "ZZ-SIN-2");
  });

  afterAll(async () => {
    await limpar();
    await app?.close();
  });

  it("registra, lista por cliente, atualiza e exclui", async () => {
    const body = { clientId, policyId, dataOcorrencia: "2026-10-20", tipo: "Colisão", descricao: "Batida traseira no semáforo", valor: 3500 };
    const r = await app.inject({ method: "POST", url: "/api/claims", headers: auth, payload: body });
    expect(r.statusCode).toBe(201);
    const c = r.json();
    expect(c).toMatchObject({ clientNome: "ZZ Teste Sinistro Esposa", policyNumero: "ZZ-SIN-1", placa: "ZZT1A23", status: "ABERTO", valor: "3500.00" });

    // apólice de outro cliente (mesmo CPF) é recusada
    const bad = await app.inject({ method: "POST", url: "/api/claims", headers: auth, payload: { ...body, policyId: outraPolicy } });
    expect(bad.statusCode).toBe(400);

    const list = await app.inject({ method: "GET", url: `/api/claims?clientId=${clientId}`, headers: auth });
    expect(list.json().total).toBe(1);
    const outro = await app.inject({ method: "GET", url: `/api/claims?clientId=${outroId}`, headers: auth });
    expect(outro.json().total).toBe(0);

    const up = await app.inject({ method: "PATCH", url: `/api/claims/${c.id}`, headers: auth, payload: { status: "EM_ANALISE", protocolo: "S-123" } });
    expect(up.json()).toMatchObject({ status: "EM_ANALISE", protocolo: "S-123" });

    // vencimentos por período trazem CPF e nº de sinistros
    const exp = await app.inject({ method: "GET", url: "/api/dashboard/expiring?de=2031-03-01&ate=2031-03-31", headers: auth });
    expect(exp.statusCode).toBe(200);
    const row = exp.json().data.find((p: { id: string }) => p.id === policyId);
    expect(row).toMatchObject({ sinistros: 1, client: { cpfCnpj: CPF }, placas: ["ZZT1A23"] });
    const ruim = await app.inject({ method: "GET", url: "/api/dashboard/expiring?de=2031-04-01&ate=2031-03-01", headers: auth });
    expect(ruim.statusCode).toBe(400);

    const del = await app.inject({ method: "DELETE", url: `/api/claims/${c.id}`, headers: auth });
    expect(del.statusCode).toBe(204);
  });
});
