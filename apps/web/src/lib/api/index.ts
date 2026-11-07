import { http, qs, fetchFileUrl, IS_DEMO } from "./client";
import { realApi } from "./real";
import type {
  ActionId,
  ActionResult,
  AuthResponse,
  Birthday,
  BroadcastFilter,
  BroadcastPreview,
  ClientAction,
  ClientDetail,
  ClientListItem,
  CreateFromPdfInput,
  CreateLeadInput,
  CreateQuoteInput,
  DashboardCharts,
  DashboardSummary,
  ExpiringPolicy,
  ExpiringFilter,
  Claim,
  ClaimInput,
  ClaimsQuery,
  Installment,
  InstallmentsDue,
  Insurer,
  InsurerCredential,
  Lead,
  Message,
  MessageRule,
  MessageTemplate,
  CreateTemplateInput,
  ProfileUpdate,
  ImportEstado,
  AttachTipo,
  ClientInput,
  DocumentFile,
  PolicyInput,
  InviteInput,
  InviteResult,
  Perfil,
  ImportJob,
  PdfBatchStats,
  BroadcastSource,
  Paginated,
  ParseResult,
  Policy,
  Quote,
  RobotSession,
  SaveCredentialInput,
  TestConnectionResult,
  TimelineEvent,
  User,
  WhatsappInstance,
  BroadcastOptions,
  BroadcastResult,
  MessageAttachment,
  MessagingPacing,
} from "../types";

export { IS_DEMO, ApiError, tokenStore } from "./client";

export interface ClientsQuery {
  q?: string;
  status?: string;
  ramo?: string;
  seguradora?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Modo demonstração: dados fictícios em memória (./demo.ts), mesmas assinaturas da API real. */
const demoApi = {
  auth: {
    login: (email: string, senha: string) => http.post<AuthResponse>("/auth/login", { email, senha }),
    refresh: () => http.post<Omit<AuthResponse, "user"> & { user?: User }>("/auth/refresh"),
    me: () => http.get<User>("/auth/me"),
    logout: () => http.post<{ ok: boolean }>("/auth/logout"),
    updateProfile: (data: ProfileUpdate) => http.patch<User>("/auth/me", data),
    forgotPassword: (email: string) => http.post<{ ok: boolean }>("/auth/forgot-password", { email }),
    resetPassword: (token: string, senha: string) => http.post<{ ok: boolean }>("/auth/reset-password", { token, senha }),
  },
  equipe: {
    list: () => http.get<User[]>("/users"),
    invite: (data: InviteInput) => http.post<InviteResult>("/users/invite", data),
    update: (id: string, data: { perfil?: Perfil; ativo?: boolean }) => http.patch<User>(`/users/${id}`, data),
    remove: (id: string) => http.del<User>(`/users/${id}`),
  },
  importacao: {
    estado: () => http.get<ImportEstado>("/import/estado"),
    /** Um lote por requisição: .zip(s) com a pasta base/seguradora e/ou PDFs soltos. */
    pdfs: (files: File[]) => {
      const fd = new FormData();
      for (const f of files) fd.append("arquivos", f, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
      return http.post<PdfBatchStats>("/import/pdfs", fd);
    },
    carteira: (clients: File, policies: File, dryRun: boolean) => {
      const fd = new FormData();
      fd.append("dryRun", String(dryRun));
      fd.append("clients", clients, "clients.json");
      fd.append("policies", policies, "policies.json");
      return http.post<{ jobId: string; total: number; dryRun: boolean }>("/import/carteira", fd);
    },
    job: (id: string) => http.get<ImportJob>(`/import/carteira/${id}`),
    /** Apaga todos os clientes e PDFs importados (ADMIN). */
    limpar: (confirmacao: string) =>
      http.post<{ clientes: number; apolices: number; documentos: number; pastasRemovidas: number }>("/import/limpar", { confirmacao }),
  },
  claims: {
    list: async (q: ClaimsQuery): Promise<Paginated<Claim>> => {
      const r = await http.get<{ data: Claim[]; total: number; page: number; pageSize: number }>(`/claims${qs({ ...q })}`);
      return { items: r.data, total: r.total, page: r.page, pageSize: r.pageSize };
    },
    create: (data: ClaimInput) => http.post<Claim>("/claims", data),
    update: (id: string, data: Partial<Omit<ClaimInput, "clientId">>) => http.patch<Claim>(`/claims/${id}`, data),
    remove: (id: string) => http.del<void>(`/claims/${id}`),
  },
  dashboard: {
    summary: () => http.get<DashboardSummary>("/dashboard/summary"),
    expiring: (f: ExpiringFilter) => http.get<ExpiringPolicy[]>(`/dashboard/expiring${qs({ ...f })}`),
    installmentsDue: () => http.get<InstallmentsDue>("/dashboard/installments-due"),
    charts: () => http.get<DashboardCharts>("/dashboard/charts"),
    birthdays: () => http.get<Birthday[]>("/dashboard/birthdays"),
  },
  clients: {
    list: (q: ClientsQuery) => http.get<Paginated<ClientListItem>>(`/clients${qs({ ...q })}`),
    get: (id: string) => http.get<ClientDetail>(`/clients/${id}`),
    update: (id: string, data: Partial<ClientDetail>) => http.patch<ClientDetail>(`/clients/${id}`, data),
    timeline: (id: string) => http.get<TimelineEvent[]>(`/clients/${id}/timeline`),
    messages: (id: string) => http.get<Message[]>(`/messaging/history/client/${id}`),
    actions: (id: string) => http.get<ClientAction[]>(`/clients/${id}/actions`),
    runAction: (id: string, acao: ActionId, policyId: string) => http.post<ActionResult>(`/clients/${id}/actions/${acao}`, { policyId }),
    fromPdf: (input: CreateFromPdfInput) => http.post<{ clientId: string; criado: boolean }>("/clients/from-pdf", input),
    create: (data: ClientInput) => http.post<ClientDetail>("/clients", data),
    edit: (id: string, data: ClientInput) => http.patch<ClientDetail>(`/clients/${id}`, data),
  },
  documents: {
    parse: (file: File) => http.post<ParseResult>("/documents/parse", { fileName: file.name }),
    fileUrl: (id: string) => fetchFileUrl(`/documents/${id}/file`, "/demo/apolice-demo.pdf"),
    /** Anexa arquivos ao cliente sem o leitor de PDF. */
    attach: (clientId: string, files: File[], tipo: AttachTipo, policyId?: string | null) => {
      const fd = new FormData();
      fd.append("tipo", tipo);
      if (policyId) fd.append("policyId", policyId);
      for (const f of files) fd.append("arquivos", f, f.name);
      return http.post<DocumentFile[]>(`/clients/${clientId}/documents`, fd);
    },
  },
  policies: {
    list: (clientId?: string) => http.get<Policy[]>(`/policies${qs({ clientId })}`),
    create: (data: PolicyInput) => http.post<Policy>("/policies", data),
    update: (id: string, data: PolicyInput) => http.patch<Policy>(`/policies/${id}`, data),
  },
  installments: { list: (status?: string) => http.get<Installment[]>(`/installments${qs({ status })}`) },
  insurers: {
    list: () => http.get<Insurer[]>("/insurers"),
    get: (id: string) => http.get<Insurer>(`/insurers/${id}`),
    credentials: (id: string) => http.get<InsurerCredential[]>(`/insurers/${id}/credentials`),
    saveCredential: (id: string, data: SaveCredentialInput) => http.put<{ ok: boolean }>(`/insurers/${id}/credentials`, data),
    test: (id: string) => http.post<TestConnectionResult>(`/insurers/${id}/test`),
    robotSession: (id: string) => http.get<RobotSession>(`/insurers/${id}/robot-session`),
    renewRobotSession: (id: string) => http.post<RobotSession>(`/insurers/${id}/robot-session/renew`),
  },
  messaging: {
    instance: () => http.get<WhatsappInstance>("/messaging/instance"),
    connect: () => http.post<WhatsappInstance>("/messaging/instance/connect"),
    confirmDemo: () => http.post<WhatsappInstance>("/messaging/instance/confirm-demo"),
    disconnect: () => http.post<WhatsappInstance>("/messaging/instance/logout"),
    updateInstance: (data: Partial<WhatsappInstance>) => http.patch<WhatsappInstance>("/messaging/instance", data),
    templates: () => http.get<MessageTemplate[]>("/messaging/templates"),
    createTemplate: (data: CreateTemplateInput) => http.post<MessageTemplate>("/messaging/templates", data),
    rules: () => http.get<MessageRule[]>("/messaging/rules"),
    updateRule: (id: string, data: Partial<MessageRule>) => http.patch<MessageRule>(`/messaging/rules/${id}`, data),
    broadcastPreview: (filtro: BroadcastFilter, source: BroadcastSource, opts: BroadcastOptions = {}) => http.post<BroadcastPreview>("/messaging/broadcast/preview", { filtro, ...source, ...opts }),
    broadcast: (filtro: BroadcastFilter, source: BroadcastSource, opts: BroadcastOptions = {}) => http.post<BroadcastResult>("/messaging/broadcast", { filtro, ...source, ...opts }),
    pacing: () => http.get<MessagingPacing>("/messaging/settings"),
    updatePacing: (data: Partial<MessagingPacing>) => http.patch<MessagingPacing>("/messaging/settings", data),
    /** Sobe um anexo (até 10 MB) para o envio avulso ou o disparo em massa. */
    uploadAttachment: (file: File, clientId?: string) => {
      const fd = new FormData();
      if (clientId) fd.append("clientId", clientId);
      fd.append("arquivo", file, file.name);
      return http.post<MessageAttachment>("/messaging/attachments", fd);
    },
    history: () => http.get<Message[]>("/messaging/history"),
    queue: () => http.get<Message[]>("/messaging/queue"),
    send: (clientId: string, texto: string, anexo?: string) => http.post<{ ok: boolean }>("/messaging/send", { clientId, texto, anexo }),
  },
  leads: {
    list: () => http.get<Lead[]>("/leads"),
    create: (data: CreateLeadInput) => http.post<Lead>("/leads", data),
    submitSite: (data: CreateLeadInput) => http.post<Lead>("/leads", data).then(() => ({ ok: true })),
    update: (id: string, data: Partial<Lead>) => http.patch<Lead>(`/leads/${id}`, data),
    convert: (id: string) => http.post<{ clientId: string }>(`/leads/${id}/convert`),
  },
  quotes: {
    list: () => http.get<Quote[]>("/quotes"),
    get: (id: string) => http.get<Quote>(`/quotes/${id}`),
    create: (data: CreateQuoteInput) => http.post<Quote>("/quotes", data),
    send: (id: string) => http.post<{ ok: boolean }>(`/quotes/${id}/send`),
  },
};

export type Api = typeof demoApi;
/** API usada pelas telas: real (NEXT_PUBLIC_DEMO !== "1") ou demonstração. */
export const api: Api = IS_DEMO ? demoApi : realApi;
