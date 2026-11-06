import { describe, expect, it } from "vitest";
import { decrypt, encrypt, maskSecret, parseKey } from "../src/lib/crypto";
import { addDays, diffDays, formatBr, formatMoneyBr, localTime, nextWindowOpen, todayIso } from "../src/lib/dates";
import { primeiroNome, renderTemplate, DEFAULT_TEMPLATES } from "../src/modules/messaging/template";
import { decideSend, randomIntervalMs } from "../src/modules/messaging/sender";
import { phoneFromJid } from "../src/modules/messaging/webhook";
import { resolveInsurerSlug, INSURER_CATALOG, canalDe } from "../src/connectors/catalog";
import { HttpClient } from "../src/connectors/http";
import { ConnectorError } from "../src/connectors/types";
import { MockConnector, buildFakeBoletoPdf } from "../src/connectors/mock";

const key = parseKey(Buffer.alloc(32, 1).toString("base64"));
const settings = { pausado: false, limiteDiario: 10, janelaInicio: 8, janelaFim: 20 };
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("crypto AES-256-GCM", () => {
  it("cifra/decifra e detecta adulteração", () => {
    const c = encrypt('{"apiKey":"x"}', key);
    expect(c.startsWith("v1:")).toBe(true);
    expect(decrypt(c, key)).toBe('{"apiKey":"x"}');
    const parts = c.split(":");
    parts[3] = Buffer.from("adulterado").toString("base64");
    expect(() => decrypt(parts.join(":"), key)).toThrow();
  });
  it("IV aleatório: mesmo texto gera cifras diferentes", () => {
    expect(encrypt("a", key)).not.toBe(encrypt("a", key));
  });
  it("rejeita chave de tamanho errado", () => {
    expect(() => parseKey("curta-demais-curta-demais-curta-demais")).toThrow();
  });
  it("mascara sem revelar o segredo", () => {
    expect(maskSecret("abc")).toBe("••••••••");
    expect(maskSecret("chave-super-secreta-123")).toBe("cha•••••123");
  });
});

describe("datas em America/Sao_Paulo", () => {
  it("dia local difere do UTC perto da meia-noite", () => {
    expect(todayIso(new Date("2026-11-06T02:30:00Z"))).toBe("2026-11-05");
    expect(localTime(new Date("2026-11-06T02:30:00Z")).hour).toBe(23);
  });
  it("aritmética de dias e formatação BR", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-11-01", "2026-11-08")).toBe(7);
    expect(formatBr("2026-03-09")).toBe("09/03/2026");
    expect(formatMoneyBr("1234.5").replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
  it("próxima abertura da janela", () => {
    expect(nextWindowOpen(sp("2026-11-06T06:00:00"), 8).toISOString()).toBe("2026-11-06T11:00:00.000Z");
    expect(nextWindowOpen(sp("2026-11-06T21:00:00"), 8).toISOString()).toBe("2026-11-07T11:00:00.000Z");
  });
});

describe("templates", () => {
  it("substitui variáveis e remove desconhecidas", () => {
    expect(renderTemplate("Oi {{nome}}, {{ seguradora }} {{x}}vence {{vencimento}}", { nome: "Ana", seguradora: "Porto", vencimento: "10/12/2026" })).toBe(
      "Oi Ana, Porto vence 10/12/2026",
    );
  });
  it("primeiro nome capitalizado", () => {
    expect(primeiroNome("MARIA DA SILVA")).toBe("Maria");
  });
  it("textos aprovados estão íntegros", () => {
    expect(DEFAULT_TEMPLATES.PRIMEIRA_PARCELA.conteudo).toMatch(/^Oi tudo bem\? Passando para lembrar/);
    expect(DEFAULT_TEMPLATES.PROBLEMA_COM_BOLETO.anexarBoleto).toBe(true);
    expect(DEFAULT_TEMPLATES.ANIVERSARIO.conteudo).toContain("Feliz Aniversário");
  });
});

describe("decisão de envio (janela, limite, pausa, opt-out)", () => {
  const base = { settings, enviadasHoje: 0, optOut: false, telefone: "11988887777" };
  it("envia dentro da janela", () => {
    expect(decideSend({ ...base, now: sp("2026-11-06T10:00:00") }).tipo).toBe("enviar");
  });
  it("reagenda fora da janela para 8h", () => {
    const d = decideSend({ ...base, now: sp("2026-11-06T20:30:00") });
    expect(d).toMatchObject({ tipo: "reagendar" });
    if (d.tipo === "reagendar") expect(d.para.toISOString()).toBe("2026-11-07T11:00:00.000Z");
  });
  it("respeita limite diário (reagenda para amanhã 8h)", () => {
    const d = decideSend({ ...base, enviadasHoje: 10, now: sp("2026-11-06T15:00:00") });
    expect(d.tipo === "reagendar" && d.para.toISOString()).toBe("2026-11-07T11:00:00.000Z");
  });
  it("pausa geral reagenda; opt-out e sem telefone ignoram", () => {
    expect(decideSend({ ...base, settings: { ...settings, pausado: true }, now: sp("2026-11-06T10:00:00") }).tipo).toBe("reagendar");
    expect(decideSend({ ...base, optOut: true, now: sp("2026-11-06T10:00:00") }).tipo).toBe("ignorar");
    expect(decideSend({ ...base, telefone: "123", now: sp("2026-11-06T10:00:00") }).tipo).toBe("ignorar");
  });
  it("intervalo aleatório fica entre min e max", () => {
    for (let i = 0; i < 50; i++) {
      const ms = randomIntervalMs(20, 60);
      expect(ms).toBeGreaterThanOrEqual(20_000);
      expect(ms).toBeLessThanOrEqual(60_000);
    }
  });
});

describe("catálogo de seguradoras", () => {
  it("resolve nomes vindos do extrator", () => {
    expect(resolveInsurerSlug("Liberty/Yelum")).toBe("yelum");
    expect(resolveInsurerSlug("Porto Seguro")).toBe("porto");
    expect(resolveInsurerSlug("Itaú")).toBe("itau");
    expect(resolveInsurerSlug("Mitsui")).toBe("mitsui-sumitomo");
    expect(resolveInsurerSlug("Junto Seguros")).toBe("junto");
    expect(resolveInsurerSlug("Tokio Marine")).toBe("tokio-marine");
    expect(resolveInsurerSlug("xyz")).toBeNull();
  });
  it("todas as seguradoras pedidas estão no seed, com canal declarado", () => {
    const pedidas = ["Porto", "Tokio Marine", "Bradesco", "Allianz", "Yelum", "Zurich", "Suhai", "Mapfre", "HDI", "AXA", "Akad", "Junto", "MBM", "Darwin", "Justos", "Icatu", "Novo", "Ezze", "BP", "Pier", "Youse", "Usebens", "MetLife", "Excelsior", "Azul", "Itaú", "Mitsui Sumitomo", "Sompo"];
    const nomes = new Set(INSURER_CATALOG.map((e) => e.nome));
    for (const p of pedidas) expect(nomes.has(p), p).toBe(true);
    for (const e of INSURER_CATALOG) expect(["api", "import", "rpa", "manual"]).toContain(canalDe(e));
  });
});

describe("HttpClient (retry exponencial + rate limit)", () => {
  it("repete em 503 e devolve quando volta", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return n < 3 ? new Response("x", { status: 503 }) : Response.json({ ok: true });
    }) as typeof fetch;
    const c = new HttpClient({ baseUrl: "https://exemplo.invalid", fetchImpl, sleep: async () => {}, rps: 1000 });
    expect(await c.json<{ ok: boolean }>({ path: "/x" })).toEqual({ ok: true });
    expect(n).toBe(3);
  });
  it("desiste após esgotar tentativas", async () => {
    const fetchImpl = (async () => new Response("x", { status: 500 })) as typeof fetch;
    const c = new HttpClient({ baseUrl: "https://exemplo.invalid", fetchImpl, sleep: async () => {}, retries: 2, rps: 1000 });
    await expect(c.json({ path: "/x" })).rejects.toBeInstanceOf(ConnectorError);
  });
  it("não repete erro 4xx", async () => {
    let n = 0;
    const fetchImpl = (async () => (n++, new Response("nao", { status: 400 }))) as typeof fetch;
    const c = new HttpClient({ baseUrl: "https://exemplo.invalid", fetchImpl, sleep: async () => {}, rps: 1000 });
    await expect(c.json({ path: "/x" })).rejects.toThrow(/400/);
    expect(n).toBe(1);
  });
  it("espaça requisições pelo rps", async () => {
    const waits: number[] = [];
    const fetchImpl = (async () => Response.json({})) as typeof fetch;
    const c = new HttpClient({ baseUrl: "https://exemplo.invalid", fetchImpl, sleep: async (ms) => void waits.push(ms), rps: 2 });
    await Promise.all([c.json({ path: "/a" }), c.json({ path: "/b" }), c.json({ path: "/c" })]);
    expect(waits.filter((w) => w > 0).length).toBeGreaterThanOrEqual(2);
  });
});

describe("MockConnector e webhook", () => {
  it("boleto fictício é um PDF válido", async () => {
    const pdf = await new MockConnector().getBoletoPdf({ tipo: "x", ambiente: "x", valores: {} }, "123", 1);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buildFakeBoletoPdf(["a"]).toString("latin1")).toContain("%%EOF");
  });
  it("extrai telefone do JID", () => {
    expect(phoneFromJid("5511988887777@s.whatsapp.net")).toBe("11988887777");
  });
});
