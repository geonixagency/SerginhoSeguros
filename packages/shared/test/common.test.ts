import { describe, expect, it } from "vitest";
import { ClientCreateSchema, isValidCpfCnpj, maskCpfCnpj, TelefoneSchema } from "../src";

// CPFs/CNPJs abaixo são números de teste gerados (não pertencem a clientes).
describe("validações compartilhadas", () => {
  it("valida CPF e CNPJ pelo dígito verificador", () => {
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
    expect(isValidCpfCnpj("529.982.247-24")).toBe(false);
    expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCpfCnpj("111.111.111-11")).toBe(false);
  });
  it("normaliza CPF para só dígitos e mascara", () => {
    const c = ClientCreateSchema.parse({ nome: "Fulano de Teste", cpfCnpj: "529.982.247-25" });
    expect(c.cpfCnpj).toBe("52998224725");
    expect(maskCpfCnpj(c.cpfCnpj)).toBe("529.***.***-25");
  });
  it("normaliza telefone removendo +55", () => {
    expect(TelefoneSchema.parse("+55 (11) 98888-7777")).toBe("11988887777");
    expect(() => TelefoneSchema.parse("123")).toThrow();
  });
});
