// Upload/leitura de PDF de apólice, cadastro a partir do PDF revisado e download autenticado.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ClientFromPdfSchema, DocumentTipoSchema, FormaPagamentoSchema, onlyDigits, type FromPdfResponse, type ParsedPolicyDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { sha256 } from "../../lib/crypto";
import { isPdf, openStorageFile, saveUpload } from "../../lib/storage";
import { resolveInsurerSlug } from "../../connectors/catalog";
import { upsertClientByCpf } from "../clients/service";
import { documentDTO } from "../../lib/serialize";
import { createPolicyWithChildren } from "../policies/service";
import { refreshClientStatus } from "../policies/rules";
import { callPdfParser } from "./pdfParser";
import { findPolicyForDocument } from "../policies/match";

const IdParams = z.object({ id: z.string().min(1) });

export const ANEXO_MAX_MB = 25;
const ANEXO_MAX_FILES = 10;

/** Tipo real pelo conteúdo (não confia em extensão/MIME declarados). Só PDF e imagens. */
export function sniffMime(buf: Buffer): { mime: string; ext: string } | null {
  if (isPdf(buf)) return { mime: "application/pdf", ext: ".pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: ".png" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: ".webp" };
  return null;
}

const cleanName = (n: string, fallback: string) => n.replace(/^.*[\\/]/, "").replace(/[\x00-\x1f]/g, "").slice(0, 200) || fallback;

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
    const existente = cpf ? await prisma.client.findFirst({ where: { cpfCnpj: cpf }, select: { id: true, nome: true } }) : null;
    const docExistente = await prisma.document.findFirst({ where: { hash }, select: { id: true } });
    const forma = FormaPagamentoSchema.safeParse(out.apolice.formaPagamento.valor?.toUpperCase());
    const tipoDocumento = out.tipoDocumento ?? null;

    const cliente = {
      ...out.cliente,
      cpfCnpj: { valor: cpf, confianca: out.cliente.cpfCnpj.confianca },
      telefone: { valor: out.cliente.telefone.valor ? onlyDigits(out.cliente.telefone.valor) : null, confianca: out.cliente.telefone.confianca },
    };
    let apoliceAlvo: ParsedPolicyDTO["apoliceAlvo"] = null;
    if (existente) {
      // Cliente já cadastrado: o que o PDF não trouxe (endosso costuma ter só nome e CPF) vem do
      // cadastro, com confiança cheia, em vez de aparecer vazio e "incerto" na revisão.
      const c = await prisma.client.findUnique({ where: { id: existente.id }, select: { nome: true, nascimento: true, telefone: true, email: true, endereco: true } });
      if (c) {
        const end = (c.endereco ?? null) as { logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null } | null;
        const linha = end ? [end.logradouro, end.numero, end.bairro, end.cidade, end.uf].filter(Boolean).join(", ") || null : null;
        const fill = (f: { valor: string | null; confianca: number }, v: string | null | undefined) => (!f.valor && v ? { valor: v, confianca: 1 } : f);
        // Nome lido com pouca certeza (ex.: só do nome do arquivo) perde para o do cadastro.
        cliente.nome = cliente.nome.confianca < 0.6 && c.nome ? { valor: c.nome, confianca: 1 } : fill(cliente.nome, c.nome);
        cliente.nascimento = fill(cliente.nascimento, c.nascimento ? c.nascimento.toISOString().slice(0, 10) : null);
        cliente.telefone = fill(cliente.telefone, c.telefone);
        cliente.email = fill(cliente.email, c.email);
        cliente.endereco = fill(cliente.endereco, linha);
        cliente.cep = fill(cliente.cep, end?.cep ?? null);
      }
      if (tipoDocumento === "endosso") {
        const m = await findPolicyForDocument(prisma, existente.id, {
          insurerId: insurer?.id,
          numero: out.apolice.numero.valor,
          placa: out.itens[0]?.placa,
          chassi: out.itens[0]?.chassi,
        });
        if (m) {
          const p = await prisma.policy.findUnique({ where: { id: m.id }, select: { insurer: { select: { nome: true } }, items: { select: { placa: true }, take: 1 } } });
          apoliceAlvo = { id: m.id, numero: m.numero, seguradora: p?.insurer.nome ?? "", placa: p?.items[0]?.placa ?? null, status: m.status, via: m.via };
        }
      }
    }

    return {
      seguradora: { valor: insurer?.nome ?? out.seguradora.valor, confianca: insurer ? out.seguradora.confianca : Math.min(out.seguradora.confianca, 0.4), insurerId: insurer?.id ?? null },
      ramo: out.ramo,
      cliente,
      apolice: { ...out.apolice, formaPagamento: { valor: forma.success ? forma.data : null, confianca: out.apolice.formaPagamento.confianca } },
      itens: out.itens,
      parcelas: out.parcelas,
      avisos: out.avisos,
      paginas: out.paginas,
      clienteExistente: existente,
      tipoDocumento,
      endossoCancelamento: Boolean(out.endossoCancelamento),
      apoliceAlvo,
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
    const alvo = input.endossoDePolicyId
      ? await prisma.policy.findUnique({ where: { id: input.endossoDePolicyId }, select: { id: true, clientId: true, status: true } })
      : null;
    if (input.endossoDePolicyId && !alvo) throw badRequest("Apólice do endosso não encontrada");

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
      if (alvo) {
        // Endosso de apólice já cadastrada: o PDF fica ligado a ela e nada é duplicado.
        if (alvo.clientId !== client.id) throw badRequest("A apólice do endosso é de outro cliente");
        await tx.document.update({ where: { id: doc.id }, data: { policyId: alvo.id } });
        if (input.cancelarApolice && alvo.status !== "CANCELADA") await tx.policy.update({ where: { id: alvo.id }, data: { status: "CANCELADA" } });
        return { clientId: client.id, policyId: alvo.id, documentId: doc.id, clienteCriado: client.criado };
      }
      const policy = await createPolicyWithChildren(
        tx,
        { ...input.apolice, ...(input.cancelarApolice ? { status: "CANCELADA" as const } : {}), clientId: client.id, documentId: doc.id },
        input.parcelas,
        input.itens,
      );
      await tx.document.update({ where: { id: doc.id }, data: { policyId: policy.id } });
      return { clientId: client.id, policyId: policy.id, documentId: doc.id, clienteCriado: client.criado };
    });

    await refreshClientStatus(result.clientId);
    await audit(req, "CADASTRO_POR_PDF", "Client", result.clientId, null, { policyId: result.policyId, documentId: result.documentId, clienteCriado: result.clienteCriado, tipo: input.tipoDocumento, cancelou: Boolean(input.cancelarApolice) });
    reply.status(201);
    return result;
  });

  /**
   * Anexa arquivos ao cliente SEM passar pelo leitor de PDF.
   * Multipart: "arquivos" (1 a 10; PDF, JPG, PNG ou WebP, até 25 MB cada), "tipo" e "policyId" opcionais.
   */
  app.post("/clients/:id/documents", async (req, reply) => {
    const { id } = parse(IdParams, req.params);
    if (!req.isMultipart()) throw badRequest("Envie os arquivos como multipart/form-data (campo 'arquivos')");
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!client) throw notFound("Cliente");
    const files: { buf: Buffer; name: string }[] = [];
    const fields: Record<string, string> = {};
    for await (const part of req.parts({ limits: { fileSize: ANEXO_MAX_MB * 1024 * 1024, files: ANEXO_MAX_FILES, fields: 5 } })) {
      if (part.type === "file") {
        const buf = await part.toBuffer();
        if (part.file.truncated) throw new AppError(413, "FILE_TOO_LARGE", `"${cleanName(part.filename, "arquivo")}" passa de ${ANEXO_MAX_MB} MB`);
        files.push({ buf, name: cleanName(part.filename, "arquivo") });
      } else if (typeof part.value === "string") fields[part.fieldname] = part.value;
    }
    if (!files.length) throw badRequest("Nenhum arquivo enviado (campo 'arquivos')");
    const tipo = parse(DocumentTipoSchema.default("OUTRO"), fields.tipo || undefined);
    const policyId = fields.policyId || null;
    if (policyId) {
      const pol = await prisma.policy.findFirst({ where: { id: policyId, clientId: id }, select: { id: true } });
      if (!pol) throw badRequest("Apólice não pertence a este cliente");
    }
    const tipos = files.map((f) => sniffMime(f.buf));
    const ruim = files.find((_, i) => !tipos[i]);
    if (ruim) throw badRequest(`"${ruim.name}" não é PDF nem imagem (JPG, PNG, WebP)`);

    const docs = [];
    for (const [i, f] of files.entries()) {
      const t = tipos[i]!;
      const saved = await saveUpload(f.buf, t.ext);
      const doc = await prisma.document.create({
        data: { clientId: id, policyId, tipo, nomeArquivo: f.name, caminho: saved.caminho, hash: saved.hash, tamanho: saved.tamanho, mimeType: t.mime },
      });
      docs.push(doc);
    }
    await audit(req, "ANEXAR_DOCUMENTO", "Client", id, null, { documentos: docs.map((d) => ({ id: d.id, tipo: d.tipo, nome: d.nomeArquivo, tamanho: d.tamanho })), policyId });
    return reply.status(201).send(docs.map(documentDTO));
  });

  /** Move o documento para outra apólice do mesmo cliente (ou o solta, com policyId null). */
  app.patch("/documents/:id", async (req) => {
    const { id } = parse(IdParams, req.params);
    const input = parse(z.object({ policyId: z.string().min(1).max(64).nullable() }), req.body);
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true, clientId: true, policyId: true } });
    if (!doc) throw notFound("Documento");
    if (input.policyId) {
      if (!doc.clientId) throw badRequest("Documento sem cliente");
      const pol = await prisma.policy.findFirst({ where: { id: input.policyId, clientId: doc.clientId }, select: { id: true } });
      if (!pol) throw badRequest("Apólice não pertence a este cliente");
    }
    const updated = await prisma.document.update({ where: { id }, data: { policyId: input.policyId } });
    await audit(req, "MOVER_DOCUMENTO", "Document", id, { policyId: doc.policyId }, { policyId: input.policyId });
    return documentDTO(updated);
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
