"""Motor genérico de busca "rótulo -> valor" sobre o layout do PDF.

Para cada segmento que casa com um rótulo, testa como candidatos:
  a) o restante do próprio segmento (ex.: "CPF: 123..."),
  b) os segmentos à direita na mesma linha,
  c) segmentos nas linhas abaixo que se sobrepõem horizontalmente ao rótulo
     (tabelas com cabeçalho em cima e valor embaixo).
O primeiro candidato aceito pelo validador do tipo (`kind`) vence.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from . import normalize as N
from .pdftext import Doc, Seg

TODAY = date.today()

LABELISH = re.compile(
    r"(^|\s)(nome|cpf|cnpj|endereco|bairro|cidade|cep|uf|telefone|celular|e-?mail|data|placa|chassi|"
    r"apolice|proposta|vigencia|premio|parcela|ramo|sexo|estado civil|rg|complemento|municipio|"
    r"segurado|condutor|veiculo|modelo|ano|codigo|cod\.|tipo|item|endosso|produto|corretor)\b.*:?$"
)

BAD_NAME_WORDS = re.compile(
    r"\b(segurad[oa]|nome|cpf|cnpj|endereco|social|apolice|seguro|seguradora|corretor|corretora|proponente|"
    r"estipulante|beneficiario|condutor|principal|dados|vigencia|item|cliente|data|nao|sim|veiculo|"
    r"informacoes|pagina|proprietario|tipo|pessoa|fisica|juridica|registro|razao|titular|ltda me|responsabilidade|"
    r"telefone|numero|onde|podem|exclusiva|declaro|valor|premio|cobertura|garantia|endosso|parcela|assinatura|"
    r"atencao|importante|contrato|condicoes)\b"
)


@dataclass
class Hit:
    value: object
    conf: float
    line: int
    raw: str = ""


# --------------------------------------------------------------------------- validadores por tipo
_TRAIL = re.compile(
    r"\s+(nome social|nome|cpf|cnpj|cpf/cnpj|rg|r\.g\.|data|dt\.?|nasc\w*|sexo|estado civil|telefone|tel\.?|celular|fone|e-?mail|"
    r"bairro|cep|cidade|uf|complemento|compl\.?|municipio|n[ºo°]|numero|profiss\w*|cod\.?|codigo|item|placa|chassi|ano|"
    r"apolice|proposta|vigencia|endereco|tipo|pessoa|ramo|produto|cliente|documento|identidade|orgao)\b[^:]{0,25}:.*$"
)


def cut_labels(s: str) -> str:
    """Remove rótulos que vieram colados no valor: 'FULANO DE TAL Nome Social:' -> 'FULANO DE TAL'."""
    n = N.strip_accents(s).lower()
    if len(n) != len(s):
        return s
    m = _TRAIL.search(n)
    return s[: m.start()] if m else s


def _v_policy(s: str):
    s = s.strip()
    # Porto/Itaú/Azul: "0531 65 12345678" ou "65 25 0531 12345678" (sucursal, ramo, número).
    # Sem isto o número virava só "0531" e apólices diferentes do mesmo cliente se fundiam.
    g = re.match(r"(\d{2,4}(?: \d{2,4}){1,3} \d{6,10})(?![\d.,/])", s)
    if g:
        return g.group(1)
    m = re.search(r"(?<![\w])([A-Z]{0,3}[\d][\dA-Z./\-]{2,32}[\dA-Z]|\d{4,})(?![\w])", s.upper())
    if not m:
        return None
    v = m.group(1).strip(".-/")
    digits = re.sub(r"\D", "", v)
    if len(digits) < 4 or "," in v:
        return None
    if N.DATE_RE.fullmatch(v) or re.fullmatch(r"\d{1,2}/\d{4}", v) or re.fullmatch(r"(19|20)\d{2}|0800", v):  # ano solto não é apólice
        return None
    if v.startswith("15414") or v.startswith("10.") and len(digits) == 11:  # processo SUSEP
        return None
    return v


def _v_name(s: str):
    s = N.clean_spaces(cut_labels(s))
    s = re.sub(r"^(sr\.?|sra\.?)\s+", "", s, flags=re.I)
    if not (4 <= len(s) <= 90) or re.search(r"\d|@|:|\(|\)|/", s) or s.endswith(".") and not re.search(r"\b(ltda|s\.?a|me|epp|cia)\.$", s, re.I):
        return None
    words = s.split()
    if len(words) < 2:
        return None
    if BAD_NAME_WORDS.search(N.norm_key(s)):
        return None
    if not re.fullmatch(r"[A-Za-zÀ-ÿ'&.\- ]+", s):
        return None
    return s


def _v_text(s: str):
    s = N.clean_spaces(cut_labels(s))
    if len(s) < 2 or s.endswith(":") or LABELISH.fullmatch(N.norm_key(s)):
        return None
    return s


def _v_address(s: str):
    s = N.clean_spaces(cut_labels(s))
    if len(s) < 6 or not re.search(r"[A-Za-z]{3}", s) or LABELISH.fullmatch(N.norm_key(s)):
        return None
    if re.match(r"(?i)(de\s+)?(correspond|pernoite|cobran)", s):
        return None
    return s


def _v_bonus(s: str):
    m = re.match(r"\s*(\d{1,2})\b(?!\s*[/.,]\d)", s)
    if m and 0 <= int(m.group(1)) <= 10:
        return int(m.group(1))
    return None


def _v_int(s: str):
    m = re.match(r"\s*(\d{1,3})\b(?![/.,]\d)", s)
    return int(m.group(1)) if m and 0 < int(m.group(1)) <= 120 else None


def _v_year(s: str):
    m = re.search(r"\b((?:19|20)\d{2})\s*/\s*((?:19|20)\d{2})\b", s)
    if m:
        return m.group(2)
    m = re.search(r"\b((?:19|20)\d{2})\b", s)
    if m and 1950 <= int(m.group(1)) <= TODAY.year + 2:
        return m.group(1)
    m = re.fullmatch(r"\s*(\d{2})\s*/\s*(\d{2})\s*", s)
    if m:
        return "20" + m.group(2) if int(m.group(2)) < 60 else "19" + m.group(2)
    return None


def _v_birth(s: str):
    d = N.parse_date(s)
    if d and 1910 <= int(d[:4]) <= TODAY.year - 16:
        return d
    return None


def _v_cnh(s: str):
    m = re.search(r"(?<!\d)(\d{9,11})(?!\d)", s.replace(".", "").replace(" ", ""))
    return m.group(1) if m else None


def _v_vehicle(s: str):
    s = N.clean_spaces(cut_labels(s))
    if len(s) < 3 or not re.search(r"[A-Za-z]{2}", s) or s.endswith(":"):
        return None
    k = N.norm_key(s)
    if re.fullmatch(r"(sim|nao|particular|passeio|zero km.*|novo|usado|item.*|\d+)", k) or LABELISH.fullmatch(k):
        return None
    return s


VALIDATORS = {
    "date": N.parse_date,
    "birth": _v_birth,
    "money": N.parse_money,
    "doc": lambda s: (N.find_docs(s) or [None])[0],
    "phone": N.parse_phone,
    "email": N.parse_email,
    "cep": N.parse_cep,
    "placa": N.parse_placa,
    "chassi": N.parse_chassi,
    "policy": _v_policy,
    "name": _v_name,
    "text": _v_text,
    "address": _v_address,
    "bonus": _v_bonus,
    "int": _v_int,
    "year": _v_year,
    "cnh": _v_cnh,
    "vehicle": _v_vehicle,
    "payment": N.norm_payment,
}

# Tipos de valor "livre" — só aceitam o candidato mais próximo (evita pegar valor de outro rótulo)
STRICT_KINDS = {"name", "text", "address", "vehicle", "bonus", "int", "year"}


def _norm(s: str) -> str:
    return N.norm_key(s)


def _segs_right(doc: Doc, seg: Seg) -> list[Seg]:
    line = doc.lines[seg.line]
    return [s for s in line.segs if s.x0 >= seg.x1 - 1]


def _segs_below(doc: Doc, seg: Seg, max_lines: int, max_dy: float) -> list[Seg]:
    out = []
    li = seg.line
    for j in range(li + 1, min(li + 1 + max_lines, len(doc.lines))):
        L = doc.lines[j]
        if L.page != seg.page or L.y - seg.y > max_dy:
            break
        best = None
        best_ov = 0.0
        for s in L.segs:
            ov = min(s.x1, seg.x1 + 4) - max(s.x0, seg.x0 - 4)
            if ov > best_ov:
                best, best_ov = s, ov
        if best is not None:
            out.append(best)
    return out


def find(
    doc: Doc,
    labels: list[str],
    kind: str,
    *,
    exclude: str | None = None,
    exclude_scope: str = "line",
    start: int = 0,
    stop: int | None = None,
    right: bool = True,
    below: int = 2,
    max_dy: float = 40,
    accept=None,
    all_hits: bool = False,
):
    """Procura valor do tipo `kind` associado a algum dos `labels` (regex, texto sem acento/minúsculo)."""
    val = VALIDATORS[kind]
    pats = [re.compile(l) for l in labels]
    exc = re.compile(exclude) if exclude else None
    strict = kind in STRICT_KINDS
    hits = []
    stop = len(doc.lines) if stop is None else min(stop, len(doc.lines))
    for pat in pats:  # ordem dos rótulos = prioridade
        for li in range(start, stop):
            line = doc.lines[li]
            lnorm = None
            for seg in line.segs:
                st = seg.norm
                m = pat.search(st)
                if not m:
                    continue
                if exc is not None:
                    lnorm = line.norm if exclude_scope == "line" else seg.norm
                    if exc.search(lnorm):
                        continue
                cands: list[tuple[str, float]] = []
                rem = re.sub(r"^\s*\(\s*[ao]s?\s*\)", "", seg.text[m.end():])
                rem = rem.lstrip(" :.-–º°ª")
                if rem.strip():
                    cands.append((rem, 0.9))
                if not (strict and cands):
                    if right:
                        rs = [s for s in _segs_right(doc, seg) if s is not seg and s.text.strip() not in (":", "-")]
                        for s in rs[: 1 if strict else 3]:
                            cands.append((s.text.strip().lstrip(": "), 0.85))
                    if below:
                        for k, s in enumerate(_segs_below(doc, seg, below, max_dy)):
                            cands.append((s.text, 0.8 - 0.05 * k))
                            if strict:
                                break
                for text, conf in cands:
                    v = val(text)
                    if v is not None and (accept is None or accept(v)):
                        h = Hit(v, conf, li, text)
                        if not all_hits:
                            return h
                        hits.append(h)
                        break
    return hits if all_hits else None


def lines_matching(doc: Doc, pattern: str, start=0, stop=None):
    p = re.compile(pattern)
    stop = len(doc.lines) if stop is None else stop
    for li in range(start, min(stop, len(doc.lines))):
        if p.search(doc.lines[li].norm):
            yield li


def window_text(doc: Doc, li: int, n_after: int = 2, n_before: int = 0) -> str:
    a = max(0, li - n_before)
    b = min(len(doc.lines), li + n_after + 1)
    return "\n".join(doc.lines[i].text for i in range(a, b) if doc.lines[i].page == doc.lines[li].page)


# --------------------------------------------------------------------------- parcelas
_MON = r"(?:R\$\s*)?\*{0,12}(\d{1,3}(?:\.\d{3})*,\d{2})"
_DT = r"(\d{2}/\d{2}/\d{2,4})"
_NUM = r"(?<![\d/.,])(\d{1,4})(?:\s?(?:ª|a|º)\.?)?(?:\s*(?:parcela|prestacao|prestação)\s*:?)?"
INST_PATTERNS = [
    re.compile(_NUM + r"\s+" + _MON + r"\s+" + _DT),
    re.compile(_NUM + r"\s+" + _DT + r"\s+" + _MON),
    re.compile(_NUM + r"\s+" + _DT + r"\s+(?:\S+\s+){1,3}?" + _MON),
    re.compile(_NUM + r"\s+" + _MON + r"\s+(conf\.?\s*fat\S*|cart[aã]o\S*|d[eé]bito\S*|fatura\S*|paga\b|pago\b|quitad\S*)", re.I),
    re.compile(_NUM + r"\s*/\s*\d{1,2}\s+" + _DT + r"\s+" + _MON),
    re.compile(_NUM + r"\s*/\s*\d{1,2}\s+" + _MON + r"\s+" + _DT),
    # só número + "R$ valor" (cartão, sem vencimento) — exige cabeçalho "parcela" logo acima
    re.compile(r"(?<![\d/.,])(\d{1,2})\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})(?!\s*\d{2}/)"),
    # número + texto ("Conforme Cartão de Crédito") + valor — também exige cabeçalho
    re.compile(r"(?<![\d/.,])(\d{1,2})\s+[A-Za-zÀ-ÿ .]{4,40}?\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d/])"),
]


def _has_header(doc: Doc, li: int) -> bool:
    for j in range(max(0, li - 25), li):
        if re.search(r"^parcela|parcela\s+valor|forma de parcelamento|parcelas\s+valor|^np\b|vencimento\s+valor|plano de pagamento", doc.lines[j].norm):
            return True
    return False


def parse_installments(doc: Doc, start=0, stop=None):
    """Extrai sequências 1..n de (parcela, valor, vencimento) e devolve a mais longa."""
    items = []  # (n, valor, venc, linha)
    stop = len(doc.lines) if stop is None else stop
    for li in range(start, min(stop, len(doc.lines))):
        t = doc.lines[li].text
        found = []
        for pi, p in enumerate(INST_PATTERNS):
            for m in p.finditer(t):
                g = m.groups()
                n = int(g[0])
                if pi in (0, 5):
                    val, due = g[1], g[2]
                elif pi in (1, 2, 4):
                    due, val = g[1], g[2]
                else:
                    val, due = g[1], None
                if pi >= 6 and not _has_header(doc, li):
                    continue
                found.append((m.start(), n, val, due))
            if found:
                break
        found.sort()
        for _, n, val, due in found:
            v = float(val.replace(".", "").replace(",", "."))
            d = N.parse_date(due) if due else None
            if n < 1 or n > 60 or v <= 0:
                continue
            items.append((n, v, d, li))
    # agrupa itens em blocos de linhas próximas (tabelas em 1, 2 ou 3 colunas)
    blocks = []
    for it in items:
        if blocks and it[3] - blocks[-1][-1][3] <= 4:
            blocks[-1].append(it)
        else:
            blocks.append([it])
    seqs = []
    for bl in blocks:
        byn = {}
        for it in bl:
            if it[0] == 1 and 1 in byn and len(byn) > 1:
                # recomeço da numeração dentro do bloco -> fecha a sequência atual
                seqs.append(byn)
                byn = {}
            byn.setdefault(it[0], it)
        seqs.append(byn)
    out = []
    first = None
    for byn in seqs:
        if 1 not in byn and 2 in byn:
            # tabela das "demais parcelas" (2..n); a 1ª costuma vir num campo separado
            if first is None:
                mv = re.search(r"valor da 1[ªa]\s*parcela\s*:?\s*(?:r\$\s*)?([\d.]+,\d{2})", doc.norm)
                md = re.search(r"vencimento da 1[ªa]\s*parcela\s*:?\s*(\d{2}/\d{2}/\d{4})", doc.norm)
                first = (mv, md)
            mv, md = first
            if mv:
                byn[1] = (1, N.parse_money(mv.group(1)), N.parse_date(md.group(1)) if md else None, min(i[3] for i in byn.values()))
        k = 0
        while (k + 1) in byn:
            k += 1
        if k:
            out.append([byn[i] for i in range(1, k + 1)])
    seqs = out
    if not seqs:
        return None
    # preferir sequências com datas e mais longas
    seqs.sort(key=lambda s: (len(s) + (0.5 if s[0][2] else 0)), reverse=True)
    best = seqs[0]
    # sequência de 1 item só vale se houver contexto de pagamento perto
    if len(best) == 1:
        li = best[0][3]
        ctx = _norm(window_text(doc, li, 1, 6))
        if not re.search(r"parcela|vencimento|pagamento|prestac", ctx):
            return None
    return [{"parcela": n, "valor": v, "vencimento": d} for n, v, d, _ in best], best[0][3]
