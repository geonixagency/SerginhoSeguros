// Gera PDFs FICTÍCIOS para o modo demo (apólice e boleto). Nenhum dado real.
// Uso: pnpm demo:pdf
import fs from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const gold = rgb(0.85, 0.64, 0.1);
const ink = rgb(0.06, 0.06, 0.07);
const gray = rgb(0.4, 0.38, 0.35);

async function apolice() {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: ink });
  page.drawText("SEGURADORA EXEMPLO S.A.", { x: 40, y: 806, size: 16, font: t, color: gold });
  page.drawText("APÓLICE DE SEGURO AUTOMÓVEL — DOCUMENTO FICTÍCIO PARA DEMONSTRAÇÃO", { x: 40, y: 788, size: 8, font: f, color: rgb(0.9, 0.88, 0.82) });
  let y = 740;
  const section = (title) => {
    page.drawText(title, { x: 40, y, size: 11, font: b, color: ink });
    page.drawLine({ start: { x: 40, y: y - 6 }, end: { x: 555, y: y - 6 }, thickness: 0.8, color: gold });
    y -= 26;
  };
  const row = (k, v) => {
    page.drawText(k, { x: 40, y, size: 9, font: f, color: gray });
    page.drawText(v, { x: 200, y, size: 10, font: b, color: ink });
    y -= 18;
  };
  section("DADOS DA APÓLICE");
  row("Apólice nº", "POR5531907");
  row("Proposta nº", "771204418");
  row("Vigência", "06/11/2026 a 06/11/2027 — 24h");
  row("Corretor", "SERGINHO SEGUROS (exemplo)");
  y -= 8;
  section("SEGURADO");
  row("Nome", "RAFAELA MONTEIRO QUINTELA");
  row("CPF", "418.392.507-21");
  row("Nascimento", "14/03/1988");
  row("Endereço", "Rua das Acácias, 418 — Jardim América");
  row("Cidade/UF", "Ribeirão Preto/SP");
  y -= 8;
  section("VEÍCULO SEGURADO");
  row("Modelo", "VW T-CROSS HIGHLINE 1.4 TSI");
  row("Ano/Modelo", "2024/2025");
  row("Placa", "RTA4E21");
  row("Chassi", "9BWBH6BF5R4XXXXXX");
  y -= 8;
  section("COBERTURAS E PRÊMIO");
  row("Casco", "100% Tabela FIPE");
  row("RCF Danos materiais", "R$ 200.000,00");
  row("Franquia", "R$ 3.450,00");
  row("Prêmio total", "R$ 3.842,17");
  row("Pagamento", "Boleto — 10 parcelas — 1º venc. 16/11/2026");
  page.drawText("Documento gerado automaticamente para demonstração do sistema. Sem validade jurídica.", { x: 40, y: 50, size: 8, font: f, color: gray });
  for (let i = 0; i < 2; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`Condições gerais — página ${i + 2}`, { x: 40, y: 790, size: 12, font: b, color: ink });
    for (let l = 0; l < 40; l++) p.drawText("Cláusula exemplificativa de condições gerais do seguro, texto fictício para demonstração.", { x: 40, y: 760 - l * 17, size: 8.5, font: f, color: gray });
  }
  return doc.save();
}

async function boleto() {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 420]);
  page.drawText("BOLETO DE PAGAMENTO — FICTÍCIO (DEMONSTRAÇÃO)", { x: 30, y: 385, size: 12, font: b, color: ink });
  page.drawText("23793.38128 60000.000003 00000.000400 1 00000000384217", { x: 30, y: 355, size: 11, font: b, color: ink });
  const rows = [["Beneficiário", "Seguradora Exemplo S.A."], ["Pagador", "Cliente de demonstração"], ["Vencimento", "16/11/2026"], ["Valor", "R$ 384,22"], ["Parcela", "1 de 10"]];
  rows.forEach(([k, v], i) => {
    page.drawText(k, { x: 30, y: 315 - i * 22, size: 9, font: f, color: gray });
    page.drawText(v, { x: 160, y: 315 - i * 22, size: 10, font: b, color: ink });
  });
  for (let i = 0; i < 70; i++) page.drawRectangle({ x: 30 + i * 7.6, y: 60, width: i % 3 === 0 ? 3 : 1.4, height: 60, color: ink });
  return doc.save();
}

fs.mkdirSync("public/demo", { recursive: true });
fs.writeFileSync("public/demo/apolice-demo.pdf", await apolice());
fs.writeFileSync("public/demo/boleto-demo.pdf", await boleto());
console.log("PDFs de demonstração gerados em public/demo");
