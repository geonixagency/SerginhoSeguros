"""Leitura focada em ENDOSSO: o que o endosso mudou na apólice.

Endosso é um PDF com o mesmo formato da apólice (veículo, endereço de pernoite, condutor,
prêmio), mas que só altera parte dela. Aqui tiramos o que é próprio do endosso:
número do endosso, motivos (troca de veículo, endereço, condutor...), principal condutor
e o prêmio cobrado (ou devolvido) pelo endosso. A comparação com a apólice cadastrada
é feita na API, que conhece os dados atuais.
"""
from __future__ import annotations

import re

from . import normalize as N

# (padrão no texto normalizado, rótulo mostrado na tela)
MOTIVOS: list[tuple[str, str]] = [
    (r"substitui\w* d[oe] (veiculo|item)|veiculo substituido|troca de veiculo|substituicao de item", "Troca de veículo"),
    (r"alteracao d[eo] (endereco|cep)|cep de pernoite alterado|mudanca de endereco|alteracao do local de pernoite", "Mudança de endereço"),
    (r"(alteracao|inclusao|substituicao|troca) d[oe] (principal )?condutor", "Troca de condutor"),
    (r"alteracao (de|dos) dados cadastrais", "Dados cadastrais"),
    (r"(alteracao|troca) d[ae] (forma|modalidade) de pagamento|endosso de cobranca|alteracao de cobranca", "Forma de pagamento"),
    (r"(inclusao|exclusao|alteracao) de cobertura|adequacao das coberturas", "Coberturas"),
    (r"(alteracao|troca) de placa", "Placa"),
    (r"alteracao de bonus|classe de bonus alterada", "Bônus"),
]

_NOME = re.compile(r"^[A-Za-zÀ-ÿ'´`]+(?: [A-Za-zÀ-ÿ'´`]+){1,7}$")
_LIXO_NOME = re.compile(r"(?i)\b(estado|civil|sexo|data|cpf|nascimento|vinculo|idade|faixa|proprio|segurado|sim|nao|questionario)\b")


def _nome(v: str | None) -> str | None:
    v = re.sub(r"\s+", " ", (v or "").strip(" :|-")).strip()
    v = re.split(r"\s+(?:CPF|Data|Sexo|Estado)\b", v)[0].strip()
    if not v or not _NOME.match(v) or _LIXO_NOME.search(v) or len(v) > 70:
        return None
    return v.upper()


def _tabela(lines: list[str], rotulo: str) -> str | None:
    """Valor sob o rótulo numa tabela (colunas separadas por 2+ espaços, valores na linha de baixo)."""
    rx = re.compile(rotulo, re.I)
    for i, l in enumerate(lines[:-1]):
        cols = re.split(r"\s{2,}", l.strip())
        if len(cols) < 2:
            continue
        idx = next((k for k, c in enumerate(cols) if rx.fullmatch(c.strip())), None)
        if idx is None:
            continue
        vals = re.split(r"\s{2,}", lines[i + 1].strip())
        if len(vals) == len(cols):
            return vals[idx].strip()
    return None


def _condutor(lines: list[str], segurado: str | None = None) -> str | None:
    n = _nome(_tabela(lines, r"nome do principal condutor|principal condutor|nome do condutor|condutor principal"))
    if n:
        return n
    if segurado and any(re.search(r"(?i)determinar o condutor\?\s*pr[oó]prio segurado|segurado [eé] o principal condutor\??\s*sim", l) for l in lines):
        return _nome(segurado) or segurado.upper()
    rot = re.compile(r"(?i)(nome do principal condutor|principal condutor\s*[-:]?\s*nome|dados do principal condutor|^condutor\s*:|^principal condutor$|nome do condutor)")
    for i, l in enumerate(lines):
        if not rot.search(l):
            continue
        resto = rot.split(l)[-1]
        cand = [resto] + lines[i + 1 : i + 4]
        for c in cand:
            c = re.sub(r"(?i)^\s*(nome|condutor)\s*:?", "", c)
            n = _nome(c)
            if n:
                return n
    return None


def _numero_endosso(text: str, lines: list[str]) -> str | None:
    t = _tabela(lines, r"endosso|n[ºo°.]* ?(do )?endosso")
    if t and re.fullmatch(r"[0-9][0-9./-]{0,30}", t):
        return t
    pats = [
        r"(?i)n[ºo°r.]*\s*(?:do\s+)?endosso\s*:?\s*([0-9](?:[0-9./-]{0,30}[0-9])?)(?![\d.])",
        r"(?im)^\s*endosso\s*:?\s*\n?\s*([0-9][0-9.]{2,30}[0-9])\s*$",
        r"(?i)\bendosso\s*:\s*([0-9]{3,12})\b",
    ]
    for p in pats:
        m = re.search(p, text)
        if m:
            return m.group(1).strip(".-/")
    return None


def _premio_endosso(text: str, norm: str, premio_total: float | None) -> tuple[float | None, bool]:
    """Valor cobrado (positivo) ou devolvido (restituição) pelo endosso."""
    m = re.search(r"(?i)gerou uma (cobranca|restituicao|devolucao) de r\$\s*([\d.]+,\d{2})", norm)
    if m:
        v = N.parse_money(m.group(2))
        return v, m.group(1) != "cobranca"
    restit = bool(re.search(r"(premio|valor) (a |ser )?(restituir|restituido|devolver|devolvido)\s*:?\s*(r\$)?\s*[1-9][\d.]*,\d{2}", norm))
    for p in (r"(?i)pr[eê]mio do endosso\s*:?\s*R?\$?\s*([\d.]+,\d{2})", r"(?i)valor do endosso\s*:?\s*R?\$?\s*([\d.]+,\d{2})",
              r"(?i)(?:pr[eê]mio|valor) a restituir\s*:?\s*R?\$?\s*([\d.]+,\d{2})"):
        m = re.search(p, text)
        if m:
            return N.parse_money(m.group(1)), restit
    return premio_total, restit


def endorsement_details(doc, R: dict) -> dict:
    text = doc.text
    norm = N.norm_key(text)
    head = N.norm_key("\n".join(l.text for l in doc.lines[:400]))
    motivos: list[str] = []
    for pat, rot in MOTIVOS:
        if re.search(pat, head) and rot not in motivos:
            motivos.append(rot)
    if R.get("endosso_cancelamento") and "Cancelamento" not in motivos:
        motivos.append("Cancelamento")
    lines = [l.text.strip() for l in doc.lines if l.text.strip()]
    premio, restituicao = _premio_endosso(text, norm, R.get("premio_total"))
    return {
        "numero": _numero_endosso(text, lines),
        "motivos": motivos,
        "condutor": _condutor(lines, R.get("nome_segurado")),
        "premio": premio,
        "restituicao": restituicao,
    }
