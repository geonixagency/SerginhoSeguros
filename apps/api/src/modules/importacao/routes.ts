// Configurações > Importar carteira (só ADMIN).
//   POST /import/pdfs              multipart, vários arquivos .zip e/ou .pdf por requisição
//   POST /import/carteira          multipart: clients (clients.json), policies (policies.json), dryRun
//   GET  /import/carteira/:jobId   progresso da importação (roda em segundo plano)
//   GET  /import/estado            contagens para a tela
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma";
import { audit } from "../../lib/audit";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { CarteiraSchema, importCarteira, type ImportResult } from "./carteira";
import { emptyBatchStats, loadFileIndex, saveFileIndex, storageResolver, storeLoosePdf, storeZip } from "./arquivos";

const MB = 1024 * 1024;
/** Lote de PDFs: até ~60 MB por arquivo (zip) e 300 arquivos por requisição. */
const PDF_LIMITS = { fileSize: 60 * MB, files: 300, fields: 5 };
/** JSON do extrator: alguns MB cada. */
const JSON_LIMITS = { fileSize: 40 * MB, files: 2, fields: 5 };

type Job = {
  id: string;
  status: "processando" | "concluido" | "erro";
  dryRun: boolean;
  feitos: number;
  total: number;
  iniciadoEm: string;
  concluidoEm: string | null;
  resultado: ImportResult | null;
  erro: string | null;
};

// Uma importação por vez (processo único da API). O estado fica em memória: basta para
// acompanhar a barra de progresso; o resultado final também vai para a auditoria.
const jobs = new Map<string, Job>();
let running: string | null = null;

export default async function importRoutes(app: FastifyInstance) {
  app.addHook("onRequest", app.requireRole("ADMIN"));

  app.get("/estado", async () => {
    const [clientes, apolices, documentos, indice] = await Promise.all([
      prisma.client.count(),
      prisma.policy.count(),
      prisma.document.count(),
      loadFileIndex(),
    ]);
    return { clientes, apolices, documentos, indicePdfs: indice ? Object.keys(indice).length : 0, importacaoEmAndamento: running };
  });

  app.post("/pdfs", async (req) => {
    if (!req.isMultipart()) throw badRequest("Envie os arquivos como multipart/form-data");
    const stats = emptyBatchStats();
    const index = await loadFileIndex();
    let arquivos = 0;
    for await (const part of req.parts({ limits: PDF_LIMITS })) {
      if (part.type !== "file") continue;
      const buf = await part.toBuffer();
      if (part.file.truncated) throw new AppError(413, "FILE_TOO_LARGE", `${part.filename} passa de 60 MB: divida em lotes menores`);
      arquivos++;
      const nome = part.filename ?? "";
      const isZip = /\.zip$/i.test(nome) || buf.subarray(0, 4).toString("latin1") === "PK\u0003\u0004";
      try {
        if (isZip) await storeZip(buf, stats);
        else await storeLoosePdf(nome, buf, stats, index);
      } catch (e) {
        throw badRequest(e instanceof Error ? e.message : "Arquivo inválido");
      }
    }
    if (!arquivos) throw badRequest("Nenhum arquivo recebido");
    await audit(req, "IMPORTAR_PDFS", "Carteira", null, null, { arquivos, ...stats });
    return stats;
  });

  app.post("/carteira", async (req, reply) => {
    if (!req.isMultipart()) throw badRequest("Envie clients.json e policies.json como multipart/form-data");
    if (running) throw new AppError(409, "IMPORT_RUNNING", "Já existe uma importação em andamento");
    const raw: Record<string, unknown> = {};
    let dryRun = false;
    for await (const part of req.parts({ limits: JSON_LIMITS })) {
      if (part.type === "field") {
        if (part.fieldname === "dryRun") dryRun = String(part.value) === "true";
        continue;
      }
      const buf = await part.toBuffer();
      if (part.file.truncated) throw new AppError(413, "FILE_TOO_LARGE", `${part.filename} é grande demais`);
      const campo = part.fieldname === "clients" || /clients/i.test(part.filename ?? "") ? "clients" : part.fieldname === "policies" || /polic/i.test(part.filename ?? "") ? "policies" : null;
      if (!campo) continue;
      try {
        raw[campo] = JSON.parse(buf.toString("utf8").replace(/^﻿/, ""));
      } catch {
        throw badRequest(`${part.filename ?? campo} não é um JSON válido`);
      }
    }
    const parsed = CarteiraSchema.safeParse({ clients: raw.clients, policies: raw.policies ?? [] });
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw badRequest(`Formato inesperado (${i?.path.slice(0, 1).join(".") || "arquivo"}): confira se enviou clients.json e policies.json do extrator`);
    }
    // Índice de nomes para casar PDFs enviados soltos depois.
    await saveFileIndex(parsed.data.policies);

    const job: Job = {
      id: randomUUID(),
      status: "processando",
      dryRun,
      feitos: 0,
      total: parsed.data.clients.length,
      iniciadoEm: new Date().toISOString(),
      concluidoEm: null,
      resultado: null,
      erro: null,
    };
    jobs.set(job.id, job);
    running = job.id;
    const log = req.log;

    void (async () => {
      try {
        const resolver = await storageResolver();
        job.resultado = await importCarteira(parsed.data, {
          resolveFile: resolver,
          dryRun,
          onProgress: (feitos, total) => {
            job.feitos = feitos;
            job.total = total;
          },
        });
        job.status = "concluido";
        await audit(req, dryRun ? "SIMULAR_IMPORTACAO" : "IMPORTAR_CARTEIRA", "Carteira", job.id, null, job.resultado);
      } catch (e) {
        job.status = "erro";
        job.erro = e instanceof Error ? e.message : "Falha na importação";
        log.error({ err: e }, "falha na importação da carteira");
      } finally {
        job.concluidoEm = new Date().toISOString();
        running = null;
      }
    })();

    return reply.status(202).send({ jobId: job.id, total: job.total, dryRun });
  });

  app.get("/carteira/:jobId", async (req) => {
    const { jobId } = req.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) throw notFound("Importação");
    return job;
  });
}
