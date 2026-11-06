"""HDI Seguros: 'Dados de Cobrança' -> 'Tipo de Cobrança: X', 'Parcela: 164,58   Forma de Pagamento: 10 x'."""
import re

from .. import engine as E
from .. import normalize as N
from .common import build_installments

PROFILE = {
    "labels": {
        "forma_pagamento": [r"tipo de cobranca"],
        "nome_segurado": [r"nome de registro do segurado"],
    },
}


def refine(doc, R):
    h = E.find(doc, [r"tipo de cobranca"], "payment")
    if h:
        R.put("forma_pagamento", h.value, 0.9, overwrite=True)
    m = re.search(r"parcela\s*:\s*([\d.]+,\d{2})\s+forma de pagamento\s*:\s*(\d{1,2})\s*x", doc.norm)
    if m:
        n = int(m.group(2))
        val = N.parse_money(m.group(1))
        R.put("n_parcelas", n, 0.9, overwrite=True)
        if not R.get("parcelas") or len(R["parcelas"]) != n:
            first = val
            m1 = re.search(r"1[ªa]\s*parcela\s*:?\s*([\d.]+,\d{2})", doc.norm)
            if m1:
                first = N.parse_money(m1.group(1))
            R.put("parcelas", build_installments(n, first, val), 0.75, overwrite=True)
