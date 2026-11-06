"""Normalização e validação de valores (datas, dinheiro, CPF/CNPJ, telefone, seguradora...)."""
from __future__ import annotations

import re
import unicodedata
from datetime import date

# --------------------------------------------------------------------------- texto

def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm_key(s: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(s or "").lower()).strip()


def clean_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip(" :-–|;,")


# --------------------------------------------------------------------------- datas
DATE_RE = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b")
_MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}
_ANY_DATE_RE = re.compile(
    r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b"
    r"|\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:de\s+)?(\d{4})\b",
    re.I,
)


def _iter_dates(s: str):
    for m in _ANY_DATE_RE.finditer(s or ""):
        if m.group(1):
            d = _mkdate(m.group(1), m.group(2), m.group(3))
        else:
            d = _mkdate(m.group(4), _MESES[strip_accents(m.group(5)).lower()[:3]], m.group(6))
        if d:
            yield d


def parse_date(s: str) -> str | None:
    """Primeira data em s (dd/mm/aaaa ou '12 de Agosto de 2024') -> 'aaaa-mm-dd'."""
    return next(_iter_dates(s), None)


def all_dates(s: str) -> list[str]:
    return list(_iter_dates(s))


def _mkdate(d, m, y) -> str | None:
    try:
        d, m, y = int(d), int(m), int(y)
        if y < 100:
            y += 2000 if y < 60 else 1900
        if not 1900 <= y <= 2100:
            return None
        return date(y, m, d).isoformat()
    except ValueError:
        return None


# --------------------------------------------------------------------------- dinheiro
MONEY_RE = re.compile(r"(?<![\d/])(?:R\$\s*)?\*{0,12}(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,7},\d{2})(?![\d/])")


def parse_money(s: str) -> float | None:
    if not s:
        return None
    m = MONEY_RE.search(s)
    if not m:
        return None
    return float(m.group(1).replace(".", "").replace(",", "."))


def all_money(s: str) -> list[float]:
    return [float(m.group(1).replace(".", "").replace(",", ".")) for m in MONEY_RE.finditer(s or "")]


# --------------------------------------------------------------------------- CPF / CNPJ
CPF_CNPJ_RE = re.compile(
    r"(?<![\d.])(\d{2}\.?\d{3}\.?\d{3}\s?/\s?\d{4}\s?-?\s?\d{2}|\d{3}\.?\d{3}\.?\d{3}\s?[-/.]?\s?\d{2}|\d{14}|\d{11})(?![\d])"
)


def _cpf_ok(d: str) -> bool:
    if len(d) != 11 or d == d[0] * 11:
        return False
    for n in (9, 10):
        s = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        if (s * 10 % 11) % 10 != int(d[n]):
            return False
    return True


def _cnpj_ok(d: str) -> bool:
    if len(d) != 14 or d == d[0] * 14:
        return False
    for n in (12, 13):
        w = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][13 - n:]
        s = sum(int(d[i]) * w[i] for i in range(n))
        r = s % 11
        if (0 if r < 2 else 11 - r) != int(d[n]):
            return False
    return True


def valid_doc(s: str) -> str | None:
    """Retorna CPF/CNPJ formatado se válido (checksum)."""
    d = re.sub(r"\D", "", s or "")
    if len(d) == 11 and _cpf_ok(d):
        return f"{d[:3]}.{d[3:6]}.{d[6:9]}-{d[9:]}"
    if len(d) == 14 and _cnpj_ok(d):
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    return None


def find_docs(s: str) -> list[str]:
    out = []
    for m in CPF_CNPJ_RE.finditer(s or ""):
        v = valid_doc(m.group(1))
        if v:
            out.append(v)
    return out


def mask_doc(v: str | None) -> str | None:
    if not v:
        return v
    d = re.sub(r"\D", "", v)
    if len(d) == 11:
        return f"{d[:3]}.***.***-{d[9:]}"
    if len(d) == 14:
        return f"{d[:2]}.***.***/{d[8:12]}-{d[12:]}"
    return "***"


# --------------------------------------------------------------------------- contato
PHONE_RE = re.compile(r"(?<!\d)(?:\+?55\s?)?\(?\s?0?(\d{2})\s?\)?\s?(9?\s?\d{4})\s?-?\s?(\d{4})(?!\d)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", re.I)
CEP_RE = re.compile(r"(?<![\d.])(\d{5})\s?-\s?(\d{3})(?!\d)|(?<![\d.])(\d{2})\.(\d{3})-(\d{3})(?!\d)")


def parse_phone(s: str) -> str | None:
    for m in PHONE_RE.finditer(s or ""):
        ddd, a, b = m.group(1), m.group(2).replace(" ", ""), m.group(3)
        if ddd.startswith("0") or set(a + b) == {"0"}:
            continue
        if not (11 <= int(ddd) <= 99):
            continue
        if len(a) == 5 and not a.startswith("9"):
            continue
        return f"({ddd}) {a}-{b}"
    return None


def parse_email(s: str) -> str | None:
    m = EMAIL_RE.search(s or "")
    return m.group(0).lower().rstrip(".") if m else None


def parse_cep(s: str) -> str | None:
    m = CEP_RE.search(s or "")
    if not m:
        return None
    if m.group(1):
        return f"{m.group(1)}-{m.group(2)}"
    return f"{m.group(3)}{m.group(4)}-{m.group(5)}"


# Dados do corretor / seguradoras que aparecem em quase todas as apólices
# (não são do cliente). Complementado em runtime por blocklist.json.
BROKER_EMAIL_PAT = re.compile(
    r"sseguro|sergiorosalim|sergioroslim|ssergiorosalim|prasempre|alvimseguros|edisonalvim|corretor|"
    r"ouvidoria|faleconosco|dpo@|protecaodedados|privacidade|atendimento|sac@|pagamentos|chamaqui|"
    r"@(?:[\w.-]*\.)?(tokiomarine|yelum|libertyseguros|zurich|mapfre|darwinseguros|sompo|sompoconsumer|ezzeseguros|"
    r"akadseguros|allianz|bradescoseguros|hdi|portoseguro|azulseguros|itau|suhai|mitsui|icatu|axa|pier|justos|surco|"
    r"nacion-seguros|ecp\.com|genial|susep)",
    re.I,
)

# --------------------------------------------------------------------------- veículo
PLACA_RE = re.compile(r"(?<![A-Z0-9])([A-Z]{3})\s?-?\s?(\d[A-Z0-9]\d{2})(?![A-Z0-9])")
CHASSI_RE = re.compile(r"(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])")


def parse_placa(s: str) -> str | None:
    m = PLACA_RE.search((s or "").upper())
    return m.group(1) + m.group(2) if m else None


def parse_chassi(s: str) -> str | None:
    for m in CHASSI_RE.finditer((s or "").upper()):
        v = m.group(1)
        if re.search(r"\d", v) and re.search(r"[A-Z]", v) and not v.isdigit():
            return v
    return None


# --------------------------------------------------------------------------- seguradoras
# (nome canônico, regex aplicada ao nome do arquivo, regex aplicada ao texto do PDF)
INSURERS: list[tuple[str, str, str]] = [
    ("Tokio Marine", r"tok[iy]o", r"tokio\s*marine"),
    ("Bradesco", r"brad?r?esco", r"bradesco\s*(auto|seguros|vida|sa[uú]de)|bradescoseguros"),
    ("Allianz", r"all?ianz", r"allianz"),
    ("Azul", r"\bazul\b", r"azul\s*(companhia|seguro|seguros)|azulseguros"),
    ("HDI", r"\bhdi\b", r"hdi\s*seguros|www\.hdi\.com"),
    ("Porto Seguro", r"\bporto\b", r"porto\s*seguro\s*(cia|companhia)|portoseguro\.com|porto\s*seguro"),
    ("Liberty/Yelum", r"li[bv]ert+y|yelum", r"yelum|liberty\s*seguros"),
    ("Itaú", r"ita[uú�]|itau", r"ita[uú]\s*seguros"),
    ("Suhai", r"suhai", r"suhai"),
    ("Zurich", r"zur[ui]?c?h|zuruch|zurih", r"zurich"),
    ("Mapfre", r"mapfre", r"mapfre"),
    ("Mitsui", r"mit[si]+[iu]|mitisui", r"mitsui\s*sumitomo|mitsui"),
    ("MBM", r"\bmbm\b", r"mbm\s*seguradora|\bmbm\b"),
    ("Sompo", r"sompo", r"sompo"),
    ("Darwin", r"darwin", r"darwin"),
    ("Pier", r"\bpier\b", r"\bpier\b"),
    ("Justos", r"justos", r"justos"),
    ("Akad", r"akad", r"akad"),
    ("Ezze", r"ezze", r"ezze"),
    ("Icatu", r"icatu", r"icatu"),
    ("AXA", r"\baxa\b", r"\baxa\s*seguros|\baxa\b"),
    ("Essor", r"\bessor\b", r"\bessor\b"),
    ("Excelsior", r"excelsior", r"excelsior"),
    ("Sura", r"\bsura\b", r"seguros\s*sura"),
    ("Junto Seguros", r"junto", r"junto\s*seguros"),
    ("MAG", r"\bmag\b", r"mag\s*seguros|mongeral"),
    ("Cardif", r"cardif", r"cardif"),
    ("Sancor", r"sancor", r"sancor"),
]


def insurer_from_filename(fname: str) -> str | None:
    k = norm_key(fname)
    parts = [p.strip() for p in re.split(r"_", k)]
    # preferir o 3º campo (padrão "Apolice Nome_PLACA Veiculo_Seguradora_data")
    cand = parts[2:3] + parts
    for p in cand:
        for name, fpat, _ in INSURERS:
            if re.search(fpat, p):
                return name
    return None


def insurer_from_text(text: str) -> tuple[str | None, dict]:
    """Pontua menções de cada seguradora; ignora menções a congênere/renovação."""
    t = norm_key(text[:60000])
    scores: dict[str, float] = {}
    n = max(len(t), 1)
    for name, _, tpat in INSURERS:
        sc = 0.0
        for m in re.finditer(tpat, t):
            ctx = t[max(0, m.start() - 80): m.start()]
            if re.search(r"congener|anterior|renova|seguradora anterior|cia anterior|/\s*$", ctx):
                sc += 0.1
                continue
            pos = m.start() / n
            sc += 3.0 if pos < 0.1 else 1.0
        if sc:
            scores[name] = round(sc, 1)
    if not scores:
        return None, scores
    best = max(scores, key=scores.get)
    return best, scores


# --------------------------------------------------------------------------- pagamento
def norm_payment(s: str) -> str | None:
    k = norm_key(s)
    if not k:
        return None
    if re.search(r"cart[a]o|credito|fat\.?\s*cart|conf\.?\s*fat|visa|master|amex|elo\b", k):
        return "cartao"
    if re.search(r"debito|deb\.?\s*(em|aut|c/c|conta)|d[eé]b\b", k):
        return "debito"
    if re.search(r"carne", k):
        return "carne"
    if re.search(r"boleto|ficha de compensa|bloqueto|cobranca bancaria|ficha", k):
        return "boleto"
    if re.search(r"\bpix\b", k):
        return "pix"
    if re.search(r"conta corrente|\bc/c\b|agencia\s*:?\s*\d", k):
        return "debito"
    if re.fullmatch(r"(pagamento )?a vista\.?", k):
        return "a_vista"
    return None


RAMO_KEYWORDS = [
    ("carta_verde", r"carta verde|mercosul|cartao verde"),
    ("frota", r"\bfrota\b"),
    ("residencial", r"residencial|residencia\b|resid\.|habitacional"),
    ("empresarial", r"empresarial|empresa\b|compreensivo empresarial|patrimonial"),
    ("condominio", r"condominio"),
    ("vida", r"seguro de vida|vida em grupo|vida individual|\bvida\b"),
    ("acidentes_pessoais", r"acidentes pessoais"),
    ("rc", r"responsabilidade civil(?! facultativa)"),
    ("viagem", r"seguro viagem"),
    ("moto", r"motocicleta|\bmoto\b"),
    ("auto", r"automovel|automoveis|seguro auto|\bauto\b|veiculo|placa"),
]
