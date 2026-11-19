// Endosso: o que muda na apólice/cliente a partir do PDF lido (lógica pura, dados FICTÍCIOS).
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { proporAlteracoes, splitRua, type EndossoLido, type PolicyForDiff } from "../src/modules/endorsements/routes";
import type { ParserOutput } from "../src/modules/documents/pdfParser";

const f = <T>(valor: T | null, confianca = 0.9) => ({ valor, confianca });
const parser = (over: Partial<ParserOutput> = {}): ParserOutput => ({
  seguradora: f("Seguradora Teste"),
  ramo: f("AUTO"),
  cliente: { nome: f("FULANO DE TAL"), cpfCnpj: f(null), nascimento: f(null), telefone: f(null), email: f(null), cep: f(null), endereco: f(null) },
  apolice: { numero: f("1234567"), proposta: f(null), emissao: f("2026-11-10"), inicioVigencia: f(null), fimVigencia: f(null), premioTotal: f(null), formaPagamento: f(null) },
  itens: [{ placa: "XYZ9A88", modelo: "CARRO NOVO 1.0", ano: "2024", chassi: "9BWZZZ377VT000002", confianca: 0.9 }],
  parcelas: [],
  avisos: [],
  paginas: 2,
  tipoDocumento: "endosso",
  endossoCancelamento: false,
  ...over,
});
const apolice = (over: Partial<PolicyForDiff> = {}): PolicyForDiff => ({
  id: "p1",
  numero: "1234567",
  ramo: "AUTO",
  status: "VIGENTE",
  fimVigencia: null,
  premioTotal: new Prisma.Decimal(2000),
  condutorPrincipal: null,
  insurer: { nome: "Seguradora Teste" },
  items: [{ id: "i1", tipo: "VEICULO", placa: "ABC1D23", modelo: "CARRO VELHO 1.0", ano: "2015", chassi: "9BWZZZ377VT000001" }],
  ...over,
});
const endCli = { endereco: { logradouro: "Rua Antiga", numero: "10", bairro: "Centro", cidade: "Cidade A", uf: "SP", cep: "01000-000" } };

describe("proporAlteracoes", () => {
  it("troca de veículo: placa, chassi, modelo e ano; prêmio somado quando o endosso traz só a diferença", () => {
    const e: EndossoLido = { motivos: ["Troca de veículo"], premio: 300, restituicao: false };
    const alt = proporAlteracoes(parser(), e, apolice(), endCli);
    const by = Object.fromEntries(alt.map((a) => [a.campo, a]));
    expect(by["item.placa"]?.depois).toBe("XYZ9A88");
    expect(by["item.chassi"]?.antes).toBe("9BWZZZ377VT000001");
    expect(by["item.modelo"]?.depois).toBe("CARRO NOVO 1.0");
    expect(by["item.ano"]?.depois).toBe("2024");
    expect(by["policy.premioTotal"]).toMatchObject({ antes: "2000.00", depois: "2300.00" });
    expect(by["client.cep"]).toBeUndefined();
  });

  it("mesmo veículo: não propõe trocar modelo por diferença de texto; muda endereço e condutor", () => {
    const out = parser({ itens: [{ placa: "ABC-1D23", modelo: "Carro Velho 1.0 Flex", ano: "2015", chassi: "9BWZZZ377VT000001", confianca: 0.9 }] });
    const e: EndossoLido = { condutor: "BELTRANO DA SILVA", endereco: { endereco: "Rua Nova, 200", bairro: "Jardim", cidade: "Cidade B", uf: "mg", cep: "30000000" } };
    const alt = proporAlteracoes(out, e, apolice(), endCli);
    const campos = alt.map((a) => a.campo);
    expect(campos).not.toContain("item.modelo");
    expect(campos).not.toContain("item.placa");
    expect(alt.find((a) => a.campo === "client.cep")?.depois).toBe("30000-000");
    expect(alt.find((a) => a.campo === "client.logradouro")).toMatchObject({ antes: "Rua Antiga, 10", depois: "Rua Nova, 200" });
    expect(alt.find((a) => a.campo === "client.uf")?.depois).toBe("MG");
    expect(alt.find((a) => a.campo === "policy.condutorPrincipal")?.depois).toBe("BELTRANO DA SILVA");
  });

  it("prêmio: valor da ordem do prêmio inteiro vira o novo total; restituição desconta; cancelamento não mexe", () => {
    const total = proporAlteracoes(parser(), { premio: 2500 }, apolice(), endCli).find((a) => a.campo === "policy.premioTotal");
    expect(total?.depois).toBe("2500.00");
    const rest = proporAlteracoes(parser(), { premio: 150, restituicao: true }, apolice(), endCli).find((a) => a.campo === "policy.premioTotal");
    expect(rest?.depois).toBe("1850.00");
    const canc = proporAlteracoes(parser({ endossoCancelamento: true }), { premio: 150, restituicao: true }, apolice(), endCli);
    expect(canc.find((a) => a.campo === "policy.premioTotal")).toBeUndefined();
  });
});

describe("splitRua", () => {
  it("separa número do fim", () => {
    expect(splitRua("Rua Nova, 200")).toEqual({ logradouro: "Rua Nova", numero: "200" });
    expect(splitRua("Av. Brasil nº 15A")).toEqual({ logradouro: "Av. Brasil", numero: "15A" });
    expect(splitRua("Estrada sem número")).toEqual({ logradouro: "Estrada sem número", numero: null });
  });
});
