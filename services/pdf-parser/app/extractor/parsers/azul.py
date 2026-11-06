"""Azul Seguros: bloco 'Nome: X   CPF/CNPJ: Y' / 'Endereço:' com CEP+cidade+UF na linha seguinte sem rótulo;
data de emissão acima de 'Local e Data'."""
import re

from .. import engine as E
from .. import normalize as N

PROFILE = {
    "labels": {
        "nome_segurado": [r"^nome\s*:"],
        "apolice": [r"nr\.?\s*apolice"],
    },
}


def refine(doc, R):
    for li in E.lines_matching(doc, r"^endereco\s*:"):
        for j in range(li, min(li + 4, len(doc.lines))):
            t = doc.lines[j].text
            cep = N.parse_cep(t)
            if cep:
                R.put("cep", cep, 0.8)
                m = re.search(r"\d{5}-?\d{3}\s+(.+?)\s{2,}([A-Z]{2})\s*$", t)
                if m:
                    R.put("cidade", m.group(1).strip().upper(), 0.75)
                    R.put("uf", m.group(2), 0.75)
                break
        break
    if not R.get("data_emissao"):
        for li in E.lines_matching(doc, r"local e data"):
            if li > 0:
                d = N.parse_date(doc.lines[li - 1].text)
                if d:
                    R.put("data_emissao", d, 0.75)
                    break


_PAIR = re.compile(r"(?<![\d/.,])(\d{2})\s+([\d.]+,\d{2})(?![\d/])")


def _azul_installments(doc, R):
    """Tabela em 3 colunas 'PARCELA VALOR VENCIMENTO' (vencimento às vezes 'Conf.Fat.Carta' quebrado)."""
    for li in E.lines_matching(doc, r"parcela\s+valor\s+vencimento"):
        items = {}
        for j in range(li + 1, min(li + 9, len(doc.lines))):
            t = doc.lines[j].text
            for m in _PAIR.finditer(t):
                k = int(m.group(1))
                rest = t[m.end():m.end() + 14]
                items.setdefault(k, {"parcela": k, "valor": N.parse_money(m.group(2)), "vencimento": N.parse_date(rest)})
        if 1 in items:
            k = 0
            while k + 1 in items:
                k += 1
            lst = [items[i] for i in range(1, k + 1)]
            if not R.get("parcelas") or len(lst) > len(R["parcelas"]):
                R.put("parcelas", lst, 0.8, overwrite=True)
                R.put("n_parcelas", k, 0.8, overwrite=True)
            return


_old_refine = refine


def refine(doc, R):  # noqa: F811
    _old_refine(doc, R)
    _azul_installments(doc, R)
