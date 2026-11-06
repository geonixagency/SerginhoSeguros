// Cliente da Evolution API v2 (WhatsApp). Só o backend fala com a Evolution;
// a chave (EVOLUTION_API_KEY) nunca vai ao frontend.
// Com EVOLUTION_MOCK=true (ou sem EVOLUTION_URL em dev) as chamadas são simuladas.
import { env } from "../../config/env";
import { HttpClient } from "../../connectors/http";
import { unavailable } from "../../lib/errors";

export type InstanceState = "open" | "close" | "connecting" | "unconfigured" | "unknown";

export interface EvolutionApi {
  readonly mock: boolean;
  readonly configured: boolean;
  connectionState(): Promise<InstanceState>;
  connect(): Promise<{ state: InstanceState; qrcode: string | null; pairingCode: string | null }>;
  logout(): Promise<void>;
  sendText(numero: string, texto: string): Promise<{ id: string | null }>;
  sendDocument(numero: string, pdf: Buffer, fileName: string, legenda: string): Promise<{ id: string | null }>;
}

/** Número no formato que a Evolution espera: 55 + DDD + número, só dígitos. */
export function toWhatsappNumber(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

interface Opts {
  baseUrl: string;
  apiKey: string;
  instance: string;
  fetchImpl?: typeof fetch;
}

export class EvolutionClient implements EvolutionApi {
  readonly mock = false;
  readonly configured = true;
  private http: HttpClient;

  constructor(private readonly o: Opts) {
    // Retry curto: mensagens têm retry próprio na fila (BullMQ).
    this.http = new HttpClient({ baseUrl: o.baseUrl, rps: 5, retries: 1, timeoutMs: 30_000, headers: { apikey: o.apiKey }, fetchImpl: o.fetchImpl });
  }

  private get inst() {
    return encodeURIComponent(this.o.instance);
  }

  async connectionState(): Promise<InstanceState> {
    const res = await this.http.raw({ path: `/instance/connectionState/${this.inst}` });
    if (res.status === 404) return "close"; // instância ainda não criada
    if (!res.ok) throw unavailable(`Evolution respondeu ${res.status}`);
    const body = (await res.json()) as { instance?: { state?: string }; state?: string };
    const st = body.instance?.state ?? body.state;
    return st === "open" || st === "close" || st === "connecting" ? st : "unknown";
  }

  private async ensureInstance() {
    const res = await this.http.raw({ path: `/instance/connectionState/${this.inst}` });
    if (res.status !== 404) return;
    await this.http.json({
      method: "POST",
      path: "/instance/create",
      body: { instanceName: this.o.instance, qrcode: true, integration: "WHATSAPP-BAILEYS" },
    });
  }

  async connect() {
    await this.ensureInstance();
    const body = await this.http.json<{ base64?: string; code?: string; pairingCode?: string | null; instance?: { state?: string } }>({
      path: `/instance/connect/${this.inst}`,
    });
    if (body.instance?.state === "open") return { state: "open" as const, qrcode: null, pairingCode: null };
    const qr = body.base64 ? (body.base64.startsWith("data:") ? body.base64 : `data:image/png;base64,${body.base64}`) : null;
    return { state: "connecting" as const, qrcode: qr, pairingCode: body.pairingCode ?? null };
  }

  async logout() {
    const res = await this.http.raw({ method: "DELETE", path: `/instance/logout/${this.inst}` });
    if (!res.ok && res.status !== 404) throw unavailable(`Evolution respondeu ${res.status} ao desconectar`);
  }

  async sendText(numero: string, texto: string) {
    const body = await this.http.json<{ key?: { id?: string } }>({
      method: "POST",
      path: `/message/sendText/${this.inst}`,
      body: { number: toWhatsappNumber(numero), text: texto },
    });
    return { id: body.key?.id ?? null };
  }

  async sendDocument(numero: string, pdf: Buffer, fileName: string, legenda: string) {
    const body = await this.http.json<{ key?: { id?: string } }>({
      method: "POST",
      path: `/message/sendMedia/${this.inst}`,
      body: {
        number: toWhatsappNumber(numero),
        mediatype: "document",
        mimetype: "application/pdf",
        media: pdf.toString("base64"),
        fileName,
        caption: legenda,
      },
    });
    return { id: body.key?.id ?? null };
  }
}

/** Simulação para dev/demo/testes: não sai nada para a rede. */
export class MockEvolution implements EvolutionApi {
  readonly mock = true;
  readonly configured = true;
  state: InstanceState = "close";
  sent: Array<{ numero: string; texto: string; anexo?: string }> = [];

  async connectionState() {
    return this.state;
  }
  async connect() {
    this.state = "open"; // na simulação, "escanear" é instantâneo
    // QR 1x1 transparente apenas para o frontend ter o que renderizar.
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    return { state: "connecting" as const, qrcode: `data:image/png;base64,${png}`, pairingCode: "MOCK-1234" };
  }
  async logout() {
    this.state = "close";
  }
  async sendText(numero: string, texto: string) {
    this.sent.push({ numero: toWhatsappNumber(numero), texto });
    return { id: `mock-${this.sent.length}` };
  }
  async sendDocument(numero: string, _pdf: Buffer, fileName: string, legenda: string) {
    this.sent.push({ numero: toWhatsappNumber(numero), texto: legenda, anexo: fileName });
    return { id: `mock-${this.sent.length}` };
  }
}

class UnconfiguredEvolution implements EvolutionApi {
  readonly mock = false;
  readonly configured = false;
  async connectionState(): Promise<InstanceState> {
    return "unconfigured";
  }
  private fail(): never {
    throw unavailable("WhatsApp não configurado: defina EVOLUTION_URL e EVOLUTION_API_KEY");
  }
  async connect(): Promise<never> {
    this.fail();
  }
  async logout(): Promise<never> {
    this.fail();
  }
  async sendText(): Promise<never> {
    this.fail();
  }
  async sendDocument(): Promise<never> {
    this.fail();
  }
}

let instance: EvolutionApi | null = null;

export function getEvolution(): EvolutionApi {
  if (instance) return instance;
  if (env.EVOLUTION_MOCK) instance = new MockEvolution();
  else if (env.EVOLUTION_URL && env.EVOLUTION_API_KEY)
    instance = new EvolutionClient({ baseUrl: env.EVOLUTION_URL, apiKey: env.EVOLUTION_API_KEY, instance: env.EVOLUTION_INSTANCE });
  else instance = new UnconfiguredEvolution();
  return instance;
}

/** Para testes. */
export function setEvolution(e: EvolutionApi | null) {
  instance = e;
}
