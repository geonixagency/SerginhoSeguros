// Carrega e valida variáveis de ambiente uma única vez. Falha cedo (no boot) se algo
// obrigatório faltar — melhor do que descobrir em produção no meio de um disparo.
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { z } from "zod";

// .env.local tem precedência sobre .env (dotenv não sobrescreve variáveis já definidas).
for (const f of [".env.local", ".env"]) loadDotenv({ path: path.resolve(process.cwd(), f) });

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa de ao menos 32 caracteres"),
  JWT_ACCESS_TTL: z.coerce.number().int().default(900), // segundos
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().default(7),
  /** 32 bytes em base64 (44 chars) ou hex (64 chars). */
  APP_ENCRYPTION_KEY: z.string().min(32),
  /** Lista separada por vírgula. */
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: bool,
  /** "none" quando o frontend (Vercel) está em outro domínio que a API. */
  COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
  STORAGE_DIR: z.string().default("./storage"),
  PDF_PARSER_URL: z.string().default("http://127.0.0.1:8001"),
  PDF_PARSER_TOKEN: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(20),
  EVOLUTION_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCE: z.string().default("serginho-seguros"),
  /** true = não chama a Evolution real; respostas simuladas (dev/demo). */
  EVOLUTION_MOCK: bool,
  /** Token exigido no webhook da Evolution (opt-out "SAIR"). */
  EVOLUTION_WEBHOOK_TOKEN: z.string().optional(),
  // URL que a Evolution chama (rede interna serve: http://<api>:3333/api/webhooks/evolution).
  EVOLUTION_WEBHOOK_URL: z.string().url().optional(),
  AGGILIZADOR_BASE_URL: z.string().default("https://api.aggilizador.com.br"),
  /** IDs da corretora no Aggilizador (QuotationDto). A credencial cadastrada na tela tem precedência. */
  AGGILIZADOR_INSURANCE_BROKER_ID: z.string().optional(),
  AGGILIZADOR_BROKER_ID: z.string().optional(),
  AGGILIZADOR_COMPANY_ID: z.string().optional(),
  AGGILIZADOR_PARTNER: z.string().optional(),
  AGGILIZADOR_INSURANCE_BROKER: z.string().optional(),
  /** true = todas as seguradoras usam o MockConnector (demonstração). */
  CONNECTORS_DEMO: bool,
  /** Serviço portal-robot (canal rpa: Tokio e Porto). Só na rede interna do docker. */
  PORTAL_ROBOT_URL: z.string().default("http://portal-robot:8020"),
  /** Token compartilhado com o portal-robot (mesmo valor de ROBOT_TOKEN lá). */
  PORTAL_ROBOT_TOKEN: z.string().optional(),
  /** URL pública do frontend, usada nos links enviados por e-mail (redefinição de senha). */
  WEB_URL: z.string().url().default("http://localhost:3000"),
  /** SMTP para e-mails transacionais. Sem SMTP_HOST/SMTP_FROM a redefinição por e-mail fica indisponível. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  /** true = TLS direto (porta 465); false = STARTTLS quando o servidor oferece. */
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  /** false = este processo não roda worker/agendador (útil para escalar só a API). */
  RUN_WORKER: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
});

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${msg}`);
  }
  return parsed.data;
}

export const env = load();
export const storageRoot = path.resolve(env.STORAGE_DIR);
export const corsOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
