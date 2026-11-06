// Tokio Marine (Portal Parceiros) — maior carteira da corretora.
//
// A tela "Visão Geral do Cliente" é uma SPA sobre BFFs internos autenticados pela sessão.
// Endpoints observados (base portalparceiros.tokiomarine.com.br/portais/bff/v1/consulta-unica):
//   GET  apolice/cpfCnpj/{cpf}     apólices do cliente (lista com id de cada apólice)
//   GET  item/{idApolice}/0/false  detalhe da apólice: cliente (telefone/e-mail), forma de
//                                  pagamento e a tabela de parcelas (situação, vencimento, valor,
//                                  data de pagamento, tipo de cobrança, ação PIX/2ª via)
// As chamadas são feitas DE DENTRO da página logada (fetch com credentials:include); os
// cabeçalhos de sessão são herdados pelo navegador — este código não manipula tokens.
// Login via OpenAM (ssoportais3.tokiomarine.com.br): usuário, senha e possível 2FA/captcha,
// que viram needs_human.
//
// A VALIDAR com login real: caminhos exatos dos campos no JSON (ver ROBOT_DEBUG_SHAPES) e
// o parâmetro "0/false" de item/{id} (aparenta ser versão/flag fixos do portal).
import type { PageSignals, PortalPage } from "../page";
import { RobotError, type LoginCredential, type RobotContact, type RobotInstallment, type RobotPolicy, type SessionStatus, type TokioClientResult } from "../types";
import { arrayAt, digits, int, isObj, isoDate, num, pick, shapeOf, situacaoParcela, str, type Json } from "../util";
import type { PortalDefinition } from "./definition";

export const TOKIO_ORIGIN = "https://portalparceiros.tokiomarine.com.br";
export const TOKIO_HOME = `${TOKIO_ORIGIN}/portais/visao-cliente-corretor/home`;
export const TOKIO_LOGIN = `${TOKIO_ORIGIN}/portais/visao-cliente-corretor/index.html`;
export const TOKIO_BFF = `${TOKIO_ORIGIN}/portais/bff/v1/consulta-unica`;

async function getJson(page: PortalPage, url: string): Promise<Json> {
  const res = await page.fetch({ url });
  if (res.status === 401 || res.status === 403) throw new RobotError("SESSION_EXPIRED", "Sessão da Tokio expirou");
  if (res.status === 404) throw new RobotError("NOT_FOUND", "Nada encontrado na Tokio para este CPF/CNPJ");
  if (res.status >= 400) throw new RobotError("PORTAL_ERROR", `Tokio respondeu ${res.status}`);
  try {
    return JSON.parse(res.body) as Json;
  } catch {
    throw new RobotError("SESSION_EXPIRED", "Resposta da Tokio não é JSON (provável tela de login)");
  }
}

export function mapParcela(raw: Json): RobotInstallment {
  const situacaoTxt = str(pick(raw, ["situacao", "status", "descricaoSituacao"]));
  const situacao = situacaoParcela(situacaoTxt);
  const temPix = Boolean(pick(raw, ["acaoPix", "pix", "permitePix", "linkPix"]));
  const temSegundaVia = Boolean(pick(raw, ["acaoSegundaVia", "segundaVia", "permiteSegundaVia", "boleto", "linkBoleto"]));
  return {
    numero: int(pick(raw, ["numeroParcela", "parcela", "numero"])) ?? 0,
    situacao,
    situacaoPortal: situacaoTxt ?? undefined,
    vencimento: isoDate(pick(raw, ["dataVencimento", "vencimento"])),
    valor: num(pick(raw, ["valor", "valorParcela"])),
    dataPagamento: isoDate(pick(raw, ["dataPagamento", "pagamento"])),
    tipoCobranca: str(pick(raw, ["tipoCobranca", "formaCobranca", "meioPagamento"])),
    acaoPix: temPix || (situacao !== "PAGA" && situacao !== "CANCELADA"),
    acaoSegundaVia: temSegundaVia,
  };
}

export function mapContato(detalhe: Json): RobotContact | null {
  const cli = pick(detalhe, ["cliente", "segurado", "dadosCliente"]);
  if (!isObj(cli)) return null;
  const tels = arrayAt(cli, ["telefones", "contatos.telefones"])
    .map((t) => digits(str(isObj(t) ? pick(t, ["numero", "telefone", "ddd"]) ?? JSON.stringify(t) : t)))
    .filter(Boolean);
  for (const k of ["telefone", "celular", "telefoneCelular"]) {
    const d = digits(str(pick(cli, [k])));
    if (d) tels.push(d);
  }
  const emails = arrayAt(cli, ["emails"])
    .map((e) => str(isObj(e) ? pick(e, ["email", "endereco"]) : e))
    .filter((v): v is string => Boolean(v));
  const email = str(pick(cli, ["email"]));
  if (email) emails.push(email);
  return { nome: str(pick(cli, ["nome", "nomeCompleto", "razaoSocial"])), telefones: [...new Set(tels)], emails: [...new Set(emails)] };
}

export function mapApolice(resumo: Json, detalhe: Json | null): RobotPolicy {
  const fonte = detalhe && isObj(detalhe) ? (pick(detalhe, ["apolice"]) ?? detalhe) : resumo;
  const parcelasRaw = arrayAt(detalhe ?? resumo, ["parcelas", "cobranca.parcelas", "faturas"]);
  return {
    idPortal: str(pick(resumo, ["id", "idApolice", "codigo"])) ?? "",
    numero: str(pick(fonte, ["numero", "numeroApolice", "apolice"])) ?? "",
    ramo: str(pick(fonte, ["ramo", "nomeRamo"])),
    produto: str(pick(fonte, ["produto", "nomeProduto", "descricaoProduto"])),
    situacao: str(pick(fonte, ["situacao", "status"])),
    inicioVigencia: isoDate(pick(fonte, ["inicioVigencia", "vigenciaInicial", "dataInicioVigencia"])),
    fimVigencia: isoDate(pick(fonte, ["fimVigencia", "vigenciaFinal", "dataFimVigencia"])),
    formaPagamento: str(pick(fonte, ["formaPagamento", "formaPgto"])),
    placa: str(pick(fonte, ["placa", "veiculo.placa"])),
    parcelas: parcelasRaw.map(mapParcela),
  };
}

/** Consulta completa de um cliente: apólices + parcelas + contatos. */
export async function fetchClient(page: PortalPage, cpfCnpj: string, debugShapes = false): Promise<TokioClientResult> {
  const cpf = digits(cpfCnpj);
  if (!cpf) throw new RobotError("BAD_REQUEST", "CPF/CNPJ inválido");
  const lista = await getJson(page, `${TOKIO_BFF}/apolice/cpfCnpj/${cpf}`);
  const resumos = arrayAt(lista, ["apolices", "data", "content", "itens"]);
  const apolices: RobotPolicy[] = [];
  let contato: RobotContact | null = null;
  let estrutura: unknown;
  for (const resumo of resumos) {
    const id = str(pick(resumo, ["id", "idApolice", "codigo"]));
    let detalhe: Json | null = null;
    if (id) {
      try {
        detalhe = await getJson(page, `${TOKIO_BFF}/item/${id}/0/false`);
      } catch (err) {
        if (err instanceof RobotError && err.code === "SESSION_EXPIRED") throw err;
        detalhe = null; // uma apólice sem detalhe não derruba a consulta inteira
      }
      await page.wait(250);
    }
    if (debugShapes && estrutura === undefined && detalhe) estrutura = shapeOf(detalhe);
    if (!contato && detalhe) contato = mapContato(detalhe);
    apolices.push(mapApolice(resumo, detalhe));
  }
  return { cpfCnpj: cpf, apolices, contato, ...(debugShapes ? { estrutura } : {}) };
}

// ---------------------------------------------------------------- login / classificação

function classify(s: PageSignals): SessionStatus {
  if (s.captcha || s.segundoFator) return "needs_human";
  if (s.campoSenha || /openam|\/login|XUI/i.test(s.url)) return "expired";
  return "valid";
}

export const tokioDefinition: PortalDefinition = {
  insurer: "tokio",
  homeUrl: TOKIO_HOME,
  loginUrl: TOKIO_LOGIN,
  classify,
  async submitLogin(page, cred: LoginCredential) {
    await page.goto(TOKIO_HOME); // redireciona para o OpenAM quando não há sessão
    await page.wait(1500);
    const antes = await page.signals();
    if (antes.captcha || antes.segundoFator) return "needs_human";
    // OpenAM (XUI) usa idToken1 (usuário) e idToken2 (senha); caímos para name= como alternativa.
    const userSel = (await page.isVisible("#idToken1")) ? "#idToken1" : 'input[name="IDToken1"]';
    const passSel = (await page.isVisible("#idToken2")) ? "#idToken2" : 'input[name="IDToken2"]';
    await page.pause();
    await page.typeHuman(userSel, cred.usuario);
    await page.pause();
    await page.typeHuman(passSel, cred.senha);
    await page.pause();
    const submit = (await page.isVisible("#loginButton_0")) ? "#loginButton_0" : 'input[type="submit"], button[type="submit"]';
    await page.click(submit);
    await page.wait(2500);
    const depois = await page.signals();
    if (depois.captcha || depois.segundoFator) return "needs_human";
    return "submitted";
  },
};
