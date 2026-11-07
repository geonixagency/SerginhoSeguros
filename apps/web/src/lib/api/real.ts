/**
 * Adaptador da API REAL (contrato em app/docs/API.md, DTOs em @ss/shared) para os
 * view-models das telas (lib/types.ts). Só é usado com NEXT_PUBLIC_DEMO !== "1".
 *
 * Convenções da API: listas paginadas em { data, total, ... }, dinheiro em string
 * decimal, datas de calendário "aaaa-mm-dd", ramo em texto livre minúsculo.
 */
import type {
  BirthdayDTO,
  BroadcastResponse,
  ClientActionDTO,
  ClientActionResultDTO,
  ClientDetailDTO,
  DocumentDTO,
  ClientListItemDTO,
  DashboardChartsDTO,
  DashboardSummaryDTO,
  ExpiringPolicyDTO,
  FromPdfResponse,
  InstallmentDTO,
  InstallmentWithContextDTO,
  InsurerDTO,
  LeadDTO,
  LoginResponse,
  MessageDTO,
  MessageRuleDTO,
  MessageTemplateDTO,
  MessagingConnectDTO,
  MessagingInstanceDTO,
  MessagingInstanceStatusDTO,
  MessagingQueueDTO,
  MessagingSettingsDTO,
  Paginated as ApiPage,
  ParsedPolicyDTO,
  PolicyDetailDTO,
  PolicyListItemDTO,
  QuoteDTO,
  QuoteSendResponse,
  TimelineEventDTO,
  UserDTO,
} from "@ss/shared";
import { http, qs, fetchFileUrl } from "./client";
import type {
  PortalAccess,
  PatchCredentialInput,
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
  DocumentFile,
  Endereco,
  ExpiringPolicy,
  ExpiringFilter,
  Claim,
  ClaimInput,
  ClaimsQuery,
  Installment,
  InstallmentsDue,
  Insurer,
  InsurerCredential,
  IntegrationStatus,
  Lead,
  LeadOrigem,
  Message,
  MessageRule,
  MessageStatus,
  MessageTemplate,
  CreateTemplateInput,
  ProfileUpdate,
  ImportEstado,
  AttachTipo,
  ClientInput,
  PolicyInput,
  InviteInput,
  InviteResult,
  Perfil,
  ImportJob,
  PdfBatchStats,
  BroadcastSource,
  Paginated,
  ParseResult,
  ParsedField,
  Policy,
  Quote,
  QuoteResult,
  Ramo,
  SaveCredentialInput,
  RobotSession,
  TestConnectionResult,
  TimelineEvent,
  TimelineType,
  User,
  WhatsappInstance,
  BroadcastOptions,
  BroadcastResult,
  MessageAttachment,
  MessagingPacing,
} from "../types";
import type { ClientsQuery } from "./index";

/* ---------------------------------------------------------------- helpers */
const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? 0 : Number(v));
const unwrap = <T,>(r: T[] | { data: T[] }): T[] => (Array.isArray(r) ? r : r.data);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // aaaa-mm-dd

/** Ramo da API (texto livre) → família usada nas telas (ícone, rótulo, gráficos). */
export function toRamo(r: string | null | undefined): Ramo {
  const s = (r ?? "").toLowerCase();
  if (/auto|moto|frota|carro|caminh/.test(s)) return "AUTO";
  if (/vida|acident|prestamista|previd|funeral|odonto|saude/.test(s)) return "VIDA";
  if (/resid|condom|casa/.test(s)) return "RESIDENCIAL";
  if (/consorc/.test(s)) return "CONSORCIO";
  if (/imob|fianca|aluguel/.test(s)) return "IMOBILIARIO";
  return "EMPRESARIAL"; // empresarial, rc, garantia, agro, celular...
}
/** Ramo das telas → valor aceito pela API (filtros e cotação). */
const RAMO_API: Record<Ramo, string> = {
  AUTO: "auto",
  VIDA: "vida",
  RESIDENCIAL: "residencial",
  EMPRESARIAL: "empresarial",
  IMOBILIARIO: "imobiliario",
  CONSORCIO: "consorcio",
};

const PALETTE = ["#1d4f91", "#0a7a5a", "#d81e05", "#4b2c83", "#0072bc", "#b7840f", "#0f6e3a", "#7a1f5c", "#2f5d62", "#8c640b"];
function colorFor(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function endereco(e: ClientDetailDTO["endereco"]): Endereco | null {
  if (!e) return null;
  return { logradouro: e.logradouro ?? "", numero: e.numero ?? "", complemento: e.complemento ?? undefined, bairro: e.bairro ?? "", cidade: e.cidade ?? "", uf: e.uf ?? "", cep: e.cep ?? "" };
}

function policy(p: PolicyDetailDTO | PolicyListItemDTO, client: { id: string; nome: string }): Policy {
  const it = "itens" in p ? p.itens[0] : undefined;
  const placa = it?.placa ?? ("placas" in p ? p.placas[0] : undefined);
  return {
    id: p.id,
    clientId: client.id,
    clientNome: client.nome,
    insurerId: p.insurer.id,
    seguradora: p.insurer.nome,
    ramo: toRamo(p.ramo),
    numero: p.numero ?? p.proposta ?? "—",
    proposta: p.proposta ?? "",
    emissao: p.emissao ?? p.inicioVigencia ?? p.createdAt,
    inicioVigencia: p.inicioVigencia ?? "",
    fimVigencia: p.fimVigencia ?? "",
    premioTotal: num(p.premioTotal),
    formaPagamento: p.formaPagamento,
    status: p.status === "EM_EMISSAO" ? "VIGENTE" : p.status,
    item: it || placa
      ? {
          tipo: it?.tipo === "IMOVEL" ? "IMOVEL" : it?.tipo === "PESSOA" ? "PESSOA" : "VEICULO",
          descricao: it?.descricao ?? it?.modelo ?? placa ?? "",
          placa: placa ?? undefined,
          modelo: it?.modelo ?? undefined,
          ano: it?.ano ? Number(String(it.ano).slice(0, 4)) || undefined : undefined,
          chassi: it?.chassi ?? undefined,
          endereco: it?.endereco ?? undefined,
        }
      : null,
    documentId: p.documentId,
  };
}

/** Formulário manual -> corpo aceito pela API. Campos vazios viram null. */
function clientBody(d: ClientInput) {
  const e = d.endereco;
  const temEndereco = !!e && Object.values(e).some((v) => v && String(v).trim());
  return {
    nome: d.nome.trim(),
    cpfCnpj: d.cpfCnpj,
    nascimento: d.nascimento || null,
    cnh: d.cnh?.trim() || null,
    telefone: d.telefone?.trim() || null,
    email: d.email?.trim() || null,
    endereco: temEndereco && e ? { ...e, complemento: e.complemento || null, uf: e.uf?.trim() ? e.uf.trim().toUpperCase() : null } : null,
    ...(d.optOut !== undefined ? { optOut: d.optOut } : {}),
  };
}
function policyBody(d: PolicyInput) {
  const it = d.item;
  return {
    insurerId: d.insurerId,
    ramo: RAMO_API[d.ramo],
    numero: d.numero?.trim() || null,
    proposta: d.proposta?.trim() || null,
    inicioVigencia: d.inicioVigencia || null,
    fimVigencia: d.fimVigencia || null,
    premioTotal: d.premioTotal,
    formaPagamento: d.formaPagamento,
    status: d.status,
    itens: it && (it.placa || it.modelo) ? [{ tipo: d.ramo === "AUTO" ? "VEICULO" : "OUTRO", placa: it.placa || null, modelo: it.modelo || null, ano: it.ano || null }] : [],
    parcelas: d.parcelas.map((p) => ({ numero: p.numero, valor: p.valor, vencimento: p.vencimento, status: p.status })),
  };
}

function installmentCtx(i: InstallmentWithContextDTO): Installment {
  return {
    id: i.id,
    policyId: i.policyId,
    apoliceNumero: i.policy.numero ?? "—",
    clientId: i.client.id,
    clientNome: i.client.nome,
    telefone: i.client.telefone ?? "",
    seguradora: i.policy.insurer.nome,
    numero: i.numero,
    total: 0,
    valor: num(i.valor),
    vencimento: i.vencimento,
    status: i.status,
    formaPagamento: i.policy.formaPagamento,
  };
}

function installmentOf(i: InstallmentDTO, p: PolicyDetailDTO, c: ClientDetailDTO): Installment {
  return {
    id: i.id,
    policyId: p.id,
    apoliceNumero: p.numero ?? "—",
    clientId: c.id,
    clientNome: c.nome,
    telefone: c.telefone ?? "",
    seguradora: p.insurer.nome,
    numero: i.numero,
    total: p.parcelas.length,
    valor: num(i.valor),
    vencimento: i.vencimento,
    status: i.status,
    formaPagamento: p.formaPagamento,
  };
}

function listItem(c: ClientListItemDTO): ClientListItem {
  return {
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpfCnpj,
    nascimento: null,
    telefone: c.telefone ?? "",
    email: c.email,
    endereco: null,
    status: c.status,
    origem: "",
    optOut: c.optOut,
    criadoEm: c.createdAt,
    apolicesVigentes: c.totalApolices,
    seguradoras: c.seguradoras,
    ramos: [],
    placas: [],
    proximoVencimento: c.proximoVencimento,
    premioTotal: 0,
  };
}

function clientDetail(c: ClientDetailDTO): ClientDetail {
  const ref = { id: c.id, nome: c.nome };
  const apolices = c.apolices.map((p) => policy(p, ref));
  const vig = c.apolices.filter((p) => p.status === "VIGENTE" || p.status === "EM_EMISSAO");
  const proximo = vig.map((p) => p.fimVigencia).filter((d): d is string => !!d && d >= today()).sort()[0] ?? null;
  return {
    id: c.id,
    nome: c.nome,
    cpfCnpj: c.cpfCnpj,
    nascimento: c.nascimento,
    cnh: c.cnh,
    telefone: c.telefone ?? "",
    email: c.email,
    endereco: endereco(c.endereco),
    status: c.status,
    origem: c.origem ?? "",
    optOut: c.optOut,
    criadoEm: c.createdAt,
    apolicesVigentes: vig.length,
    seguradoras: [...new Set(c.apolices.map((p) => p.insurer.nome))],
    ramos: [...new Set(c.apolices.map((p) => toRamo(p.ramo)))],
    placas: [...new Set(c.apolices.flatMap((p) => p.itens.map((i) => i.placa).filter((x): x is string => !!x)))],
    proximoVencimento: proximo,
    premioTotal: vig.reduce((s, p) => s + num(p.premioTotal), 0),
    apolices,
    parcelas: c.apolices.flatMap((p) => p.parcelas.map((i) => installmentOf(i, p, c))).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    documentos: c.documentos.map(
      (d): DocumentFile => ({ id: d.id, clientId: c.id, policyId: d.policyId, tipo: d.tipo, nome: d.nomeArquivo, tamanho: d.tamanho, criadoEm: d.createdAt, mimeType: d.mimeType }),
    ),
  };
}

const MSG_STATUS: Record<MessageDTO["status"], MessageStatus> = {
  AGENDADA: "NA_FILA",
  ENVIANDO: "ENVIANDO",
  ENVIADA: "ENVIADA",
  FALHOU: "FALHOU",
  CANCELADA: "CANCELADA",
  IGNORADA: "CANCELADA",
};
function message(m: MessageDTO): Message {
  return {
    id: m.id,
    clientId: m.clientId ?? "",
    clientNome: m.clientNome ?? "Contato sem cadastro",
    telefone: m.telefone,
    regra: m.ruleNome ?? (m.broadcastId ? "Disparo em massa" : "Mensagem avulsa"),
    texto: m.conteudo,
    anexo: m.anexoDocumentId ? "Anexo (PDF)" : null,
    status: MSG_STATUS[m.status],
    criadoEm: m.createdAt,
    agendadoPara: m.agendadaPara,
    enviadoEm: m.enviadaEm,
    erro: m.erro,
  };
}

const TL: Record<TimelineEventDTO["tipo"], TimelineType> = {
  CLIENTE_CRIADO: "CADASTRO",
  APOLICE_INICIO: "APOLICE",
  APOLICE_FIM: "APOLICE",
  PARCELA_VENCIMENTO: "ALERTA",
  PARCELA_PAGA: "PAGAMENTO",
  DOCUMENTO: "DOCUMENTO",
  MENSAGEM: "MENSAGEM",
  AUDITORIA: "ACAO",
  TAREFA: "ACAO",
};

const INTEG: Record<InsurerDTO["statusIntegracao"], IntegrationStatus> = {
  OK: "CONECTADA",
  ERRO: "ERRO",
  CONFIGURADA: "NAO_CONFIGURADA",
  NAO_CONFIGURADA: "NAO_CONFIGURADA",
  SEM_API: "MANUAL",
};
function insurer(i: InsurerDTO): Insurer {
  return {
    id: i.id,
    nome: i.nome,
    slug: i.slug,
    ramos: [...new Set(i.ramos.map(toRamo))],
    portalUrl: i.portalUrl ?? "",
    temApi: i.temApi,
    canal: i.canal,
    statusIntegracao: INTEG[i.statusIntegracao],
    capacidades: i.capacidades,
    clientes: null,
    apolices: i.totalApolices ?? 0,
    ultimoTeste: i.credencial?.ultimoTeste ?? null,
    cor: colorFor(i.slug),
  };
}

const ACTION_IN: Record<string, ActionId | undefined> = {
  "segunda-via-boleto": "BOLETO_2VIA",
  "status-apolice": "STATUS_APOLICE",
  "sincronizar-parcelas": "STATUS_PARCELAS",
  sinistros: "SINISTROS",
};
const ACTION_OUT: Record<ActionId, string> = {
  BOLETO_2VIA: "segunda-via-boleto",
  STATUS_APOLICE: "status-apolice",
  STATUS_PARCELAS: "sincronizar-parcelas",
  SINISTROS: "sinistros",
};
const ACTION_DESC: Record<ActionId, string> = {
  BOLETO_2VIA: "Baixa o PDF do boleto da parcela em aberto.",
  STATUS_APOLICE: "Consulta a situação da apólice na seguradora.",
  STATUS_PARCELAS: "Atualiza o status de pagamento das parcelas.",
  SINISTROS: "Lista os sinistros abertos na apólice.",
};

const ORIGENS: LeadOrigem[] = ["site", "whatsapp", "indicacao", "instagram", "telefone"];
function lead(l: LeadDTO): Lead {
  const o = (l.origem ?? "").toLowerCase();
  return {
    id: l.id,
    nome: l.nome,
    telefone: l.telefone ?? "",
    email: l.email,
    produto: toRamo(l.produto),
    origem: (ORIGENS.find((x) => o.includes(x)) ?? "telefone") as LeadOrigem,
    etapa: l.etapa,
    responsavel: l.responsavel?.nome ?? null,
    proximoContato: l.proximoContato,
    notas: l.notas ?? "",
    valorEstimado: l.valorEstimado === null ? null : num(l.valorEstimado),
    criadoEm: l.createdAt,
    clientId: l.clientId,
  };
}

function quote(q: QuoteDTO, nomes: Map<string, string>): Quote {
  const d = q.dados as { nome?: string; veiculo?: { modelo?: string; placa?: string; ano?: number }; observacoes?: string };
  const sorted = [...q.resultados].filter((r) => r.premio > 0).sort((a, b) => a.premio - b.premio);
  const resultados: QuoteResult[] = sorted.map((r, i) => ({
    seguradora: r.seguradora,
    premio: r.premio,
    parcelas: r.parcelas ?? r.produto ?? "",
    franquia: r.franquia ?? null,
    coberturas: r.coberturas ?? [],
    destaque: i === 0 ? "melhor_preco" : null,
  }));
  const veic = [d.veiculo?.modelo, d.veiculo?.ano, d.veiculo?.placa].filter(Boolean).join(" · ");
  return {
    id: q.id,
    leadId: q.leadId,
    clientId: q.clientId,
    nome: d.nome ?? nomes.get(q.leadId ?? q.clientId ?? "") ?? "Cotação",
    ramo: toRamo(q.ramo),
    status: q.status,
    aggilizadorId: q.aggilizadorId,
    criadoEm: q.createdAt,
    descricao: q.status === "ERRO" ? (q.erro ?? "Falha na cotação") : veic || d.observacoes || "",
    resultados,
  };
}

/* ---------------------------------------------------------------- PDF */
// O parse não grava nada: guardamos o arquivo e a leitura até o "salvar" (from-pdf).
const pendingPdf = new Map<string, { file: File; dto: ParsedPolicyDTO }>();
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const isoDate = (v: string | undefined) => {
  const s = (v ?? "").trim();
  const m = BR_DATE.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const brDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : (v ?? ""));
const money = (v: string | undefined) => {
  const s = (v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

function parseResult(dto: ParsedPolicyDTO, file: File, ms: number): ParseResult {
  const campos: ParsedField[] = [];
  const add = (chave: string, rotulo: string, f: { valor: string | number | null; confianca: number } | undefined, grupo: ParsedField["grupo"], fmt?: (v: string) => string) => {
    if (!f) return;
    const raw = f.valor === null || f.valor === undefined ? "" : String(f.valor);
    campos.push({ chave, rotulo, valor: fmt ? fmt(raw) : raw, confianca: raw ? f.confianca : 0, grupo });
  };
  const c = dto.cliente;
  add("nome", "Nome do segurado", c.nome, "cliente");
  add("cpfCnpj", "CPF/CNPJ", c.cpfCnpj, "cliente");
  add("nascimento", "Data de nascimento", c.nascimento, "cliente", brDate);
  add("telefone", "Telefone", c.telefone, "cliente");
  add("email", "E-mail", c.email, "cliente");
  add("cep", "CEP", c.cep, "cliente");
  add("endereco", "Endereço", c.endereco, "cliente");
  const a = dto.apolice;
  add("seguradora", "Seguradora", { valor: dto.seguradora.valor, confianca: dto.seguradora.insurerId ? dto.seguradora.confianca : 0 }, "apolice");
  add("numero", "Nº da apólice", a.numero, "apolice");
  add("proposta", "Nº da proposta", a.proposta, "apolice");
  add("emissao", "Emissão", a.emissao, "apolice", brDate);
  add("inicioVigencia", "Início de vigência", a.inicioVigencia, "apolice", brDate);
  add("fimVigencia", "Fim de vigência", a.fimVigencia, "apolice", brDate);
  add("premioTotal", "Prêmio total", { valor: a.premioTotal.valor, confianca: a.premioTotal.confianca }, "apolice", (v) => (v ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : ""));
  const it = dto.itens[0];
  if (it) {
    add("placa", "Placa", { valor: it.placa, confianca: it.confianca }, "item");
    add("modelo", "Veículo", { valor: it.modelo, confianca: it.confianca }, "item");
    add("ano", "Ano/modelo", { valor: it.ano, confianca: it.confianca }, "item");
    add("chassi", "Chassi", { valor: it.chassi, confianca: it.confianca }, "item");
  }
  add("formaPagamento", "Forma de pagamento", a.formaPagamento, "pagamento");
  if (dto.parcelas.length) {
    const p1 = dto.parcelas[0]!;
    campos.push({ chave: "parcelas", rotulo: "Parcelas", valor: String(dto.parcelas.length), confianca: p1.confianca, grupo: "pagamento" });
    campos.push({ chave: "vencimento1", rotulo: "1º vencimento", valor: brDate(p1.vencimento), confianca: p1.vencimento ? p1.confianca : 0, grupo: "pagamento" });
  }
  pendingPdf.set(dto.hash, { file, dto });
  return {
    documentId: dto.hash,
    arquivo: file.name,
    paginas: dto.paginas,
    seguradora: dto.seguradora.valor,
    ramo: dto.ramo.valor ? toRamo(dto.ramo.valor) : null,
    campos,
    clienteExistente: dto.clienteExistente,
    duracaoMs: ms,
  };
}

async function fromPdf(input: CreateFromPdfInput): Promise<{ clientId: string; criado: boolean }> {
  const pend = pendingPdf.get(input.documentId);
  if (!pend) throw new Error("Leia o PDF novamente antes de salvar.");
  const { dto, file } = pend;
  const v = input.campos;
  const s = (k: string) => (v[k] ?? "").trim() || null;
  const forma = dto.apolice.formaPagamento.valor ?? "OUTRO";
  // Seguradora: a lida no PDF, ou a digitada na revisão (casada pelo nome no catálogo).
  let insurerId = dto.seguradora.insurerId;
  const nomeSeg = s("seguradora");
  if (nomeSeg && (!insurerId || nomeSeg !== dto.seguradora.valor)) {
    const norm = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/seguros?|s\.?a\.?/g, "").trim();
    const all = unwrap(await http.get<InsurerDTO[] | { data: InsurerDTO[] }>("/insurers"));
    const n = norm(nomeSeg);
    insurerId = all.find((i) => norm(i.nome) === n || i.slug === n)?.id ?? all.find((i) => norm(i.nome).includes(n) || n.includes(norm(i.nome)))?.id ?? null;
  }
  const cep = s("cep");
  const data = {
    cliente: {
      nome: s("nome") ?? "",
      cpfCnpj: s("cpfCnpj") ?? "",
      nascimento: isoDate(v.nascimento),
      telefone: s("telefone"),
      email: s("email"),
      endereco: s("endereco") || cep ? { logradouro: s("endereco"), cep } : null,
      origem: "PDF",
    },
    apolice: {
      insurerId: insurerId ?? "",
      ramo: dto.ramo.valor ?? "auto",
      numero: s("numero"),
      proposta: s("proposta"),
      emissao: isoDate(v.emissao),
      inicioVigencia: isoDate(v.inicioVigencia),
      fimVigencia: isoDate(v.fimVigencia),
      premioTotal: money(v.premioTotal),
      formaPagamento: forma,
      status: "VIGENTE",
    },
    parcelas: dto.parcelas
      .filter((p) => p.vencimento)
      .map((p) => ({ numero: p.numero, valor: p.valor, vencimento: p.vencimento!, status: "PENDENTE" })),
    itens: dto.itens.length
      ? [{ tipo: "VEICULO", placa: s("placa"), modelo: s("modelo"), ano: s("ano"), chassi: s("chassi") }]
      : [],
    tipoDocumento: "APOLICE",
    confianca: Object.fromEntries(Object.entries(dto.cliente).map(([k, f]) => [k, f.confianca])),
  };
  if (!data.apolice.insurerId) throw new Error("Seguradora não encontrada. Digite o nome como aparece em Seguradoras (ex.: Porto, Allianz).");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("data", JSON.stringify(data));
  const r = await http.post<FromPdfResponse>("/clients/from-pdf", fd);
  pendingPdf.delete(input.documentId);
  return { clientId: r.clientId, criado: r.clienteCriado };
}

/* ---------------------------------------------------------------- mensageria */
const INSTANCE_STATUS: Record<MessagingInstanceDTO["estado"], WhatsappInstance["status"]> = {
  open: "CONECTADO",
  connecting: "AGUARDANDO_QR",
  close: "DESCONECTADO",
  unconfigured: "DESCONECTADO",
  unknown: "DESCONECTADO",
};
function instanceVm(i: MessagingInstanceDTO, s: MessagingSettingsDTO, qr: string | null = null): WhatsappInstance {
  return {
    status: INSTANCE_STATUS[i.estado],
    numero: null,
    nome: i.instanceName,
    qrCode: qr,
    atualizadoEm: new Date().toISOString(),
    enviadasHoje: s.enviadasHoje,
    limiteDiario: s.limiteDiario,
    pausado: s.pausado,
  };
}
// O QR só vem no "connect"; enquanto a instância está "connecting" a tela consulta o
// estado periodicamente, então guardamos o último QR para não piscar.
let lastQr: string | null = null;
async function instance(qr: string | null = null) {
  if (qr) lastQr = qr;
  const [i, s] = await Promise.all([http.get<MessagingInstanceDTO>("/messaging/instance"), http.get<MessagingSettingsDTO>("/messaging/settings")]);
  if (i.estado !== "connecting") lastQr = null;
  return instanceVm(i, s, i.estado === "connecting" ? lastQr : null);
}

const GATILHO_DESC: Record<MessageRuleDTO["gatilho"], string> = {
  PRIMEIRA_PARCELA: "Antes do vencimento da 1ª parcela",
  PROBLEMA_SEM_BOLETO: "Parcela em aberto, sem boleto",
  PROBLEMA_COM_BOLETO: "Parcela em aberto, com boleto anexo",
  ANIVERSARIO: "No dia do aniversário",
};

function broadcastFilter(f: BroadcastFilter) {
  return {
    ...(f.status && f.status !== "TODOS" ? { status: f.status } : {}),
    ...(f.seguradora && f.seguradora !== "TODAS" ? { insurerIds: [f.seguradora] } : {}),
    ...(f.ramo && f.ramo !== "TODOS" ? { ramos: RAMO_FAMILY[f.ramo] } : {}),
  };
}
/** Valores de ramo da carteira em cada família (para filtrar pela API). */
const RAMO_FAMILY: Record<Ramo, string[]> = {
  AUTO: ["auto", "moto", "frota"],
  VIDA: ["vida", "acidentes_pessoais", "prestamista", "previdencia"],
  RESIDENCIAL: ["residencial", "condominio"],
  EMPRESARIAL: ["empresarial", "rc", "garantia", "agro"],
  IMOBILIARIO: ["imobiliario"],
  CONSORCIO: ["consorcio"],
};

function pacingVm(s: MessagingSettingsDTO): MessagingPacing {
  return {
    intervaloMinSeg: s.intervaloMinSeg,
    intervaloMaxSeg: s.intervaloMaxSeg,
    loteTamanho: s.loteTamanho,
    lotePausaMin: s.lotePausaMin,
    janelaInicio: s.janelaInicio,
    janelaFim: s.janelaFim,
    limiteDiario: s.limiteDiario,
    enviadasHoje: s.enviadasHoje,
  };
}

/* ---------------------------------------------------------------- API */
export const realApi = {
  auth: {
    login: async (email: string, senha: string): Promise<AuthResponse> => http.post<LoginResponse>("/auth/login", { email, senha }),
    refresh: () => http.post<Omit<AuthResponse, "user"> & { user?: User }>("/auth/refresh"),
    me: (): Promise<User> => http.get<UserDTO>("/auth/me"),
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
    summary: async (): Promise<DashboardSummary> => {
      const s = await http.get<DashboardSummaryDTO>("/dashboard/summary");
      const HREF: Record<string, string> = {
        PARCELAS_ATRASADAS: "/app/disparos",
        VENCENDO_7_DIAS: "/app",
        PARCELAS_HOJE: "/app",
        SEM_TELEFONE: "/app/clientes",
      };
      return {
        ativos: s.clientesAtivos,
        inativos: s.clientesInativos,
        novosMes: s.novosNoMes,
        apolicesVigentes: s.apolicesVigentes,
        premioCarteira: num(s.premioCarteira),
        variacao: null,
        parcelasAtrasadas: s.parcelasAtrasadas,
        vencendo: s.vencendo,
        alertas: s.alertas.map((a) => ({ id: a.tipo, nivel: a.nivel, titulo: a.mensagem, descricao: "", href: HREF[a.tipo] })),
      };
    },
    expiring: async (f: ExpiringFilter): Promise<ExpiringPolicy[]> => {
      const r = await http.get<{ data: ExpiringPolicyDTO[] }>(`/dashboard/expiring${qs({ ...f })}`);
      return r.data.map((p) => ({
        id: p.id,
        clientId: p.client.id,
        clientNome: p.client.nome,
        insurerId: p.insurer.id,
        seguradora: p.insurer.nome,
        ramo: toRamo(p.ramo),
        numero: p.numero ?? "—",
        proposta: "",
        emissao: "",
        inicioVigencia: "",
        fimVigencia: p.fimVigencia,
        premioTotal: num(p.premioTotal),
        formaPagamento: "OUTRO",
        status: "VIGENTE",
        item: p.placas[0] ? { tipo: "VEICULO", descricao: p.placas[0], placa: p.placas[0] } : null,
        documentId: null,
        diasRestantes: p.diasParaVencer,
        telefone: p.client.telefone ?? "",
        cpfCnpj: p.client.cpfCnpj,
        placas: p.placas,
        sinistros: p.sinistros,
      }));
    },
    installmentsDue: async (): Promise<InstallmentsDue> => {
      const [hoje, semana, atrasadas] = await Promise.all([
        http.get<{ data: InstallmentWithContextDTO[] }>("/dashboard/installments-due?range=today"),
        http.get<{ data: InstallmentWithContextDTO[] }>("/dashboard/installments-due?range=week"),
        http.get<ApiPage<InstallmentWithContextDTO>>("/installments?status=ATRASADO&pageSize=50"),
      ]);
      return { hoje: hoje.data.map(installmentCtx), semana: semana.data.map(installmentCtx), atrasadas: atrasadas.data.map(installmentCtx) };
    },
    charts: async (): Promise<DashboardCharts> => {
      const c = await http.get<DashboardChartsDTO>("/dashboard/charts");
      const ramo = new Map<Ramo, { apolices: number; premio: number }>();
      for (const r of c.porRamo) {
        const k = toRamo(r.ramo);
        const acc = ramo.get(k) ?? { apolices: 0, premio: 0 };
        ramo.set(k, { apolices: acc.apolices + r.apolices, premio: acc.premio + num(r.premio) });
      }
      const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      return {
        porSeguradora: c.porSeguradora.map((s) => ({ nome: s.nome, apolices: s.apolices, premio: num(s.premio) })).sort((a, b) => b.apolices - a.apolices),
        porRamo: [...ramo.entries()].map(([r, v]) => ({ ramo: r, ...v })).sort((a, b) => b.apolices - a.apolices),
        novosPorMes: c.novosPorMes.slice(-12).map((m) => ({
          mes: MES[Number(m.mes.slice(5, 7)) - 1] ?? m.mes,
          novos: m.clientes,
          renovacoes: Math.max(0, m.apolices - m.clientes),
        })),
      };
    },
    birthdays: async (): Promise<Birthday[]> => {
      const r = await http.get<{ data: BirthdayDTO[] }>("/dashboard/birthdays?scope=month");
      const t = today();
      const [y] = t.split("-");
      const limit = new Date(`${t}T12:00:00`);
      limit.setDate(limit.getDate() + 7);
      const lim = limit.toISOString().slice(0, 10);
      return r.data
        .map((b) => ({ b, data: `${y}-${b.nascimento.slice(5, 10)}` }))
        .filter(({ b, data }) => data >= t && data <= lim && !b.optOut)
        .sort((a, b) => a.data.localeCompare(b.data))
        .map(({ b, data }) => ({ clientId: b.id, nome: b.nome, telefone: b.telefone ?? "", data, idade: b.idade, hoje: data === t, mensagemEnviada: false }));
    },
  },
  clients: {
    list: async (q: ClientsQuery): Promise<Paginated<ClientListItem>> => {
      const sort = q.sort === "recentes" ? "-createdAt" : "nome";
      const r = await http.get<ApiPage<ClientListItemDTO>>(
        `/clients${qs({
          q: q.q,
          status: q.status && q.status !== "TODOS" ? q.status : undefined,
          ramo: q.ramo && q.ramo !== "TODOS" ? RAMO_API[q.ramo as Ramo] : undefined,
          insurerId: q.seguradora && q.seguradora !== "TODAS" ? q.seguradora : undefined,
          sort,
          page: q.page,
          pageSize: q.pageSize,
        })}`,
      );
      return { items: r.data.map(listItem), total: r.total, page: r.page, pageSize: r.pageSize };
    },
    get: async (id: string): Promise<ClientDetail> => clientDetail(await http.get<ClientDetailDTO>(`/clients/${id}`)),
    update: async (id: string, data: Partial<ClientDetail>): Promise<ClientDetail> => {
      const body: Record<string, unknown> = {};
      for (const k of ["nome", "telefone", "email", "optOut", "cnh"] as const) if (data[k] !== undefined) body[k] = data[k];
      if (data.nascimento !== undefined) body.nascimento = data.nascimento ? String(data.nascimento).slice(0, 10) : null;
      if (data.endereco !== undefined) body.endereco = data.endereco;
      await http.patch(`/clients/${id}`, body);
      return clientDetail(await http.get<ClientDetailDTO>(`/clients/${id}`));
    },
    timeline: async (id: string): Promise<TimelineEvent[]> =>
      unwrap(await http.get<TimelineEventDTO[] | { data: TimelineEventDTO[] }>(`/clients/${id}/timeline`))
        .map((e, i) => ({ id: `${e.tipo}-${e.refId ?? i}-${e.data}`, tipo: TL[e.tipo], titulo: e.titulo, descricao: e.descricao, data: e.data }))
        .sort((a, b) => b.data.localeCompare(a.data)),
    messages: async (id: string): Promise<Message[]> =>
      (await http.get<ApiPage<MessageDTO>>(`/messaging/history${qs({ clientId: id, pageSize: 100 })}`)).data.map(message),
    actions: async (id: string): Promise<ClientAction[]> => {
      const r = unwrap(await http.get<ClientActionDTO[] | { data: ClientActionDTO[] }>(`/clients/${id}/actions`));
      return r.flatMap((a): ClientAction[] => {
        const acao = ACTION_IN[a.action];
        if (!acao) return [];
        return [
          {
            id: acao,
            rotulo: a.label,
            descricao: a.modo === "API" ? ACTION_DESC[acao] : "Sem API: abre o portal e cria uma tarefa.",
            policyId: a.policyId,
            apoliceNumero: a.policyNumero ?? "—",
            seguradora: a.insurer.nome,
            // Ação manual também é executável: o sistema cria a tarefa e devolve o link do portal.
            disponivel: true,
          },
        ];
      });
    },
    runAction: async (id: string, acao: ActionId, policyId: string): Promise<ActionResult> => {
      const r = await http.post<ClientActionResultDTO>(`/clients/${id}/actions/${ACTION_OUT[acao]}`, { policyId });
      const dados = r.dados && typeof r.dados === "object" && !Array.isArray(r.dados)
        ? Object.entries(r.dados as Record<string, unknown>)
            .filter(([, v]) => v !== null && typeof v !== "object")
            .slice(0, 8)
            .map(([k, v]) => ({ rotulo: k, valor: String(v) }))
        : [];
      return {
        acao,
        titulo: r.modo === "MANUAL" ? "Ação manual guiada" : "Resposta da seguradora",
        sucesso: r.ok,
        resumo: r.mensagem,
        dados,
        documento: r.documentId ? { id: r.documentId, nome: "Boleto (PDF)", url: await fetchFileUrl(`/documents/${r.documentId}/file`, "") } : undefined,
        portalUrl: r.portalUrl ?? null,
        executadoEm: new Date().toISOString(),
      };
    },
    fromPdf,
    create: async (data: ClientInput): Promise<ClientDetail> => clientDetail(await http.post<ClientDetailDTO>("/clients", { ...clientBody(data), origem: "MANUAL" })),
    edit: async (id: string, data: ClientInput): Promise<ClientDetail> => clientDetail(await http.patch<ClientDetailDTO>(`/clients/${id}`, clientBody(data))),
  },
  documents: {
    parse: async (file: File): Promise<ParseResult> => {
      const fd = new FormData();
      fd.append("file", file);
      const t0 = performance.now();
      const dto = await http.post<ParsedPolicyDTO>("/documents/parse", fd);
      return parseResult(dto, file, performance.now() - t0);
    },
    fileUrl: (id: string) => fetchFileUrl(`/documents/${id}/file`, ""),
    attach: async (clientId: string, files: File[], tipo: AttachTipo, policyId?: string | null): Promise<DocumentFile[]> => {
      const fd = new FormData();
      fd.append("tipo", tipo);
      if (policyId) fd.append("policyId", policyId);
      for (const f of files) fd.append("arquivos", f, f.name);
      const docs = await http.post<DocumentDTO[]>(`/clients/${clientId}/documents`, fd);
      return docs.map((d) => ({ id: d.id, clientId, policyId: d.policyId, tipo: d.tipo, nome: d.nomeArquivo, tamanho: d.tamanho, criadoEm: d.createdAt, mimeType: d.mimeType }));
    },
  },
  policies: {
    list: async (clientId?: string): Promise<Policy[]> => {
      const r = await http.get<ApiPage<PolicyListItemDTO>>(`/policies${qs({ clientId, pageSize: 200 })}`);
      return r.data.map((p) => policy(p, p.client));
    },
    create: async (data: PolicyInput): Promise<Policy> => policy(await http.post<PolicyDetailDTO>("/policies", { clientId: data.clientId, ...policyBody(data) }), { id: data.clientId, nome: "" }),
    update: async (id: string, data: PolicyInput): Promise<Policy> => policy(await http.patch<PolicyDetailDTO>(`/policies/${id}`, policyBody(data)), { id: data.clientId, nome: "" }),
  },
  installments: {
    list: async (status?: string): Promise<Installment[]> =>
      (await http.get<ApiPage<InstallmentWithContextDTO>>(`/installments${qs({ status, pageSize: 200 })}`)).data.map(installmentCtx),
  },
  insurers: {
    acessos: async (): Promise<PortalAccess[]> => unwrap(await http.get<PortalAccess[] | { data: PortalAccess[] }>("/insurers/acessos")),
    patchCredential: (id: string, data: PatchCredentialInput) => http.patch<unknown>(`/insurers/${id}/credentials`, data).then(() => ({ ok: true })),
    list: async (): Promise<Insurer[]> =>
      unwrap(await http.get<InsurerDTO[] | { data: InsurerDTO[] }>("/insurers"))
        .map(insurer)
        .sort((a, b) => b.apolices - a.apolices || a.nome.localeCompare(b.nome)),
    get: async (id: string): Promise<Insurer> => insurer(await http.get<InsurerDTO>(`/insurers/${id}`)),
    credentials: async (id: string): Promise<InsurerCredential[]> => {
      const i = await http.get<InsurerDTO>(`/insurers/${id}`);
      const c = i.credencial;
      if (!c) return [];
      return Object.entries(c.mascara).map(([k, mask]) => ({
        id: k,
        insurerId: id,
        tipo: c.tipo,
        rotulo: k,
        valorMascarado: mask,
        ultimoTeste: c.ultimoTeste,
        ultimoErro: c.ultimoErro,
      }));
    },
    saveCredential: (id: string, data: SaveCredentialInput) => http.put<{ ok: boolean }>(`/insurers/${id}/credentials`, { ambiente: "PRODUCAO", ...data }),
    test: async (id: string): Promise<TestConnectionResult> => {
      const r = await http.post<{ ok: boolean; detalhe?: string; duracaoMs?: number }>(`/insurers/${id}/test`);
      return { ok: r.ok, detalhe: r.detalhe, latenciaMs: r.duracaoMs };
    },
    robotSession: (id: string): Promise<RobotSession> => http.get<RobotSession>(`/insurers/${id}/robot-session`),
    renewRobotSession: (id: string): Promise<RobotSession> => http.post<RobotSession>(`/insurers/${id}/robot-session/renew`),
  },
  messaging: {
    instance: () => instance(),
    connect: async (): Promise<WhatsappInstance> => {
      const r = await http.post<MessagingConnectDTO>("/messaging/instance/connect");
      if (r.estado === "open") return instance();
      return instance(r.qrcode?.startsWith("data:image") ? r.qrcode : null);
    },
    /** Na API real não há confirmação manual: a tela consulta o estado até virar "open". */
    confirmDemo: () => instance(),
    disconnect: async () => {
      await http.post("/messaging/instance/logout");
      return instance();
    },
    updateInstance: async (data: Partial<WhatsappInstance>): Promise<WhatsappInstance> => {
      const body: Record<string, unknown> = {};
      if (data.pausado !== undefined) body.pausado = data.pausado;
      if (data.limiteDiario !== undefined) body.limiteDiario = data.limiteDiario;
      const r = await http.patch<MessagingInstanceStatusDTO>("/messaging/instance", body);
      return instanceVm(r, r.settings, r.estado === "connecting" ? lastQr : null);
    },
    createTemplate: async (data: CreateTemplateInput): Promise<MessageTemplate> => {
      const t = await http.post<MessageTemplateDTO>("/messaging/templates", { nome: data.nome.trim(), conteudo: data.texto.trim() });
      return { id: t.id, nome: t.nome, texto: t.conteudo, anexarBoleto: t.anexarBoleto };
    },
    templates: async (): Promise<MessageTemplate[]> =>
      unwrap(await http.get<MessageTemplateDTO[] | { data: MessageTemplateDTO[] }>("/messaging/templates"))
        .filter((t) => t.ativo)
        .map((t) => ({ id: t.id, nome: t.nome, texto: t.conteudo, anexarBoleto: t.anexarBoleto })),
    rules: async (): Promise<MessageRule[]> => {
      const [rules, tpls] = await Promise.all([
        http.get<MessageRuleDTO[] | { data: MessageRuleDTO[] }>("/messaging/rules"),
        http.get<MessageTemplateDTO[] | { data: MessageTemplateDTO[] }>("/messaging/templates"),
      ]);
      const byId = new Map(unwrap(tpls).map((t) => [t.id, t]));
      return unwrap(rules).map((r) => {
        const t = byId.get(r.templateId);
        return {
          id: r.id,
          nome: r.nome,
          gatilho: r.gatilho,
          descricaoGatilho: GATILHO_DESC[r.gatilho],
          antecedenciaDias: r.antecedenciaDias,
          horario: r.horario,
          formasPagamento: r.formasPagamento,
          seguradoras: r.seguradoras,
          ativo: r.ativo,
          texto: t?.conteudo ?? "",
          anexarBoleto: t?.anexarBoleto ?? false,
          enviadas30d: 0,
        };
      });
    },
    updateRule: async (id: string, data: Partial<MessageRule>): Promise<MessageRule> => {
      const body: Record<string, unknown> = {};
      for (const k of ["nome", "antecedenciaDias", "horario", "formasPagamento", "seguradoras", "ativo"] as const) if (data[k] !== undefined) body[k] = data[k];
      const r = await http.patch<MessageRuleDTO>(`/messaging/rules/${id}`, body);
      if (data.texto !== undefined) await http.patch(`/messaging/templates/${r.templateId}`, { conteudo: data.texto });
      const all = await realApi.messaging.rules();
      return all.find((x) => x.id === id)!;
    },
    broadcastPreview: async (filtro: BroadcastFilter, source: BroadcastSource, opts: BroadcastOptions = {}): Promise<BroadcastPreview> => {
      const conteudo = "conteudo" in source ? source.conteudo : ((await realApi.messaging.templates()).find((t) => t.id === source.templateId)?.texto ?? "");
      const csv = opts.contatos?.length ? opts.contatos : null;
      const [r, prev] = await Promise.all([
        http.post<BroadcastResponse>("/messaging/broadcast", { ...source, ...opts, filtro: broadcastFilter(filtro), dryRun: true }),
        // No CSV a prévia é montada na tela com a primeira linha; aqui só a prévia de exemplo da carteira.
        csv ? Promise.resolve({ texto: "" }) : http.post<{ texto: string }>("/messaging/templates/preview", { conteudo }),
      ]);
      const agora = new Date().toISOString();
      return {
        total: r.total,
        optOut: r.ignorados.optOut,
        invalidos: r.ignorados.invalidos ?? 0,
        duplicados: r.ignorados.duplicados ?? 0,
        lotes: r.estimativa?.lotes ?? 0,
        inicioPrevisto: r.estimativa?.inicioPrevisto ?? agora,
        terminoPrevisto: r.estimativa?.terminoPrevisto ?? agora,
        // Prévia com dados de exemplo: não expomos clientes reais aqui.
        amostra: csv ? [] : [{ clientId: "exemplo", nome: "Cliente de exemplo", telefone: "", texto: prev.texto }],
      };
    },
    broadcast: async (filtro: BroadcastFilter, source: BroadcastSource, opts: BroadcastOptions = {}): Promise<BroadcastResult> => {
      const r = await http.post<BroadcastResponse>("/messaging/broadcast", { ...source, ...opts, filtro: broadcastFilter(filtro), dryRun: false });
      return { enfileiradas: r.total, lotes: r.estimativa?.lotes ?? 0, terminoPrevisto: r.estimativa?.terminoPrevisto ?? null };
    },
    pacing: async (): Promise<MessagingPacing> => pacingVm(await http.get<MessagingSettingsDTO>("/messaging/settings")),
    updatePacing: async (data: Partial<MessagingPacing>): Promise<MessagingPacing> => {
      const body: Record<string, number> = {};
      for (const k of ["intervaloMinSeg", "intervaloMaxSeg", "loteTamanho", "lotePausaMin"] as const) if (data[k] !== undefined) body[k] = data[k];
      return pacingVm(await http.patch<MessagingSettingsDTO>("/messaging/settings", body));
    },
    uploadAttachment: (file: File, clientId?: string): Promise<MessageAttachment> => {
      const fd = new FormData();
      if (clientId) fd.append("clientId", clientId);
      fd.append("arquivo", file, file.name);
      return http.post<MessageAttachment>("/messaging/attachments", fd);
    },
    history: async (): Promise<Message[]> => (await http.get<ApiPage<MessageDTO>>("/messaging/history?pageSize=100")).data.map(message),
    queue: async (): Promise<Message[]> => (await http.get<MessagingQueueDTO>("/messaging/queue")).mensagens.map(message),
    send: async (clientId: string, texto: string, anexo?: string) => {
      await http.post("/messaging/send", { clientId, conteudo: texto, anexoDocumentId: anexo ?? null });
      return { ok: true };
    },
  },
  leads: {
    list: async (): Promise<Lead[]> => (await http.get<ApiPage<LeadDTO>>("/leads?pageSize=500")).data.map(lead),
    create: async (data: CreateLeadInput): Promise<Lead> =>
      lead(
        await http.post<LeadDTO>("/leads", {
          nome: data.nome,
          telefone: data.telefone || null,
          email: data.email || null,
          produto: RAMO_API[data.produto],
          origem: data.origem,
          notas: data.mensagem || null,
        }),
      ),
    /** Formulário do site (sem login). */
    submitSite: async (data: CreateLeadInput) => {
      await http.post("/public/leads", { nome: data.nome, telefone: data.telefone, email: data.email || null, produto: RAMO_API[data.produto], mensagem: data.mensagem || null });
      return { ok: true };
    },
    update: async (id: string, data: Partial<Lead>): Promise<Lead> => {
      // Fechar = converter em cliente (a API não aceita FECHADO pelo PATCH).
      if (data.etapa === "FECHADO") {
        const r = await http.post<{ lead: LeadDTO }>(`/leads/${id}/convert`, {});
        return lead(r.lead);
      }
      const body: Record<string, unknown> = {};
      if (data.etapa !== undefined) body.etapa = data.etapa;
      if (data.notas !== undefined) body.notas = data.notas;
      if (data.valorEstimado !== undefined) body.valorEstimado = data.valorEstimado;
      if (data.proximoContato !== undefined) body.proximoContato = data.proximoContato ? new Date(data.proximoContato).toISOString() : null;
      if (data.produto !== undefined) body.produto = RAMO_API[data.produto];
      return lead(await http.patch<LeadDTO>(`/leads/${id}`, body));
    },
    convert: async (id: string) => {
      const r = await http.post<{ clientId: string }>(`/leads/${id}/convert`, {});
      return { clientId: r.clientId };
    },
  },
  quotes: {
    list: async (): Promise<Quote[]> => {
      const [q, leads] = await Promise.all([http.get<ApiPage<QuoteDTO>>("/quotes?pageSize=200"), http.get<ApiPage<LeadDTO>>("/leads?pageSize=500")]);
      const nomes = new Map(leads.data.map((l) => [l.id, l.nome]));
      return q.data.map((x) => quote(x, nomes));
    },
    get: async (id: string): Promise<Quote> => {
      let q = await http.get<QuoteDTO>(`/quotes/${id}`);
      if (q.status === "PROCESSANDO" && q.aggilizadorId) q = await http.post<QuoteDTO>(`/quotes/${id}/refresh`);
      return quote(q, new Map());
    },
    create: async (data: CreateQuoteInput): Promise<Quote> => {
      // A API exige um lead ou cliente: cotação "do zero" cria o lead antes.
      let leadId = data.leadId;
      if (!leadId && !data.clientId) {
        const l = await http.post<LeadDTO>("/leads", { nome: data.nome, produto: RAMO_API[data.ramo], origem: "cotacao", cpfCnpj: data.cpfCnpj || null });
        leadId = l.id;
      }
      const dados = { nome: data.nome, cpfCnpj: data.cpfCnpj, cep: data.cep, veiculo: data.veiculo, observacoes: data.observacoes };
      const q = await http.post<QuoteDTO>("/quotes", { ...(leadId ? { leadId } : { clientId: data.clientId }), ramo: RAMO_API[data.ramo], dados });
      return quote(q, new Map());
    },
    send: async (id: string) => {
      await http.post<QuoteSendResponse>(`/quotes/${id}/send`);
      return { ok: true };
    },
  },
};
