// Conectores com respostas gravadas (fixtures fictícias, sem dados reais).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AggilizadorConnector,
  buildQuotationDto,
  extractQuotationId,
  extractResults,
} from "../src/connectors/aggilizador";
import { EvolutionClient, toWhatsappNumber } from "../src/modules/messaging/evolution";

const fx = (f: string) => readFileSync(path.join(__dirname, "fixtures", "aggilizador", f), "utf8");
const cred = (valores: Record<string, string> = {}) => ({ tipo: "API_KEY", ambiente: "PRODUCAO", valores });
const segurado = { nome: "Fulano Fixture", cpfCnpj: "529.982.247-25", telefone: "5514999990000", email: "f@exemplo.invalid" };

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> };
function fakeFetch(routes: Record<string, () => Response>, calls: Call[]) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: (init?.headers ?? {}) as Record<string, string> });
    const key = `${method} ${new URL(url).pathname}`;
    const r = routes[key];
    return r ? r() : new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("Aggilizador: mapeamento Lead/Cliente -> QuotationDto", () => {
  it("monta CalculationAuto com segurado, veículo, seguro e IDs da corretora", () => {
    const { path: p, dto } = buildQuotationDto(
      { ramo: "auto", segurado, dados: { cep: "17500-000", nascimento: "1980-05-10", vigenciaInicial: "2026-12-01", veiculo: { placa: "abc-1d23", anoModelo: "2023", zeroKm: false } } },
      { insuranceBrokerId: 123, brokerId: 45, companyId: 6, partner: 0 },
    );
    expect(p).toBe("/Auto");
    expect(dto).toMatchObject({ InsuranceBrokerId: 123, BrokerId: 45, CompanyId: 6, Partner: 0, AbortMail: true });
    const c = dto.CalculationAuto!;
    expect(c.Segurado).toMatchObject({ NomeCompleto: "Fulano Fixture", CpfCnpj: "52998224725", Cep: "17500000", DataNascimento: "1980-05-10T00:00:00", TelefoneCelular: { Ddd: "14", Numero: "999990000" } });
    expect(c.Veiculo).toMatchObject({ Placa: "ABC1D23", AnoModelo: "2023", ZeroKm: "N", CepPernoite: "17500000" });
    expect(c.Seguro).toMatchObject({ VigenciaInicial: "2026-12-01T00:00:00", VigenciaFinal: "2027-12-01T00:00:00" });
  });
  it("residencial usa /Residence com Imovel.Endereco", () => {
    const { path: p, dto } = buildQuotationDto({ ramo: "residencial", segurado, dados: { imovel: { cep: "01001000", cidade: "São Paulo", uf: "sp" } } }, { insuranceBrokerId: 1 });
    expect(p).toBe("/Residence");
    expect(dto.CalculationResidence?.Imovel?.Endereco).toMatchObject({ Cep: "01001000", Estado: "SP" });
  });
  it("ramo não suportado gera erro claro", () => {
    expect(() => buildQuotationDto({ ramo: "consorcio", segurado, dados: {} }, {})).toThrow(/não suportado/);
  });
  it("lê ID e resultados das respostas gravadas", () => {
    expect(extractQuotationId(JSON.parse(fx("post-auto.json")))).toBe("fx-quot-0001");
    expect(extractQuotationId('"abc-123"')).toBe("abc-123");
    const r = extractResults(JSON.parse(fx("get-quotation-done.json")));
    expect(r.map((x) => x.seguradora)).toEqual(["Seguradora Fixture A", "Seguradora Fixture B"]);
    expect(extractResults(JSON.parse(fx("get-quotation-processing.json")))).toEqual([]);
  });
});

describe("AggilizadorConnector (HTTP com fixtures)", () => {
  it("createQuote: POST /Auto e GET /Quotation/{id}", async () => {
    const calls: Call[] = [];
    const c = new AggilizadorConnector({
      baseUrl: "https://agg.exemplo.invalid",
      sleep: async () => {},
      fetchImpl: fakeFetch(
        {
          "POST /Auto": () => new Response(fx("post-auto.json"), { status: 200 }),
          "GET /Quotation/fx-quot-0001": () => new Response(fx("get-quotation-done.json"), { status: 200 }),
        },
        calls,
      ),
    });
    const r = await c.quote(cred({ insuranceBrokerId: "987" }), { ramo: "auto", segurado, dados: {} });
    expect(r).toMatchObject({ externoId: "fx-quot-0001", status: "CONCLUIDA" });
    expect(r.resultados).toHaveLength(2);
    expect(calls[0]).toMatchObject({ method: "POST" });
    expect((calls[0]!.body as { InsuranceBrokerId: number }).InsuranceBrokerId).toBe(987);
    // Nunca enviar token de sessão do app (integração não oficial).
    expect(JSON.stringify(calls.map((x) => x.headers))).not.toMatch(/authorization|hubAuth/i);
  });
  it("getQuote ainda calculando => PROCESSANDO", async () => {
    const c = new AggilizadorConnector({
      baseUrl: "https://agg.exemplo.invalid",
      fetchImpl: fakeFetch({ "GET /Quotation/fx-quot-0001": () => new Response(fx("get-quotation-processing.json")) }, []),
    });
    expect((await c.getQuote(cred(), "fx-quot-0001")).status).toBe("PROCESSANDO");
  });
  it("sem InsuranceBrokerId recusa antes de chamar a API", async () => {
    const calls: Call[] = [];
    const c = new AggilizadorConnector({ baseUrl: "https://agg.exemplo.invalid", fetchImpl: fakeFetch({}, calls) });
    await expect(c.quote(cred(), { ramo: "auto", segurado, dados: {} })).rejects.toThrow(/InsuranceBrokerId/);
    expect(calls).toHaveLength(0);
  });
  it("400 do Aggilizador vira erro legível", async () => {
    const c = new AggilizadorConnector({
      baseUrl: "https://agg.exemplo.invalid",
      fetchImpl: fakeFetch({ "POST /Auto": () => new Response('"Campo obrigatório"', { status: 400 }) }, []),
    });
    await expect(c.quote(cred({ insuranceBrokerId: "1" }), { ramo: "auto", segurado, dados: {} })).rejects.toThrow(/HTTP 400/);
  });
  it("testConnection avisa quando faltam os IDs da corretora", async () => {
    const c = new AggilizadorConnector({ baseUrl: "https://agg.exemplo.invalid", fetchImpl: fakeFetch({ "GET /Auto/Settings": () => Response.json({}) }, []) });
    expect(await c.testConnection(cred())).toMatchObject({ ok: false });
    expect(await c.testConnection(cred({ insuranceBrokerId: "5" }))).toMatchObject({ ok: true });
  });
});

describe("Evolution API (mock de fetch, sem chamar a real)", () => {
  it("envia texto com apikey e número 55+DDD", async () => {
    const calls: Call[] = [];
    const evo = new EvolutionClient({
      baseUrl: "https://evo.exemplo.invalid",
      apiKey: "k-teste",
      instance: "inst",
      fetchImpl: fakeFetch({ "POST /message/sendText/inst": () => Response.json({ key: { id: "MSG1" } }) }, calls),
    });
    expect(await evo.sendText("(11) 98888-7777", "oi")).toEqual({ id: "MSG1" });
    expect(calls[0]!.body).toEqual({ number: "5511988887777", text: "oi" });
    expect(calls[0]!.headers.apikey).toBe("k-teste");
  });
  it("connect cria a instância se não existir e devolve QR", async () => {
    const calls: Call[] = [];
    let created = false;
    const evo = new EvolutionClient({
      baseUrl: "https://evo.exemplo.invalid",
      apiKey: "k",
      instance: "inst",
      fetchImpl: fakeFetch(
        {
          "GET /instance/connectionState/inst": () => (created ? Response.json({ instance: { state: "connecting" } }) : new Response("", { status: 404 })),
          "POST /instance/create": () => ((created = true), Response.json({ instance: { instanceName: "inst" } })),
          "GET /instance/connect/inst": () => Response.json({ base64: "AAAA", pairingCode: "XY" }),
        },
        calls,
      ),
    });
    const r = await evo.connect();
    expect(r).toEqual({ state: "connecting", qrcode: "data:image/png;base64,AAAA", pairingCode: "XY" });
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toContain("POST /instance/create");
  });
  it("envia PDF como documento base64", async () => {
    const calls: Call[] = [];
    const evo = new EvolutionClient({
      baseUrl: "https://evo.exemplo.invalid",
      apiKey: "k",
      instance: "inst",
      fetchImpl: fakeFetch({ "POST /message/sendMedia/inst": () => Response.json({ key: { id: "M2" } }) }, calls),
    });
    await evo.sendDocument("11988887777", Buffer.from("%PDF-1.4"), "boleto.pdf", "legenda");
    expect(calls[0]!.body).toMatchObject({ mediatype: "document", mimetype: "application/pdf", fileName: "boleto.pdf", caption: "legenda" });
  });
  it("normaliza número", () => {
    expect(toWhatsappNumber("11988887777")).toBe("5511988887777");
    expect(toWhatsappNumber("5511988887777")).toBe("5511988887777");
  });
});
