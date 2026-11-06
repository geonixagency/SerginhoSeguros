// Adaptador Playwright da PortalPage, com um contexto de navegador PERSISTENTE por seguradora.
//
// O contexto persistente guarda os cookies de sessão do portal em disco (ROBOT_PROFILE_DIR),
// então uma vez logado o robô volta a consultar sem refazer login até a sessão expirar.
// Esses perfis contêm sessão viva dos portais: ficam em volume fora do git (ver .gitignore).
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import type { RobotEnv } from "./config";
import { collectSignals, inPageFetch, type InPageRequest, type InPageResponse, type PageSignals, type PortalPage } from "./page";
import { randomBetween } from "./pacing";
import type { RobotInsurer } from "./types";
import { safePage } from "./util";

export class PlaywrightPage implements PortalPage {
  constructor(
    private readonly page: Page,
    private readonly timeoutMs: number,
    private readonly passo: { min: number; max: number } = { min: 700, max: 2200 },
  ) {
    page.setDefaultTimeout(timeoutMs);
  }

  async typeHuman(selector: string, value: string) {
    await this.page.click(selector, { timeout: this.timeoutMs });
    await this.page.fill(selector, "");
    // Atraso por tecla entre 60 e 180 ms, como uma pessoa digitando.
    for (const ch of value) await this.page.keyboard.type(ch, { delay: randomBetween(60, 180) });
  }

  async pause() {
    await this.page.waitForTimeout(randomBetween(this.passo.min, this.passo.max));
  }

  async goto(url: string) {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
  }

  currentUrl() {
    return this.page.url();
  }

  async fetch(req: InPageRequest): Promise<InPageResponse> {
    return this.page.evaluate(inPageFetch, req);
  }

  async isVisible(selector: string) {
    try {
      return await this.page.isVisible(selector, { timeout: 1500 });
    } catch {
      return false;
    }
  }

  async fill(selector: string, value: string) {
    await this.page.fill(selector, value, { timeout: this.timeoutMs });
  }

  async click(selector: string) {
    await this.page.click(selector, { timeout: this.timeoutMs });
  }

  async selectFirstOption(selector: string, preferido?: string) {
    try {
      await this.page.selectOption(selector, preferido ? { label: preferido } : { index: 1 }, { timeout: 3000 });
    } catch {
      // campo pode não ser um <select> (portal varia); segue sem travar
    }
  }

  async signals(): Promise<PageSignals> {
    const base = await this.page.evaluate(collectSignals);
    return { url: this.page.url(), ...base };
  }

  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }
}

/** Abre (ou reaproveita) o contexto persistente de uma seguradora e entrega sua página. */
export async function openPortalPage(env: RobotEnv, insurer: RobotInsurer): Promise<{ page: PlaywrightPage; context: BrowserContext; raw: Page }> {
  const userDataDir = path.join(env.ROBOT_PROFILE_DIR, insurer);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: env.ROBOT_HEADLESS,
    executablePath: env.ROBOT_CHROMIUM_PATH || undefined,
    timezoneId: "America/Sao_Paulo",
    locale: "pt-BR",
    viewport: { width: 1366, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const raw = context.pages()[0] ?? (await context.newPage());
  return { page: new PlaywrightPage(raw, env.ROBOT_TIMEOUT_MS, { min: env.ROBOT_STEP_MIN_MS, max: env.ROBOT_STEP_MAX_MS }), context, raw };
}

export { safePage };
