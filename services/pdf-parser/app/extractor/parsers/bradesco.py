"""Bradesco Auto/RE.

Layout auto: rótulo numa linha, valor na linha de baixo. Pagamento em
"Tipo de Cobrança / Nº de Prestações / 1ª Prestação / Demais Prestações".
Residencial/Empresarial: começam com boletos (cujo "Prêmio Total" é o valor da
prestação) e trazem "Forma de Pagamento: 06 PRESTAÇÕES ... (1ª PRESTAÇÃO: R$ x DEMAIS: y)".
"""
import re

from .. import engine as E
from .. import normalize as N
from .common import build_installments, is_boleto_doc, text_after

PROFILE = {
    "labels": {
        "apolice": [r"^numero da apolice$", r"^n[ºo°]\s*apolice$"],
        "premio_total": [r"^premio total\s*:"],
    },
    "excludes": {
        "premio_total": r"controle|nosso numero|prestac|parcela|coberturas?\s+premio|liquido total",
        "apolice": r"congenere|anterior|renovacao da apolice|sucursal\s+ramo|prestacao|proposta\s+apolice",
    },
}


def refine(doc, R):
    # número da apólice no formato Sucursal.Ramo.Cia.Apólice
    m = re.search(r"(\d{3,4})\s*\.\s*(\d{3})\s*\.\s*(\d{4})\s*\.\s*(\d{5,7})", doc.text)
    if m and (not R.get("numero_apolice") or len(re.sub(r"\D", "", R["numero_apolice"])) < 10):
        R.put("numero_apolice", ".".join(m.groups()), 0.9, overwrite=True)

    boleto = is_boleto_doc(doc)
    n = first = rest = None
    h = E.find(doc, [r"n[ºo°]\s*de prestacoes", r"quantidade de prestacoes"], "int")
    if h:
        n = h.value
    h1 = E.find(doc, [r"1[ªa]\s*prestacao"], "money", exclude=r"a 30 dias")
    h2 = E.find(doc, [r"demais prestacoes"], "money")
    first = h1.value if h1 else None
    rest = h2.value if h2 else None
    t, li = text_after(doc, r"^forma de pagamento$|forma de pagamento\s*:", 8)
    dates = []
    if t:
        m = re.search(r"(\d{1,2})\s*presta", N.norm_key(t))
        if m:
            n = n or int(m.group(1))
        m = re.search(r"1[ªa]\s*presta\w*\s*:?\s*r?\$?\s*([\d.]+,\d{2}).{0,20}?demais\s*:?\s*r?\$?\s*([\d.]+,\d{2})", N.norm_key(t), re.S)
        if m:
            first, rest = N.parse_money(m.group(1)), N.parse_money(m.group(2))
        elif not first:
            mm = re.search(r"valor\s*r\$\s*([\d.]+,\d{2})", N.norm_key(t))
            if mm:
                first = N.parse_money(mm.group(1))
        dates = N.all_dates(t.split("Datas de Vencimento")[-1]) if "Vencimento" in t else []
        if R.get("forma_pagamento") is None and re.search(r"presta", N.norm_key(t)):
            R.put("forma_pagamento", "boleto" if boleto else None, 0.6)
    if not dates and boleto:
        # datas dos boletos (rótulo "Vencimento" e a data logo ao lado/abaixo)
        seen = []
        for hh in E.find(doc, [r"^vencimento$", r"^vencimento\b"], "date", all_hits=True, below=1):
            if hh.value not in seen:
                seen.append(hh.value)
        dates = sorted(seen)
    if n:
        R.put("n_parcelas", n, 0.9, overwrite=True)
        if not R.get("parcelas") or len(R["parcelas"]) != n:
            items = build_installments(n, first, rest, dates if len(dates) in (n, n - 1) else None)
            if items:
                R.put("parcelas", items, 0.8, overwrite=True)
    # prêmio total: em residencial/empresarial o "Prêmio Total" do boleto é a prestação
    if boleto and n and first and R.get("premio_total") and abs(R["premio_total"] - first) < 0.02 and n > 1:
        R.put("premio_total", round(first + (rest or first) * (n - 1), 2), 0.6, overwrite=True)
        R["avisos"].append("premio_total_calculado_pelas_prestacoes")
    if not R.get("forma_pagamento") and boleto:
        R.put("forma_pagamento", "boleto", 0.6)
