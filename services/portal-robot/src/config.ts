// Configuração do robô de portais. Falha cedo no boot se faltar algo obrigatório.
//
// O robô só existe na rede interna do docker (nunca exposto na internet): a API
// chama com o token compartilhado ROBOT_TOKEN. Os perfis de navegador ficam em
// ROBOT_PROFILE_DIR (volume fora do git) porque guardam cookies de sessão dos portais.
import path from "node:path";
import { z } from "zod";

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ROBOT_PORT: z.coerce.number().int().default(8020),
  ROBOT_HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  /** Token exigido em toda chamada (Authorization: Bearer). Mesmo valor de PORTAL_ROBOT_TOKEN na API. */
  ROBOT_TOKEN: z.string().min(24, "ROBOT_TOKEN precisa de ao menos 24 caracteres"),
  /** Pasta dos perfis persistentes (um subdiretório por seguradora). */
  ROBOT_PROFILE_DIR: z.string().default("./profiles"),
  /** false = abre janela (para login manual via noVNC/desktop). */
  ROBOT_HEADLESS: bool(true),
  /** Caminho do Chromium (opcional; a imagem do Playwright já traz o navegador). */
  ROBOT_CHROMIUM_PATH: z.string().optional(),
  /** Endereço do noVNC mostrado ao operador no login manual (ex.: http://127.0.0.1:6080/vnc.html). */
  ROBOT_VNC_URL: z.string().optional(),
  /** Tempo máximo de uma operação no portal (ms). */
  ROBOT_TIMEOUT_MS: z.coerce.number().int().default(60_000),
  /** Pausa entre chamadas aos BFFs, para não martelar o portal (ms). */
  ROBOT_CALL_GAP_MS: z.coerce.number().int().default(400),
  /** Logins automáticos por seguradora por dia (ritmo humano; acima disso, só login assistido). */
  ROBOT_MAX_LOGINS_PER_DAY: z.coerce.number().int().min(1).default(3),
  /** Consultas ao portal por seguradora por dia. */
  ROBOT_MAX_QUERIES_PER_DAY: z.coerce.number().int().min(1).default(300),
  /** Pausa aleatória entre passos de navegação (ms). */
  ROBOT_STEP_MIN_MS: z.coerce.number().int().default(700),
  ROBOT_STEP_MAX_MS: z.coerce.number().int().default(2200),
  /** true = respostas incluem só a ESTRUTURA (chaves/tipos, sem valores) do JSON do portal, para validar mapeamentos. */
  ROBOT_DEBUG_SHAPES: bool(false),
});

export type RobotEnv = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): RobotEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${msg}`);
  }
  return { ...parsed.data, ROBOT_PROFILE_DIR: path.resolve(parsed.data.ROBOT_PROFILE_DIR) };
}
