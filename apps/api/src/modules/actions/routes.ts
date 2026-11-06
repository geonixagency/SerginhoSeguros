// Ações por API no cliente: só as que o conector da seguradora implementa.
// Seguradora sem API => ação MANUAL guiada (abre o portal + cria tarefa) — nunca
// automatizamos login em portal com senha (regra inegociável 3).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConnectorCapability } from "@ss/shared";
import { CLIENT_ACTIONS, ClientActionSchema, type ClientActionDTO, type ClientActionId, type ClientActionResultDTO } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { dateOnly } from "../../lib/dates";
import { saveUpload } from "../../lib/storage";
import { insurerSummary } from "../../lib/serialize";
import { getConnector, loadCredential } from "../../connectors/registry";
import { ConnectorError } from "../../connectors/types";
import { createAndEnqueue } from "../messaging/service";
import { renderTemplate } from "../messaging/template";
import { varsFor } from "../messaging/engine";

const ACTIONS: Record<ClientActionId, { label: string; requer: ConnectorCapability }> = {
  "segunda-via-boleto": { label: "2ª via de boleto", requer: "getBoletoPdf" },
  "enviar-boleto-whatsapp": { label: "Enviar boleto por WhatsApp", requer: "getBoletoPdf" },
  "status-apolice": { label: "Consultar status da apólice", requer: "getPolicyStatus" },
  "sincronizar-parcelas": { label: "Atualizar parcelas", requer: "listInstallments" },
  sinistros: { label: "Consultar sinistros", requer: "getClaims" },
};

const Params = z.object({ id: z.string().min(1), action: z.enum(CLIENT_ACTIONS) });

export default async function actionRoutes(app: FastifyInstance) {
  app.get("/:id/actions", async (req) => {
    const { id } = parse(z.object({ id: z.string().min(1) }), req.params);
    const client = await prisma.client.findUnique({
      where: { id },
      include: { policies: { where: { status: { not: "CANCELADA" } }, include: { insurer: true }, orderBy: { fimVigencia: "desc" } } },
    });
    if (!client) throw notFound("Cliente");
    const data: ClientActionDTO[] = [];
    for (const p of client.policies) {
      const caps = getConnector(p.insurer.slug).capabilities;
      for (const [action, def] of Object.entries(ACTIONS) as Array<[ClientActionId, (typeof ACTIONS)[ClientActionId]]>) {
        const api = caps.includes(def.requer);
        // Sem API, só oferecemos as ações que fazem sentido no portal (boleto/status/sinistro).
        if (!api && action === "enviar-boleto-whatsapp") continue;
        data.push({
          action,
          label: def.label,
          policyId: p.id,
          policyNumero: p.numero,
          insurer: insurerSummary(p.insurer),
          modo: api ? "API" : "MANUAL",
          portalUrl: p.insurer.portalUrl,
        });
      }
    }
    return { data };
  });

  app.post("/:id/actions/:action", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req): Promise<ClientActionResultDTO> => {
    const { id, action } = parse(Params, req.params);
    const body = parse(ClientActionSchema, req.body ?? {});
    const policy = await prisma.policy.findFirst({
      where: { id: body.policyId, clientId: id },
      include: { insurer: true, client: true, installments: { orderBy: { numero: "asc" } }, items: true },
    });
    if (!policy) throw notFound("Apólice deste cliente");
    const def = ACTIONS[action];
    const connector = getConnector(policy.insurer.slug);

    // ---------- modo manual guiado
    if (!connector.capabilities.includes(def.requer)) {
      const task = await prisma.task.create({
        data: {
          titulo: `${def.label} — ${policy.insurer.nome}`,
          descricao: `Cliente ${policy.client.nome}, apólice ${policy.numero ?? "(sem número)"}${body.parcela ? `, parcela ${body.parcela}` : ""}. Fazer pelo portal da seguradora.`,
          clientId: id,
          insurerId: policy.insurerId,
          policyId: policy.id,
          createdBy: req.user.sub,
        },
      });
      await audit(req, `ACAO_MANUAL:${action}`, "Client", id, null, { policyId: policy.id, taskId: task.id });
      return { modo: "MANUAL", ok: true, mensagem: "Seguradora sem integração por API. Tarefa criada; abra o portal para concluir.", taskId: task.id, portalUrl: policy.insurer.portalUrl };
    }

    // ---------- modo API
    if (!policy.numero) throw badRequest("A apólice não tem número cadastrado; não é possível consultar a seguradora");
    const cred = await loadCredential(policy.insurer);
    if (!cred) throw badRequest(`Credencial da ${policy.insurer.nome} não cadastrada`);
    const numero = policy.numero;
    // Canais rpa (Tokio/Porto) consultam o portal pelo CPF/CNPJ do cliente.
    const ctx = { cpfCnpj: policy.client.cpfCnpj };

    try {
      let result: ClientActionResultDTO;
      switch (action) {
        case "segunda-via-boleto":
        case "enviar-boleto-whatsapp": {
          const parcela =
            body.parcela ?? policy.installments.find((i) => i.status !== "PAGO")?.numero ?? policy.installments[0]?.numero ?? 1;
          const pdf = await connector.getBoletoPdf!(cred, numero, parcela, ctx);
          const file = await saveUpload(pdf);
          const doc = await prisma.document.create({
            data: {
              clientId: id,
              policyId: policy.id,
              tipo: "BOLETO",
              nomeArquivo: `boleto-${numero}-parcela-${parcela}.pdf`,
              caminho: file.caminho,
              hash: file.hash,
              tamanho: file.tamanho,
            },
          });
          const inst = policy.installments.find((i) => i.numero === parcela);
          if (inst) await prisma.installment.update({ where: { id: inst.id }, data: { boletoDocumentId: doc.id } });
          result = { modo: "API", ok: true, mensagem: `Boleto da parcela ${parcela} obtido`, documentId: doc.id };
          if (action === "enviar-boleto-whatsapp") {
            if (!policy.client.telefone) throw badRequest("Cliente sem telefone cadastrado");
            if (policy.client.optOut) throw badRequest("Cliente pediu para não receber mensagens (opt-out)");
            const vars = inst ? varsFor({ ...inst, policy }) : { nome: policy.client.nome };
            const messageId = await createAndEnqueue({
              clientId: id,
              telefone: policy.client.telefone,
              conteudo: renderTemplate(
                `Olá {{nome}}, segue o boleto da parcela ${parcela} do seu seguro {{seguradora}} (apólice {{apolice}}).`,
                { ...vars, seguradora: policy.insurer.nome, apolice: numero },
              ),
              installmentId: null,
              anexoDocumentId: doc.id,
            });
            result = { ...result, mensagem: `Boleto da parcela ${parcela} enfileirado para envio por WhatsApp`, messageId: messageId ?? undefined };
          }
          break;
        }
        case "status-apolice": {
          const st = await connector.getPolicyStatus!(cred, numero, ctx);
          result = { modo: "API", ok: true, mensagem: `Situação: ${st.situacao}`, dados: st };
          break;
        }
        case "sincronizar-parcelas": {
          const remotas = await connector.listInstallments!(cred, numero, ctx);
          let atualizadas = 0;
          for (const r of remotas) {
            await prisma.installment.upsert({
              where: { policyId_numero: { policyId: policy.id, numero: r.numero } },
              create: { policyId: policy.id, numero: r.numero, valor: r.valor, vencimento: dateOnly(r.vencimento), status: r.status, verificadoEm: new Date(), pagoEm: r.status === "PAGO" ? new Date() : null },
              update: { status: r.status, verificadoEm: new Date(), ...(r.status === "PAGO" ? { pagoEm: new Date() } : {}) },
            });
            atualizadas++;
          }
          result = { modo: "API", ok: true, mensagem: `${atualizadas} parcela(s) atualizada(s)`, dados: remotas };
          break;
        }
        case "sinistros": {
          const claims = await connector.getClaims!(cred, numero);
          result = { modo: "API", ok: true, mensagem: claims.length ? `${claims.length} sinistro(s)` : "Nenhum sinistro encontrado", dados: claims };
          break;
        }
      }
      await audit(req, `ACAO_API:${action}`, "Client", id, null, { policyId: policy.id, ok: true });
      return result;
    } catch (err) {
      if (err instanceof AppError) throw err;
      req.log.warn({ err, insurer: policy.insurer.slug, action }, "ação via conector falhou");
      await audit(req, `ACAO_API:${action}`, "Client", id, null, { policyId: policy.id, ok: false });
      throw new AppError(502, "CONNECTOR_ERROR", err instanceof ConnectorError ? err.message : "A seguradora não respondeu como esperado");
    }
  });
}
