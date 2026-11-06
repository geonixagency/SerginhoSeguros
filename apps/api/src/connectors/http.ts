// Cliente HTTP para conectores: rate limit (token bucket simples), timeout e retry
// exponencial com jitter em erros transitórios (rede, 429, 5xx). Seguradoras costumam
// ter APIs instáveis e limites baixos — por isso isso é obrigatório (prompt pai §7).
import { ConnectorError } from "./types";

export interface HttpClientOptions {
  baseUrl: string;
  /** Requisições por segundo permitidas (padrão 2). */
  rps?: number;
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  headers?: Record<string, string>;
  /** Injetável nos testes. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface HttpRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpClient {
  private nextSlot = 0;
  private readonly o: Required<Omit<HttpClientOptions, "headers" | "fetchImpl" | "sleep">> & HttpClientOptions;

  constructor(opts: HttpClientOptions) {
    this.o = { rps: 2, retries: 3, timeoutMs: 15_000, baseDelayMs: 500, ...opts };
  }

  private async throttle() {
    const sleep = this.o.sleep ?? defaultSleep;
    const interval = 1000 / this.o.rps;
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + interval;
    if (wait > 0) await sleep(wait);
  }

  private url(path: string, query?: HttpRequest["query"]) {
    const u = new URL(path.replace(/^\//, ""), this.o.baseUrl.endsWith("/") ? this.o.baseUrl : `${this.o.baseUrl}/`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u.toString();
  }

  async raw(req: HttpRequest): Promise<Response> {
    const fetchImpl = this.o.fetchImpl ?? fetch;
    const sleep = this.o.sleep ?? defaultSleep;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.o.retries; attempt++) {
      await this.throttle();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs);
      try {
        const res = await fetchImpl(this.url(req.path, req.query), {
          method: req.method ?? "GET",
          headers: {
            Accept: "application/json",
            ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...this.o.headers,
            ...req.headers,
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: ctrl.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new ConnectorError(`Serviço respondeu ${res.status}`, true, res.status);
          const retryAfter = Number(res.headers.get("retry-after"));
          if (attempt < this.o.retries) await sleep(retryAfter > 0 ? retryAfter * 1000 : this.backoff(attempt));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (attempt < this.o.retries) await sleep(this.backoff(attempt));
      } finally {
        clearTimeout(timer);
      }
    }
    if (lastErr instanceof ConnectorError) throw lastErr;
    throw new ConnectorError("Falha de comunicação com o serviço externo", true);
  }

  async json<T>(req: HttpRequest): Promise<T> {
    const res = await this.raw(req);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ConnectorError(`Serviço respondeu ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`, false, res.status);
    }
    return (await res.json()) as T;
  }

  private backoff(attempt: number) {
    const exp = this.o.baseDelayMs * 2 ** attempt;
    return exp + Math.floor(Math.random() * exp * 0.3);
  }
}
