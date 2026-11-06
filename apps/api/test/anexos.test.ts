// Cadastro manual: anexar arquivos sem o leitor de PDF e editar parcelas/itens da apólice.
// Integração (INTEGRATION_DB) com cliente FICTÍCIO (CPF de teste), apagado no fim.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sniffMime } from "../src/modules/documents/routes";

describe("sniffMime", () => {
  it("reconhece PDF e imagens pelo conteúdo e recusa o resto", () => {
    expect(sniffMime(Buffer.from("%PDF-1.4\n"))?.mime).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mime).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe("image/png");
    expect(sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffMime(Buffer.from("<html>"))).toBeNull();
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const CPF = "52998224725"; // CPF de teste (gerador público)

describe.skipIf(!enabled)("anexos e edição manual (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let clientId = "";
  let policyId = "";

  const limpar = async () => {
    const c = await prisma.client.findUnique({ where: { cpfCnpj: CPF }, select: { id: true } });
    if (c) {
      await prisma.policy.deleteMany({ where: { clientId: c.id } });
      await prisma.client.delete({ where: { id: c.id } });
    }
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await limpar();
    const u = await prisma.user.findFirstOrThrow({ where: { ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: u.id, perfil: u.perfil, nome: u.nome })}` };
    const r = await app.inject({ method: "POST", url: "/api/clients", headers: auth, payload: { nome: "Cliente Manual Teste", cpfCnpj: CPF } });
    expect(r.statusCode).toBe(201);
    clientId = (r.json() as { id: string }).id;
    const ins = await prisma.insurer.findFirstOrThrow({ select: { id: true } });
    const ano = new Date().getFullYear();
    const p = await app.inject({
      method: "POST",
      url: "/api/policies",
      headers: auth,
      payload: { clientId, insurerId: ins.id, ramo: "AUTO", numero: "MANUAL-1", inicioVigencia: `${ano}-01-01`, fimVigencia: `${ano + 1}-01-01`, parcelas: [{ numero: 1, valor: 100, vencimento: `${ano + 1}-02-01` }] },
    });
    expect(p.statusCode).toBe(201);
    policyId = (p.json() as { id: string }).id;
  });

  afterAll(async () => {
    await limpar();
    await app?.close();
  });

  const multipart = (parts: { name: string; filename?: string; content: Buffer | string }[]) => {
    const boundary = "----anexo";
    const chunks = parts.map((p) =>
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${p.filename ? `; filename="${p.filename}"` : ""}\r\n\r\n`),
        Buffer.isBuffer(p.content) ? p.content : Buffer.from(p.content),
        Buffer.from("\r\n"),
      ]),
    );
    return { payload: Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]), headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` } };
  };

  it("anexa PDF e imagem ligados à apólice; recusa arquivo que não é PDF/imagem", async () => {
    const m = multipart([
      { name: "tipo", content: "APOLICE" },
      { name: "policyId", content: policyId },
      { name: "arquivos", filename: "apolice.pdf", content: Buffer.from("%PDF-1.4\n% teste\n%%EOF\n") },
      { name: "arquivos", filename: "foto.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) },
    ]);
    const r = await app.inject({ method: "POST", url: `/api/clients/${clientId}/documents`, ...m });
    expect(r.statusCode).toBe(201);
    const docs = r.json() as { id: string; tipo: string; mimeType: string; policyId: string }[];
    expect(docs.map((d) => d.mimeType)).toEqual(["application/pdf", "image/png"]);
    expect(docs.every((d) => d.policyId === policyId && d.tipo === "APOLICE")).toBe(true);

    const f = await app.inject({ method: "GET", url: `/api/documents/${docs[1]!.id}/file`, headers: auth });
    expect(f.statusCode).toBe(200);
    expect(f.headers["content-type"]).toBe("image/png");

    const bad = multipart([{ name: "arquivos", filename: "x.pdf", content: "<html>nao</html>" }]);
    const r2 = await app.inject({ method: "POST", url: `/api/clients/${clientId}/documents`, ...bad });
    expect(r2.statusCode).toBe(400);
  });

  it("PATCH da apólice troca parcelas (por número) e itens", async () => {
    const ano = new Date().getFullYear() + 1;
    const r = await app.inject({
      method: "PATCH",
      url: `/api/policies/${policyId}`,
      headers: auth,
      payload: {
        premioTotal: 300,
        parcelas: [
          { numero: 1, valor: 150, vencimento: `${ano}-02-01` },
          { numero: 2, valor: 150, vencimento: `${ano}-03-01` },
        ],
        itens: [{ tipo: "VEICULO", placa: "TST1A23", modelo: "Carro Teste" }],
      },
    });
    expect(r.statusCode).toBe(200);
    const parcelas = await prisma.installment.findMany({ where: { policyId }, orderBy: { numero: "asc" } });
    expect(parcelas.map((p) => Number(p.valor))).toEqual([150, 150]);
    expect(await prisma.insuredItem.count({ where: { policyId } })).toBe(1);
    const c = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(c.status).toBe("ATIVO");
  });
});
