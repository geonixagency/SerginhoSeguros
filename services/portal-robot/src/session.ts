// Gerente de sessões: uma fila por seguradora (as operações de um portal são serializadas,
// pois compartilham o mesmo contexto de navegador persistente), orçamento diário (poucos
// logins e consultas por dia) e um lugar único para checar status e fazer login.
//
// A credencial chega no corpo do POST /login, fica só em memória durante o login e não é
// guardada nem logada aqui. A sessão resultante fica no perfil persistente (fora do git).
import type { RobotEnv } from "./config";
import { openPortalPage } from "./browser";
import type { PortalDefinition } from "./insurers/definition";
import { portoDefinition } from "./insurers/porto";
import { tokioDefinition } from "./insurers/tokio";
import { DailyBudget, type BudgetKind } from "./pacing";
import type { PortalPage } from "./page";
import { RobotError, type LoginCredential, type RobotInsurer, type SessionResult, type SessionStatus } from "./types";
import { safePage } from "./util";

const DEFINITIONS: Record<RobotInsurer, PortalDefinition> = { tokio: tokioDefinition, porto: portoDefinition };

export interface OpenedPage {
  page: PortalPage;
  close(): Promise<void>;
}
export type PageFactory = (insurer: RobotInsurer) => Promise<OpenedPage>;

type SessionEnv = Pick<RobotEnv, "ROBOT_HEADLESS" | "ROBOT_VNC_URL" | "ROBOT_MAX_LOGINS_PER_DAY" | "ROBOT_MAX_QUERIES_PER_DAY">;

export class SessionManager {
  private readonly live = new Map<RobotInsurer, OpenedPage>();
  private readonly chains = new Map<RobotInsurer, Promise<unknown>>();
  readonly budget: DailyBudget;

  constructor(
    private readonly env: SessionEnv,
    private readonly openPage: PageFactory = defaultFactory(env as RobotEnv),
    agora?: () => Date,
  ) {
    this.budget = new DailyBudget({ loginsPorDia: env.ROBOT_MAX_LOGINS_PER_DAY, consultasPorDia: env.ROBOT_MAX_QUERIES_PER_DAY }, agora);
  }

  definition(insurer: RobotInsurer): PortalDefinition {
    const def = DEFINITIONS[insurer];
    if (!def) throw new RobotError("BAD_REQUEST", `Seguradora não suportada: ${insurer}`);
    return def;
  }

  /** Serializa operações por seguradora: o portal tem um navegador só. */
  private serial<T>(insurer: RobotInsurer, task: (page: PortalPage) => Promise<T>): Promise<T> {
    const prev = this.chains.get(insurer) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => task((await this.ensure(insurer)).page));
    this.chains.set(
      insurer,
      next.catch(() => {}),
    );
    return next;
  }

  /** Consulta ao portal: conta no orçamento diário de consultas. */
  run<T>(insurer: RobotInsurer, task: (page: PortalPage) => Promise<T>): Promise<T> {
    return this.serial(insurer, async (page) => {
      this.cobrar(insurer, "consulta");
      return task(page);
    });
  }

  /**
   * Consulta que exige sessão: garante que a página está no portal logado antes de chamar os
   * BFFs (o fetch dentro da página só leva os cookies se estiver na origem do portal).
   * Sessão caída -> SESSION_EXPIRED (a API refaz o login e tenta de novo); captcha -> NEEDS_HUMAN.
   */
  runLogged<T>(insurer: RobotInsurer, task: (page: PortalPage) => Promise<T>): Promise<T> {
    const def = this.definition(insurer);
    return this.run(insurer, async (page) => {
      if (origem(page.currentUrl()) !== origem(def.homeUrl)) {
        await page.goto(def.homeUrl);
        await page.pause();
      }
      const status = def.classify(await page.signals());
      if (status === "needs_human") throw new RobotError("NEEDS_HUMAN", "O portal pede verificação humana (captcha/2FA)");
      if (status !== "valid") throw new RobotError("SESSION_EXPIRED", "Sessão do portal expirada");
      return task(page);
    });
  }

  private cobrar(insurer: RobotInsurer, tipo: BudgetKind) {
    const motivo = this.budget.motivoRecusa(insurer, tipo);
    if (motivo) throw new RobotError("BUSY", motivo, 429);
    this.budget.consumir(insurer, tipo);
  }

  private async ensure(insurer: RobotInsurer): Promise<OpenedPage> {
    const existing = this.live.get(insurer);
    if (existing) return existing;
    const opened = await this.openPage(insurer);
    this.live.set(insurer, opened);
    return opened;
  }

  /** Vai para a home e classifica a sessão a partir dos sinais da tela. Não conta no orçamento. */
  async status(insurer: RobotInsurer): Promise<SessionResult> {
    const def = this.definition(insurer);
    return this.serial(insurer, async (page) => {
      try {
        await page.goto(def.homeUrl);
        await page.pause();
        const signals = await page.signals();
        return this.result(insurer, def.classify(signals), { pagina: safePage(signals.url) });
      } catch (err) {
        return this.result(insurer, "error", { detalhe: mensagem(err, "Falha ao abrir o portal") });
      }
    });
  }

  /** Login automático; devolve needs_human quando aparece captcha/2FA. */
  async login(insurer: RobotInsurer, cred: LoginCredential): Promise<SessionResult> {
    const def = this.definition(insurer);
    return this.serial(insurer, async (page) => {
      try {
        // Já logado? Não refaz (nem gasta orçamento).
        await page.goto(def.homeUrl);
        await page.pause();
        if (def.classify(await page.signals()) === "valid") return this.result(insurer, "valid", { detalhe: "Sessão já estava ativa" });

        const motivo = this.budget.motivoRecusa(insurer, "login");
        if (motivo) return this.result(insurer, "needs_human", { detalhe: motivo });
        this.budget.consumir(insurer, "login");

        const outcome = await def.submitLogin(page, cred);
        if (outcome === "needs_human") {
          return this.result(insurer, "needs_human", {
            detalhe: this.env.ROBOT_HEADLESS
              ? "O portal pediu captcha/2FA. Faça o login assistido (robô em modo janela, via noVNC/desktop)."
              : "O portal pediu captcha/2FA. Conclua a verificação na janela do robô (noVNC/desktop).",
          });
        }
        const signals = await page.signals();
        const status = def.classify(signals);
        if (status === "expired") {
          // Ainda na tela de login após enviar: credencial recusada. Suspende novas tentativas hoje.
          this.budget.bloquearLogin(insurer);
          return this.result(insurer, "invalid_credentials", { detalhe: "Usuário ou senha recusados pelo portal. Login automático suspenso hoje." });
        }
        return this.result(insurer, status, { pagina: safePage(signals.url) });
      } catch (err) {
        return this.result(insurer, "error", { detalhe: mensagem(err, "Falha no login") });
      }
    });
  }

  private result(insurer: RobotInsurer, status: SessionStatus, extra: Partial<SessionResult> = {}): SessionResult {
    return {
      insurer,
      status,
      headful: !this.env.ROBOT_HEADLESS,
      ...(this.env.ROBOT_VNC_URL ? { vncUrl: this.env.ROBOT_VNC_URL } : {}),
      verificadoEm: new Date().toISOString(),
      ...extra,
    };
  }

  async closeAll() {
    for (const p of this.live.values()) await p.close().catch(() => {});
    this.live.clear();
  }
}

function defaultFactory(env: RobotEnv): PageFactory {
  return async (insurer) => {
    const { page, context } = await openPortalPage(env, insurer);
    return { page, close: () => context.close() };
  };
}

function origem(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** Mensagem de erro curta e sem dados sensíveis (erros do Playwright podem citar seletores, nunca valores). */
function mensagem(err: unknown, padrao: string): string {
  if (!(err instanceof Error)) return padrao;
  return err.message.split("\n")[0]!.slice(0, 200);
}
