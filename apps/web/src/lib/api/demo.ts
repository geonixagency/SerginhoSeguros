/**
 * Roteador do MODO DEMO (NEXT_PUBLIC_DEMO=1): responde aos mesmos caminhos da API REST
 * usando a base fictícia em memória. Mantém alterações durante a sessão do navegador.
 */
import { buildDemoDB, type DemoDB } from "./demo-data";
import type {
  ClientInput,
  DocumentFile,
  Policy,
  PolicyInput,
  ActionResult,
  Birthday,
  BroadcastFilter,
  BroadcastPreview,
  ClientAction,
  ClientDetail,
  ClientListItem,
  CreateLeadInput,
  CreateQuoteInput,
  DashboardCharts,
  DashboardSummary,
  ExpiringPolicy,
  Installment,
  InstallmentsDue,
  Lead,
  MessageRule,
  MessageTemplate,
  BroadcastContact,
  BroadcastResult,
  MessageAttachment,
  MessagingPacing,
  User,
  Paginated,
  ParseResult,
  Quote,
  Ramo,
} from "../types";
import { daysUntil, renderTemplate, formatBRL, formatDate } from "../utils";
import { estimateSchedule, isValidCpfCnpj, normalizePhoneBr } from "@ss/shared";

let db: DemoDB | null = null;
const getDB = () => (db ??= buildDemoDB());

export class DemoHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (base: number) => base + Math.random() * base * 0.6;
const now = () => new Date().toISOString();

function toListItem(d: DemoDB, c: DemoDB["clients"][number]): ClientListItem {
  const ps = d.policies.filter((p) => p.clientId === c.id);
  const vig = ps.filter((p) => p.status === "VIGENTE");
  const next = vig.map((p) => p.fimVigencia).sort()[0] ?? null;
  return {
    ...c,
    apolicesVigentes: vig.length,
    seguradoras: [...new Set(ps.map((p) => p.seguradora))],
    ramos: [...new Set(ps.map((p) => p.ramo))],
    placas: ps.map((p) => p.item?.placa).filter((x): x is string => !!x),
    proximoVencimento: next,
    premioTotal: vig.reduce((s, p) => s + p.premioTotal, 0),
  };
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Handler = (ctx: { params: Record<string, string>; query: URLSearchParams; body: unknown; d: DemoDB }) => unknown | Promise<unknown>;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), "([^/]+)")) + "$");
  routes.push({ method, pattern, keys, handler });
}

/* ---------------- auth ---------------- */
const DEMO_USER: User = { id: "usr-1", nome: "Conta Demonstração", email: "demo@exemplo.com", perfil: "ADMIN", avatar: null, ativo: true, ultimoLogin: new Date().toISOString() };
/* Equipe fictícia do modo demonstração (nomes e e-mails inventados). */
const demoTeam: User[] = [
  DEMO_USER,
  { id: "usr-2", nome: "Operador Exemplo", email: "operador@exemplo.com", perfil: "OPERADOR", avatar: null, ativo: true, ultimoLogin: new Date(Date.now() - 86400_000).toISOString() },
];
route("POST", "/auth/login", ({ body }) => {
  const b = body as { email?: string; senha?: string };
  if (!b?.email || !b?.senha) throw new DemoHttpError(400, "Informe e-mail e senha.");
  if (b.senha.length < 4) throw new DemoHttpError(401, "E-mail ou senha inválidos.");
  return { accessToken: "demo-token", user: { ...DEMO_USER } };
});
route("POST", "/auth/refresh", () => ({ accessToken: "demo-token", user: DEMO_USER }));
route("POST", "/auth/logout", () => ({ ok: true }));
route("GET", "/auth/me", () => DEMO_USER);
route("PATCH", "/auth/me", ({ body }) => {
  const b = body as { nome?: string; avatar?: string | null };
  if (b.nome !== undefined) {
    if (b.nome.trim().length < 2) throw new DemoHttpError(400, "Informe seu nome");
    DEMO_USER.nome = b.nome.trim();
  }
  if (b.avatar !== undefined) DEMO_USER.avatar = b.avatar;
  return { ...DEMO_USER };
});
route("POST", "/auth/forgot-password", () => ({ ok: true }));
route("GET", "/users", () => demoTeam.map((u) => (u.id === DEMO_USER.id ? { ...DEMO_USER } : { ...u })));
route("POST", "/users/invite", ({ body }) => {
  const b = body as { nome?: string; email?: string; perfil?: User["perfil"] };
  const email = (b.email ?? "").trim().toLowerCase();
  if (!b.nome || b.nome.trim().length < 2) throw new DemoHttpError(400, "Informe o nome");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new DemoHttpError(400, "E-mail inválido");
  const ex = demoTeam.find((u) => u.email === email);
  if (ex?.ultimoLogin && ex.ativo) throw new DemoHttpError(409, "Este e-mail já tem acesso ao sistema");
  const user: User = ex ?? { id: `usr-${Date.now()}`, nome: b.nome.trim(), email, perfil: b.perfil ?? "OPERADOR", avatar: null, ativo: true, ultimoLogin: null };
  Object.assign(user, { nome: b.nome.trim(), perfil: b.perfil ?? "OPERADOR", ativo: true });
  if (!ex) demoTeam.push(user);
  return { user: { ...user }, emailEnviado: true };
});
route("PATCH", "/users/:id", ({ params, body }) => {
  const u = demoTeam.find((x) => x.id === params.id);
  if (!u) throw new DemoHttpError(404, "Usuário não encontrado");
  const b = body as { perfil?: User["perfil"]; ativo?: boolean };
  if (u.id === DEMO_USER.id && (b.ativo === false || (b.perfil && b.perfil !== "ADMIN"))) throw new DemoHttpError(400, "Você não pode desativar nem rebaixar o próprio usuário");
  Object.assign(u, b);
  return { ...u };
});
route("DELETE", "/users/:id", ({ params }) => {
  const u = demoTeam.find((x) => x.id === params.id);
  if (!u) throw new DemoHttpError(404, "Usuário não encontrado");
  if (u.id === DEMO_USER.id) throw new DemoHttpError(400, "Você não pode remover o próprio usuário");
  u.ativo = false;
  return { ...u };
});
route("POST", "/auth/reset-password", ({ body }) => {
  const b = body as { token?: string; senha?: string };
  if (!b.token || b.token.length < 20) throw new DemoHttpError(400, "Link inválido ou expirado. Peça um novo link de redefinição.");
  if (!b.senha || b.senha.length < 10) throw new DemoHttpError(400, "A senha deve ter ao menos 10 caracteres");
  return { ok: true };
});

/* Importação da carteira: no demo só simula (nada é gravado). */
const demoJobs = new Map<string, { inicio: number; total: number; dryRun: boolean }>();
route("GET", "/import/estado", ({ d }) => ({ clientes: d.clients.length, apolices: d.policies.length, documentos: d.documents.length, indicePdfs: 0, importacaoEmAndamento: null }));
route("POST", "/import/pdfs", ({ body }) => {
  const files = body instanceof FormData ? body.getAll("arquivos") : [];
  if (!files.length) throw new DemoHttpError(400, "Nenhum arquivo recebido");
  const n = files.reduce((acc, f) => acc + (typeof f !== "string" && /\.zip$/i.test(f.name) ? 60 : 1), 0);
  return { recebidos: n, gravados: n, iguais: 0, substituidos: 0, semDestino: 0, invalidos: 0 };
});
route("POST", "/import/limpar", () => {
  throw new DemoHttpError(403, "Na demonstração não é possível limpar a carteira");
});
route("POST", "/import/carteira", ({ body }) => {
  const dryRun = body instanceof FormData && body.get("dryRun") === "true";
  const id = `demo-${Date.now()}`;
  demoJobs.set(id, { inicio: Date.now(), total: 600, dryRun });
  return { jobId: id, total: 600, dryRun };
});
route("GET", "/import/carteira/:id", ({ params }) => {
  const j = demoJobs.get(params.id);
  if (!j) throw new DemoHttpError(404, "Importação não encontrada");
  const feitos = Math.min(j.total, Math.round(((Date.now() - j.inicio) / 4000) * j.total));
  const done = feitos >= j.total;
  return {
    id: params.id,
    status: done ? "concluido" : "processando",
    dryRun: j.dryRun,
    feitos,
    total: j.total,
    iniciadoEm: new Date(j.inicio).toISOString(),
    concluidoEm: done ? new Date().toISOString() : null,
    erro: null,
    resultado: done
      ? {
          dryRun: j.dryRun,
          seguradorasNaoMapeadas: {},
          stats: { clientesLidos: 600, clientesCriados: 590, clientesAtualizados: 8, clientesSemCpf: 2, apolicesCriadas: 1790, apolicesDuplicadas: 21, apolicesSemSeguradora: 0, documentosCriados: 2370, documentosJaExistentes: 0, arquivosForaDoStorage: 0, arquivosInexistentes: 11, parcelas: 9120, itens: 1610 },
        }
      : null,
  };
});

/* ---------------- dashboard ---------------- */
route("GET", "/dashboard/summary", ({ d }): DashboardSummary => {
  const ativos = d.clients.filter((c) => c.status === "ATIVO").length;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const novosMes = d.clients.filter((c) => new Date(c.criadoEm) >= monthStart).length || 7;
  const vig = d.policies.filter((p) => p.status === "VIGENTE");
  const atrasadas = d.installments.filter((i) => i.status === "ATRASADO").length;
  const tokio = d.insurers.find((i) => i.statusIntegracao === "ERRO");
  return {
    ativos,
    inativos: d.clients.length - ativos,
    novosMes,
    apolicesVigentes: vig.length,
    premioCarteira: vig.reduce((s, p) => s + p.premioTotal, 0),
    variacao: { ativos: 4.2, novosMes: 16.7, apolicesVigentes: 3.1, premioCarteira: 6.8 },
    alertas: [
      { id: "al-1", nivel: "critico", titulo: `${atrasadas} parcelas em atraso`, descricao: "Coberturas podem ser suspensas. Régua “problema no pagamento” já agendada.", href: "/app/disparos" },
      ...(tokio ? [{ id: "al-2", nivel: "atencao" as const, titulo: `Integração ${tokio.nome} com erro`, descricao: "Token expirado. Atualize a credencial para voltar a consultar boletos.", href: `/app/seguradoras/${tokio.id}` }] : []),
      { id: "al-3", nivel: "info", titulo: "3 leads do site sem contato há 24h", descricao: "Novos pedidos de cotação aguardando primeiro retorno.", href: "/app/crm" },
    ],
  };
});
route("GET", "/dashboard/expiring", ({ d, query }): ExpiringPolicy[] => {
  const days = Number(query.get("days") ?? 30);
  return d.policies
    .filter((p) => p.status === "VIGENTE")
    .map((p) => ({ ...p, diasRestantes: daysUntil(p.fimVigencia), telefone: d.clients.find((c) => c.id === p.clientId)?.telefone ?? "" }))
    .filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= days)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
});
route("GET", "/dashboard/installments-due", ({ d }): InstallmentsDue => {
  const open = d.installments.filter((i) => i.status === "PENDENTE" || i.status === "ATRASADO");
  return {
    hoje: open.filter((i) => daysUntil(i.vencimento) === 0),
    semana: open.filter((i) => {
      const n = daysUntil(i.vencimento);
      return n > 0 && n <= 7;
    }).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    atrasadas: open.filter((i) => i.status === "ATRASADO"),
  };
});
route("GET", "/dashboard/charts", ({ d }): DashboardCharts => {
  const vig = d.policies.filter((p) => p.status === "VIGENTE");
  const bySeg = new Map<string, { apolices: number; premio: number }>();
  const byRamo = new Map<Ramo, { apolices: number; premio: number }>();
  for (const p of vig) {
    const s = bySeg.get(p.seguradora) ?? { apolices: 0, premio: 0 };
    s.apolices++;
    s.premio += p.premioTotal;
    bySeg.set(p.seguradora, s);
    const r = byRamo.get(p.ramo) ?? { apolices: 0, premio: 0 };
    r.apolices++;
    r.premio += p.premioTotal;
    byRamo.set(p.ramo, r);
  }
  const meses: DashboardCharts["novosPorMes"] = [];
  const base = new Date();
  const serie = [6, 9, 7, 11, 8, 12, 10, 14, 9, 13, 15, 12];
  for (let k = 11; k >= 0; k--) {
    const m = new Date(base.getFullYear(), base.getMonth() - k, 1);
    meses.push({
      mes: m.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      novos: serie[11 - k],
      renovacoes: Math.round(serie[11 - k] * 1.4 + (k % 3)),
    });
  }
  return {
    porSeguradora: [...bySeg.entries()].map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.apolices - a.apolices),
    porRamo: [...byRamo.entries()].map(([ramo, v]) => ({ ramo, ...v })).sort((a, b) => b.apolices - a.apolices),
    novosPorMes: meses,
  };
});
route("GET", "/dashboard/birthdays", ({ d }): Birthday[] => {
  const t = new Date();
  const out: Birthday[] = [];
  for (const c of d.clients) {
    if (!c.nascimento) continue;
    const n = new Date(c.nascimento);
    const thisYear = new Date(t.getFullYear(), n.getMonth(), n.getDate());
    const diff = daysUntil(thisYear.toISOString());
    if (diff >= 0 && diff <= 7) {
      out.push({ clientId: c.id, nome: c.nome, telefone: c.telefone, data: thisYear.toISOString(), idade: t.getFullYear() - n.getFullYear(), hoje: diff === 0, mensagemEnviada: diff === 0 && c.id.endsWith("4") });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
});

/* ---------------- clientes ---------------- */
route("GET", "/clients", ({ d, query }): Paginated<ClientListItem> => {
  const q = norm(query.get("q") ?? "");
  const status = query.get("status");
  const ramo = query.get("ramo");
  const segId = query.get("seguradora");
  // O filtro chega com o id da seguradora (como na API real).
  const seguradora = segId && segId !== "TODAS" ? (d.insurers.find((i) => i.id === segId)?.nome ?? segId) : segId;
  const page = Number(query.get("page") ?? 1);
  const pageSize = Number(query.get("pageSize") ?? 12);
  let items = d.clients.map((c) => toListItem(d, c));
  if (q) {
    const digits = q.replace(/\D/g, "");
    items = items.filter(
      (c) =>
        norm(c.nome).includes(q) ||
        (digits.length >= 3 && c.cpfCnpj.includes(digits)) ||
        c.placas.some((p) => norm(p).includes(q.replace(/[^a-z0-9]/g, ""))) ||
        d.policies.some((p) => p.clientId === c.id && norm(p.numero).includes(q)),
    );
  }
  if (status && status !== "TODOS") items = items.filter((c) => c.status === status);
  if (ramo && ramo !== "TODOS") items = items.filter((c) => c.ramos.includes(ramo as Ramo));
  if (seguradora && seguradora !== "TODAS") items = items.filter((c) => c.seguradoras.includes(seguradora));
  const sort = query.get("sort") ?? "nome";
  items.sort((a, b) =>
    sort === "vencimento"
      ? (a.proximoVencimento ?? "9").localeCompare(b.proximoVencimento ?? "9")
      : sort === "premio"
        ? b.premioTotal - a.premioTotal
        : sort === "recentes"
          ? b.criadoEm.localeCompare(a.criadoEm)
          : a.nome.localeCompare(b.nome, "pt-BR"),
  );
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
});
function detailOf(d: DemoDB, id: string): ClientDetail {
  const c = d.clients.find((x) => x.id === id);
  if (!c) throw new DemoHttpError(404, "Cliente não encontrado.");
  return {
    ...toListItem(d, c),
    apolices: d.policies.filter((p) => p.clientId === c.id).sort((a, b) => b.fimVigencia.localeCompare(a.fimVigencia)),
    parcelas: d.installments.filter((i) => i.clientId === c.id).sort((a, b) => b.vencimento.localeCompare(a.vencimento)),
    documentos: d.documents.filter((x) => x.clientId === c.id),
  };
}
/** Status do cliente: ATIVO se houver apólice vigente com fim >= hoje. */
function recalcStatus(d: DemoDB, clientId: string) {
  const c = d.clients.find((x) => x.id === clientId);
  if (!c) return;
  const hoje = new Date().toISOString().slice(0, 10);
  c.status = d.policies.some((p) => p.clientId === clientId && p.status === "VIGENTE" && (p.fimVigencia || "") >= hoje) ? "ATIVO" : "INATIVO";
}
function checkClientInput(d: DemoDB, b: ClientInput, selfId?: string) {
  if (!b.nome || b.nome.trim().length < 2) throw new DemoHttpError(400, "Informe o nome");
  const doc = (b.cpfCnpj ?? "").replace(/\D/g, "");
  if (!isValidCpfCnpj(doc)) throw new DemoHttpError(400, "CPF/CNPJ inválido");
  if (d.clients.some((x) => x.cpfCnpj === doc && x.id !== selfId)) throw new DemoHttpError(409, "Já existe cliente com este CPF/CNPJ");
  return doc;
}
route("GET", "/clients/:id", ({ d, params }): ClientDetail => detailOf(d, params.id));
route("POST", "/clients", ({ d, body }): ClientDetail => {
  const b = body as ClientInput;
  const doc = checkClientInput(d, b);
  const id = `cli-man-${Date.now()}`;
  d.clients.unshift({ id, nome: b.nome.trim(), cpfCnpj: doc, nascimento: b.nascimento, cnh: b.cnh, telefone: (b.telefone ?? "").replace(/\D/g, ""), email: b.email, endereco: b.endereco, status: "INATIVO", origem: "MANUAL", optOut: false, criadoEm: now() });
  d.timeline[id] = [{ id: `tl-${id}`, tipo: "CADASTRO", titulo: "Cliente cadastrado manualmente", data: now() }];
  return detailOf(d, id);
});
route("PATCH", "/clients/:id", ({ d, params, body }): ClientDetail => {
  const c = d.clients.find((x) => x.id === params.id);
  if (!c) throw new DemoHttpError(404, "Cliente não encontrado.");
  const b = body as Partial<ClientInput>;
  if (b.cpfCnpj !== undefined) b.cpfCnpj = checkClientInput(d, { ...c, ...b } as ClientInput, c.id);
  if (b.telefone !== undefined) b.telefone = (b.telefone ?? "").replace(/\D/g, "");
  Object.assign(c, b);
  return detailOf(d, c.id);
});
route("POST", "/clients/:id/documents", ({ d, params, body }): DocumentFile[] => {
  if (!d.clients.some((x) => x.id === params.id)) throw new DemoHttpError(404, "Cliente não encontrado.");
  const fd = body instanceof FormData ? body : null;
  const files = (fd?.getAll("arquivos") ?? []).filter((f): f is File => typeof f !== "string");
  if (!files.length) throw new DemoHttpError(400, "Nenhum arquivo enviado");
  const ruim = files.find((f) => !/\.(pdf|jpe?g|png|webp)$/i.test(f.name));
  if (ruim) throw new DemoHttpError(400, `"${ruim.name}" não é PDF nem imagem (JPG, PNG, WebP)`);
  const tipo = (fd?.get("tipo") as DocumentFile["tipo"]) || "OUTRO";
  const policyId = (fd?.get("policyId") as string) || null;
  const docs = files.map((f, i): DocumentFile => ({ id: `doc-man-${Date.now()}-${i}`, clientId: params.id, policyId, tipo, nome: f.name, tamanho: f.size, criadoEm: now(), mimeType: f.type || "application/pdf" }));
  d.documents.unshift(...docs);
  return docs;
});
route("GET", "/clients/:id/timeline", ({ d, params }) => d.timeline[params.id] ?? []);
route("GET", "/messaging/history/client/:id", ({ d, params }) => d.messages.filter((m) => m.clientId === params.id));
route("GET", "/clients/:id/actions", ({ d, params }): ClientAction[] => {
  const ps = d.policies.filter((p) => p.clientId === params.id && p.status === "VIGENTE");
  const acts: ClientAction[] = [];
  for (const p of ps) {
    const ins = d.insurers.find((i) => i.id === p.insurerId)!;
    const has = (c: string) => ins.capacidades.includes(c as never) && ins.statusIntegracao === "CONECTADA";
    const motivo = !ins.temApi ? "Seguradora sem API — ação manual pelo portal" : ins.statusIntegracao !== "CONECTADA" ? "Integração indisponível" : "Não suportado por esta seguradora";
    acts.push(
      { id: "BOLETO_2VIA", rotulo: "2ª via de boleto", descricao: "Gera o PDF da próxima parcela em aberto", policyId: p.id, apoliceNumero: p.numero, seguradora: p.seguradora, disponivel: has("getBoletoPdf"), motivo: has("getBoletoPdf") ? undefined : motivo },
      { id: "STATUS_APOLICE", rotulo: "Status da apólice", descricao: "Consulta situação e vigência na seguradora", policyId: p.id, apoliceNumero: p.numero, seguradora: p.seguradora, disponivel: has("getPolicyStatus"), motivo: has("getPolicyStatus") ? undefined : motivo },
      { id: "STATUS_PARCELAS", rotulo: "Status das parcelas", descricao: "Lista parcelas pagas e em aberto", policyId: p.id, apoliceNumero: p.numero, seguradora: p.seguradora, disponivel: has("listInstallments"), motivo: has("listInstallments") ? undefined : motivo },
      { id: "SINISTROS", rotulo: "Sinistros", descricao: "Avisos de sinistro vinculados", policyId: p.id, apoliceNumero: p.numero, seguradora: p.seguradora, disponivel: has("getClaims"), motivo: has("getClaims") ? undefined : motivo },
    );
  }
  return acts;
});
route("POST", "/clients/:id/actions/:action", async ({ d, params, body }): Promise<ActionResult> => {
  const b = { ...(body as { policyId: string }), acao: params.action as ClientAction["id"] };
  const p = d.policies.find((x) => x.id === b.policyId && x.clientId === params.id);
  if (!p) throw new DemoHttpError(404, "Apólice não encontrada.");
  await wait(900);
  const parcelas = d.installments.filter((i) => i.policyId === p.id);
  const aberta = parcelas.find((i) => i.status !== "PAGO") ?? parcelas[parcelas.length - 1];
  const base = { acao: b.acao, sucesso: true, executadoEm: now() };
  if (b.acao === "BOLETO_2VIA") {
    return {
      ...base,
      titulo: "2ª via gerada",
      resumo: `Boleto da parcela ${aberta.numero}/${aberta.total} pronto para envio.`,
      dados: [
        { rotulo: "Apólice", valor: p.numero },
        { rotulo: "Parcela", valor: `${aberta.numero} de ${aberta.total}` },
        { rotulo: "Valor", valor: formatBRL(aberta.valor) },
        { rotulo: "Vencimento", valor: formatDate(aberta.vencimento) },
      ],
      linhaDigitavel: "23793.38128 60000.000003 00000.000400 1 " + String(Math.round(aberta.valor * 100)).padStart(14, "0"),
      documento: { id: `bol-${aberta.id}`, nome: `Boleto_${p.numero}_p${aberta.numero}.pdf`, url: "/demo/boleto-demo.pdf" },
    };
  }
  if (b.acao === "STATUS_APOLICE") {
    return {
      ...base,
      titulo: "Apólice ativa na seguradora",
      resumo: `${p.seguradora} confirma a apólice ${p.numero} em vigor.`,
      dados: [
        { rotulo: "Situação", valor: "Emitida · em vigor" },
        { rotulo: "Início", valor: formatDate(p.inicioVigencia) },
        { rotulo: "Fim", valor: formatDate(p.fimVigencia) },
        { rotulo: "Prêmio total", valor: formatBRL(p.premioTotal) },
        { rotulo: "Item", valor: p.item?.descricao ?? "—" },
      ],
    };
  }
  if (b.acao === "STATUS_PARCELAS") {
    const pagas = parcelas.filter((i) => i.status === "PAGO").length;
    return { ...base, titulo: "Parcelas consultadas", resumo: `${pagas} de ${parcelas.length} parcelas pagas.`, dados: [{ rotulo: "Forma", valor: p.formaPagamento }], parcelas };
  }
  return { ...base, titulo: "Nenhum sinistro", resumo: "Não há avisos de sinistro para esta apólice.", dados: [{ rotulo: "Consultado em", valor: formatDate(now()) }] };
});

/* ---------------- documentos / PDF ---------------- */
route("POST", "/documents/parse", async ({ d, body }): Promise<ParseResult> => {
  const b = body as { fileName?: string };
  await wait(400);
  const existing = d.clients[18];
  return {
    documentId: `doc-up-${Date.now()}`,
    arquivo: b?.fileName ?? "apolice.pdf",
    paginas: 6,
    seguradora: "Porto Seguro",
    ramo: "AUTO",
    duracaoMs: 3400,
    clienteExistente: Math.random() > 0.5 ? { id: existing.id, nome: existing.nome } : null,
    campos: [
      { chave: "nome", rotulo: "Nome do segurado", valor: "Rafaela Monteiro Quintela", confianca: 0.98, grupo: "cliente" },
      { chave: "cpfCnpj", rotulo: "CPF", valor: "418.392.507-21", confianca: 0.97, grupo: "cliente" },
      { chave: "nascimento", rotulo: "Data de nascimento", valor: "14/03/1988", confianca: 0.91, grupo: "cliente" },
      { chave: "telefone", rotulo: "Telefone", valor: "(16) 99712-4408", confianca: 0.74, grupo: "cliente" },
      { chave: "email", rotulo: "E-mail", valor: "rafaela.mq@exemplo.com.br", confianca: 0.62, grupo: "cliente" },
      { chave: "endereco", rotulo: "Endereço", valor: "Rua das Acácias, 418 — Jardim América, Ribeirão Preto/SP", confianca: 0.81, grupo: "cliente" },
      { chave: "numero", rotulo: "Nº da apólice", valor: "POR5531907", confianca: 0.99, grupo: "apolice" },
      { chave: "proposta", rotulo: "Nº da proposta", valor: "771204418", confianca: 0.93, grupo: "apolice" },
      { chave: "inicioVigencia", rotulo: "Início de vigência", valor: "06/11/2026", confianca: 0.96, grupo: "apolice" },
      { chave: "fimVigencia", rotulo: "Fim de vigência", valor: "06/11/2027", confianca: 0.96, grupo: "apolice" },
      { chave: "premioTotal", rotulo: "Prêmio total", valor: "R$ 3.842,17", confianca: 0.88, grupo: "apolice" },
      { chave: "placa", rotulo: "Placa", valor: "RTA4E21", confianca: 0.95, grupo: "item" },
      { chave: "modelo", rotulo: "Veículo", valor: "VW T-Cross Highline 1.4 TSI", confianca: 0.86, grupo: "item" },
      { chave: "ano", rotulo: "Ano/modelo", valor: "2024/2025", confianca: 0.69, grupo: "item" },
      { chave: "chassi", rotulo: "Chassi", valor: "9BWBH6BF5R4••••••", confianca: 0.41, grupo: "item" },
      { chave: "formaPagamento", rotulo: "Forma de pagamento", valor: "Boleto · 10x", confianca: 0.78, grupo: "pagamento" },
      { chave: "vencimento1", rotulo: "1º vencimento", valor: "16/11/2026", confianca: 0.55, grupo: "pagamento" },
    ],
  };
});
route("POST", "/clients/from-pdf", ({ d, body }) => {
  const b = body as { campos: Record<string, string>; anexarAoCliente?: string | null };
  if (b.anexarAoCliente) return { clientId: b.anexarAoCliente, criado: false };
  const id = `cli-new-${Date.now()}`;
  d.clients.unshift({
    id,
    nome: b.campos.nome ?? "Novo cliente",
    cpfCnpj: (b.campos.cpfCnpj ?? "").replace(/\D/g, ""),
    nascimento: null,
    telefone: (b.campos.telefone ?? "").replace(/\D/g, ""),
    email: b.campos.email ?? null,
    endereco: null,
    status: "ATIVO",
    origem: "pdf",
    optOut: false,
    criadoEm: now(),
  });
  d.timeline[id] = [{ id: `tl-${id}`, tipo: "CADASTRO", titulo: "Cliente criado a partir do PDF", descricao: "Campos revisados manualmente", data: now(), autor: "Viviani" }];
  return { clientId: id, criado: true };
});

/* ---------------- apólices / parcelas ---------------- */
route("GET", "/policies", ({ d, query }) => {
  const clientId = query.get("clientId");
  return d.policies.filter((p) => !clientId || p.clientId === clientId);
});
function savePolicy(d: DemoDB, b: PolicyInput, id: string): Policy {
  const c = d.clients.find((x) => x.id === b.clientId);
  const ins = d.insurers.find((x) => x.id === b.insurerId);
  if (!c) throw new DemoHttpError(404, "Cliente não encontrado.");
  if (!ins) throw new DemoHttpError(400, "Seguradora inválida");
  const old = d.policies.find((p) => p.id === id);
  const p: Policy = {
    id,
    clientId: c.id,
    clientNome: c.nome,
    insurerId: ins.id,
    seguradora: ins.nome,
    ramo: b.ramo,
    numero: b.numero || "—",
    proposta: b.proposta ?? "",
    emissao: old?.emissao ?? b.inicioVigencia ?? now(),
    inicioVigencia: b.inicioVigencia ?? "",
    fimVigencia: b.fimVigencia ?? "",
    premioTotal: b.premioTotal ?? 0,
    formaPagamento: b.formaPagamento,
    status: b.status,
    item: b.item && (b.item.placa || b.item.modelo) ? { tipo: b.ramo === "AUTO" ? "VEICULO" : "EMPRESA", descricao: b.item.modelo ?? b.item.placa ?? "", placa: b.item.placa ?? undefined, modelo: b.item.modelo ?? undefined, ano: b.item.ano ? Number(b.item.ano) || undefined : undefined } : null,
    documentId: old?.documentId ?? null,
  };
  if (old) Object.assign(old, p);
  else d.policies.unshift(p);
  d.installments = d.installments.filter((i) => i.policyId !== id);
  d.installments.push(
    ...b.parcelas.map((x) => ({ id: `${id}-p${x.numero}`, policyId: id, apoliceNumero: p.numero, clientId: c.id, clientNome: c.nome, telefone: c.telefone, seguradora: ins.nome, numero: x.numero, total: b.parcelas.length, valor: x.valor ?? 0, vencimento: x.vencimento, status: x.status, formaPagamento: b.formaPagamento })),
  );
  recalcStatus(d, c.id);
  return p;
}
route("POST", "/policies", ({ d, body }) => savePolicy(d, body as PolicyInput, `pol-man-${Date.now()}`));
route("PATCH", "/policies/:id", ({ d, params, body }) => {
  if (!d.policies.some((p) => p.id === params.id)) throw new DemoHttpError(404, "Apólice não encontrada");
  return savePolicy(d, body as PolicyInput, params.id);
});
route("GET", "/installments", ({ d, query }): Installment[] => {
  const status = query.get("status");
  return d.installments.filter((i) => !status || i.status === status);
});

/* ---------------- seguradoras ---------------- */
route("GET", "/insurers", ({ d }) => d.insurers);
route("GET", "/insurers/:id", ({ d, params }) => {
  const i = d.insurers.find((x) => x.id === params.id);
  if (!i) throw new DemoHttpError(404, "Seguradora não encontrada.");
  return i;
});
route("GET", "/insurers/:id/credentials", ({ d, params }) => d.credentials.filter((c) => c.insurerId === params.id));
route("PUT", "/insurers/:id/credentials", ({ d, params, body }) => {
  // Como a API real: o conjunto de campos é substituído inteiro.
  const b = body as { tipo: string; valores: Record<string, string> };
  d.credentials = d.credentials.filter((c) => c.insurerId !== params.id);
  for (const [rotulo, valor] of Object.entries(b.valores)) {
    const masked = valor.length > 4 ? "••••••••" + valor.slice(-2) : "••••";
    d.credentials.push({ id: `cred-${rotulo}-${Date.now()}`, insurerId: params.id, tipo: b.tipo, rotulo, valorMascarado: masked, ultimoTeste: null, ultimoErro: null });
  }
  const ins = d.insurers.find((x) => x.id === params.id);
  if (ins && ins.statusIntegracao === "NAO_CONFIGURADA") ins.statusIntegracao = "ERRO";
  return { ok: true };
});
route("POST", "/insurers/:id/test", async ({ d, params }) => {
  await wait(1400);
  const ins = d.insurers.find((x) => x.id === params.id);
  if (!ins) throw new DemoHttpError(404, "Seguradora não encontrada.");
  ins.ultimoTeste = now();
  if (ins.slug === "tokio") return { ok: false, detalhe: "401 Unauthorized — token expirado. Gere um novo Client Secret no portal.", latenciaMs: 812 };
  if (!ins.temApi) return { ok: false, detalhe: "Seguradora sem API oficial — use o portal.", latenciaMs: 0 };
  ins.statusIntegracao = "CONECTADA";
  return { ok: true, detalhe: "Autenticado e apólice de teste localizada.", latenciaMs: Math.round(180 + Math.random() * 320) };
});
// Canal rpa (robô de portal): status da sessão e renovação (login assistido).
route("GET", "/insurers/:id/robot-session", ({ d, params }) => {
  const ins = d.insurers.find((x) => x.id === params.id);
  if (!ins) throw new DemoHttpError(404, "Seguradora não encontrada.");
  if (ins.canal !== "rpa") throw new DemoHttpError(400, "Esta seguradora não usa o robô de portal.");
  // Demo: Tokio pede login assistido (2FA); as demais estão com sessão ativa.
  if (ins.slug === "tokio") return { status: "needs_human" as const, detalhe: "O login da Tokio pediu verificação em duas etapas. Conclua pelo acesso assistido.", headful: false, verificadoEm: now() };
  return { status: "valid" as const, detalhe: "Sessão do robô ativa no portal.", verificadoEm: now() };
});
route("POST", "/insurers/:id/robot-session/renew", async ({ d, params }) => {
  await wait(1600);
  const ins = d.insurers.find((x) => x.id === params.id);
  if (!ins) throw new DemoHttpError(404, "Seguradora não encontrada.");
  if (ins.canal !== "rpa") throw new DemoHttpError(400, "Esta seguradora não usa o robô de portal.");
  ins.ultimoTeste = now();
  if (ins.slug === "tokio") return { status: "needs_human" as const, detalhe: "Captcha/2FA no portal da Tokio. Conclua o login na janela do robô (noVNC).", headful: true, verificadoEm: now() };
  ins.statusIntegracao = "CONECTADA";
  return { status: "valid" as const, detalhe: "Sessão renovada: login no portal concluído.", verificadoEm: now() };
});

/* ---------------- mensageria ---------------- */
route("GET", "/messaging/instance", ({ d }) => d.instance);
route("POST", "/messaging/instance/connect", async ({ d }) => {
  await wait(600);
  d.instance = { ...d.instance, status: "AGUARDANDO_QR", qrCode: `SERGINHO-DEMO-${Date.now()}`, numero: null, atualizadoEm: now() };
  return d.instance;
});
route("POST", "/messaging/instance/confirm-demo", ({ d }) => {
  d.instance = { ...d.instance, status: "CONECTADO", qrCode: null, numero: "5516990000000", atualizadoEm: now() };
  return d.instance;
});
route("POST", "/messaging/instance/logout", ({ d }) => {
  d.instance = { ...d.instance, status: "DESCONECTADO", qrCode: null, numero: null, atualizadoEm: now() };
  return d.instance;
});
route("PATCH", "/messaging/instance", ({ d, body }) => {
  d.instance = { ...d.instance, ...(body as object) };
  return d.instance;
});
route("GET", "/messaging/templates", ({ d }) => d.templates);
route("POST", "/messaging/templates", ({ d, body }): MessageTemplate => {
  const b = body as { nome?: string; texto?: string };
  const nome = (b.nome ?? "").trim();
  const texto = (b.texto ?? "").trim();
  if (nome.length < 2 || nome.length > 80) throw new DemoHttpError(400, "Dê um nome de 2 a 80 caracteres ao template.");
  if (!texto || texto.length > 4000) throw new DemoHttpError(400, "Escreva o texto da mensagem (até 4000 caracteres).");
  if (d.templates.some((t) => t.nome.toLowerCase() === nome.toLowerCase())) throw new DemoHttpError(409, "Já existe um template com esse nome.");
  const t: MessageTemplate = { id: `tpl-${Date.now()}`, nome, texto, anexarBoleto: false };
  d.templates.push(t);
  return t;
});
route("GET", "/messaging/rules", ({ d }) => d.rules);
route("PATCH", "/messaging/rules/:id", ({ d, params, body }): MessageRule => {
  const r = d.rules.find((x) => x.id === params.id);
  if (!r) throw new DemoHttpError(404, "Régua não encontrada.");
  Object.assign(r, body as object);
  return r;
});
const ANEXO_MAX = 10 * 1024 * 1024;
const ANEXO_TIPOS = /\.(pdf|jpe?g|png|webp|docx?|xlsx?|pptx)$/i;
function pacingOf(d: DemoDB): MessagingPacing {
  d.pacing ??= { intervaloMinSeg: 50, intervaloMaxSeg: 230, loteTamanho: 25, lotePausaMin: 240 };
  return { ...d.pacing, janelaInicio: 8, janelaFim: 20, limiteDiario: d.instance.limiteDiario, enviadasHoje: d.instance.enviadasHoje };
}
const estimar = (d: DemoDB, n: number) => estimateSchedule(n, pacingOf(d), new Date(), d.instance.enviadasHoje);
route("GET", "/messaging/settings", ({ d }) => pacingOf(d));
route("PATCH", "/messaging/settings", ({ d, body }) => {
  const p = { ...pacingOf(d), ...(body as Partial<MessagingPacing>) };
  if (p.intervaloMinSeg < 5 || p.intervaloMaxSeg > 540) throw new DemoHttpError(400, "Intervalo entre 5 e 540 segundos.");
  if (p.intervaloMinSeg > p.intervaloMaxSeg) throw new DemoHttpError(400, "Intervalo mínimo maior que o máximo");
  if (p.loteTamanho < 1 || p.loteTamanho > 500) throw new DemoHttpError(400, "Lote entre 1 e 500 mensagens.");
  if (p.lotePausaMin < 0 || p.lotePausaMin > 1440) throw new DemoHttpError(400, "Pausa entre 0 e 24 horas.");
  d.pacing = { intervaloMinSeg: p.intervaloMinSeg, intervaloMaxSeg: p.intervaloMaxSeg, loteTamanho: p.loteTamanho, lotePausaMin: p.lotePausaMin };
  return pacingOf(d);
});
route("POST", "/messaging/attachments", async ({ d, body }): Promise<MessageAttachment> => {
  const f = body instanceof FormData ? body.get("arquivo") : null;
  if (!f || typeof f === "string") throw new DemoHttpError(400, "Nenhum arquivo enviado");
  if (f.size > ANEXO_MAX) throw new DemoHttpError(413, "O anexo passa de 10 MB");
  if (!ANEXO_TIPOS.test(f.name)) throw new DemoHttpError(400, "Formato não aceito. Envie PDF, imagem (JPG, PNG, WebP) ou documento do Word/Excel.");
  await wait(400);
  const id = `anexo-${Date.now()}`;
  d.anexos = { ...(d.anexos ?? {}), [id]: f.name };
  return { documentId: id, nome: f.name, mimeType: f.type || "application/octet-stream", tamanho: f.size };
});
const anexoNome = (d: DemoDB, id?: string | null) => (id ? (d.anexos?.[id] ?? d.documents.find((x) => x.id === id)?.nome ?? null) : null);
/** CSV: normaliza, descarta inválidos e repetidos e tira quem pediu para sair (pelo telefone do cliente). */
function csvTargets(d: DemoDB, contatos: BroadcastContact[]) {
  const seen = new Set<string>();
  let invalidos = 0;
  let duplicados = 0;
  const lista: BroadcastContact[] = [];
  for (const c of contatos) {
    const tel = normalizePhoneBr(c.telefone);
    if (!tel) invalidos++;
    else if (seen.has(tel)) duplicados++;
    else {
      seen.add(tel);
      lista.push({ ...c, telefone: tel });
    }
  }
  const optOutTel = new Set(d.clients.filter((c) => c.optOut && c.telefone).map((c) => normalizePhoneBr(c.telefone)));
  const alvo = lista.filter((c) => !optOutTel.has(c.telefone));
  return { alvo, invalidos, duplicados, optOut: lista.length - alvo.length };
}
const csvVars = (c: BroadcastContact) => ({ ...c.vars, nome: (c.nome || c.vars.nome || "").split(" ")[0] ?? "", nome_completo: c.nome || c.vars.nome || "", telefone: c.telefone });
const renderLoose = (texto: string, vars: Record<string, string>) => texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k.toLowerCase()] ?? "");

function filterClients(d: DemoDB, f: BroadcastFilter) {
  return d.clients
    .map((c) => toListItem(d, c))
    .filter((c) => (!f.status || f.status === "TODOS" ? true : c.status === f.status))
    .filter((c) => (!f.ramo || f.ramo === "TODOS" ? true : c.ramos.includes(f.ramo)))
    .filter((c) => {
      if (!f.seguradora || f.seguradora === "TODAS") return true;
      const nome = d.insurers.find((i) => i.id === f.seguradora)?.nome;
      return !!nome && c.seguradoras.includes(nome);
    });
}
function templateText(d: DemoDB, src: { templateId?: string; conteudo?: string }) {
  if (src.conteudo !== undefined) {
    if (!src.conteudo.trim()) throw new DemoHttpError(400, "Escreva a mensagem do disparo.");
    return src.conteudo;
  }
  const t = d.templates.find((x) => x.id === src.templateId);
  if (!t) throw new DemoHttpError(404, "Template não encontrado.");
  if (t.anexarBoleto) throw new DemoHttpError(400, "Templates com boleto anexo só podem ser usados pelas réguas");
  return t.texto;
}
type BroadcastBody = { filtro: BroadcastFilter; templateId?: string; conteudo?: string; contatos?: BroadcastContact[]; anexoDocumentId?: string | null };
route("POST", "/messaging/broadcast/preview", ({ d, body }): BroadcastPreview => {
  const b = body as BroadcastBody;
  const texto = templateText(d, b);
  if (b.contatos?.length) {
    const r = csvTargets(d, b.contatos);
    const e = estimar(d, r.alvo.length);
    return {
      total: r.alvo.length,
      optOut: r.optOut,
      invalidos: r.invalidos,
      duplicados: r.duplicados,
      lotes: e.lotes,
      inicioPrevisto: e.inicioPrevisto,
      terminoPrevisto: e.terminoPrevisto,
      // Como na API real: a tela monta a prévia do CSV com a primeira linha.
      amostra: [],
    };
  }
  const list = filterClients(d, b.filtro);
  const ok = list.filter((c) => !c.optOut);
  const e = estimar(d, ok.length);
  return {
    total: ok.length,
    optOut: list.length - ok.length,
    invalidos: 0,
    duplicados: 0,
    lotes: e.lotes,
    inicioPrevisto: e.inicioPrevisto,
    terminoPrevisto: e.terminoPrevisto,
    amostra: ok.slice(0, 3).map((c) => ({
      clientId: c.id,
      nome: c.nome,
      telefone: c.telefone,
      texto: renderTemplate(texto, { nome: c.nome.split(" ")[0], seguradora: c.seguradoras[0] ?? "", placa: c.placas[0] ?? "", apolice: "", valor: "", vencimento: c.proximoVencimento ? formatDate(c.proximoVencimento) : "" }),
    })),
  };
});
route("POST", "/messaging/broadcast", ({ d, body }): BroadcastResult => {
  const b = body as BroadcastBody;
  const texto = templateText(d, b);
  const anexo = anexoNome(d, b.anexoDocumentId);
  const t = Date.now();
  const p = pacingOf(d);
  // Horário previsto de cada mensagem: intervalo médio + pausa a cada lote (a fila real ainda respeita a janela).
  const media = ((p.intervaloMinSeg + p.intervaloMaxSeg) / 2) * 1000;
  const quando = (k: number) => new Date(t + (k + 1) * media + Math.floor(k / Math.max(1, p.loteTamanho)) * p.lotePausaMin * 60_000).toISOString();
  if (b.contatos?.length) {
    const { alvo } = csvTargets(d, b.contatos);
    alvo.forEach((c, k) => {
      const cli = d.clients.find((x) => normalizePhoneBr(x.telefone) === c.telefone);
      d.messages.unshift({
        id: `msg-b-${t}-${k}`,
        clientId: cli?.id ?? "",
        clientNome: cli?.nome ?? (c.nome || "Contato do CSV"),
        telefone: c.telefone,
        regra: "Disparo em massa (CSV)",
        texto: renderLoose(texto, csvVars(c)),
        anexo,
        status: "NA_FILA",
        criadoEm: now(),
        agendadoPara: quando(k),
        enviadoEm: null,
        erro: null,
      });
    });
    const e = estimar(d, alvo.length);
    return { enfileiradas: alvo.length, lotes: e.lotes, terminoPrevisto: e.terminoPrevisto };
  }
  const list = filterClients(d, b.filtro).filter((c) => !c.optOut);
  list.forEach((c, k) =>
    d.messages.unshift({
      id: `msg-b-${t}-${k}`,
      clientId: c.id,
      clientNome: c.nome,
      telefone: c.telefone,
      regra: "Disparo em massa",
      texto: renderTemplate(texto, { nome: c.nome.split(" ")[0], seguradora: c.seguradoras[0] ?? "" }),
      anexo,
      status: "NA_FILA",
      criadoEm: now(),
      agendadoPara: quando(k),
      enviadoEm: null,
      erro: null,
    }),
  );
  const e = estimar(d, list.length);
  return { enfileiradas: list.length, lotes: e.lotes, terminoPrevisto: e.terminoPrevisto };
});
route("GET", "/messaging/history", ({ d }) => d.messages.filter((m) => !["NA_FILA", "ENVIANDO"].includes(m.status)));
route("GET", "/messaging/queue", ({ d }) => d.messages.filter((m) => ["NA_FILA", "ENVIANDO"].includes(m.status)).sort((a, b) => (a.agendadoPara ?? "").localeCompare(b.agendadoPara ?? "")));
route("POST", "/messaging/send", async ({ d, body }) => {
  const b = body as { clientId: string; texto: string; anexo?: string };
  await wait(700);
  const c = d.clients.find((x) => x.id === b.clientId);
  d.messages.unshift({ id: `msg-s-${Date.now()}`, clientId: b.clientId, clientNome: c?.nome ?? "", telefone: c?.telefone ?? "", regra: null, texto: b.texto, anexo: anexoNome(d, b.anexo) ?? b.anexo ?? null, status: "ENVIADA", criadoEm: now(), agendadoPara: null, enviadoEm: now(), erro: null });
  return { ok: true };
});

/* ---------------- leads / CRM ---------------- */
route("GET", "/leads", ({ d }) => d.leads);
route("POST", "/leads", ({ d, body }): Lead => {
  const b = body as CreateLeadInput;
  if (!b?.nome || !b?.telefone) throw new DemoHttpError(400, "Nome e telefone são obrigatórios.");
  const lead: Lead = { id: `lead-${Date.now()}`, nome: b.nome, telefone: b.telefone.replace(/\D/g, ""), email: b.email ?? null, produto: b.produto, origem: b.origem, etapa: "NOVO", responsavel: null, proximoContato: null, notas: b.mensagem ?? "", valorEstimado: null, criadoEm: now() };
  d.leads.unshift(lead);
  return lead;
});
route("PATCH", "/leads/:id", ({ d, params, body }) => {
  const l = d.leads.find((x) => x.id === params.id);
  if (!l) throw new DemoHttpError(404, "Lead não encontrado.");
  Object.assign(l, body as object);
  return l;
});
route("POST", "/leads/:id/convert", ({ d, params }) => {
  const l = d.leads.find((x) => x.id === params.id);
  if (!l) throw new DemoHttpError(404, "Lead não encontrado.");
  const id = `cli-lead-${Date.now()}`;
  d.clients.unshift({ id, nome: l.nome, cpfCnpj: "", nascimento: null, telefone: l.telefone, email: l.email, endereco: null, status: "INATIVO", origem: l.origem, optOut: false, criadoEm: now() });
  d.timeline[id] = [{ id: `tl-${id}`, tipo: "CADASTRO", titulo: "Convertido a partir do CRM", descricao: `Lead de ${l.origem}`, data: now(), autor: l.responsavel ?? undefined }];
  l.etapa = "FECHADO";
  l.clientId = id;
  return { clientId: id };
});

/* ---------------- cotações ---------------- */
route("GET", "/quotes", ({ d }) => d.quotes);
route("GET", "/quotes/:id", ({ d, params }) => {
  const q = d.quotes.find((x) => x.id === params.id);
  if (!q) throw new DemoHttpError(404, "Cotação não encontrada.");
  // simula conclusão do processamento
  if (q.status === "PROCESSANDO" && Date.now() - new Date(q.criadoEm).getTime() > 6000) {
    const base = q.ramo === "AUTO" ? 3400 : 1200;
    q.status = "CONCLUIDA";
    q.resultados = ["Azul Seguros", "HDI Seguros", "Porto Seguro", "Allianz", "Tokio Marine"].map((s, k) => ({
      seguradora: s,
      premio: Math.round(base * (0.9 + k * 0.08 + Math.random() * 0.05)),
      parcelas: `até ${[10, 10, 12, 10, 6][k]}x sem juros`,
      franquia: q.ramo === "AUTO" ? 3200 + k * 350 : null,
      coberturas: q.ramo === "AUTO" ? ["Colisão", "Roubo e furto", "Terceiros R$ 200 mil", "Assistência 24h"] : ["Cobertura básica", "Assistência 24h"],
      destaque: k === 0 ? "melhor_preco" : k === 2 ? "melhor_custo_beneficio" : null,
    }));
  }
  return q;
});
route("POST", "/quotes", async ({ d, body }): Promise<Quote> => {
  const b = body as CreateQuoteInput;
  await wait(500);
  const q: Quote = { id: `cot-${Date.now()}`, leadId: b.leadId ?? null, clientId: b.clientId ?? null, nome: b.nome, ramo: b.ramo, status: "PROCESSANDO", aggilizadorId: `AGG-${Math.floor(100000 + Math.random() * 900000)}`, criadoEm: now(), descricao: b.veiculo?.modelo ? `${b.veiculo.modelo} ${b.veiculo.ano ?? ""}`.trim() : (b.observacoes ?? ""), resultados: [] };
  d.quotes.unshift(q);
  return q;
});
route("POST", "/quotes/:id/send", async ({ d, params }) => {
  await wait(600);
  const q = d.quotes.find((x) => x.id === params.id);
  if (q) q.status = "ENVIADA";
  return { ok: true };
});

/* ---------------- dispatcher ---------------- */
export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(path, "http://demo.local");
  const p = url.pathname.replace(/^\/api/, "");
  await wait(jitter(path.startsWith("/dashboard") ? 260 : 180));
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = p.match(r.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const res = await r.handler({ params, query: url.searchParams, body, d: getDB() });
    return structuredClone(res) as T;
  }
  throw new DemoHttpError(404, `Rota demo não encontrada: ${method} ${p}`);
}
