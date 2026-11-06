/**
 * Cliente HTTP tipado da API Serginho Seguros.
 * - Base: NEXT_PUBLIC_API_URL + "/api"
 * - Auth: access token (JWT bearer) em memória; refresh via cookie httpOnly em POST /auth/refresh
 * - MODO DEMO (NEXT_PUBLIC_DEMO=1): todas as chamadas são atendidas por ./demo.ts
 */
import { DemoHttpError, demoRequest } from "./demo";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333").replace(/\/$/, "")}/api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const tokenStore = {
  get: () => accessToken,
  set: (t: string | null) => {
    accessToken = t;
  },
  onUnauthorized: (fn: () => void) => {
    onUnauthorized = fn;
  },
};

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" })
    .then(async (r) => {
      if (!r.ok) return false;
      const j = (await r.json()) as { accessToken?: string };
      if (j.accessToken) accessToken = j.accessToken;
      return !!j.accessToken;
    })
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown, retry = true): Promise<T> {
  if (IS_DEMO) {
    try {
      return await demoRequest<T>(method, path, body);
    } catch (e) {
      if (e instanceof DemoHttpError) throw new ApiError(e.status, e.message);
      throw e;
    }
  }
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!isForm && body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Não foi possível falar com o servidor. Verifique sua conexão.");
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/") && !path.startsWith("/public/")) {
    if (await tryRefresh()) return request<T>(method, path, body, false);
    onUnauthorized?.();
  }
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    let details: unknown;
    try {
      // Contrato: { error: { code, message, details? } } (message já vem pronta para exibir).
      const j = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } | string; message?: string; details?: unknown };
      if (j.error && typeof j.error === "object") {
        msg = j.error.message ?? msg;
        details = j.error.details;
      } else {
        msg = j.message ?? (typeof j.error === "string" ? j.error : msg);
        details = j.details;
      }
    } catch {
      /* corpo vazio */
    }
    throw new ApiError(res.status, msg, details);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Baixa um arquivo protegido (PDF) e devolve uma URL de objeto para o visualizador. */
export async function fetchFileUrl(path: string, demoFallback: string): Promise<string> {
  if (IS_DEMO) return demoFallback;
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, "Não foi possível abrir o arquivo.");
  return URL.createObjectURL(await res.blob());
}

export const http = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
}
