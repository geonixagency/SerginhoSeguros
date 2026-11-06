"""Utilitários compartilhados pelos parsers de seguradoras."""
from __future__ import annotations

import re

from .. import normalize as N


def build_installments(n: int, first: float | None, rest: float | None, dates: list[str] | None = None):
    """Monta lista de parcelas a partir de 'N prestações, 1ª = x, demais = y' (+ datas, se houver)."""
    if not n or n < 1 or n > 60 or first is None:
        return None
    rest = first if rest is None else rest
    dates = dates or []
    out = []
    for i in range(1, n + 1):
        out.append({"parcela": i, "valor": first if i == 1 else rest,
                    "vencimento": dates[i - 1] if len(dates) >= n else (dates[i - 2] if len(dates) == n - 1 and i > 1 else None)})
    return out


def text_after(doc, pattern: str, n_lines: int = 6, start: int = 0) -> tuple[str, int] | tuple[None, None]:
    """Texto das n linhas a partir da primeira linha que casa com pattern (normalizado)."""
    p = re.compile(pattern)
    for i in range(start, len(doc.lines)):
        if p.search(doc.lines[i].norm):
            return "\n".join(l.text for l in doc.lines[i:i + n_lines]), i
    return None, None


def is_boleto_doc(doc) -> bool:
    return bool(re.search(r"nosso numero|pagavel preferencialmente|linha digitavel|ficha de compensacao", doc.norm))


def apply_installments(R, items, conf=0.8):
    if items:
        R.put("parcelas", items, conf)
        R.put("n_parcelas", len(items), conf)
