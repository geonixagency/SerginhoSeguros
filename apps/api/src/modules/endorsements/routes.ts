// Endossos: o PDF do endosso é lido, a apólice endossada é achada (número > chassi > placa),
// e o que mudou (veículo, endereço, condutor, prêmio) vira uma proposta de alterações.
// O operador revisa, e ao salvar as mudanças são aplicadas na apólice/cliente, o endosso
// fica registrado com antes/depois e o PDF é guardado na ficha do cliente.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  EndorsementCreateSchema,
  onlyDigits,
  type ClientEndorsementsDTO,
  type EndorsementChangeDTO,
  type EndorsementCreateInput,
  type EndorsementDTO,
  type EndorsementPolicyOptionDTO,
  type EndorsementPreviewDTO,
} from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { sha256 } from "../../lib/crypto";
import { saveUpload } from "../../lib/storage";
import { dateOnly, toIsoDate } from "../../lib/dates";
import { resolveInsurerSlug } from "../../connectors/catalog";
import { callPdfParser, type ParserOutput } from "../documents/pdfParser";
import { readPdfMultipart } from "../documents/routes";
import { findPolicyForDocument, type MatchedPolicy } from "../policies/match";
import { refreshClientStatus } from "../policies/rules";

const IdParams = z.object({ id: z.string().min(1) });

type Endereco = { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null };

/** Comparação tolerante: sem acento, caixa, pontuação e espaços extras. */
const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
const alnum = (s: string | null | undefined) => norm(s).replace(/ /g, "");
const fmtMoney = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));
const fmtCep = (s: string | null | undefined) => {
  const d = onlyDigits(s ?? "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
};
/** Endereço do cliente em uma linha ("Rua X, 123"), como o endosso traz. */
const linhaRua = (e: Endereco | null) => (e ? [e.logradouro, e.numero].filter(Boolean).join(", ") || null : null);
/** "Rua X, 123" -> logradouro + número (o número só se o fim for numérico). */
export function splitRua(v: string): { logradouro: string; numero: string | null } {
  const m = v.match(/^(.*?)[,\s]+(?:n[ºo°.]?\s*)?(\d{1,6}[A-Za-z]?)\s*$/i);
  return m ? { logradouro: m[1]!.trim(), numero: m[2]! } : { logradouro: v.trim(), numero: null };
}

export type EndossoLido = {
  numero?: string | null;
  motivos?: string[];
  condutor?: string | null;
  premio?: number | null;
  restituicao?: boolean;
  endereco?: { endereco?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null; cep?: string | null };
} | null;

export type PolicyForDiff = {
  id: string;
  numero: string | null;
  ramo: string;
  status: string;
  fimVigencia: Date | null;
  premioTotal: Prisma.Decimal | null;
  condutorPrincipal: string | null;
  insurer: { nome: string };
  items: Array<{ id: string; tipo: string; placa: string | null; modelo: string | null; ano: string | null; chassi: string | null }>;
};

/** Veículo da apólice que o endosso altera: o de mesma placa/chassi (frota) ou o primeiro. */
export function itemAlvo(p: PolicyForDiff, placa: string | null, chassi: string | null) {
  const veic = p.items.filter((i) => i.tipo === "VEICULO");
  const ch = alnum(chassi);
  const pl = alnum(placa);
  return veic.find((i) => (ch.length >= 8 && alnum(i.chassi) === ch) || (pl.length === 7 && alnum(i.placa) === pl)) ?? veic[0] ?? null;
}

/** O que mudaria nesta apólice/cliente se o endosso for aplicado nela. */
export function proporAlteracoes(out: ParserOutput, e: EndossoLido, p: PolicyForDiff, cliente: { endereco: Endereco | null }): EndorsementChangeDTO[] {
  const alt: EndorsementChangeDTO[] = [];
  const add = (campo: string, label: string, antes: string | null, depois: string | null, igual = norm(antes) === norm(depois)) => {
    if (depois && !igual) alt.push({ campo, label, antes, depois });
  };
  const v = out.itens[0];
  if (v) {
    const it = itemAlvo(p, v.placa, v.chassi);
    const mesmoVeiculo = !!it && ((alnum(v.chassi).length >= 8 && alnum(it.chassi) === alnum(v.chassi)) || (!v.chassi && alnum(it.placa) === alnum(v.placa)));
    add("item.placa", "Placa", it?.placa ?? null, v.placa, alnum(it?.placa) === alnum(v.placa));
    add("item.chassi", "Chassi", it?.chassi ?? null, v.chassi, alnum(it?.chassi) === alnum(v.chassi));
    // Mesmo veículo: diferença no texto do modelo é só formatação, não troca.
    if (!mesmoVeiculo) {
      add("item.modelo", "Veículo", it?.modelo ?? null, v.modelo);
      add("item.ano", "Ano", it?.ano ?? null, v.ano);
    }
  }
  if (e?.condutor) add("policy.condutorPrincipal", "Principal condutor", p.condutorPrincipal, e.condutor);

  const end = e?.endereco;
  const atual = cliente.endereco;
  if (end) {
    const cep = fmtCep(end.cep);
    add("client.cep", "CEP", atual?.cep ?? null, cep, onlyDigits(atual?.cep ?? "") === onlyDigits(cep ?? ""));
    // Rua/bairro/cidade só quando o CEP mudou ou o cadastro não tem: o texto varia entre seguradoras.
    const cepMudou = !!cep && onlyDigits(atual?.cep ?? "") !== onlyDigits(cep);
    if (cepMudou || !atual?.logradouro) add("client.logradouro", "Endereço", linhaRua(atual), end.endereco ?? null);
    if (cepMudou || !atual?.bairro) add("client.bairro", "Bairro", atual?.bairro ?? null, end.bairro ?? null);
    if (cepMudou || !atual?.cidade) add("client.cidade", "Cidade", atual?.cidade ?? null, end.cidade ?? null);
    if (cepMudou || !atual?.uf) add("client.uf", "UF", atual?.uf ?? null, (end.uf ?? "").toUpperCase().slice(0, 2) || null);
  }

  // Prêmio: o endosso costuma trazer só o que cobrou/devolveu; quando o valor é da ordem do
  // prêmio inteiro, ele já é o novo total. O operador confere e pode editar.
  const antes = p.premioTotal == null ? null : Number(p.premioTotal);
  const val = e?.premio ?? null;
  if (antes != null && val != null && val > 0 && !out.endossoCancelamento) {
    const novo = e?.restituicao ? Math.max(0, antes - val) : val >= antes * 0.6 ? val : antes + val;
    if (Math.abs(novo - antes) >= 0.01) alt.push({ campo: "policy.premioTotal", label: "Prêmio total", antes: fmtMoney(antes), depois: fmtMoney(novo) });
  }
  return alt;
}

const POLICY_SELECT = {
  id: true,
  numero: true,
  ramo: true,
  status: true,
  fimVigencia: true,
  premioTotal: true,
  condutorPrincipal: true,
  insurer: { select: { nome: true } },
  items: { select: { id: true, tipo: true, placa: true, modelo: true, ano: true, chassi: true } },
} satisfies Prisma.PolicySelect;

function endorsementDTO(
  e: Prisma.EndorsementGetPayload<{ include: { policy: { select: { numero: true; insurer: { select: { nome: true } } } }; document: { select: { id: true; nomeArquivo: true } } } }>,
  autores: Map<string, string>,
): EndorsementDTO {
  return {
    id: e.id,
    clientId: e.clientId,
    policyId: e.policyId,
    apoliceNumero: e.policy.numero,
    seguradora: e.policy.insurer.nome,
    numero: e.numero,
    emissao: toIsoDate(e.emissao),
    motivos: e.motivos,
    premio: e.premio == null ? null : Number(e.premio),
    restituicao: e.restituicao,
    cancelou: e.cancelou,
    alteracoes: (Array.isArray(e.alteracoes) ? e.alteracoes : []) as unknown as EndorsementChangeDTO[],
    observacao: e.observacao,
    documentId: e.document?.id ?? null,
    documentoNome: e.document?.nomeArquivo ?? null,
    autor: e.userId ? (autores.get(e.userId) ?? null) : null,
    criadoEm: e.createdAt.toISOString(),
  };
}

export default async function endorsementRoutes(app: FastifyInstance) {
  /** Lê o PDF do endosso e propõe as mudanças. NÃO grava nada. Campo opcional `clientId`. */
  app.post("/endorsements/parse", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req): Promise<EndorsementPreviewDTO> => {
    const { buf, filename, fields } = await readPdfMultipart(req);
    const out = await callPdfParser(buf, filename);
    const hash = sha256(buf);
    const e = (out.endosso ?? null) as EndossoLido;
    const slug = resolveInsurerSlug(out.seguradora.valor);
    const insurer = slug ? await prisma.insurer.findUnique({ where: { slug }, select: { id: true, nome: true } }) : null;
    const avisos = [...out.avisos.filter((a) => !a.startsWith("endosso_erro"))];
    if (out.tipoDocumento && out.tipoDocumento !== "endosso") avisos.unshift(`Este PDF parece ser ${out.tipoDocumento === "apolice" ? "uma apólice" : `"${out.tipoDocumento}"`}, não um endosso. Confira antes de salvar.`);

    const hint = { numero: out.apolice.numero.valor, placa: out.itens[0]?.placa, chassi: out.itens[0]?.chassi };
    const acharApolice = async (clientId: string): Promise<MatchedPolicy | null> =>
      (insurer ? await findPolicyForDocument(prisma, clientId, { ...hint, insurerId: insurer.id }) : null) ?? (await findPolicyForDocument(prisma, clientId, hint));

    // Cliente: o escolhido na tela (ficha do cliente) ou pelo CPF/CNPJ do PDF. O mesmo CPF pode
    // estar em mais de uma ficha (família/empresa): fica a que tem a apólice endossada.
    let cliente: { id: string; nome: string } | null = null;
    let alvo: MatchedPolicy | null = null;
    if (fields.clientId) {
      cliente = await prisma.client.findUnique({ where: { id: fields.clientId }, select: { id: true, nome: true } });
      if (!cliente) throw notFound("Cliente");
      alvo = await acharApolice(cliente.id);
    } else {
      const cpf = out.cliente.cpfCnpj.valor ? onlyDigits(out.cliente.cpfCnpj.valor) : null;
      const candidatos = cpf && cpf.length >= 11 ? await prisma.client.findMany({ where: { cpfCnpj: cpf }, select: { id: true, nome: true }, take: 10 }) : [];
      for (const c of candidatos) {
        const m = await acharApolice(c.id);
        if (m) {
          cliente = c;
          alvo = m;
          break;
        }
      }
      cliente ??= candidatos[0] ?? null;
      if (!cliente) avisos.unshift("Não achei o cliente pelo CPF/CNPJ do endosso. Escolha o cliente para continuar.");
    }
    if (cliente && !alvo) avisos.unshift("Não achei a apólice endossada pelo número, chassi ou placa. Escolha a apólice abaixo.");

    let apolices: EndorsementPolicyOptionDTO[] = [];
    if (cliente) {
      const [pols, cli] = await Promise.all([
        prisma.policy.findMany({ where: { clientId: cliente.id }, select: POLICY_SELECT, orderBy: [{ fimVigencia: { sort: "desc", nulls: "last" } }] }),
        prisma.client.findUnique({ where: { id: cliente.id }, select: { endereco: true } }),
      ]);
      const endCli = (cli?.endereco ?? null) as Endereco | null;
      apolices = pols.map((p) => {
        const it = itemAlvo(p, out.itens[0]?.placa ?? null, out.itens[0]?.chassi ?? null);
        return {
          id: p.id,
          numero: p.numero,
          seguradora: p.insurer.nome,
          ramo: p.ramo,
          status: p.status,
          placa: it?.placa ?? null,
          modelo: it?.modelo ?? null,
          itemId: it?.id ?? null,
          fimVigencia: toIsoDate(p.fimVigencia),
          premioTotal: p.premioTotal == null ? null : Number(p.premioTotal),
          alteracoes: proporAlteracoes(out, e, p, { endereco: endCli }),
        };
      });
      // A apólice endossada primeiro.
      if (alvo) apolices.sort((a, b) => Number(b.id === alvo!.id) - Number(a.id === alvo!.id));
    }

    const docs = await prisma.document.findMany({ where: { hash }, select: { id: true, endorsement: { select: { id: true } } } });
    const v = out.itens[0];
    return {
      hash,
      jaRegistrado: docs.some((d) => d.endorsement),
      tipoDocumento: out.tipoDocumento ?? null,
      endosso: {
        numero: e?.numero ?? null,
        emissao: out.apolice.emissao.valor,
        motivos: e?.motivos ?? (out.endossoCancelamento ? ["Cancelamento"] : []),
        condutor: e?.condutor ?? null,
        premio: e?.premio ?? null,
        restituicao: Boolean(e?.restituicao),
        cancelamento: Boolean(out.endossoCancelamento),
        seguradora: insurer?.nome ?? out.seguradora.valor,
        apoliceNumero: out.apolice.numero.valor,
        segurado: out.cliente.nome.valor,
        veiculo: v ? { placa: v.placa, modelo: v.modelo, ano: v.ano, chassi: v.chassi } : null,
      },
      cliente,
      apoliceSugeridaId: alvo?.id ?? null,
      via: alvo?.via ?? null,
      apolices,
      avisos,
    };
  });

  /** Registra o endosso revisado: aplica as mudanças, guarda o PDF e o histórico. */
  app.post("/endorsements", async (req, reply): Promise<EndorsementDTO> => {
    const { buf, filename, fields } = await readPdfMultipart(req);
    if (!fields.data) throw badRequest("Campo 'data' (JSON do endosso revisado) é obrigatório");
    let json: unknown;
    try {
      json = JSON.parse(fields.data);
    } catch {
      throw badRequest("Campo 'data' não é um JSON válido");
    }
    const input: EndorsementCreateInput = parse(EndorsementCreateSchema, json);
    const policy = await prisma.policy.findFirst({ where: { id: input.policyId, clientId: input.clientId }, select: POLICY_SELECT });
    if (!policy) throw badRequest("Apólice não pertence a este cliente");
    const hash = sha256(buf);
    const docExistente = await prisma.document.findFirst({
      where: { hash, clientId: input.clientId },
      select: { id: true, endorsement: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (docExistente?.endorsement) throw conflict("Este endosso já foi registrado para este cliente");
    const file = docExistente ? null : await saveUpload(buf);

    const result = await prisma.$transaction(async (tx) => {
      // PDF: reaproveita o mesmo arquivo se ele já estava na ficha (ex.: veio na importação).
      const doc = docExistente
        ? await tx.document.update({ where: { id: docExistente.id }, data: { tipo: "ENDOSSO", policyId: policy.id } })
        : await tx.document.create({
            data: { clientId: input.clientId, policyId: policy.id, tipo: "ENDOSSO", nomeArquivo: filename, caminho: file!.caminho, hash: file!.hash, tamanho: file!.tamanho },
          });

      const cli = await tx.client.findUniqueOrThrow({ where: { id: input.clientId }, select: { endereco: true } });
      const end: Endereco = { ...((cli.endereco ?? {}) as Endereco) };
      const item = (input.itemId && policy.items.find((i) => i.id === input.itemId)) || itemAlvo(policy, null, null);
      const itemData: Prisma.InsuredItemUncheckedUpdateInput = {};
      const polData: Prisma.PolicyUncheckedUpdateInput = {};
      let mexeuEndereco = false;
      const aplicadas: EndorsementChangeDTO[] = [];

      for (const a of input.alteracoes) {
        const depois = a.depois?.trim() || null;
        let antes: string | null = null;
        switch (a.campo) {
          case "item.placa":
          case "item.modelo":
          case "item.ano":
          case "item.chassi": {
            const k = a.campo.slice(5) as "placa" | "modelo" | "ano" | "chassi";
            antes = item?.[k] ?? null;
            itemData[k] = k === "placa" || k === "chassi" ? (depois ? depois.toUpperCase().replace(/[^A-Z0-9]/g, "") : null) : depois;
            break;
          }
          case "policy.condutorPrincipal":
            antes = policy.condutorPrincipal;
            polData.condutorPrincipal = depois ? depois.toUpperCase() : null;
            break;
          case "policy.premioTotal": {
            antes = fmtMoney(policy.premioTotal == null ? null : Number(policy.premioTotal));
            const n = depois == null ? null : Number(depois.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "") || NaN);
            if (n != null && (!Number.isFinite(n) || n < 0 || n > 10_000_000)) throw badRequest("Prêmio total inválido");
            polData.premioTotal = n;
            break;
          }
          case "client.logradouro": {
            antes = linhaRua(end);
            if (depois) Object.assign(end, splitRua(depois));
            else Object.assign(end, { logradouro: null, numero: null });
            mexeuEndereco = true;
            break;
          }
          case "client.cep":
          case "client.bairro":
          case "client.cidade":
          case "client.uf": {
            const k = a.campo.slice(7) as "cep" | "bairro" | "cidade" | "uf";
            antes = end[k] ?? null;
            end[k] = k === "cep" ? (fmtCep(depois) ?? depois) : k === "uf" ? (depois?.toUpperCase().slice(0, 2) ?? null) : depois;
            mexeuEndereco = true;
            break;
          }
        }
        aplicadas.push({ campo: a.campo, label: a.label, antes, depois });
      }

      if (Object.keys(itemData).length) {
        if (item) await tx.insuredItem.update({ where: { id: item.id }, data: itemData });
        else await tx.insuredItem.create({ data: { ...(itemData as Prisma.InsuredItemUncheckedCreateInput), policyId: policy.id, tipo: "VEICULO" } });
      }
      if (input.cancelar && policy.status !== "CANCELADA") polData.status = "CANCELADA";
      if (Object.keys(polData).length) await tx.policy.update({ where: { id: policy.id }, data: polData });
      if (mexeuEndereco) await tx.client.update({ where: { id: input.clientId }, data: { endereco: end as Prisma.InputJsonValue } });

      return tx.endorsement.create({
        data: {
          clientId: input.clientId,
          policyId: policy.id,
          documentId: doc.id,
          numero: input.numero ?? null,
          emissao: input.emissao ? dateOnly(input.emissao) : null,
          motivos: input.motivos,
          premio: input.premio ?? null,
          restituicao: input.restituicao,
          cancelou: input.cancelar,
          alteracoes: aplicadas as unknown as Prisma.InputJsonValue,
          observacao: input.observacao ?? null,
          userId: req.user.sub,
        },
        include: { policy: { select: { numero: true, insurer: { select: { nome: true } } } }, document: { select: { id: true, nomeArquivo: true } } },
      });
    });

    await refreshClientStatus(input.clientId);
    // Auditoria só com os nomes dos campos (sem valores pessoais).
    await audit(req, "REGISTRAR_ENDOSSO", "Policy", policy.id, null, {
      endorsementId: result.id,
      clientId: input.clientId,
      campos: input.alteracoes.map((a) => a.campo),
      cancelou: input.cancelar,
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { nome: true } });
    reply.status(201);
    return endorsementDTO(result, new Map(user ? [[req.user.sub, user.nome]] : []));
  });

  /** Histórico de endossos do cliente + PDFs de endosso antigos (importados antes deste registro). */
  app.get("/clients/:id/endorsements", async (req): Promise<ClientEndorsementsDTO> => {
    const { id } = parse(IdParams, req.params);
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!client) throw notFound("Cliente");
    const [regs, antigos] = await Promise.all([
      prisma.endorsement.findMany({
        where: { clientId: id },
        include: { policy: { select: { numero: true, insurer: { select: { nome: true } } } }, document: { select: { id: true, nomeArquivo: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.document.findMany({
        where: { clientId: id, tipo: "ENDOSSO", endorsement: null },
        select: { id: true, nomeArquivo: true, policyId: true, createdAt: true, policy: { select: { numero: true, insurer: { select: { nome: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const userIds = [...new Set(regs.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } }) : [];
    const autores = new Map(users.map((u) => [u.id, u.nome]));
    return {
      registros: regs.map((r) => endorsementDTO(r, autores)),
      documentosAntigos: antigos.map((d) => ({
        id: d.id,
        nome: d.nomeArquivo,
        policyId: d.policyId,
        apoliceNumero: d.policy?.numero ?? null,
        seguradora: d.policy?.insurer.nome ?? null,
        criadoEm: d.createdAt.toISOString(),
      })),
    };
  });
}
