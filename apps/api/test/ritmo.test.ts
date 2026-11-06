// Ritmo dos disparos (intervalo sorteado, lotes, estimativa), anexos de mensagem e CSV de contatos.
// A parte de integração (INTEGRATION_DB) usa só telefones e CPF fictícios e apaga o que cria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { batchResumeAt, estimateSchedule, randomIntervalMs, type PacingSettings } from "../src/modules/messaging/pacing";
import { sniffAttachment } from "../src/modules/messaging/attachments";
import { renderLoose } from "../src/modules/messaging/template";

const sp = (iso: string) => new Date(`${iso}-03:00`);
const base: PacingSettings = {
  janelaInicio: 8,
  janelaFim: 20,
  limiteDiario: 1000,
  intervaloMinSeg: 50,
  intervaloMaxSeg: 230,
  loteTamanho: 25,
  lotePausaMin: 240,
};

describe("intervalo sorteado", () => {
  it("respeita os limites, inclusive nas pontas", () => {
    expect(randomIntervalMs(50, 230, () => 0)).toBe(50_000);
    expect(randomIntervalMs(50, 230, () => 0.999999)).toBeLessThanOrEqual(230_000);
    expect(randomIntervalMs(230, 50, () => 0)).toBe(50_000); // min/max invertidos
    for (let i = 0; i < 100; i++) {
      const ms = randomIntervalMs(50, 230);
      expect(ms).toBeGreaterThanOrEqual(50_000);
      expect(ms).toBeLessThanOrEqual(230_000);
    }
  });
});

describe("pausa entre lotes", () => {
  const pausa = 240 * 60_000;
  const now = sp("2026-11-06T10:00:00");
  const seq = (n: number, ultima: Date, passoSeg = 120) => Array.from({ length: n }, (_, i) => new Date(ultima.getTime() - i * passoSeg * 1000));

  it("não pausa antes de completar o lote", () => {
    expect(batchResumeAt(seq(24, new Date(now.getTime() - 60_000)), 25, pausa, now)).toBeNull();
  });
  it("pausa 4 h depois do 25º envio seguido", () => {
    const ultima = new Date(now.getTime() - 60_000);
    expect(batchResumeAt(seq(25, ultima), 25, pausa, now)?.getTime()).toBe(ultima.getTime() + pausa);
  });
  it("lote já separado por uma pausa longa não conta como cheio", () => {
    const ultima = new Date(now.getTime() - 60_000);
    const lista = seq(25, ultima);
    lista[10] = new Date(lista[9]!.getTime() - pausa - 1000);
    for (let i = 11; i < 25; i++) lista[i] = new Date(lista[i - 1]!.getTime() - 120_000);
    expect(batchResumeAt(lista, 25, pausa, now)).toBeNull();
  });
  it("pausa já cumprida libera o próximo lote; pausa 0 desliga", () => {
    const ultima = new Date(now.getTime() - pausa - 1000);
    expect(batchResumeAt(seq(25, ultima), 25, pausa, now)).toBeNull();
    expect(batchResumeAt(seq(25, new Date(now.getTime() - 60_000)), 25, 0, now)).toBeNull();
  });
});

describe("estimativa de término", () => {
  it("110 contatos em lotes de 25 = 5 lotes, término depois do início e dentro da janela", () => {
    const e = estimateSchedule(110, base, sp("2026-11-06T08:00:00"));
    expect(e.total).toBe(110);
    expect(e.lotes).toBe(5);
    const ini = new Date(e.inicioPrevisto);
    const fim = new Date(e.terminoPrevisto);
    expect(fim.getTime()).toBeGreaterThan(ini.getTime());
    // 4 pausas de 4 h não cabem num dia de 12 h: termina em outro dia
    expect(fim.getTime() - ini.getTime()).toBeGreaterThan(16 * 3600_000);
    const h = Number(fim.toLocaleString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
    expect(h).toBeGreaterThanOrEqual(8);
    expect(h).toBeLessThan(20);
  });
  it("fora da janela começa às 8h do dia seguinte; sem contatos não há lote", () => {
    const e = estimateSchedule(10, base, sp("2026-11-06T21:00:00"));
    expect(new Date(e.inicioPrevisto).getTime()).toBe(sp("2026-11-07T08:00:00").getTime());
    expect(estimateSchedule(0, base, sp("2026-11-06T10:00:00")).lotes).toBe(0);
  });
  it("limite diário empurra o resto para o dia seguinte", () => {
    const e = estimateSchedule(30, { ...base, limiteDiario: 20, lotePausaMin: 0 }, sp("2026-11-06T08:00:00"));
    expect(new Date(e.terminoPrevisto).getTime()).toBeGreaterThan(sp("2026-11-07T08:00:00").getTime());
  });
});

describe("anexo e variáveis livres", () => {
  it("aceita PDF, imagem e Office pelo conteúdo; recusa o resto", () => {
    expect(sniffAttachment(Buffer.from("%PDF-1.7\n"), "a.pdf")?.mime).toBe("application/pdf");
    expect(sniffAttachment(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "foto.jpeg")?.mime).toBe("image/jpeg");
    expect(sniffAttachment(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "planilha.xlsx")?.ext).toBe(".xlsx");
    expect(sniffAttachment(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "pacote.zip")).toBeNull();
    expect(sniffAttachment(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "carta.doc")?.mime).toBe("application/msword");
    expect(sniffAttachment(Buffer.from("MZ\x90\0"), "virus.pdf")).toBeNull();
  });
  it("renderLoose usa qualquer coluna e zera as que faltam", () => {
    expect(renderLoose("Oi {{nome}}, seu {{ Seguro }} vence {{vencimento}}.", { nome: "Ana", seguro: "auto" })).toBe("Oi Ana, seu auto vence .");
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const CPF = "11144477735"; // CPF de teste (gerador público)
const TEL_OPTOUT = "11900000001"; // fictício

describe.skipIf(!enabled)("anexos e CSV no disparo (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  const docs: string[] = [];

  const limpar = async () => {
    await prisma.client.deleteMany({ where: { cpfCnpj: CPF } });
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await limpar();
    const u = await prisma.user.findFirstOrThrow({ where: { ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: u.id, perfil: u.perfil, nome: u.nome })}` };
    await prisma.client.create({ data: { nome: "Contato Saiu Teste", cpfCnpj: CPF, telefone: TEL_OPTOUT, optOut: true } });
  });

  afterAll(async () => {
    if (docs.length) await prisma.document.deleteMany({ where: { id: { in: docs } } });
    await limpar();
    await app?.close();
  });

  const multipart = (filename: string, content: Buffer) => {
    const b = "----ritmo";
    const payload = Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="arquivo"; filename="${filename}"\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]);
    return { payload, headers: { ...auth, "content-type": `multipart/form-data; boundary=${b}` } };
  };

  it("sobe anexo válido; recusa formato estranho e arquivo acima de 10 MB", async () => {
    const ok = await app.inject({ method: "POST", url: "/api/messaging/attachments", ...multipart("tabela.pdf", Buffer.from("%PDF-1.4\n% teste\n%%EOF\n")) });
    expect(ok.statusCode).toBe(201);
    const body = ok.json() as { documentId: string; mimeType: string; nome: string };
    docs.push(body.documentId);
    expect(body.mimeType).toBe("application/pdf");
    expect(body.nome).toBe("tabela.pdf");

    const ruim = await app.inject({ method: "POST", url: "/api/messaging/attachments", ...multipart("x.pdf", Buffer.from("<html>")) });
    expect(ruim.statusCode).toBe(400);

    const grande = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 + 10)]);
    const r = await app.inject({ method: "POST", url: "/api/messaging/attachments", ...multipart("grande.pdf", grande) });
    expect(r.statusCode).toBe(413);
  });

  it("dryRun com CSV conta inválidos, duplicados e opt-out e devolve estimativa", async () => {
    const contatos = [
      { telefone: "(11) 98888-0001", nome: "Ana Teste", vars: { seguro: "auto" } },
      { telefone: "11988880001", nome: "Ana de novo", vars: {} }, // duplicado
      { telefone: "123", nome: "Inválido", vars: {} },
      { telefone: TEL_OPTOUT, nome: "Saiu", vars: {} },
      { telefone: "+55 21 97777-0002", nome: "Bruno Teste", vars: { seguro: "vida" } },
    ];
    const r = await app.inject({
      method: "POST",
      url: "/api/messaging/broadcast",
      headers: auth,
      payload: { conteudo: "Oi {{nome}}, sobre seu seguro {{seguro}}", contatos, anexoDocumentId: docs[0], dryRun: true },
    });
    expect(r.statusCode, r.body).toBe(200);
    const b = r.json() as { total: number; ignorados: { optOut: number; invalidos: number; duplicados: number }; estimativa: { lotes: number } };
    expect(b.total).toBe(2);
    expect(b.ignorados).toMatchObject({ optOut: 1, invalidos: 1, duplicados: 1 });
    expect(b.estimativa.lotes).toBe(1);
  });

  it("settings aceitam e devolvem o ritmo de lotes", async () => {
    const antes = (await app.inject({ method: "GET", url: "/api/messaging/settings", headers: auth })).json() as { loteTamanho: number; lotePausaMin: number };
    const r = await app.inject({ method: "PATCH", url: "/api/messaging/settings", headers: auth, payload: { loteTamanho: 30, lotePausaMin: 120 } });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ loteTamanho: 30, lotePausaMin: 120 });
    await app.inject({ method: "PATCH", url: "/api/messaging/settings", headers: auth, payload: { loteTamanho: antes.loteTamanho, lotePausaMin: antes.lotePausaMin } });
  });
});
