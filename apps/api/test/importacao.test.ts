// Importação da carteira (lógica compartilhada com scripts/import e a tela de Configurações).
// Unitários sempre rodam. A integração (INTEGRATION_DB) usa dados FICTÍCIOS: um cliente de CPF de
// teste e PDFs mínimos gravados numa pasta própria de STORAGE_DIR, apagados no fim.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { looseKey, relFromExtractorPath } from "../src/modules/importacao/carteira";
import { relFromZipEntry } from "../src/modules/importacao/arquivos";

describe("caminhos dos PDFs", () => {
  it("relFromExtractorPath tira tudo até base/seguradora (Windows ou Linux)", () => {
    expect(relFromExtractorPath({ arquivo: "C:/Users/x/SS/base/seguradora\\Cliente A\\Apolices Vencidas\\a.pdf", cliente_pasta: "Cliente A" })).toBe("Cliente A/Apolices Vencidas/a.pdf");
    expect(relFromExtractorPath({ arquivo: "/data/seguradora/Cliente B/b.pdf", cliente_pasta: "Cliente B" })).toBe("Cliente B/b.pdf");
    expect(relFromExtractorPath({ arquivo: "../baseAtualizada/Cliente D/Apolices Vencidas/d.pdf", cliente_pasta: "Cliente D" })).toBe("Cliente D/Apolices Vencidas/d.pdf");
    expect(relFromExtractorPath({ arquivo: "D:\\outro\\lugar\\c.pdf", cliente_pasta: "Cliente C" })).toBe("Cliente C/c.pdf");
    expect(relFromExtractorPath({ arquivo: "/x/seguradora/../../etc/passwd", cliente_pasta: "Z" })).toBe("etc/passwd");
  });

  it("relFromZipEntry aceita zip com ou sem base/seguradora e recusa caminhos perigosos", () => {
    expect(relFromZipEntry("base/seguradora/Cliente A/a.pdf")).toBe("Cliente A/a.pdf");
    expect(relFromZipEntry("seguradora/Cliente A/Vencidas/a.pdf")).toBe("Cliente A/Vencidas/a.pdf");
    expect(relFromZipEntry("Cliente A/a.pdf")).toBe("Cliente A/a.pdf");
    expect(relFromZipEntry("a.pdf")).toBeNull();
    expect(relFromZipEntry("../Cliente/a.pdf")).toBeNull();
    expect(relFromZipEntry("C:/Cliente/a.pdf")).toBeNull();
  });

  it("looseKey casa nomes com acento estragado pelo encoding", () => {
    expect(looseKey("Ad\u00e3o Silva/Ap\u00f3lice.pdf")).toBe(looseKey("Ad\ufffdo Silva/Ap\ufffdlice.pdf"));
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const CPF = "39053344705"; // CPF de teste (gerador público), não pertence a cliente
const PASTA = "zz-teste-importacao";
const PDF = (s: string) => strToU8(`%PDF-1.4\n% teste ${s}\n%%EOF\n`);

describe.skipIf(!enabled)("importação da carteira (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { storageRoot } = await import("../src/config/env");
  const { importCarteira } = await import("../src/modules/importacao/carteira");
  const { storageResolver } = await import("../src/modules/importacao/arquivos");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let slug = "";

  const limpar = async () => {
    const c = await prisma.client.findFirst({ where: { cpfCnpj: CPF }, select: { id: true } });
    if (c) {
      await prisma.policy.deleteMany({ where: { clientId: c.id } });
      await prisma.document.deleteMany({ where: { clientId: c.id } });
      await prisma.client.delete({ where: { id: c.id } });
    }
    await rm(path.join(storageRoot, PASTA), { recursive: true, force: true });
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const admin = await prisma.user.findFirstOrThrow({ where: { perfil: "ADMIN", ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: admin.id, perfil: admin.perfil, nome: admin.nome })}` };
    slug = (await prisma.insurer.findFirstOrThrow({ where: { slug: "tokio-marine" }, select: { slug: true } })).slug;
    await limpar();
  });

  afterAll(async () => {
    await limpar();
    await app?.close();
  });

  const futuro = `${new Date().getFullYear() + 1}-06-30`;
  const dados = () => ({
    clients: [{ cliente: PASTA, nome_segurado: "CLIENTE TESTE IMPORTACAO", cpf_cnpj: CPF, telefone: "(16) 99999-0001", email: null }],
    policies: [
      {
        arquivo: `C:\\x\\base\\seguradora\\${PASTA}\\apolice.pdf`,
        cliente_pasta: PASTA,
        tipo_documento: "apolice",
        seguradora: slug,
        ramo: "auto",
        numero_apolice: "TESTE-IMP-1",
        inicio_vigencia: `${new Date().getFullYear()}-06-30`,
        fim_vigencia: futuro,
        premio_total: 1200,
        forma_pagamento: "boleto",
        parcelas: [{ parcela: 1, valor: 600, vencimento: futuro }],
        placa: "TST1A23",
      },
      { arquivo: `C:\\x\\base\\seguradora\\${PASTA}\\Vencidas\\endosso.pdf`, cliente_pasta: PASTA, tipo_documento: "endosso", seguradora: slug, numero_apolice: "TESTE-IMP-1" },
    ],
  });

  it("POST /import/pdfs grava o zip em STORAGE_DIR e reenvio não duplica", async () => {
    const zip = Buffer.from(
      zipSync({
        [`base/seguradora/${PASTA}/apolice.pdf`]: PDF("a"),
        [`base/seguradora/${PASTA}/Vencidas/endosso.pdf`]: PDF("e"),
        [`base/seguradora/${PASTA}/nao-e-pdf.pdf`]: strToU8("texto"),
      }),
    );
    const boundary = "----teste";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="arquivos"; filename="lote.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      zip,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const headers = { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` };
    const r = await app.inject({ method: "POST", url: "/api/import/pdfs", headers, payload: body });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ recebidos: 3, gravados: 2, invalidos: 1 });
    const again = await app.inject({ method: "POST", url: "/api/import/pdfs", headers, payload: body });
    expect(again.json()).toMatchObject({ gravados: 0, iguais: 2 });
  });

  it("importCarteira cria cliente, apólice, parcela, item e documentos; reimportar não duplica", async () => {
    const r1 = await importCarteira(dados(), { resolveFile: await storageResolver() });
    expect(r1.stats).toMatchObject({ clientesCriados: 1, apolicesCriadas: 1, documentosCriados: 2, parcelas: 1, itens: 1, arquivosInexistentes: 0 });
    const c = await prisma.client.findFirstOrThrow({ where: { cpfCnpj: CPF }, include: { policies: { include: { documents: true } } } });
    expect(c.status).toBe("ATIVO");
    expect(c.telefone).toBe("16999990001");
    expect(c.policies).toHaveLength(1);
    expect(c.policies[0]!.documents).toHaveLength(2); // apólice + endosso ligados

    const r2 = await importCarteira(dados(), { resolveFile: await storageResolver() });
    expect(r2.stats).toMatchObject({ clientesCriados: 0, apolicesCriadas: 0, documentosCriados: 0, documentosJaExistentes: 2 });
  });

  it("endosso mais novo que a apólice fica ligado a ela; reimportar corrige número truncado e cancela", async () => {
    const pol = await prisma.policy.findFirstOrThrow({ where: { client: { cpfCnpj: CPF } }, select: { id: true } });
    // Simula a leitura antiga: número truncado e endosso solto.
    await prisma.policy.update({ where: { id: pol.id }, data: { numero: "0531" } });
    await prisma.document.updateMany({ where: { tipo: "ENDOSSO", client: { cpfCnpj: CPF } }, data: { policyId: null } });
    const d = dados();
    d.policies[1] = { ...d.policies[1]!, data_emissao: futuro, endosso_cancelamento: true } as unknown as (typeof d.policies)[number];
    const r = await importCarteira(d, { resolveFile: await storageResolver() });
    expect(r.stats).toMatchObject({ apolicesCriadas: 0, apolicesCorrigidas: 1, endossosVinculados: 1, apolicesCanceladas: 1 });
    const p = await prisma.policy.findUniqueOrThrow({ where: { id: pol.id }, include: { documents: true } });
    expect(p.numero).toBe("TESTE-IMP-1");
    expect(p.status).toBe("CANCELADA");
    expect(p.documents).toHaveLength(2);
  });

  it("POST /import/carteira roda em segundo plano e reporta progresso", async () => {
    const boundary = "----teste2";
    const d = dados();
    const part = (name: string, filename: string, content: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/json\r\n\r\n${content}\r\n`;
    const body = part("clients", "clients.json", JSON.stringify(d.clients)) + part("policies", "policies.json", JSON.stringify(d.policies)) + `--${boundary}--\r\n`;
    const r = await app.inject({ method: "POST", url: "/api/import/carteira", headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: body });
    expect(r.statusCode).toBe(202);
    const { jobId } = r.json() as { jobId: string };
    let job: { status: string; resultado: { stats: { documentosJaExistentes: number } } | null } = { status: "processando", resultado: null };
    for (let i = 0; i < 50 && job.status === "processando"; i++) {
      await new Promise((res) => setTimeout(res, 100));
      job = (await app.inject({ method: "GET", url: `/api/import/carteira/${jobId}`, headers: auth })).json();
    }
    expect(job.status).toBe("concluido");
    expect(job.resultado?.stats.documentosJaExistentes).toBe(2);
  });

  it("importação é só para ADMIN", async () => {
    const op = { authorization: `Bearer ${app.jwt.sign({ sub: "x", perfil: "OPERADOR", nome: "Op" })}` };
    const r = await app.inject({ method: "GET", url: "/api/import/estado", headers: op });
    expect(r.statusCode).toBe(403);
  });
});
