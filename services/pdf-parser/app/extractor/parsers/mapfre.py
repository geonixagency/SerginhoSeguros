"""Mapfre: 'PAGAMENTO DO PRÊMIO' -> 'Forma: FICHA DE COMPENSACAO   Nº de parcela: 10',
'Vencimento da 1ª parcela' + tabela 'VENCIMENTO DAS PARCELAS' (02..n)."""

PROFILE = {
    "labels": {
        "forma_pagamento": [r"^forma\s*:", r"\bforma\s*:"],
        "n_parcelas": [r"n[ºo°]\s*de parcela"],
        "premio_total": [r"^premio total\s*:", r"^premio\s*:"],
    },
}
