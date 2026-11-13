"""Parser genérico: aplica rótulos padrão (comuns ao mercado) + overrides da seguradora."""
from __future__ import annotations

import re
from datetime import date

from .. import engine as E
from .. import normalize as N
from ..pdftext import Doc

CTX_NOT_CLIENT = (
    r"corretor|corretora|susep|seguradora s|seguros s\.?a|cia\.? de seguros|companhia|beneficiario|"
    r"sac\b|ouvidoria|atendimento|sinistro|assistencia|deficiente|0800|4004|3003|cedente|sacador|"
    r"capitais|regioes|inspetor|sucursal|filial|produtor|estipulante:? \w"
)

# ---------------------------------------------------------------- rótulos padrão (regex sobre texto sem acento, minúsculo)
DEFAULT = {
    "nome_segurado": [
        r"nome de registro do segurad[oa]", r"nome civil do segurad[oa]", r"nome do\s?\(?a?\)? segurad[oa]\(?a?\)?", r"nome do segurad[oa]",
        r"^segurad[oa]\s*\(?a?\)?\s*:", r"^segurad[oa]\(?a?\)?$", r"^proponente\s*:?", r"^nome do proponente",
        r"razao social", r"^nome\s*/\s*razao social", r"^cliente\s*:", r"^titular\s*:",
    ],
    "doc": [r"cpf\s*/\s*cnpj", r"cnpj\s*/\s*cpf", r"^cpf\b", r"\bcpf\s*:", r"^cnpj\b", r"c\.p\.f", r"cpf/cnpj"],
    "nascimento": [r"data de nascimento", r"data nascimento", r"data de nasc", r"data nasc", r"dt\.?\s*nasc", r"nascimento", r"\bnasc\."],
    "cnh": [r"\bcnh\b", r"habilitacao", r"n[ºo°]?\s*da cnh"],
    "telefone": [r"celular", r"telefone celular", r"tel\.?\s*celular", r"fone celular", r"telefone residencial",
                  r"telefone", r"^tel\b", r"\btel\.?\s*:", r"^fone", r"contato"],
    "email": [r"e-?mail"],
    "cep": [r"^cep\s*:?$", r"\bcep\s*:", r"^cep\b(?! de pernoite| pernoite)", r"cep de correspond", r"\bcep\b(?! de pernoite| pernoite)", r"cep (de )?pernoite"],
    "endereco": [r"endereco de correspondencia", r"endereco do segurado", r"endereco residencial", r"^endereco\s*:?",
                 r"\bendereco\s*:", r"^logradouro", r"endereco de pernoite", r"endereco"],
    "bairro": [r"^bairro", r"\bbairro\s*:"],
    "cidade": [r"^cidade", r"\bcidade\s*:", r"^municipio", r"\bmunicipio\s*:"],
    "uf": [r"^uf\b", r"\buf\s*:", r"^estado\s*:"],
    "apolice": [r"n[ºo°.]*\s*d[ae]\s*apolice", r"numero da apolice", r"nr\.?\s*(da\s*)?apolice", r"n[ºo°.]+\s*apolice",
                r"apolice\s*n[ºo°.]*", r"^apolice\s*:?$", r"^apolice\b", r"\bapolice\s*:", r"numero do seguro",
                r"certificado\s*n", r"n[ºo°.]*\s*do certificado", r"numero do certificado", r"bilhete"],
    "proposta": [r"n[ºo°.]*\s*da\s*proposta", r"numero da proposta", r"nr\.?\s*proposta", r"proposta\s*n[ºo°.]*",
                 r"^proposta\b", r"\bproposta\s*:", r"proposta"],
    "emissao": [r"data da emissao", r"data de emissao", r"dt\.?\s*emissao", r"data emissao", r"emissao\s*:", r"^emissao$",
                r"^emissao\b", r"emitid[ao] em", r"\bemissao\b"],
    "premio_total": [r"premio total", r"total do seguro", r"valor total do premio", r"preco total", r"valor total do seguro", r"premio final", r"valor total", r"total a pagar",
                     r"premio\s*\(r\$\)\s*total", r"total do premio", r"premio bruto", r"valor do seguro"],
    "forma_pagamento": [r"forma de pagamento", r"tipo de cobranca", r"forma de cobranca", r"cobranca em", r"meio de pagamento",
                        r"modalidade de pagamento", r"^cobranca", r"\bcobranca\s*:", r"pagamento\s*:", r"forma pagamento", r"forma de pgto",
                        r"tipo de pagamento", r"plano de pagamento"],
    "n_parcelas": [r"\bn[ºo°.]*\s*d?e?\s*parcelas?\b", r"\bn[ºo°.]*\s*d?e?\s*prestac(ao|oes)\b",r"quantidade de parcelas", r"qtde\.?\s*(de )?parcelas",
                   r"numero de parcelas", r"qtd\.?\s*parcelas", r"parcelamento\s*:"],
    "veiculo": [r"marca\s*/\s*tipo veiculo", r"marca\s*/\s*modelo", r"fabricante\s*/\s*modelo", r"descricao do veiculo", r"^veiculo\s*:",
                r"\bveiculo\s*:", r"^modelo\s*:", r"\bmodelo\s*:", r"^modelo$", r"^veiculo$", r"modelo do veiculo", r"marca/modelo"],
    "placa": [r"^placa", r"\bplaca\s*(/\s*uf)?\s*:", r"\bplaca\b"],
    "chassi": [r"^chassis?\b", r"\bchassis?\s*:", r"\bchassis?\b(?! remarcado)"],
    "ano_modelo": [r"ano de fabricacao\s*/\s*modelo", r"ano fab\.?\s*/\s*mod", r"ano\s*/\s*modelo", r"ano modelo", r"ano mod\.?",
                   r"ano fabricacao", r"^ano\b"],
    "bonus": [r"classe de bonus", r"classe bonus", r"classe do bonus", r"bonus\s*:", r"^bonus$", r"^bonus\b", r"\bbonus\b"],
}

EXCLUDES = {
    "apolice": r"congenere|anterior|renovacao da apolice|apolice anterior|apolice/seguradora|endosso n|sucursal\s+ramo|processo susep",
    "proposta": r"processo|susep|proposta de seguro\s*$",
    "emissao": r"r\.?g\.?|identidade|orgao emissor|emissor:",
    "premio_total": r"parcela|prestac|coberturas?\s+premio|liquido total",
    "telefone": CTX_NOT_CLIENT,
    "cep": CTX_NOT_CLIENT + r"|cnpj",
    "endereco": CTX_NOT_CLIENT,
    "bairro": CTX_NOT_CLIENT,
    "cidade": CTX_NOT_CLIENT + r"|local e data",
    "doc": r"corretor|corretora|correntista|beneficiario|susep|seguradora|cedente|condutor|proprietario",
    "nome_segurado": r"corretor|corretora|condutor",
    "nascimento": None,
    "bonus": r"desconto|bonus\s+\w+\s+bonus",
}


def _today():
    return date.today()


class Result(dict):
    """dict de campos + dict 'confianca' paralelo."""

    def __init__(self):
        super().__init__()
        self["confianca"] = {}

    def put(self, field, value, conf, overwrite=False):
        if value in (None, "", []):
            return
        if overwrite or self.get(field) in (None, "", []) or conf > self["confianca"].get(field, 0) + 0.15:
            self[field] = value
            self["confianca"][field] = round(conf, 2)


def labels_for(profile: dict, field: str) -> list[str]:
    return profile.get("labels", {}).get(field, []) + DEFAULT.get(field, [])


def run_generic(doc: Doc, profile: dict, R: Result, blocklist: dict):
    lab = lambda f: labels_for(profile, f)
    exc = lambda f: profile.get("excludes", {}).get(f, EXCLUDES.get(f))
    bl_emails = set(blocklist.get("emails", []))
    bl_phones = set(blocklist.get("phones", []))
    bl_docs = set(blocklist.get("docs", []))

    # ---------- nome do segurado
    h = E.find(doc, lab("nome_segurado"), "name", exclude=exc("nome_segurado"))
    if not h:
        # "Dados do segurado" -> "Nome"
        for li in E.lines_matching(doc, r"dados do segurad|segurad[oa]\s*$|informacoes do segurad|identificacao do segurad|dados do proponente|dados do cliente|^segurad[oa]\b|^proponente\s*$|^estipulante\s*$"):
            h = E.find(doc, [r"^nome completo", r"^nome\s*(do segurado)?\s*:", r"^nome\b", r"\bnome\s*:", r"\bnome completo\s*:"],
                       "name", start=li, stop=li + 10, exclude=r"corretor|condutor")
            if h:
                break
    if h:
        R.put("nome_segurado", h.value.upper(), h.conf)
        name_line = h.line
    else:
        name_line = 0

    # ---------- CPF / CNPJ
    def doc_ok(v):
        return re.sub(r"\D", "", v) not in bl_docs

    h = E.find(doc, lab("doc"), "doc", exclude=exc("doc"), start=max(0, name_line - 3), stop=name_line + 25, accept=doc_ok)
    if not h:
        h = E.find(doc, lab("doc"), "doc", exclude=exc("doc"), accept=doc_ok)
        if h:
            h.conf -= 0.1
    if not h:
        p = re.compile(CTX_NOT_CLIENT + r"|cnpj\s*:?\s*\d{2}\.\d{3}")
        for L in doc.lines:
            if p.search(N.norm_key(L.text)):
                continue
            ds = [d for d in N.find_docs(L.text) if doc_ok(d)]
            if ds:
                R.put("cpf_cnpj", ds[0], 0.55)
                break
    if h:
        R.put("cpf_cnpj", h.value, h.conf)
    if R.get("cpf_cnpj"):
        R.put("tipo_pessoa", "PF" if len(re.sub(r"\D", "", R["cpf_cnpj"])) == 11 else "PJ", R["confianca"]["cpf_cnpj"])

    # ---------- nascimento, CNH
    h = E.find(doc, lab("nascimento"), "birth")
    if h:
        R.put("data_nascimento", h.value, h.conf - 0.05)
    h = E.find(doc, lab("cnh"), "cnh", exclude=r"categoria|validade|tempo de")
    if h:
        R.put("cnh", h.value, h.conf - 0.1)

    # ---------- contato
    def phone_ok(v):
        d = re.sub(r"\D", "", v)
        return d not in bl_phones and d[-10:] not in bl_phones and not re.match(r"(0800|4004|3003|4003|4020)", d)

    h = E.find(doc, lab("telefone"), "phone", exclude=exc("telefone"), accept=phone_ok)
    if h:
        R.put("telefone", h.value, h.conf)

    def email_ok(v):
        return v not in bl_emails and not N.BROKER_EMAIL_PAT.search(v)

    h = E.find(doc, lab("email"), "email", accept=email_ok, exclude=r"corretor|ouvidoria|sac\b|dpo")
    if h:
        R.put("email", h.value, h.conf)
    else:
        for L in doc.lines:
            for e in N.EMAIL_RE.findall(L.text):
                e = e.lower().rstrip(".")
                if email_ok(e):
                    R.put("email", e, 0.6)
                    break
            if R.get("email"):
                break

    # ---------- endereço
    st = max(0, name_line - 5)
    for f, kind in (("endereco", "address"), ("bairro", "text"), ("cidade", "text"), ("uf", "text"), ("cep", "cep")):
        h = E.find(doc, lab(f), kind, exclude=exc(f), start=st, stop=st + 60) or E.find(doc, lab(f), kind, exclude=exc(f))
        if h:
            v = h.value
            if f == "uf":
                m = re.match(r"\s*([A-Za-z]{2})\b", v)
                if not m or m.group(1).upper() not in UFS:
                    continue
                v = m.group(1).upper()
            if f == "cidade":
                v = re.split(r"\s{2,}|\s+-\s+[A-Z]{2}\b|\s+UF\b|/[A-Z]{2}\b", v)[0].strip()
                if len(v) < 2 or re.search(r"\d", v):
                    continue
            if f == "bairro" and re.search(r"^\d+$", v):
                continue
            R.put(f, v.upper() if isinstance(v, str) and f != "cep" else v, h.conf - 0.05)

    # ---------- números
    h = E.find(doc, lab("apolice"), "policy", exclude=exc("apolice"))
    if h:
        R.put("numero_apolice", h.value, h.conf)
    # Yelum/Liberty: "Apólice 31.12.2024.0123456" (ramo.sucursal.ano.sequência). O formato parece
    # data, então a busca genérica pulava e pegava o "2024" de um "dezembro de 2024" qualquer.
    m = re.search(r"ap[oó]lice[\s\S]{0,150}?(?<![\d.])(\d{2}\.\d{2}\.20\d{2}\.\d{5,10})(?!\d)", doc.text, re.I)
    if m:
        R.put("numero_apolice", m.group(1), 0.95, overwrite=True)
    # Ainda curto ("0531" = só a sucursal, "1.212" = pedaço de outro campo): procura o número
    # completo perto de um rótulo de apólice (Porto/Itaú "Apólice Endossada: 0531 65 12345678",
    # "Apólice atual: ...", Tokio "Apólice: 12345678"), ou a linha solta no formato Porto.
    if len(re.sub(r"\D", "", R.get("numero_apolice") or "")) <= 4:
        m = (re.search(r"ap[oó]lice(?! anterior)[^\n:]{0,25}:?\s*(\d{4} \d{2} \d{7,8})(?!\d)", doc.text, re.I)
             or re.search(r"(?m)^\s*(\d{4} \d{2} \d{7,8})\s*$", doc.text)
             or re.search(r"ap[oó]lice:\s*(\d{7,12})(?![\d./-])", doc.text, re.I))
        if m:
            R.put("numero_apolice", m.group(1), 0.85, overwrite=True)
    h = E.find(doc, lab("proposta"), "policy", exclude=exc("proposta"), exclude_scope="seg")
    if h:
        R.put("proposta", h.value, h.conf)
    h = E.find(doc, lab("emissao"), "date", exclude=exc("emissao"))
    if h:
        R.put("data_emissao", h.value, h.conf)
    else:
        m = re.search(r"emitid[ao].{0,60}?(\d{2}/\d{2}/\d{4})", doc.norm)
        if m:
            R.put("data_emissao", N.parse_date(m.group(1)), 0.6)

    # ---------- vigência
    vig = find_vigencia(doc, profile)
    if vig:
        R.put("inicio_vigencia", vig[0], vig[2])
        R.put("fim_vigencia", vig[1], vig[2])

    # ---------- prêmio
    h = E.find(doc, lab("premio_total"), "money", exclude=exc("premio_total"), exclude_scope="seg", below=3, accept=lambda v: v > 0)
    if h:
        R.put("premio_total", h.value, h.conf)

    # ---------- parcelas
    inst = E.parse_installments(doc)
    if inst:
        R.put("parcelas", inst[0], 0.8)
    h = E.find(doc, lab("n_parcelas"), "int", below=2)
    if h:
        R.put("n_parcelas", h.value, h.conf)
    if not R.get("n_parcelas"):
        m = re.search(r"\b(?:em|plano)\s*:?\s*(\d{1,2})\s*(?:\(\w+\)\s*)?(?:parcelas?|prestac|vezes|x\b)", doc.norm)
        m = m or re.search(r"(?<![\d,.])(\d{1,2})\s*x\s*(?:de\s*)?r\$", doc.norm)
        if m and 0 < int(m.group(1)) <= 24:
            R.put("n_parcelas", int(m.group(1)), 0.65)
    if not R.get("parcelas"):
        # "10x de R$ 265,87" -> parcelas iguais sem vencimento
        m = re.search(r"(?<![\d,.])(\d{1,2})\s*x\s*(?:de\s*)?r\$\s*([\d.]+,\d{2})", doc.norm)
        if m and 0 < int(m.group(1)) <= 24:
            from .common import build_installments
            n = int(m.group(1))
            R.put("parcelas", build_installments(n, N.parse_money(m.group(2)), None), 0.65)
            R.put("n_parcelas", n, 0.7)
    if R.get("parcelas") and not R.get("n_parcelas"):
        R.put("n_parcelas", len(R["parcelas"]), 0.7)

    # ---------- forma de pagamento
    h = E.find(doc, lab("forma_pagamento"), "payment", below=3)
    if h:
        R.put("forma_pagamento", h.value, h.conf)
    else:
        fp = payment_by_context(doc, inst[1] if inst else None)
        if fp:
            R.put("forma_pagamento", fp, 0.6)

    # ---------- veículo
    h = E.find(doc, lab("veiculo"), "vehicle", exclude=r"zero km|0 ?km|blindado|utilizacao|vistoria|alienado|categoria|kit gas|tipo de veiculo|\buso\b|chassi|placa")
    if h:
        R.put("veiculo", h.value.upper(), h.conf - 0.05)
    h = E.find(doc, lab("placa"), "placa")
    if h:
        R.put("placa", h.value, h.conf)
    h = E.find(doc, lab("chassi"), "chassi", exclude=r"remarcado\s*:?\s*(sim|nao)$")
    if h:
        R.put("chassi", h.value, h.conf)
    elif R.get("placa"):
        for L in doc.lines:
            c = N.parse_chassi(L.text)
            if c and re.match(r"[0-9]?[A-Z0-9]{2}[A-Z0-9]", c) and c[:1] in "9358LWJKV" and re.search(r"\d{4}$", c):
                R.put("chassi", c, 0.6)
                break
    h = E.find(doc, lab("ano_modelo"), "year")
    if h:
        R.put("ano_modelo", h.value, h.conf - 0.05)
    h = E.find(doc, lab("bonus"), "bonus", exclude=exc("bonus"))
    if h:
        R.put("classe_bonus", h.value, h.conf - 0.05)


UFS = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())


def find_vigencia(doc: Doc, profile: dict):
    """(inicio, fim, conf) — par de datas próximo ao rótulo 'vigência'."""
    from datetime import date as _d

    def ok(a, b):
        da, db = _d.fromisoformat(a), _d.fromisoformat(b)
        return 0 < (db - da).days <= 800

    exc = re.compile(profile.get("vig_exclude", r"congenere|anterior|termino de vigencia\s*$|renovacao da apolice|seguradora anterior|apolice/seguradora"))
    pats = profile.get("vig_labels", []) + [r"vigencia", r"periodo de cobertura", r"periodo do seguro", r"validez", r"inicio do seguro", r"vigente"]
    for pat in pats:
        for li in E.lines_matching(doc, pat):
            t = N.norm_key(doc.lines[li].text)
            if exc.search(t) and not re.search(r"vigencia[^:]{0,20}:?\s*(das|de|a partir)", t):
                continue
            # mesma linha, depois linhas abaixo e segmentos sobrepostos
            chunks = [doc.lines[li].text]
            for j in range(li + 1, min(li + 4, len(doc.lines))):
                if doc.lines[j].page != doc.lines[li].page:
                    break
                chunks.append(doc.lines[j].text)
            for k in range(1, len(chunks) + 1):
                ds = N.all_dates("\n".join(chunks[:k]))
                # remover datas de "emissão" se houver no mesmo trecho
                for i in range(len(ds)):
                    for j in range(i + 1, len(ds)):
                        if ok(ds[i], ds[j]):
                            return ds[i], ds[j], 0.9 if k == 1 else 0.8
    # rótulos separados
    a = E.find(doc, [r"inicio (de |da )?vigencia", r"inicio do seguro", r"vigencia inicial", r"data inicio", r"inicio\s*:"], "date")
    b = E.find(doc, [r"(fim|termino|final) (de |da )?vigencia", r"vigencia final", r"termino do seguro", r"data fim", r"\bfim\s*:", r"\bate\s*:"], "date",
               exclude=r"congenere|anterior")
    if a and b and ok(a.value, b.value):
        return a.value, b.value, 0.8
    return None


def payment_by_context(doc: Doc, inst_line):
    cnt = {}
    rng = []
    if inst_line is not None:
        rng = range(max(0, inst_line - 8), min(len(doc.lines), inst_line + 12))
    else:
        rng = [li for li in E.lines_matching(doc, r"pagamento|cobranca|parcela|prestac")]
    for li in rng:
        t = N.norm_key(doc.lines[li].text)
        if len(t) > 160:
            continue
        for seg in doc.lines[li].segs:
            p = N.norm_payment(seg.text)
            if p and len(seg.text) < 60:
                cnt[p] = cnt.get(p, 0) + 1
    return max(cnt, key=cnt.get) if cnt else None
