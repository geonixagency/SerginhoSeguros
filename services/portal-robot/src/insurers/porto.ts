// Porto Seguro (Corretor Online) — também cobre Azul e Itaú, que ficam na mesma plataforma.
//
// Endpoints e parâmetros descobertos no bundle JS PÚBLICO do micro-frontend de cobrança
// (ssmr-corp-ncol-mfe-financial-management), lido sem sessão em 06/11/2026:
//   base  https://apis.portoseguro.com.br/corretor-online/billing/v1
//   POST  /installments                         lista de parcelas (corpo montado em `montarCorpo`)
//   GET   /installments/installments-reports     relatórios de parcelas
//   GET   /financial-installments/associated-suseps
//   GET   /financial-installments/billet-download?<chave>  -> { file: <PDF base64> } (2ª via)
// As chamadas são feitas DE DENTRO da página logada (fetch com credentials:include),
// então os cabeçalhos de sessão do portal são herdados pelo navegador — este código não
// manipula tokens. Enum de status no corpo: OVERDUE=1 DUE=2 PROCESSING=3 PAID=4 CANCELLED=5.
//
// A VALIDAR com login real: formato de startDate/endDate, limite de pageSize, nomes exatos
// dos campos de status/situação na resposta e o fluxo de escolha de SUSEP no login.
import type { PageSignals, PortalPage } from "../page";
import { RobotError, type LoginCredential, type PortoBilletKey, type PortoInstallment, type PortoInstallmentsResult, type SessionStatus } from "../types";
import { arrayAt, digits, int, isObj, isoDate, num, pick, shapeOf, situacaoParcela, str, type Json } from "../util";
import type { PortalDefinition } from "./definition";

export const PORTO_ORIGIN = "https://corretor.portoseguro.com.br";
export const PORTO_HOME = `${PORTO_ORIGIN}/novocol/financialmanagement`;
export const PORTO_LOGIN = `${PORTO_ORIGIN}/portal/site/corretoronline/template.LOGIN/`;
export const PORTO_BILLING = "https://apis.portoseguro.com.br/corretor-online/billing/v1";

export const PORTO_STATUS = { OVERDUE: 1, DUE: 2, PROCESSING: 3, PAID: 4, CANCELLED: 5 } as const;
export type PortoStatusName = keyof typeof PORTO_STATUS;
/** Boleto, Boleto Orquestrador, ADC, ADC sem prévia, cartões, PSP, cartão recorrente, PIX. */
export const PORTO_PAYMENT_TYPES = [1, 2, 15, 16, 22, 28, 38, 41, 42];

export interface PortoFilters {
  /** Só vencidas (atalho para status OVERDUE). */
  vencidas?: boolean;
  /** "Somente débitos recusados" (flagUnauthorizedDebitBill). */
  debitoRecusado?: boolean;
  /** Status explícitos (sobrepõe `vencidas`). */
  status?: PortoStatusName[];
  /** Período de vencimento (aaaa-mm-dd). */
  de?: string;
  ate?: string;
  /** Filtra por documento do cliente (CPF/CNPJ, só dígitos). */
  cpfCnpj?: string;
  suseps?: string[];
  pagina?: number;
  tamanhoPagina?: number;
  /** Máximo de páginas a percorrer (padrão 10). */
  maxPaginas?: number;
}

/** Monta o corpo do POST /installments. Campos vazios são removidos (como no portal). */
export function montarCorpo(f: PortoFilters): Record<string, unknown> {
  const status = f.status ?? (f.vencidas ? (["OVERDUE"] as PortoStatusName[]) : undefined);
  const corpo: Record<string, unknown> = {
    status: status?.map((s) => PORTO_STATUS[s]),
    paymentsTypes: PORTO_PAYMENT_TYPES,
    productIds: [99], // 99 = todos os produtos (default do portal)
    startDate: f.de ?? "",
    endDate: f.ate ?? "",
    page: String(f.pagina ?? 1),
    pageSize: String(f.tamanhoPagina ?? 50),
    clientDocument: f.cpfCnpj ? digits(f.cpfCnpj) : undefined,
    suseps: f.suseps,
    flagUnauthorizedDebitBill: f.debitoRecusado ? true : undefined,
    orderProperty: "VC",
    orderType: "ASC",
  };
  for (const k of Object.keys(corpo)) {
    const v = corpo[k];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) delete corpo[k];
  }
  return corpo;
}

const STATUS_NUM_TO_SITUACAO: Record<number, string> = { 1: "Vencida", 2: "A vencer", 3: "Processando", 4: "Paga", 5: "Cancelada" };

/** Normaliza um item de parcela da resposta do portal. */
export function mapInstallment(raw: Json): PortoInstallment {
  const contract = isObj(raw) ? pick(raw, ["contract"]) : undefined;
  const meta = isObj(raw) ? pick(raw, ["metaData", "meta"]) : undefined;
  const statusRaw = str(pick(raw, ["status"]));
  const statusNum = int(pick(raw, ["status"]));
  const situacaoTxt = statusRaw && Number.isNaN(Number(statusRaw)) ? statusRaw : statusNum !== null ? STATUS_NUM_TO_SITUACAO[statusNum] ?? null : null;
  const paymentTypeCode = str(pick(raw, ["paymentType.code", "paymentTypeCode"]));
  const policy = str(pick(meta, ["sapPolicy", "policy"])) ?? str(pick(raw, ["policy"]));
  const chave: PortoBilletKey | null =
    policy && paymentTypeCode
      ? {
          paymentTitle: str(pick(raw, ["paymentTitle"])) ?? "",
          companyCode: str(pick(contract, ["companyCode"])) ?? "",
          paymentTypeCode,
          policy: policy.replace(/-/g, ""),
          productId: str(pick(contract, ["productId"])) ?? "",
          system: str(pick(raw, ["system"])) ?? "",
          proposal: str(pick(meta, ["proposal"])) ?? "",
          installmentNumber: str(pick(raw, ["number", "installmentNumber"])) ?? "",
        }
      : null;
  const situacao = situacaoParcela(situacaoTxt);
  return {
    numero: int(pick(raw, ["number", "installmentNumber"])) ?? 0,
    situacao,
    situacaoPortal: situacaoTxt ?? undefined,
    vencimento: isoDate(pick(raw, ["dueDate"])),
    valor: num(pick(raw, ["value"])),
    dataPagamento: isoDate(pick(raw, ["paymentDate", "payDate"])),
    tipoCobranca: paymentTypeCode,
    acaoPix: paymentTypeCode === "42" || situacao !== "PAGA",
    acaoSegundaVia: Boolean(chave) && situacao !== "PAGA" && situacao !== "CANCELADA",
    apolice: policy ?? "",
    endosso: str(pick(meta, ["endorsement"])),
    proposta: str(pick(meta, ["proposal"])),
    cpfCnpj: digits(str(pick(contract, ["client.document", "financialResponsible.document"]))) || null,
    nomeCliente: str(pick(contract, ["financialResponsible.name", "client.civilName", "client.name"])),
    produtoId: int(pick(contract, ["productId"])),
    debitoRecusado: /recusad/i.test(situacaoTxt ?? ""),
    chaveBoleto: chave,
  };
}

/** Extrai a lista de parcelas e a paginação de uma resposta (tolerante a formatos). */
export function extrairParcelas(resp: Json): { parcelas: PortoInstallment[]; total: number; totalPaginas: number } {
  const results = arrayAt(resp, ["results", "data", "installments", "content"]);
  const total = int(pick(resp, ["page.count", "totalCount", "total"])) ?? results.length;
  const totalPaginas = int(pick(resp, ["page.totalPages", "totalPages"])) ?? 1;
  return { parcelas: results.map(mapInstallment), total, totalPaginas };
}

// ---------------------------------------------------------------- fluxos (usam a página logada)

async function postInstallments(page: PortalPage, corpo: Record<string, unknown>): Promise<Json> {
  const res = await page.fetch({ url: `${PORTO_BILLING}/installments`, method: "POST", body: corpo });
  if (res.status === 401 || res.status === 403) throw new RobotError("SESSION_EXPIRED", "Sessão da Porto expirou");
  if (res.status >= 400) throw new RobotError("PORTAL_ERROR", `Porto respondeu ${res.status} em /installments`);
  try {
    return JSON.parse(res.body) as Json;
  } catch {
    throw new RobotError("PORTAL_ERROR", "Resposta da Porto não é JSON (provável tela de login)");
  }
}

export async function listInstallments(page: PortalPage, filtros: PortoFilters, debugShapes = false): Promise<PortoInstallmentsResult> {
  const maxPaginas = Math.max(1, Math.min(filtros.maxPaginas ?? 10, 50));
  const tamanho = filtros.tamanhoPagina ?? 50;
  const todas: PortoInstallment[] = [];
  let pagina = filtros.pagina ?? 1;
  let total = 0;
  let totalPaginas = 1;
  let estrutura: unknown;
  do {
    const resp = await postInstallments(page, montarCorpo({ ...filtros, pagina, tamanhoPagina: tamanho }));
    if (debugShapes && estrutura === undefined) estrutura = shapeOf(resp);
    const { parcelas, total: t, totalPaginas: tp } = extrairParcelas(resp);
    todas.push(...parcelas);
    total = t;
    totalPaginas = tp;
    pagina++;
    if (pagina <= totalPaginas && pagina <= maxPaginas) await page.wait(300);
  } while (pagina <= totalPaginas && pagina <= maxPaginas);
  return { total: total || todas.length, paginas: Math.min(totalPaginas, maxPaginas), parcelas: todas, ...(debugShapes ? { estrutura } : {}) };
}

/** 2ª via do boleto em base64, quando a parcela tem chave e a ação está liberada. */
export async function getBilletBase64(page: PortalPage, chave: PortoBilletKey): Promise<string> {
  const qs = new URLSearchParams(Object.entries(chave).filter(([, v]) => v !== "")).toString();
  const res = await page.fetch({ url: `${PORTO_BILLING}/financial-installments/billet-download?${qs}` });
  if (res.status === 401 || res.status === 403) throw new RobotError("SESSION_EXPIRED", "Sessão da Porto expirou");
  if (res.status >= 400) throw new RobotError("PORTAL_ERROR", `Porto respondeu ${res.status} no download do boleto`);
  const file = str(pick(JSON.parse(res.body) as Json, ["file", "data.file", "document"]));
  if (!file) throw new RobotError("NOT_FOUND", "Boleto não disponível para esta parcela");
  return file;
}

// ---------------------------------------------------------------- login / classificação

function classify(s: PageSignals): SessionStatus {
  if (s.captcha) return "needs_human";
  if (s.segundoFator) return "needs_human";
  if (s.campoSenha || /template\.LOGIN|\/login/i.test(s.url)) return "expired";
  return "valid";
}

export const portoDefinition: PortalDefinition = {
  insurer: "porto",
  homeUrl: PORTO_HOME,
  loginUrl: PORTO_LOGIN,
  classify,
  async submitLogin(page, cred: LoginCredential) {
    await page.goto(PORTO_LOGIN);
    // O portal abre o login num modal.
    await page.pause();
    if (await page.isVisible('button[onclick="openLogin()"]')) await page.click('button[onclick="openLogin()"]');
    await page.pause();
    await page.typeHuman("#logonPrincipal", cred.usuario);
    await page.pause();
    await page.typeHuman('input[name="password"]', cred.senha);
    if (cred.susep) await page.selectFirstOption("#inputSusep", cred.susep);
    // reCAPTCHA Enterprise / segunda etapa: se aparecer, uma pessoa conclui no noVNC.
    const antes = await page.signals();
    if (antes.captcha || antes.segundoFator) return "needs_human";
    await page.pause();
    await page.click("#inputLogin");
    await page.wait(2500);
    const depois = await page.signals();
    if (depois.captcha || depois.segundoFator) return "needs_human";
    return "submitted";
  },
};
