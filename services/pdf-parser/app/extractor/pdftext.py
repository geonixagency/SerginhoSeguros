"""Leitura de PDF -> estrutura de linhas/segmentos com coordenadas (PyMuPDF).

Cada página vira uma lista de linhas reconstruídas pela coordenada Y; cada linha
é dividida em *segmentos* (blocos de texto separados por um espaço horizontal
grande), o que permite procurar valores "à direita" ou "abaixo" de um rótulo.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import fitz  # PyMuPDF

fitz.TOOLS.mupdf_display_errors(False)


@dataclass
class Seg:
    text: str
    x0: float
    x1: float
    y: float
    page: int
    line: int  # índice global da linha
    norm: str = ""  # texto sem acento, minúsculo (mesmo comprimento do original)


@dataclass
class Line:
    idx: int
    page: int
    y: float
    segs: list[Seg] = field(default_factory=list)

    _text: str | None = None
    _norm: str | None = None

    @property
    def text(self) -> str:
        if self._text is None:
            self._text = "   ".join(s.text for s in self.segs)
        return self._text

    @property
    def norm(self) -> str:
        if self._norm is None:
            from .normalize import norm_key
            self._norm = norm_key(self.text)
        return self._norm


@dataclass
class Doc:
    path: str
    n_pages: int
    lines: list[Line]
    raw_text: str  # texto na ordem nativa do PDF (fallback)

    @property
    def text(self) -> str:
        return "\n".join(l.text for l in self.lines)

    @property
    def norm(self) -> str:
        if getattr(self, "_normtxt", None) is None:
            from .normalize import norm_key
            self._normtxt = norm_key(self.text)
        return self._normtxt

    @property
    def n_chars(self) -> int:
        return sum(len(l.text) for l in self.lines)


def _page_lines(page, pno: int, start_idx: int) -> list[Line]:
    words = page.get_text("words")
    if not words:
        return []
    words.sort(key=lambda w: (w[3], w[0]))
    groups: list[list] = []
    cur: list = []
    y = None
    for w in words:
        h = max(w[3] - w[1], 1.0)
        tol = max(2.0, 0.3 * h)
        if y is None or abs(w[3] - y) > tol:
            if cur:
                groups.append(cur)
            cur = [w]
            y = w[3]
        else:
            cur.append(w)
    if cur:
        groups.append(cur)

    out: list[Line] = []
    for g in groups:
        g.sort(key=lambda w: w[0])
        li = Line(idx=start_idx + len(out), page=pno, y=g[0][3])
        seg_words: list = []
        last_x1 = None
        for w in g:
            h = max(w[3] - w[1], 1.0)
            if last_x1 is not None and (w[0] - last_x1) > max(4.0, 0.55 * h):
                li.segs.append(_mk(seg_words, pno, li.idx))
                seg_words = []
            seg_words.append(w)
            last_x1 = w[2]
        if seg_words:
            li.segs.append(_mk(seg_words, pno, li.idx))
        out.append(li)
    return out


def _mk(ws, pno, lidx) -> Seg:
    from .normalize import strip_accents
    t = " ".join(w[4] for w in ws)
    n = strip_accents(t).lower()
    if len(n) != len(t):
        n = n.ljust(len(t))[: len(t)] if len(n) < len(t) else n[: len(t)]
    return Seg(t, ws[0][0], ws[-1][2], ws[0][3], pno, lidx, n)


def load_pdf(path: str, max_pages: int = 40) -> Doc:
    d = fitz.open(path)
    lines: list[Line] = []
    raw: list[str] = []
    try:
        for pno, page in enumerate(d):
            if pno >= max_pages:
                break
            lines.extend(_page_lines(page, pno, len(lines)))
            raw.append(page.get_text())
        n = len(d)
    finally:
        d.close()
    return Doc(path=path, n_pages=n, lines=lines, raw_text="\n".join(raw))
