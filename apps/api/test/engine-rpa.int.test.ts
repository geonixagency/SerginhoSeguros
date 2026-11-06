// Job D+1 com seguradoras do canal rpa (dados FICTÍCIOS criados e apagados aqui).
// O registro de conectores é substituído por um conector falso: nada chama robô ou portal.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/messaging/queue", () => ({
  enqueueMessage: vi.fn(async () => {}),
  getMessagesQueue: vi.fn(),
  getSchedulerQueue: vi.fn(),
  closeQueues: vi.fn(),
}));

const fake = vi.hoisted(() => ({ calls: [] as string[], modo: "sessao" as "sessao" | "ok" }));

vi.mock("../src/connectors/registry", async () => {
  const { RobotSessionError } = await import("../src/connectors/insurers/rpaBase");
  const connector = {
    slug: "fake-rpa",
    capabilities: ["listInstallments"],
    async testConnection() {
      return { ok: true };
    },
    async listInstallments(_cred: unknown, numero: string) {
      fake.calls.push(numero);
      if (fake.modo === "sessao") throw new RobotSessionError("needs_human", "O portal pediu captcha/2FA");
      return [{ numero: 1, valor: 100, vencimento: "2026-01-01", status: "PAGO" as const }];
    },
  };
  return {
    getConnector: () => connector,
    connectorSupports: (_slug: string, cap: string) => cap === "listInstallments",
    loadCredential: async () => ({ tipo: "USUARIO_SENHA_API", ambiente: "PRODUCAO", valores: { usuario: "ficticio", senha: "ficticia" } }),
    connectorChannel: () => "rpa",
    registerConnector: () => {},
  };
});

const { prisma } = await import("../src/lib/prisma");
const { runRulesTick } = await import("../src/modules/messaging/engine");
const { addDays, dateOnly, todayIso } = await import("../src/lib/dates");

const enabled = Boolean(process.env.INTEGRATION_DB);
const log = { info: () => {}, warn: () => {}, error: () => {} } as never;
const CPF = "52998224725"; // CPF de teste (gerador público), não pertence a cliente

describe.skipIf(!enabled)("job D+1 no canal rpa (integração)", () => {
  const today = todayIso();
  const now = new Date(`${today}T11:00:00-03:00`);
  let clientId = "";
  const statusAntes = new Map<string, string>();

  beforeAll(async () => {
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
    const seguradoras = await prisma.insurer.findMany({ where: { slug: { in: ["porto", "azul", "tokio-marine"] } } });
    for (const s of seguradoras) statusAntes.set(s.id, s.statusIntegracao);
    const bySlug = Object.fromEntries(seguradoras.map((s) => [s.slug, s.id]));
    const c = await prisma.client.create({ data: { nome: "Cliente Teste Rpa", cpfCnpj: CPF, telefone: "11900000002", status: "ATIVO", origem: "TESTE" } });
    clientId = c.id;
    // Três apólices com parcela vencida ontem: duas na sessão da Porto (porto, azul), uma na Tokio.
    for (const [slug, numero] of [["porto", "TESTE-RPA-P"], ["azul", "TESTE-RPA-A"], ["tokio-marine", "TESTE-RPA-T"]] as const) {
      await prisma.policy.create({
        data: {
          clientId,
          insurerId: bySlug[slug]!,
          ramo: "auto",
          numero,
          fimVigencia: dateOnly(addDays(today, 300)),
          formaPagamento: "BOLETO",
          installments: { create: { numero: 1, valor: 100, vencimento: dateOnly(addDays(today, -1)) } },
        },
      });
    }
  });

  beforeEach(() => {
    fake.calls.length = 0;
  });

  afterAll(async () => {
    if (clientId) {
      await prisma.message.deleteMany({ where: { clientId } });
      await prisma.client.delete({ where: { id: clientId } });
    }
    for (const [id, st] of statusAntes) await prisma.insurer.update({ where: { id }, data: { statusIntegracao: st as never } });
    await prisma.$disconnect();
  });

  it("sessão indisponível: consulta 1x por sessão de portal, não envia mensagem e marca ERRO", async () => {
    fake.modo = "sessao";
    await runRulesTick(log, now, { clientIds: [clientId] });
    // Porto e Azul compartilham a sessão: só a primeira é tentada. Tokio é outra sessão.
    expect(fake.calls).toHaveLength(2);
    expect(await prisma.message.count({ where: { clientId } })).toBe(0);
    const porto = await prisma.insurer.findUniqueOrThrow({ where: { slug: "azul" } });
    expect(porto.statusIntegracao).toBe("ERRO");
  });

  it("parcela conferida hoje não é consultada de novo no mesmo dia", async () => {
    fake.modo = "ok";
    await runRulesTick(log, now, { clientIds: [clientId] });
    expect(fake.calls).toHaveLength(3); // agora todas respondem (PAGO) e ganham verificadoEm
    fake.calls.length = 0;
    await prisma.installment.updateMany({ where: { policy: { clientId } }, data: { status: "PENDENTE" } });
    await runRulesTick(log, new Date(`${today}T15:00:00-03:00`), { clientIds: [clientId] });
    expect(fake.calls).toHaveLength(0);
  });
});
