// Upload/leitura de PDF de apólice, cadastro a partir do PDF revisado e download autenticado.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ClientFromPdfSchema, FormaPagamentoSchema, onlyDigits, type FromPdfResponse, type ParsedPolicyDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { badRequest, notFound } from "../../lib/errors";
import { sha256 } from "../../lib/crypto";
import { isPdf, openStorageFile, saveUpload } from "../../lib/storage";
import { resolveInsurerSlug } from "../../connectors/catalog";
import { upsertClientByCpf } from "../clients/service";
import { createPolicyWithChildren } from "../policies/service";
import { refreshClientStatus } from "../policies/rules";
import { callPdfParser } from "./pdfParser";

const IdParams = z.object({ id: z.string().min(1) });

/** Lê o multipart: um arquivo PDF + campos texto opcionais. */
async function readPdfMultipart(req: FastifyRequest): Promise<{ buf: Buffer; filename: string; fields: Record<string, string> }> {
  if (!req.isMultipart()) throw badRequest("Envie o arquivo como multipart/form-data (campo 'file')");
  let buf: Buffer | null = null;
  let filename = "documento.pdf";
  const fields: Record<string, string> = {};
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (buf) throw badRequest("Envie apenas um arquivo por vez");
      buf = await part.toBuffer();
      filename = part.filename || filename;
    } else if (typeof part.value === "string") {
      fields[part.fieldname] = part.value;
    }
  }
  if (!buf) throw badRequest("Arquivo PDF não enviado (campo 'file')");
  if (!isPdf(buf)) throw badRequest("O arquivo enviado não é um PDF válido");
  // Nome só para exibição: remove caminhos e caracteres de controle.
  filename = filename.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f]/g, "").slice(0, 200) || "documento.pdf";
  return { buf, filename, fields };
}

export default async function documentRoutes(app: FastifyInstance) {
  // Lê o PDF e devolve os campos com confiança. NÃO grava nada.
  app.post("/documents/parse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req): Promise<ParsedPolicyDTO> => {
    const { buf, filename } = await readPdfMultipart(req);
    const out = await callPdfParser(buf, filename);
    const hash = sha256(buf);

    const slug = resolveInsurerSlug(out.seguradora.valor);
    const insurer = slug ? await prisma.insurer.findUnique({ where: { slug }, select: { id: true, nome: true } }) : null;
    const cpf = out.cliente.cpfCnpj.valor ? onlyDigits(out.cliente.cpfCnpj.valor) : null;
    const existente = cpf ? await prisma.client.findUnique({ where: { cpfCnpj: cpf }, select: { id: true, nome: true } }) : null;
    const docExistente = await prisma.document.findFirst({ where: { hash }, select: { id: true } });
    const forma = FormaPagamentoSchema.safeParse(out.apolice.formaPagamento.valor?.toUpperCase());

    return {
      seguradora: { valor: insurer?.nome ?? out.seguradora.valor, confianca: insurer ? out.seguradora.confianca : Math.min(out.seguradora.confianca, 0.4), insurerId: insurer?.id ?? null },
      ramo: out.ramo,
      cliente: {
        ...out.cliente,
        cpfCnpj: { valor: cpf, confianca: out.cliente.cpfCnpj.confianca },
        telefone: { valor: out.cliente.telefone.valor ? onlyDigits(out.cliente.telefone.valor) : null, confianca: out.cliente.telefone.confianca },
      },
      apolice: { ...out.apolice, formaPagamento: { valor: forma.success ? forma.data : null, confianca: out.apolice.formaPagamento.confianca } },
      itens: out.itens,
      parcelas: out.parcelas,
      avisos: out.avisos,
      paginas: out.paginas,
      clienteExistente: existente,
      hash,
      documentoExistenteId: docExistente?.id ?? null,
    };
  });

  // Salva o cadastro revisado + o PDF. Anexa a cliente existente pelo CPF/CNPJ.
  app.post("/clients/from-pdf", async (req, reply): Promise<FromPdfResponse> => {
    const { buf, filename, fields } = await readPdfMultipart(req);
    if (!fields.data) throw badRequest("Campo 'data' (JSON do cadastro revisado) é obrigatório");
    let json: unknown;
    try {
      json = JSON.parse(fields.data);
    } catch {
      throw badRequest("Campo 'data' não é um JSON válido");
    }
    const input = parse(ClientFromPdfSchema, json);
    const insurer = await prisma.insurer.findUnique({ where: { id: input.apolice.insurerId }, select: { id: true } });
    if (!insurer) throw badRequest("Seguradora inválida");

    // Grava o arquivo antes da transação: se a transação falhar sobra só um arquivo órfão
    // (inofensivo e deduplicado por hash), nunca um registro apontando para arquivo inexistente.
    const file = await saveUpload(buf);

    const result = await prisma.$transaction(async (tx) => {
      const client = await upsertClientByCpf(tx, { ...input.cliente, origem: input.cliente.origem ?? "UPLOAD_PDF" });
      const doc = await tx.document.create({
        data: {
          clientId: client.id,
          tipo: input.tipoDocumento,
          nomeArquivo: filename,
          caminho: file.caminho,
          hash: file.hash,
          tamanho: file.tamanho,
          extraido: (input.extraido ?? undefined) as Prisma.InputJsonValue | undefined,
          confianca: (input.confianca ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      const policy = await createPolicyWithChildren(
        tx,
        { ...input.apolice, clientId: client.id, documentId: doc.id },
        input.parcelas,
        input.itens,
      );
      await tx.document.update({ where: { id: doc.id }, data: { policyId: policy.id } });
      return { clientId: client.id, policyId: policy.id, documentId: doc.id, clienteCriado: client.criado };
    });

    await refreshClientStatus(result.clientId);
    await audit(req, "CADASTRO_POR_PDF", "Client", result.clientId, null, { policyId: result.policyId, documentId: result.documentId, clienteCriado: result.clienteCriado });
    reply.status(201);
    return result;
  });

  // Stream autenticado do PDF. Todo download fica na auditoria (LGPD).
  app.get("/documents/:id/file", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    const q = parse(z.object({ download: z.enum(["0", "1"]).optional() }), req.query);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) throw notFound("Documento");
    const { stream, size } = await openStorageFile(doc.caminho);
    await audit(req, "DOWNLOAD_DOCUMENTO", "Document", id, null, { clientId: doc.clientId });
    const safeName = doc.nomeArquivo.replace(/[^\w.\- ]/g, "_");
    return reply
      .header("Content-Type", doc.mimeType)
      .header("Content-Length", size)
      .header("Cache-Control", "private, no-store")
      .header("Content-Disposition", `${q.download === "1" ? "attachment" : "inline"}; filename="${safeName}"`)
      .send(stream);
  });
}
