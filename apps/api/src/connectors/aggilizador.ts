// Conector do Aggilizador (multicálculo da Agger) — API PÚBLICA de cotação.
//
// Fonte: _pesquisa/aggilizador.md + Swagger https://api.aggilizador.com.br/swagger/docs/v1
// (verificado em 06/11/2026). A API não tem securityDefinitions: a corretora é
// identificada no corpo (QuotationDto) por InsuranceBrokerId / BrokerId / CompanyId / Partner.
//   POST /<Ramo>              salva a cotação (QuotationDto) e devolve o ID
//   GET  /Quotation/{id}      obtém a cotação
//   GET  /<Ramo>/Settings     domínios dos campos (usado no teste de conexão)
//
// NÃO usamos a API interna do app (pdocs/api-prod, token de sessão hubAuth): é
// integração não oficial, pode quebrar e pode violar os termos de uso.
//
// Pendências (TODO): os IDs da corretora ainda são desconhecidos (ver config da landing
// "Online" ou o payload de um envio de teste) e o significado do enum QuotationDto.Type
// não está documentado — por isso não o enviamos; o ramo já é definido pelo endpoint.
import { env } from "../config/env";
import { addDays, todayIso } from "../lib/dates";
import { HttpClient } from "./http";
import { ConnectorError, type Credential, type InsurerConnector, type QuoteRequest, type QuoteResponse } from "./types";
import type { QuoteResultItem } from "@ss/shared";

// ------------------------------------------------------------------ tipos do Swagger (subconjunto usado)
export interface AggTelefone { Ddd?: string; Numero?: string }
export interface AggSegurado {
  NomeCompleto?: string;
  CpfCnpj?: string;
  Email?: string;
  TelefoneCelular?: AggTelefone;
  Cep?: string;
  Uf?: string;
  DataNascimento?: string;
  Sexo?: string;
  EstadoCivil?: string;
}
export interface AggEndereco { Cep?: string; Cidade?: string; Estado?: string; Numero?: string; Logradouro?: string; Complemento?: string; Bairro?: string }
export interface AggVeiculo {
  NumeroChassi?: string; Placa?: string; Uf?: string; Modelo?: string; Fabricante?: string;
  AnoFabricacao?: string; AnoModelo?: string; CodigoFipe?: string; ZeroKm?: string; CepPernoite?: string; Combustivel?: string; Blindado?: string;
}
export interface AggSeguro { VigenciaInicial?: string; VigenciaFinal?: string; TipoSeguro?: string; Bonus?: string; SeguradoraAnterior?: string; NumeroApoliceAnterior?: string; Observacoes?: string }
export interface AggCalculo { Segurado?: AggSegurado; Seguro?: AggSeguro; Veiculo?: AggVeiculo; Imovel?: { Endereco?: AggEndereco; TipoOcupacao?: string; TipoMoradia?: string; TipoConstrucao?: string }; Endereco?: AggEndereco; [k: string]: unknown }
export interface QuotationDto {
  Id?: string;
  InsuranceBroker?: string;
  InsuranceBrokerId?: number;
  BrokerId?: number;
  CompanyId?: number;
  Partner?: number;
  Renovation?: boolean;
  AbortMail?: boolean;
  CalculationAuto?: AggCalculo;
  CalculationResidence?: AggCalculo;
  CalculationBusiness?: AggCalculo;
  CalculationLife?: AggCalculo;
  CalculationTravel?: AggCalculo;
}

/** Ramo interno -> (endpoint, propriedade do QuotationDto). */
export const AGG_RAMOS: Record<string, { path: string; key: keyof QuotationDto }> = {
  auto: { path: "/Auto", key: "CalculationAuto" },
  moto: { path: "/Auto", key: "CalculationAuto" },
  residencial: { path: "/Residence", key: "CalculationResidence" },
  empresarial: { path: "/Business", key: "CalculationBusiness" },
  vida: { path: "/Life", key: "CalculationLife" },
  viagem: { path: "/Travel", key: "CalculationTravel" },
};

// ------------------------------------------------------------------ mapeamento Lead/Cliente -> QuotationDto
const str = (v: unknown): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const digits = (v: unknown) => str(v)?.replace(/\D/g, "");
/** Datas vão como ISO meia-noite (o Swagger declara date-time). */
const isoDateTime = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(0, 10)}T00:00:00` : undefined;
};
const sim = (v: unknown) => (v === undefined ? undefined : v === true || v === "true" || v === "S" ? "S" : "N");
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0))) as T;

export interface BrokerIds { insuranceBrokerId?: number; brokerId?: number; companyId?: number; partner?: number; insuranceBroker?: string }

export function brokerIdsFrom(cred: Credential | null): BrokerIds {
  const v = cred?.valores ?? {};
  const num = (a: string | undefined, b: string | undefined) => {
    const s = a ?? b;
    return s && /^\d+$/.test(s) ? Number(s) : undefined;
  };
  return {
    insuranceBrokerId: num(v.insuranceBrokerId, env.AGGILIZADOR_INSURANCE_BROKER_ID),
    brokerId: num(v.brokerId, env.AGGILIZADOR_BROKER_ID),
    companyId: num(v.companyId, env.AGGILIZADOR_COMPANY_ID),
    partner: num(v.partner, env.AGGILIZADOR_PARTNER),
    insuranceBroker: v.insuranceBroker ?? env.AGGILIZADOR_INSURANCE_BROKER,
  };
}

/**
 * Monta o QuotationDto a partir do lead/cliente e de `dados` (formulário de cotação).
 * Campos aceitos em `dados` (todos opcionais): cep, uf, nascimento, sexo, estadoCivil,
 * vigenciaInicial, tipoSeguro, bonus, seguradoraAnterior, apoliceAnterior, observacoes,
 * veiculo{placa,chassi,modelo,fabricante,anoFabricacao,anoModelo,codigoFipe,zeroKm,cepPernoite,combustivel,blindado},
 * imovel{cep,logradouro,numero,complemento,bairro,cidade,uf,tipoOcupacao,tipoMoradia,tipoConstrucao},
 * extra{...} (repassado sem alteração para o Calculation* — campos do Swagger não modelados aqui).
 */
export function buildQuotationDto(req: QuoteRequest, ids: BrokerIds): { path: string; dto: QuotationDto } {
  const ramo = AGG_RAMOS[req.ramo.toLowerCase()];
  if (!ramo) throw new ConnectorError(`Ramo "${req.ramo}" não suportado pelo Aggilizador (use: ${Object.keys(AGG_RAMOS).join(", ")})`);
  const d = req.dados;
  const tel = digits(req.segurado.telefone)?.replace(/^55(?=\d{10,11}$)/, "");
  const inicio = str(d.vigenciaInicial) ?? todayIso();

  const segurado: AggSegurado = clean({
    NomeCompleto: req.segurado.nome,
    CpfCnpj: digits(req.segurado.cpfCnpj),
    Email: str(req.segurado.email),
    TelefoneCelular: tel && tel.length >= 10 ? { Ddd: tel.slice(0, 2), Numero: tel.slice(2) } : undefined,
    Cep: digits(d.cep),
    Uf: str(d.uf)?.toUpperCase(),
    DataNascimento: isoDateTime(d.nascimento),
    Sexo: str(d.sexo),
    EstadoCivil: str(d.estadoCivil),
  });
  const seguro: AggSeguro = clean({
    VigenciaInicial: isoDateTime(inicio),
    VigenciaFinal: isoDateTime(str(d.vigenciaFinal) ?? addDays(inicio, 365)),
    TipoSeguro: str(d.tipoSeguro),
    Bonus: str(d.bonus),
    SeguradoraAnterior: str(d.seguradoraAnterior),
    NumeroApoliceAnterior: str(d.apoliceAnterior),
    Observacoes: str(d.observacoes),
  });
  const calc: AggCalculo = { Segurado: segurado, Seguro: seguro };

  if (ramo.key === "CalculationAuto") {
    const v = obj(d.veiculo);
    calc.Veiculo = clean({
      Placa: str(v.placa)?.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      NumeroChassi: str(v.chassi),
      Modelo: str(v.modelo),
      Fabricante: str(v.fabricante),
      AnoFabricacao: str(v.anoFabricacao),
      AnoModelo: str(v.anoModelo),
      CodigoFipe: str(v.codigoFipe),
      ZeroKm: sim(v.zeroKm),
      CepPernoite: digits(v.cepPernoite ?? d.cep),
      Combustivel: str(v.combustivel),
      Blindado: sim(v.blindado),
      Uf: str(v.uf ?? d.uf)?.toUpperCase(),
    });
  }
  if (ramo.key === "CalculationResidence" || ramo.key === "CalculationBusiness") {
    const i = obj(d.imovel);
    const endereco: AggEndereco = clean({
      Cep: digits(i.cep ?? d.cep),
      Logradouro: str(i.logradouro),
      Numero: str(i.numero),
      Complemento: str(i.complemento),
      Bairro: str(i.bairro),
      Cidade: str(i.cidade),
      Estado: str(i.uf ?? d.uf)?.toUpperCase(),
    });
    if (ramo.key === "CalculationResidence") {
      calc.Imovel = clean({ Endereco: endereco, TipoOcupacao: str(i.tipoOcupacao), TipoMoradia: str(i.tipoMoradia), TipoConstrucao: str(i.tipoConstrucao) });
    } else calc.Endereco = endereco;
  }
  Object.assign(calc, obj(d.extra));

  const dto: QuotationDto = clean({
    InsuranceBroker: ids.insuranceBroker,
    InsuranceBrokerId: ids.insuranceBrokerId,
    BrokerId: ids.brokerId,
    CompanyId: ids.companyId,
    Partner: ids.partner,
    Renovation: Boolean(d.renovacao),
    AbortMail: d.enviarEmail === true ? false : true, // por padrão não dispara e-mail do Aggilizador ao segurado
    [ramo.key]: clean(calc),
  });
  return { path: ramo.path, dto };
}

// ------------------------------------------------------------------ leitura da resposta
/** POST /<Ramo> devolve "object" sem schema: aceitamos string pura, {Id}, {id}, {QuotationId}. */
export function extractQuotationId(body: unknown): string | null {
  if (typeof body === "string" && body.trim()) return body.trim().replace(/^"|"$/g, "");
  const o = obj(body);
  for (const k of ["Id", "id", "QuotationId", "quotationId", "IdCotacao"]) {
    const v = o[k];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  const data = obj(o.Data ?? o.data);
  return Object.keys(data).length ? extractQuotationId(data) : null;
}

/**
 * GET /Quotation/{id} também não tem schema. Procuramos, de forma tolerante, uma lista
 * de resultados com seguradora + prêmio. Se não houver, a cotação ainda está sendo
 * calculada no Aggilizador (status PROCESSANDO).
 */
export function extractResults(body: unknown): QuoteResultItem[] {
  const o = obj(body);
  const lists = ["Results", "Resultados", "Calculos", "Calculations", "Seguradoras", "Items"]
    .map((k) => o[k])
    .filter(Array.isArray) as unknown[][];
  const out: QuoteResultItem[] = [];
  for (const list of lists) {
    for (const it of list) {
      const r = obj(it);
      const premio = Number(r.Premio ?? r.PremioTotal ?? r.Valor ?? r.premio);
      const seguradora = str(r.Seguradora ?? r.NomeSeguradora ?? r.Insurer ?? r.seguradora);
      if (!seguradora || !Number.isFinite(premio) || premio <= 0) continue;
      out.push({
        seguradora,
        produto: str(r.Produto ?? r.Product),
        premio,
        franquia: Number.isFinite(Number(r.Franquia)) ? Number(r.Franquia) : null,
        parcelas: str(r.Parcelamento ?? r.Parcelas),
      });
    }
  }
  return out.sort((a, b) => a.premio - b.premio);
}

// ------------------------------------------------------------------ conector
export interface AggilizadorOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class AggilizadorConnector implements InsurerConnector {
  slug = "aggilizador";
  capabilities: InsurerConnector["capabilities"] = ["testConnection", "quote"];
  private http: HttpClient;

  constructor(opts: AggilizadorOptions = {}) {
    this.http = new HttpClient({
      baseUrl: opts.baseUrl ?? env.AGGILIZADOR_BASE_URL ?? "https://api.aggilizador.com.br",
      rps: 1,
      retries: 2,
      timeoutMs: 30_000,
      fetchImpl: opts.fetchImpl,
      sleep: opts.sleep,
    });
  }

  async testConnection(cred: Credential) {
    try {
      const res = await this.http.raw({ path: "/Auto/Settings" });
      if (!res.ok) return { ok: false, detalhe: `API respondeu HTTP ${res.status}` };
      const ids = brokerIdsFrom(cred);
      if (!ids.insuranceBrokerId) {
        return { ok: false, detalhe: "API acessível, mas falta o InsuranceBrokerId da corretora (credencial ou AGGILIZADOR_INSURANCE_BROKER_ID)." };
      }
      return { ok: true, detalhe: "API pública do Aggilizador acessível" };
    } catch (err) {
      return { ok: false, detalhe: err instanceof Error ? err.message : "Falha de conexão" };
    }
  }

  async quote(cred: Credential, req: QuoteRequest): Promise<QuoteResponse> {
    const ids = brokerIdsFrom(cred);
    if (!ids.insuranceBrokerId) {
      throw new ConnectorError("InsuranceBrokerId da corretora não configurado: sem ele a cotação não chega à conta do Serginho no Aggilizador.");
    }
    const { path, dto } = buildQuotationDto(req, ids);
    const res = await this.http.raw({ method: "POST", path, body: dto });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* corpo pode ser string pura com o ID */
    }
    if (!res.ok) throw new ConnectorError(`Aggilizador recusou a cotação (HTTP ${res.status})${typeof body === "string" ? `: ${body.slice(0, 200)}` : ""}`, false, res.status);
    const id = extractQuotationId(body);
    if (!id) throw new ConnectorError("Aggilizador não devolveu o ID da cotação");
    return this.getQuote(cred, id).catch(() => ({ externoId: id, status: "PROCESSANDO" as const, resultados: [] }));
  }

  async getQuote(_cred: Credential, externoId: string): Promise<QuoteResponse> {
    const body = await this.http.json<unknown>({ path: `/Quotation/${encodeURIComponent(externoId)}` });
    const resultados = extractResults(body);
    return { externoId, status: resultados.length ? "CONCLUIDA" : "PROCESSANDO", resultados };
  }
}
