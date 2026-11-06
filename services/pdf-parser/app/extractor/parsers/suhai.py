"""Suhai: 'PROPONENTE' -> 'Nome:'; parcelas em 2 colunas '1a parcela: R$ x   dd/mm/aaaa'
(às vezes com a data quebrada na linha seguinte)."""
import re

from .. import normalize as N

PROFILE = {
    "labels": {
        "telefone": [r"tel\.?\s*celular", r"tel\.?\s*residencial", r"tel\.?\s*comercial"],
    },
}

_P = re.compile(r"(\d{1,2})a parcela:\s*R\$\s*([\d.]+,\d{2})(?:\s+(\d{2}/\d{2}/\d{4}))?")


def refine(doc, R):
    m = re.search(r"n[°ºo]\s*de parcelas\s*:?\s*(\d{1,2})", doc.norm)
    n = int(m.group(1)) if m else None
    items = {}
    for mm in _P.finditer(doc.text):
        k = int(mm.group(1))
        if k not in items:
            items[k] = {"parcela": k, "valor": N.parse_money(mm.group(2)), "vencimento": N.parse_date(mm.group(3)) if mm.group(3) else None}
    if items and 1 in items:
        k = 0
        while k + 1 in items:
            k += 1
        lst = [items[i] for i in range(1, k + 1)]
        if not n or len(lst) == n:
            R.put("parcelas", lst, 0.85, overwrite=True)
    if n:
        R.put("n_parcelas", n, 0.9, overwrite=True)
    # telefone no formato "11 - 999714893"
    if not R.get("telefone"):
        m = re.search(r"tel\.?\s*celular:\s*(\d{2})\s*-\s*(9?\d{8})", doc.norm)
        if m:
            R.put("telefone", N.parse_phone(f"({m.group(1)}) {m.group(2)}"), 0.8)
