// Rotas públicas (sem login): só o formulário de cotação do site institucional (formulário e quiz).
// Limite de taxa apertado + honeypot (campo `site` precisa vir vazio, senão 400); o lead entra no CRM na etapa NOVO com origem "site"
// e a corretora recebe um aviso por e-mail.
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { PublicLeadSchema, type PublicLeadInput } from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { env } from "../../config/env";
import { isMailConfigured, sendMail } from "../../lib/mailer";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function destinatarios(): Promise<string[]> {
  const fixos = (env.LEAD_NOTIFY_TO ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (fixos.length) return fixos;
  const admins = await prisma.user.findMany({ where: { perfil: "ADMIN", ativo: true }, select: { email: true } });
  return admins.map((a) => a.email);
}

/** Monta o e-mail do lead novo (exportado para teste). */
export function leadEmail(input: PublicLeadInput): { subject: string; text: string; html: string } {
  const crm = `${env.WEB_URL.replace(/\/$/, "")}/app/crm`;
  const linhas: Array<[string, string | null | undefined]> = [
    ["Nome", input.nome],
    ["Telefone", input.telefone],
    ["E-mail", input.email],
    ["Interesse", input.produto],
    ["Mensagem", input.mensagem],
  ];
  const preenchidas = linhas.filter(([, v]) => v && String(v).trim()) as Array<[string, string]>;
  const zap = input.telefone.replace(/\D/g, "");
  const subject = `Novo pedido de cotação pelo site: ${input.nome}${input.produto ? ` (${input.produto})` : ""}`;
  const text = [
    "Chegou um novo pedido de cotação pelo site da Serginho Seguros.",
    "",
    ...preenchidas.map(([k, v]) => `${k}: ${v}`),
    "",
    `Ver no CRM: ${crm}`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1c1917">
<p>Chegou um novo pedido de cotação pelo site da <b>Serginho Seguros</b>.</p>
<table cellpadding="6" style="border-collapse:collapse">${preenchidas
    .map(([k, v]) => `<tr><td style="color:#78716c;vertical-align:top">${esc(k)}</td><td><b>${esc(v).replace(/\n/g, "<br>")}</b></td></tr>`)
    .join("")}</table>
<p>${zap.length >= 10 ? `<a href="https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}">Chamar no WhatsApp</a> · ` : ""}<a href="${esc(crm)}">Abrir o CRM</a></p>
</div>`;
  return { subject, text, html };
}

async function avisarPorEmail(input: PublicLeadInput, log: FastifyBaseLogger): Promise<void> {
  if (!isMailConfigured()) return log.warn("lead do site: SMTP não configurado, aviso por e-mail não enviado");
  const to = await destinatarios();
  if (!to.length) return log.warn("lead do site: nenhum destinatário para o aviso por e-mail");
  await sendMail({ to: to.join(", "), ...leadEmail(input) });
}

export default async function publicRoutes(app: FastifyInstance) {
  app.post("/leads", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const input = parse(PublicLeadSchema, req.body);
    await prisma.lead.create({
      data: {
        nome: input.nome,
        telefone: input.telefone,
        email: input.email ?? null,
        produto: input.produto ?? null,
        origem: "site",
        etapa: "NOVO",
        notas: input.mensagem ?? null,
      },
    });
    // O e-mail não segura a resposta: se o SMTP falhar, o lead já está no CRM. Não logar os dados do lead.
    void avisarPorEmail(input, req.log).catch((err: unknown) => req.log.warn({ err: err instanceof Error ? err.message : "falha" }, "lead do site: aviso por e-mail falhou"));
    // Não devolve o id nem ecoa os dados: a rota é pública.
    return reply.status(201).send({ ok: true });
  });
}
