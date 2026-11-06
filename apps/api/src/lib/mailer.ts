// E-mail transacional (redefinição de senha) via SMTP/nodemailer.
// Nunca logar o conteúdo das mensagens: elas carregam links com token.
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type Sender = (m: MailMessage) => Promise<void>;

let transporter: Transporter | null = null;
let override: Sender | null = null;

export function isMailConfigured(): boolean {
  return Boolean(override || (env.SMTP_HOST && env.SMTP_FROM));
}

export async function sendMail(m: MailMessage): Promise<void> {
  if (override) return override(m);
  if (!env.SMTP_HOST || !env.SMTP_FROM) throw new Error("SMTP não configurado");
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
  });
  await transporter.sendMail({ from: env.SMTP_FROM, ...m });
}

/** Só para testes: troca o envio real por uma função (ou null para voltar ao SMTP). */
export function setMailSenderForTests(fn: Sender | null): void {
  override = fn;
}
