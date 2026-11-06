"""MBM Seguradora (acidentes pessoais / APP): tabela 'PARCELA VENCIMENTO IOF VALOR NOSSO NUMERO'."""
import re

from .. import normalize as N

PROFILE = {}

_P = re.compile(r"(?<![\d/])(\d{1,2})\s+(\d{2}/\d{2}/\d{4})\s+R\$\s*[\d.]+,\d{2}\s+R\$\s*([\d.]+,\d{2})")


def refine(doc, R):
    items = {}
    for mm in _P.finditer(doc.text):
        k = int(mm.group(1))
        items.setdefault(k, {"parcela": k, "valor": N.parse_money(mm.group(3)), "vencimento": N.parse_date(mm.group(2))})
    if 1 in items:
        k = 0
        while k + 1 in items:
            k += 1
        R.put("parcelas", [items[i] for i in range(1, k + 1)], 0.85, overwrite=True)
        R.put("n_parcelas", k, 0.85, overwrite=True)
    if not R.get("forma_pagamento") and re.search(r"nosso numero", doc.norm):
        R.put("forma_pagamento", "boleto", 0.7)
