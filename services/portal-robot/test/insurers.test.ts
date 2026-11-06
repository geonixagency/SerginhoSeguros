// Testes dos fluxos das seguradoras com fixtures sintéticas (dados fictícios).
import { describe, expect, it } from "vitest";
import { FakePage, fx } from "./fakePage";
import { fetchClient, TOKIO_BFF } from "../src/insurers/tokio";
import { extrairParcelas, getBilletBase64, listInstallments, montarCorpo, mapInstallment, PORTO_BILLING } from "../src/insurers/porto";
import { situacaoParcela, isoDate, num } from "../src/util";
import { RobotError } from "../src/types";

const tokioRoutes = {
  "GET /portais/bff/v1/consulta-unica/apolice/cpfCnpj/11144477735": fx("tokio/apolices.json"),
  "GET /portais/bff/v1/consulta-unica/item/AP-0001/0/false": fx("tokio/item-AP-0001.json"),
  "GET /portais/bff/v1/consulta-unica/item/AP-0002/0/false": fx("tokio/item-AP-0002.json"),
};

describe("util", () => {
  it("situacaoParcela traduz textos do portal", () => {
    expect(situacaoParcela("Pago")).toBe("PAGA");
    expect(situacaoParcela("Em aberto")).toBe("PENDENTE");
    expect(situacaoParcela("Débito recusado")).toBe("VENCIDA");
    expect(situacaoParcela("Cancelada")).toBe("CANCELADA");
    expect(situacaoParcela(null)).toBe("DESCONHECIDA");
  });
  it("isoDate aceita dd/mm/aaaa e aaaa-mm-dd; num aceita R$ e vírgula", () => {
    expect(isoDate("10/03/2026")).toBe("2026-03-10");
    expect(isoDate("2026-03-10T00:00:00")).toBe("2026-03-10");
    expect(num("R$ 1.234,56")).toBe(1234.56);
    expect(num("489.9")).toBe(489.9);
  });
});

describe("Tokio: consulta de cliente", () => {
  it("junta apólices, parcelas e contatos a partir dos BFFs", async () => {
    const page = new FakePage({ routes: tokioRoutes });
    const r = await fetchClient(page, "111.444.777-35");
    expect(r.cpfCnpj).toBe("11144477735");
    expect(r.apolices).toHaveLength(2);
    const auto = r.apolices[0]!;
    expect(auto.numero).toBe("0531-99887766");
    expect(auto.placa).toBe("ABC1D23");
    expect(auto.parcelas).toHaveLength(2);
    expect(auto.parcelas[0]).toMatchObject({ numero: 1, situacao: "PAGA", vencimento: "2026-03-10", valor: 350, dataPagamento: "2026-03-09" });
    expect(auto.parcelas[1]).toMatchObject({ numero: 2, situacao: "PENDENTE", acaoPix: true, acaoSegundaVia: true });
    expect(r.contato).toMatchObject({ nome: "Cliente Ficticio Um" });
    expect(r.contato!.telefones).toContain("14999990001");
    expect(r.contato!.emails).toContain("ficticio.um@exemplo.invalid");
    // chamou a lista + o detalhe de cada apólice
    expect(page.calls.filter((c) => c.url.includes("/item/"))).toHaveLength(2);
    expect(page.calls[0]!.url).toBe(`${TOKIO_BFF}/apolice/cpfCnpj/11144477735`);
  });

  it("sessão expirada no BFF vira RobotError SESSION_EXPIRED", async () => {
    const page = new FakePage({
      routes: { "GET /portais/bff/v1/consulta-unica/apolice/cpfCnpj/11144477735": () => ({ status: 401, url: "x", body: "" }) },
    });
    await expect(fetchClient(page, "11144477735")).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("CPF vazio é rejeitado", async () => {
    const page = new FakePage({ routes: {} });
    await expect(fetchClient(page, "---")).rejects.toBeInstanceOf(RobotError);
  });
});

describe("Porto: parcelas e boleto", () => {
  it("montarCorpo aplica vencidas, débito recusado e período; remove campos vazios", () => {
    const corpo = montarCorpo({ vencidas: true, debitoRecusado: true, de: "2026-10-01", ate: "2026-10-31", cpfCnpj: "111.444.777-35" });
    expect(corpo).toMatchObject({ status: [1], flagUnauthorizedDebitBill: true, startDate: "2026-10-01", endDate: "2026-10-31", clientDocument: "11144477735" });
    expect(corpo).not.toHaveProperty("suseps");
    const vazio = montarCorpo({});
    expect(vazio).not.toHaveProperty("startDate");
    expect(vazio).not.toHaveProperty("status");
  });

  it("mapInstallment monta a chave do boleto e marca débito recusado", () => {
    const p = mapInstallment(JSON.parse(fx("porto/installments-p1.json")).results[0]);
    expect(p).toMatchObject({ numero: 2, situacao: "VENCIDA", valor: 489.9, apolice: "0531-12345678" });
    expect(p.chaveBoleto).toMatchObject({ policy: "053112345678", companyCode: "06", productId: "18", installmentNumber: "2" });
    expect(p.acaoSegundaVia).toBe(true);
  });

  it("listInstallments segue a paginação e soma parcelas", async () => {
    let call = 0;
    const page = new FakePage({
      routes: { "POST /corretor-online/billing/v1/installments": () => ({ status: 200, url: `${PORTO_BILLING}/installments`, body: fx(`porto/installments-p${++call}.json`) }) },
    });
    const r = await listInstallments(page, { vencidas: true });
    expect(r.paginas).toBe(2);
    expect(r.parcelas).toHaveLength(3);
    expect(r.parcelas.map((p) => p.numero).sort()).toEqual([1, 2, 3]);
    expect(r.parcelas.find((p) => p.numero === 1)).toMatchObject({ situacao: "PAGA", dataPagamento: "2026-09-18" });
  });

  it("getBilletBase64 devolve o base64 do campo file", async () => {
    const page = new FakePage({
      routes: { "GET /corretor-online/billing/v1/financial-installments/billet-download": fx("porto/billet.json") },
    });
    const b64 = await getBilletBase64(page, {
      paymentTitle: "Parcela 02", companyCode: "06", paymentTypeCode: "1", policy: "053112345678", productId: "18", system: "0", proposal: "PRO-777", installmentNumber: "2",
    });
    expect(b64).toBe("JVBERi1GQUtFLUJPTEVUTw==");
  });

  it("401 em /installments vira SESSION_EXPIRED", async () => {
    const page = new FakePage({ routes: { "POST /corretor-online/billing/v1/installments": () => ({ status: 401, url: "x", body: "" }) } });
    await expect(listInstallments(page, {})).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
  });

  it("extrairParcelas tolera resposta sem paginação", () => {
    const { parcelas, totalPaginas } = extrairParcelas({ data: [JSON.parse(fx("porto/installments-p2.json")).results[0]] });
    expect(parcelas).toHaveLength(1);
    expect(totalPaginas).toBe(1);
  });
});

describe("classificação de sessão", () => {
  it("campo de senha visível => expired; captcha/2FA => needs_human", async () => {
    const { tokioDefinition } = await import("../src/insurers/tokio");
    expect(tokioDefinition.classify({ url: "x", campoSenha: true, captcha: false, segundoFator: false, texto: "" })).toBe("expired");
    expect(tokioDefinition.classify({ url: "x", campoSenha: true, captcha: true, segundoFator: false, texto: "" })).toBe("needs_human");
    expect(tokioDefinition.classify({ url: "https://portalparceiros.tokiomarine.com.br/portais/visao-cliente-corretor/home", campoSenha: false, captcha: false, segundoFator: false, texto: "" })).toBe("valid");
  });
});
