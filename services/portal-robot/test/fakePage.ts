// Página falsa que implementa PortalPage com respostas gravadas (fixtures sintéticas).
// Permite testar os mapeadores e fluxos sem abrir navegador nem tocar em portal real.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { InPageRequest, InPageResponse, PageSignals, PortalPage } from "../src/page";

const fxDir = path.join(__dirname, "fixtures");
export const fx = (f: string) => readFileSync(path.join(fxDir, f), "utf8");

export interface FakePageOptions {
  /** Mapa "METHOD pathname" -> corpo da resposta (string) ou função. */
  routes: Record<string, string | (() => InPageResponse)>;
  signals?: Partial<PageSignals>;
  startUrl?: string;
}

export class FakePage implements PortalPage {
  readonly calls: Array<{ url: string; method: string; body: unknown }> = [];
  private url: string;

  constructor(private readonly opts: FakePageOptions) {
    this.url = opts.startUrl ?? "https://portal.exemplo.invalid/home";
  }

  async goto(url: string) {
    this.url = url;
  }
  currentUrl() {
    return this.url;
  }

  async fetch(req: InPageRequest): Promise<InPageResponse> {
    this.calls.push({ url: req.url, method: req.method ?? "GET", body: req.body });
    const key = `${req.method ?? "GET"} ${new URL(req.url).pathname}`;
    const r = this.opts.routes[key];
    if (r === undefined) return { status: 404, url: req.url, body: "not found" };
    if (typeof r === "function") return r();
    return { status: 200, url: req.url, body: r };
  }

  async isVisible() {
    return false;
  }
  async fill() {}
  async click() {}
  async selectFirstOption() {}
  async signals(): Promise<PageSignals> {
    return { url: this.url, campoSenha: false, captcha: false, segundoFator: false, texto: "", ...this.opts.signals };
  }
  async wait() {}
  /** Campos digitados (só o seletor e o tamanho — nunca o valor, mesmo em teste). */
  readonly typed: Array<{ selector: string; length: number }> = [];
  async typeHuman(selector: string, value: string) {
    this.typed.push({ selector, length: value.length });
  }
  pauses = 0;
  async pause() {
    this.pauses++;
  }
}
