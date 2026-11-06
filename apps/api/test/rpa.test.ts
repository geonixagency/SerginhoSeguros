// Conectores do canal "rpa" (Tokio e Porto) com fixtures sintéticas: o PortalRobotClient
// conversa com um fetch falso que imita a API do serviço portal-robot. Sem navegador,
// sem portal real, sem dados reais.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PortalRobotClient } from "../src/connectors/portalRobot";
import { TokioConnector } from "../src/connectors/insurers/tokio";
import { PortoConnector } from "../src/connectors/insurers/porto";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", "robot", f), "utf8");
const cred = (valores: Record<string, string> = { usuario: "corretor-teste", senha: "x" }) => ({ tipo: "USUARIO_SENHA_API", ambiente: "PRODUCAO", valores });

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
function fakeFetch(routes: Record<string, () => Response>, calls: Call[] = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = routes[`${method} ${new URL(url).pathname}`];
    return r ? r() : new Response("not found", { status: 404 });
  }) as typeof fetch;
}
const client = (routes: Record<string, () => Response>, calls?: Call[]) =>
  new PortalRobotClient({ baseUrl: "http://robot.invalid", token: "tkn-teste", sleep: async () => {}, fetchImpl: fakeFetch(routes, calls) });

describe("TokioConnector (rpa)", () => {
  it("testConnection reflete o status da sessão do robô", async () => {
    const t = new TokioConnector(client({ "GET /status/tokio": () => new Response(fx("status-needs-human.json")) }));
    expect(await t.testConnection(cred())).toMatchObject({ ok: false });
  });
  it("findPolicy busca por CPF e mapeia a apólice", async () => {
    const t = new TokioConnector(client({ "POST /tokio/client": () => new Response(fx("tokio-client.json")) }));
    const r = await t.findPolicy(cred(), { cpfCnpj: "111.444.777-35" });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ numero: "0531-99887766", placa: "ABC1D23", formaPagamento: "BOLETO" });
  });
  it("listInstallments usa o CPF do contexto e ignora canceladas", async () => {
    const calls: Call[] = [];
    const t = new TokioConnector(client({ "POST /tokio/client": () => new Response(fx("tokio-client.json")) }, calls));
    const parcelas = await t.listInstallments(cred(), "0531-99887766", { cpfCnpj: "11144477735" });
    expect(parcelas.map((p) => p.status)).toEqual(["PAGO", "ATRASADO"]);
    expect(calls[0]!.body).toEqual({ cpfCnpj: "11144477735" });
    expect(calls[0]!.headers.Authorization).toBe("Bearer tkn-teste");
  });
  it("sem CPF no contexto recusa com mensagem clara", async () => {
    const t = new TokioConnector(client({}));
    await expect(t.listInstallments(cred(), "0531-99887766")).rejects.toThrow(/CPF\/CNPJ/);
  });
  it("getPolicyStatus marca pendência de pagamento quando há vencida", async () => {
    const t = new TokioConnector(client({ "POST /tokio/client": () => new Response(fx("tokio-client.json")) }));
    const st = await t.getPolicyStatus(cred(), "0531-99887766", { cpfCnpj: "11144477735" });
    expect(st).toMatchObject({ situacao: "PENDENTE_PAGAMENTO", parcelasEmAberto: 1 });
  });
});

describe("PortoConnector (rpa)", () => {
  it("listInstallments filtra por apólice e mapeia status", async () => {
    const p = new PortoConnector("porto", client({ "POST /porto/installments": () => new Response(fx("porto-installments.json")) }));
    const parcelas = await p.listInstallments(cred(), "0531-12345678", { cpfCnpj: "11144477735" });
    expect(parcelas.map((x) => x.status)).toEqual(["PAGO", "ATRASADO"]);
    expect(parcelas[1]).toMatchObject({ numero: 2, boletoDisponivel: true });
  });
  it("getBoletoPdf acha a parcela e baixa o PDF pela chave", async () => {
    const calls: Call[] = [];
    const p = new PortoConnector("porto", client({ "POST /porto/installments": () => new Response(fx("porto-installments.json")), "POST /porto/billet": () => new Response(fx("billet.json")) }, calls));
    const pdf = await p.getBoletoPdf(cred(), "0531-12345678", 2, { cpfCnpj: "11144477735" });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(0);
    const billetCall = calls.find((c) => c.url.endsWith("/porto/billet"))!;
    expect((billetCall.body as { chaveBoleto: { installmentNumber: string } }).chaveBoleto.installmentNumber).toBe("2");
  });
  it("2ª via sem chave disponível devolve erro", async () => {
    const p = new PortoConnector("porto", client({ "POST /porto/installments": () => new Response(fx("porto-installments.json")) }));
    await expect(p.getBoletoPdf(cred(), "0531-12345678", 1, { cpfCnpj: "11144477735" })).rejects.toThrow(/2ª via/);
  });
  it("findPolicy agrupa parcelas por apólice", async () => {
    const p = new PortoConnector("porto", client({ "POST /porto/installments": () => new Response(fx("porto-installments.json")) }));
    const r = await p.findPolicy(cred(), { cpfCnpj: "11144477735" });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ numero: "0531-12345678", status: "PENDENTE_PAGAMENTO" });
  });
  it("testConnection ok quando a sessão está válida", async () => {
    const p = new PortoConnector("porto", client({ "GET /status/porto": () => new Response(fx("status-valid.json")) }));
    expect(await p.testConnection(cred())).toMatchObject({ ok: true });
  });
});

describe("canal rpa: sessão e login automático", () => {
  const expired = () => Response.json({ code: "SESSION_EXPIRED", message: "Sessão do portal expirada" }, { status: 409 });

  it("sessão caída => login automático com a credencial do cofre e nova tentativa", async () => {
    const calls: Call[] = [];
    let logado = false;
    const t = new TokioConnector(
      client(
        {
          "POST /tokio/client": () => (logado ? new Response(fx("tokio-client.json")) : expired()),
          "POST /login/tokio": () => ((logado = true), Response.json({ insurer: "tokio", status: "valid", verificadoEm: "2026-11-06T10:00:00Z" })),
        },
        calls,
      ),
    );
    const parcelas = await t.listInstallments(cred(), "0531-99887766", { cpfCnpj: "11144477735" });
    expect(parcelas).toHaveLength(2);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual(["POST /tokio/client", "POST /login/tokio", "POST /tokio/client"]);
    // A credencial só vai no corpo do /login (nunca nas consultas).
    expect(calls.filter((c) => JSON.stringify(c.body ?? {}).includes("senha")).map((c) => new URL(c.url).pathname)).toEqual(["/login/tokio"]);
  });

  it("login pede captcha/2FA => RobotSessionError needs_human (sem insistir)", async () => {
    const calls: Call[] = [];
    const p = new PortoConnector(
      "porto",
      client({ "POST /porto/installments": expired, "POST /login/porto": () => Response.json({ insurer: "porto", status: "needs_human", detalhe: "2FA", verificadoEm: "x" }) }, calls),
    );
    await expect(p.listInstallments(cred(), "0531-12345678", { cpfCnpj: "11144477735" })).rejects.toMatchObject({ name: "RobotSessionError", sessionStatus: "needs_human" });
    expect(calls).toHaveLength(2);
  });

  it("captcha na consulta (NEEDS_HUMAN) não tenta login", async () => {
    const calls: Call[] = [];
    const p = new PortoConnector("porto", client({ "POST /porto/installments": () => Response.json({ code: "NEEDS_HUMAN", message: "captcha" }, { status: 409 }) }, calls));
    await expect(p.findPolicy(cred(), { cpfCnpj: "11144477735" })).rejects.toMatchObject({ sessionStatus: "needs_human" });
    expect(calls).toHaveLength(1);
  });

  it("limite diário do robô (429) vira RobotSessionError budget", async () => {
    const p = new PortoConnector("porto", client({ "POST /porto/installments": () => Response.json({ code: "BUSY", message: "limite" }, { status: 429 }) }));
    await expect(p.findPolicy(cred(), { cpfCnpj: "11144477735" })).rejects.toMatchObject({ sessionStatus: "budget" });
  });

  it("cache curto: várias parcelas do mesmo cliente = uma consulta ao portal", async () => {
    const calls: Call[] = [];
    const t = new TokioConnector(client({ "POST /tokio/client": () => new Response(fx("tokio-client.json")) }, calls));
    await t.listInstallments(cred(), "0531-99887766", { cpfCnpj: "11144477735" });
    await t.getPolicyStatus(cred(), "0531-99887766", { cpfCnpj: "111.444.777-35" });
    expect(calls).toHaveLength(1);
  });

  it("credencial sem senha é recusada antes de chamar o robô", async () => {
    const calls: Call[] = [];
    const t = new TokioConnector(client({ "POST /tokio/client": expired }, calls));
    await expect(t.listInstallments(cred({ usuario: "x" }), "1", { cpfCnpj: "11144477735" })).rejects.toThrow(/incompleta/);
  });
});
