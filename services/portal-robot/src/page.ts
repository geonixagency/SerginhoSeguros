// Abstração mínima da página do navegador usada pelos fluxos das seguradoras.
// A implementação real embrulha um Page do Playwright (browser.ts); os testes usam
// uma página falsa com respostas gravadas (fixtures sintéticas), sem abrir navegador.

export interface InPageRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  /** Objeto serializado como JSON. */
  body?: unknown;
}

export interface InPageResponse {
  status: number;
  /** URL final (detecta redirecionamento para o SSO). */
  url: string;
  body: string;
}

/** Sinais da tela atual usados para classificar a sessão (login, captcha, 2FA). */
export interface PageSignals {
  url: string;
  campoSenha: boolean;
  captcha: boolean;
  segundoFator: boolean;
  /** Trecho do texto visível (só para achar mensagens de erro; nunca devolvido à API). */
  texto: string;
}

export interface PortalPage {
  goto(url: string): Promise<void>;
  currentUrl(): string;
  /** fetch() executado DENTRO da página: herda cookies e origem do portal logado. */
  fetch(req: InPageRequest): Promise<InPageResponse>;
  isVisible(selector: string): Promise<boolean>;
  fill(selector: string, value: string): Promise<void>;
  /** Digita tecla a tecla com atraso variável (ritmo humano). Usado no login. */
  typeHuman(selector: string, value: string): Promise<void>;
  /** Pausa aleatória entre passos. */
  pause(): Promise<void>;
  click(selector: string): Promise<void>;
  selectFirstOption(selector: string, preferido?: string): Promise<void>;
  signals(): Promise<PageSignals>;
  wait(ms: number): Promise<void>;
}

/** Corpo do fetch rodado no navegador. Autocontido: o Playwright serializa a função. */
export async function inPageFetch(req: InPageRequest): Promise<InPageResponse> {
  const r = await fetch(req.url, {
    method: req.method ?? "GET",
    credentials: "include",
    headers: { Accept: "application/json, text/plain, */*", ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(req.headers ?? {}) },
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });
  return { status: r.status, url: r.url, body: await r.text() };
}

/** Coleta de sinais rodada no navegador (autocontida). */
export function collectSignals(): Omit<PageSignals, "url"> {
  const visible = (el: Element | null) => {
    if (!el) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    const st = getComputedStyle(el as HTMLElement);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
  };
  const any = (sel: string) => Array.from(document.querySelectorAll(sel)).some(visible);
  const texto = (document.body?.innerText ?? "").slice(0, 4000);
  return {
    campoSenha: any('input[type="password"]'),
    // Desafio visível (o selo invisível do reCAPTCHA Enterprise da Porto está sempre na página e não conta).
    captcha:
      any('iframe[src*="recaptcha"][src*="bframe"]') ||
      any('iframe[src*="hcaptcha"]') ||
      any('iframe[title*="desafio" i], iframe[title*="challenge" i]') ||
      any('img[src*="captcha" i], input[name*="captcha" i]:not([type="hidden"])'),
    segundoFator:
      any('input[autocomplete="one-time-code"]') ||
      any('input[name*="otp" i]:not([type="hidden"]), input[id*="otp" i]:not([type="hidden"])') ||
      /c[oó]digo de (verifica|seguran|acesso)|enviamos um c[oó]digo|autentica[cç][aã]o em duas etapas|token de acesso/i.test(texto),
    texto,
  };
}
