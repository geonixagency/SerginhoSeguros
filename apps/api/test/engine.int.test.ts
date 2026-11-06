// Integração das réguas com o banco de dev (dados FICTÍCIOS criados e apagados aqui).
// A fila é simulada: verificamos a criação idempotente das mensagens, não o envio.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/messaging/queue", () => ({
  enqueueMessage: vi.fn(async () => {}),
  getMessagesQueue: vi.fn(),
  getSchedulerQueue: vi.fn(),
  closeQueues: vi.fn(),
}));

const { prisma } = await import("../src/lib/prisma");
const { runRulesTick } = await import("../src/modules/messaging/engine");
const { addDays, dateOnly, todayIso } = await import("../src/lib/dates");

const enabled = Boolean(process.env.INTEGRATION_DB);
const log = { info: () => {}, warn: () => {}, error: () => {} } as never;
const CPF = "39053344705"; // CPF de teste (gerador público), não pertence a cliente

/** Número de apólice que o MockConnector considera "parcela em aberto com boleto". */
function numeroEmAberto(): string {
  for (let i = 0; ; i++) {
    const n = `TESTE-ENG-${i}`;
    const s = parseInt(createHash("md5").update(n).digest("hex").slice(0, 8), 16);
    if (s % 2 === 0 && s % 3 !== 0) return n;
  }
}

describe.skipIf(!enabled)("motor das réguas (integração)", () => {
  const today = todayIso();
  const now = new Date(`${today}T11:00:00-03:00`);
  let clientId = "";

  beforeAll(async () => {
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
    const porto = await prisma.insurer.findUniqueOrThrow({ where: { slug: "porto" } });
    const [y] = today.split("-");
    const c = await prisma.client.create({
      data: {
        nome: "Cliente Teste Motor",
        cpfCnpj: CPF,
        telefone: "11900000001",
        status: "ATIVO",
        origem: "TESTE",
        nascimento: dateOnly(`${Number(y) - 30}${today.slice(4)}`),
      },
    });
    clientId = c.id;
    await prisma.policy.create({
      data: {
        clientId,
        insurerId: porto.id,
        ramo: "auto",
        numero: "TESTE-ENG-PRIMEIRA",
        fimVigencia: dateOnly(addDays(today, 300)),
        formaPagamento: "BOLETO",
        installments: { create: { numero: 1, valor: 100, vencimento: dateOnly(addDays(today, 2)) } },
      },
    });
    await prisma.policy.create({
      data: {
        clientId,
        insurerId: porto.id,
        ramo: "auto",
        numero: numeroEmAberto(),
        fimVigencia: dateOnly(addDays(today, 300)),
        formaPagamento: "CARTAO",
        installments: { create: [{ numero: 1, valor: 100, vencimento: dateOnly(addDays(today, -31)), status: "PAGO" }, { numero: 2, valor: 100, vencimento: dateOnly(addDays(today, -1)) }] },
      },
    });
  });

  afterAll(async () => {
    if (!clientId) return;
    await prisma.message.deleteMany({ where: { clientId } });
    await prisma.client.delete({ where: { id: clientId } });
    await prisma.$disconnect();
  });

  it("cria 1ª parcela, aniversário e problema c/ boleto — e não duplica no 2º tick", async () => {
    await runRulesTick(log, now, { clientIds: [clientId] });
    const msgs = await prisma.message.findMany({ where: { clientId }, include: { rule: true } });
    const gatilhos = msgs.map((m) => m.rule?.gatilho).sort();
    expect(gatilhos).toEqual(["ANIVERSARIO", "PRIMEIRA_PARCELA", "PROBLEMA_COM_BOLETO"]);
    const comBoleto = msgs.find((m) => m.rule?.gatilho === "PROBLEMA_COM_BOLETO")!;
    expect(comBoleto.anexoDocumentId).toBeTruthy();
    expect(msgs.find((m) => m.rule?.gatilho === "PRIMEIRA_PARCELA")!.conteudo).toMatch(/^Oi tudo bem\?/);

    await runRulesTick(log, now, { clientIds: [clientId] });
    expect(await prisma.message.count({ where: { clientId } })).toBe(3);
  });

  it("antes do horário da régua não cria nada", async () => {
    await prisma.message.deleteMany({ where: { clientId } });
    await runRulesTick(log, new Date(`${today}T05:00:00-03:00`), { clientIds: [clientId] });
    expect(await prisma.message.count({ where: { clientId } })).toBe(0);
  });

  it("opt-out bloqueia a criação", async () => {
    await prisma.client.update({ where: { id: clientId }, data: { optOut: true } });
    await runRulesTick(log, now, { clientIds: [clientId] });
    expect(await prisma.message.count({ where: { clientId } })).toBe(0);
  });
});
