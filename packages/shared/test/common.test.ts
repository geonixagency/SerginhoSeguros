import { describe, expect, it } from "vitest";
import { ClientCreateSchema, isValidCpfCnpj, maskCpfCnpj, TelefoneSchema } from "../src";
import { columnVar, mapCsvContacts, normalizePhoneBr, parseCsv } from "../src/csv";

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

describe("CSV de contatos", () => {
  it("detecta ; ou , e lida com aspas, BOM e CRLF", () => {
    const t = parseCsv('﻿Nome;Telefone;Seguro\r\n"Silva; Maria";(16) 99999-0001;Auto\r\n\r\nJoão;16 3333-4444;"Vida ""Plus"""\r\n');
    expect(t.separador).toBe(";");
    expect(t.cabecalho).toEqual(["Nome", "Telefone", "Seguro"]);
    expect(t.linhas).toEqual([
      ["Silva; Maria", "(16) 99999-0001", "Auto"],
      ["João", "16 3333-4444", 'Vida "Plus"'],
    ]);
    expect(parseCsv("a,b\n1,2").separador).toBe(",");
  });

  it("normaliza telefone BR", () => {
    expect(normalizePhoneBr("+55 (16) 99999-0001")).toBe("16999990001");
    expect(normalizePhoneBr("016 99999-0001")).toBe("16999990001");
    expect(normalizePhoneBr("1633334444")).toBe("1633334444");
    expect(normalizePhoneBr("12345")).toBeNull();
    expect(normalizePhoneBr("16899990001")).toBeNull();
  });

  it("mapeia colunas em variáveis e descarta inválidos e duplicados", () => {
    const t = parseCsv("Nome,Celular,Seguro Contratado\nAna,16999990001,Auto\nBia,169999,Vida\nCris,(16) 99999-0001,Casa");
    const r = mapCsvContacts(t, { telefone: 1, nome: 0 });
    expect(r.invalidos).toBe(1);
    expect(r.duplicados).toBe(1);
    expect(r.contatos).toEqual([{ telefone: "16999990001", nome: "Ana", vars: { nome: "Ana", celular: "16999990001", seguro_contratado: "Auto", telefone: "16999990001" } }]);
    expect(columnVar("Vencimento da Parcela")).toBe("vencimento_da_parcela");
  });
});
