// Webhook da Evolution (evento messages.upsert): trata o opt-out "SAIR" (LGPD).
// Configure na Evolution: URL = https://<api>/api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>
import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { forbidden, unavailable } from "../../lib/errors";
import { audit } from "../../lib/audit";

const OPT_OUT_WORDS = new Set(["sair", "parar", "pare", "cancelar", "descadastrar", "stop"]);

function tokenOk(given: string | undefined): boolean {
  if (!env.EVOLUTION_WEBHOOK_TOKEN || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.EVOLUTION_WEBHOOK_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface UpsertPayload {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean };
    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
  };
}

/** Telefone salvo (DDD+número) a partir do JID (5511988887777@s.whatsapp.net). */
export function phoneFromJid(jid: string): string {
  const d = jid.split("@")[0]?.replace(/\D/g, "") ?? "";
  return d.startsWith("55") ? d.slice(2) : d;
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/evolution", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req) => {
    if (!env.EVOLUTION_WEBHOOK_TOKEN) throw unavailable("Webhook desativado (EVOLUTION_WEBHOOK_TOKEN não definido)");
    const q = req.query as { token?: string };
    if (!tokenOk(q.token ?? (req.headers["x-webhook-token"] as string | undefined))) throw forbidden("Token inválido");

    const body = req.body as UpsertPayload;
    const evento = (body.event ?? "").toLowerCase().replace("_", ".");
    if (evento !== "messages.upsert" || body.data?.key?.fromMe) return { ok: true, ignorado: true };
    const texto = (body.data?.message?.conversation ?? body.data?.message?.extendedTextMessage?.text ?? "").trim().toLowerCase();
    if (!OPT_OUT_WORDS.has(texto)) return { ok: true, ignorado: true };

    const tel = phoneFromJid(body.data?.key?.remoteJid ?? "");
    if (tel.length < 10) return { ok: true, ignorado: true };
    // Celular pode vir com ou sem o 9º dígito; casamos pelos 8 finais + DDD.
    const candidatos = await prisma.client.findMany({
      where: { telefone: { endsWith: tel.slice(-8) }, optOut: false },
      select: { id: true, telefone: true },
    });
    const ddd = tel.slice(0, 2);
    const alvo = candidatos.filter((c) => c.telefone?.startsWith(ddd));
    for (const c of alvo) {
      await prisma.client.update({ where: { id: c.id }, data: { optOut: true, optOutEm: new Date() } });
      await prisma.message.updateMany({ where: { clientId: c.id, status: "AGENDADA" }, data: { status: "CANCELADA", erro: "Opt-out do cliente" } });
      await audit(null, "OPT_OUT_WHATSAPP", "Client", c.id);
    }
    req.log.info({ clientes: alvo.length }, "opt-out recebido via WhatsApp");
    return { ok: true, optOut: alvo.length };
  });
}
