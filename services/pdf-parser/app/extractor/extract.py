"""Extrator de dados de apólices de seguro (PDF).

Uso como biblioteca (backend do SaaS):

    from extrator import parse_policy_pdf
    data = parse_policy_pdf("apolice.pdf")            # dict com campos + "confianca"

Uso em lote (base da corretora):

    python -m extrator.extract --root <pasta_clientes> --out <pasta_saida> [--today 2026-11-05] [--workers 12]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import date
from multiprocessing import Pool

from . import normalize as N
from .parsers import get_parser
from .parsers.base import Result, run_generic
from .pdftext import load_pdf

HERE = os.path.dirname(os.path.abspath(__file__))
# Lista de contatos/documentos da corretora e seguradoras (não são do cliente). Gerada a
# partir da carteira real -> fica FORA do git; no container é montada via EXTRATOR_BLOCKLIST.
BLOCKLIST_PATH = os.environ.get("EXTRATOR_BLOCKLIST") or os.path.join(HERE, "blocklist.json")
MIN_CHARS = 80  # abaixo disso o PDF é considerado imagem / sem texto

FIELDS = [
    "nome_segurado", "cpf_cnpj", "tipo_pessoa", "data_nascimento", "cnh", "telefone", "email",
    "endereco", "bairro", "cidade", "uf", "cep", "seguradora", "ramo", "tipo_documento",
    "numero_apolice", "proposta", "data_emissao", "inicio_vigencia", "fim_vigencia", "premio_total",
    "forma_pagamento", "n_parcelas", "parcelas", "veiculo", "placa", "chassi", "ano_modelo", "classe_bonus",
]

_BLOCKLIST_CACHE = None


def load_blocklist() -> dict:
    global _BLOCKLIST_CACHE
    if _BLOCKLIST_CACHE is None:
        try:
            with open(BLOCKLIST_PATH, encoding="utf-8") as f:
                _BLOCKLIST_CACHE = json.load(f)
        except (OSError, ValueError):
            _BLOCKLIST_CACHE = {"emails": [], "phones": [], "docs": []}
    return _BLOCKLIST_CACHE


# --------------------------------------------------------------------------- nome de arquivo
def parse_filename(fname: str) -> dict:
    """'Apolice <Nome>_<PLACA> <Veiculo>_<Seguradora>_<dd.mm.aaaa>.pdf' (com variações)."""
    base = os.path.splitext(os.path.basename(fname))[0]
    out = {}
    parts = [p.strip() for p in base.split("_")]
    if parts:
        nm = re.sub(r"(?i)^((ap[oó]lices?|endossos?|de|do|da|cancelamento|proposta|renova[cç][aã]o|carta verde|2[ªa] via)\s+)+", "", parts[0]).strip()
        out["nome"] = nm or None
    m = re.search(r"(\d{1,2})[.\-](\d{1,2})[.\-](\d{4}|\d{2})(?!\d)", base)
    if m:
        out["data"] = N._mkdate(*m.groups())
    if len(parts) >= 2:
        p = N.parse_placa(parts[1])
        if p:
            out["placa"] = p
            out["veiculo"] = re.sub(r"(?i)^[A-Z]{3}-?\d[A-Z0-9]\d{2}\s*", "", parts[1]).strip() or None
    out["seguradora"] = N.insurer_from_filename(base)
    return out


# --------------------------------------------------------------------------- classificação
def detect_doc_type(fname: str, head: str) -> str:
    f = N.norm_key(os.path.basename(fname))
    h = N.norm_key(head)
    if re.search(r"\bcnh\b|habilitacao", f) or re.search(r"carteira nacional de habilitacao|national driver license", h):
        return "cnh"
    if re.search(r"\bcrlv|\bcrv\b|documento do veiculo", f) or re.search(r"certificado de registro e licenciamento|certificado de registro de veiculo", h):
        return "crlv"
    if re.search(r"cartao cnpj|contrato social|laudo|vistoria|orcamento|nota fiscal", f) or re.search(r"comprovante de inscricao e de situacao cadastral", h):
        return "documento_auxiliar"
    if "endosso" in f or "cancelamento" in f:
        return "endosso"
    if "proposta" in f:
        return "proposta"
    if "boleto" in f:
        return "boleto"
    if "carta verde" in f:
        return "carta_verde"
    if re.search(r"carta verde|mercosul", h):
        return "carta_verde"
    if re.search(r"endosso\s+(de|n[ºo]?\.?\s*\d*[1-9])|tipo de endosso|especificacao do endosso|^endosso\b|alteracao cadastral|endosso de (inclusao|exclusao|alteracao|cancelamento)", h, re.M):
        return "endosso"
    if re.search(r"proposta de seguro|proposta de adesao", h) and not re.search(r"apolice\s*(n|:|de seguro)", h):
        return "proposta"
    if re.search(r"apolice|certificado|bilhete", h):
        return "apolice"
    if re.search(r"boleto|ficha de compensacao|linha digitavel", h):
        return "boleto"
    return "outro"


def detect_ramo(text_head: str, fname: str, R: dict) -> str | None:
    t = N.norm_key(os.path.basename(fname)) + " " + N.norm_key(text_head)
    if R.get("tipo_documento") == "carta_verde":
        return "carta_verde"

    def n_itens():
        m = re.search(r"quantidade de (?:veiculos|itens)(?:\s*\(itens\))?\s*:?\s*(\d{1,4})\b", t)
        return int(m.group(1)) if m else 1

    m = re.search(r"\bramo\s*:?\s*([\w .\-/]{3,40})", N.norm_key(text_head))
    ramo_lbl = m.group(1) if m else ""
    for name, pat in N.RAMO_KEYWORDS:
        if name == "carta_verde":
            continue
        if re.search(pat, ramo_lbl):
            if name == "auto" and (n_itens() > 1 or re.search(r"\bfrota\b", t)):
                return "frota"
            return name
    fn = N.norm_key(os.path.basename(fname))
    for name in ("residencial", "empresarial", "condominio", "vida", "acidentes_pessoais"):
        if re.search(dict(N.RAMO_KEYWORDS)[name], fn):
            return name
    if R.get("placa") or R.get("chassi"):
        if n_itens() > 1 or re.search(r"\bfrota\b", t):
            return "frota"
        return "auto"
    for name, pat in N.RAMO_KEYWORDS:
        if name != "carta_verde" and re.search(pat, t):
            return name
    return None


# --------------------------------------------------------------------------- API pública
def parse_policy_pdf(path: str, *, use_filename: bool = True, blocklist: dict | None = None, filename: str | None = None) -> dict:
    """Extrai os dados de UMA apólice em PDF.

    Retorna dict com os campos de FIELDS (None quando não encontrado), mais:
      - "confianca": {campo: 0..1}
      - "status_texto": "ok" | "sem_texto" | "erro"
      - "arquivo", "paginas", "seguradora_scores", "avisos"
    `use_filename=True` usa o nome do arquivo como pista/fallback (placa, data, seguradora).
    `filename` (upload): nome original do arquivo, usado como pista mesmo com use_filename=False.
    """
    bl = blocklist if blocklist is not None else load_blocklist()
    R = Result()
    for f in FIELDS:
        R.setdefault(f, None)
    R["arquivo"] = path
    R["avisos"] = []
    fname = filename or path
    fn = parse_filename(fname) if (use_filename or filename) else {}
    try:
        doc = load_pdf(path)
    except Exception as e:  # PDF corrompido / protegido
        R["status_texto"] = "erro"
        R["avisos"].append(f"erro_leitura: {type(e).__name__}: {e}"[:200])
        _apply_filename_fallbacks(R, fn)
        return _finish(R)
    R["paginas"] = doc.n_pages
    if doc.n_chars < MIN_CHARS or _garbage(doc.text):
        R["status_texto"] = "sem_texto"
        _apply_filename_fallbacks(R, fn)
        R["tipo_documento"] = detect_doc_type(fname, "")
        return _finish(R)
    R["status_texto"] = "ok"

    ins, scores = N.insurer_from_text(doc.text)
    R["seguradora_scores"] = scores
    fins = fn.get("seguradora")
    # nome do arquivo vence quando a seguradora dele também é citada no texto (ex.: Itaú Auto é
    # operado pela Porto e os PDFs citam as duas); sem nome de arquivo, regra de grupo:
    if ins in ("Porto Seguro", "Itaú") and re.search(r"itau seguros?|itau auto|marca licenciada.{0,40}porto", doc.norm):
        ins = "Itaú"
    if fins and scores.get(fins, 0) > 0:
        ins = fins
    if fins == "Itaú" and ins == "Porto Seguro":  # Itaú Auto emitido pela Porto
        ins = "Itaú"
        R["avisos"].append("emitida_pela_porto_seguro")
        scores["Itaú"] = scores.get("Porto Seguro", 1)
    if ins and (not fins or fins == ins or scores.get(ins, 0) >= 2 * scores.get(fins, 0.01)):
        R.put("seguradora", ins, 0.9 if not fins or fins == ins else 0.7)
        if fins and fins != ins:
            R["avisos"].append(f"seguradora_arquivo={fins}")
    elif fins:
        R.put("seguradora", fins, 0.75 if scores.get(fins) else 0.5)

    profile, refine = get_parser(R.get("seguradora"))
    run_generic(doc, profile, R, bl)
    if refine:
        try:
            refine(doc, R)
        except Exception as e:  # nunca derrubar o lote por causa de um refinamento
            R["avisos"].append(f"refine_erro: {type(e).__name__}: {e}"[:200])

    head = "\n".join(l.text for l in doc.lines[:60])
    R.put("tipo_documento", detect_doc_type(fname, head), 0.8)
    # Endosso de cancelamento: a apólice original deixa de valer na data do endosso.
    R["endosso_cancelamento"] = R.get("tipo_documento") == "endosso" and bool(
        re.search(r"endosso de cancelamento|\d{4} - cancelamento de cobertura|cancelamento total da apolice|tipo de endosso:? ?cancelamento", N.norm_key(head + " " + doc.text[:6000]))
        or re.search(r"cancelamento", N.norm_key(os.path.basename(fname))))
    R.put("ramo", detect_ramo("\n".join(l.text for l in doc.lines[:250]), path, R), 0.7)
    _apply_filename_fallbacks(R, fn)
    _sanity(R)
    return _finish(R)


def _garbage(text: str) -> bool:
    letters = sum(c.isalpha() for c in text)
    return letters < 0.3 * max(len(text.replace(" ", "")), 1)


def _apply_filename_fallbacks(R: Result, fn: dict):
    if not fn:
        return
    if fn.get("seguradora"):
        R.put("seguradora", fn["seguradora"], 0.5)
    if fn.get("placa"):
        if R.get("placa") and R["placa"] != fn["placa"]:
            R["avisos"].append("placa_difere_do_nome_do_arquivo")
        R.put("placa", fn["placa"], 0.5)
    if fn.get("veiculo"):
        R.put("veiculo", fn["veiculo"].upper(), 0.4)
    if fn.get("data") and not R.get("fim_vigencia"):
        R.put("fim_vigencia", fn["data"], 0.4)
        R["confianca"]["fim_vigencia_fonte"] = "nome_arquivo"
    if fn.get("nome") and not R.get("nome_segurado"):
        R.put("nome_segurado", fn["nome"].upper(), 0.3)


def _sanity(R: Result):
    if R.get("premio_total") and R.get("parcelas"):
        s = sum(p["valor"] for p in R["parcelas"])
        if abs(s - R["premio_total"]) > max(5, 0.03 * R["premio_total"]) and len(R["parcelas"]) > 1:
            R["avisos"].append(f"soma_parcelas({s:.2f})!=premio_total")
            R["confianca"]["parcelas"] = min(R["confianca"].get("parcelas", 0.8), 0.6)
        elif R["confianca"].get("parcelas"):
            R["confianca"]["parcelas"] = 0.95
            R["confianca"]["premio_total"] = max(R["confianca"].get("premio_total", 0), 0.95)
    if R.get("n_parcelas") and R.get("parcelas") and R["n_parcelas"] != len(R["parcelas"]):
        R["avisos"].append("n_parcelas_difere_da_lista")
    if R.get("premio_total") and not R.get("n_parcelas") and R.get("forma_pagamento") == "boleto":
        pass


def _finish(R: Result) -> dict:
    d = dict(R)
    d["confianca"] = dict(R["confianca"])
    return d


# --------------------------------------------------------------------------- lote
def _is_vencida_dir(rel_parts: list[str]) -> bool:
    return any(re.search(r"venc|vinc|verc", N.norm_key(p)) and re.search(r"apo|ap0|venc", N.norm_key(p)) for p in rel_parts)


def scan(root: str):
    pdfs, others = [], []
    for cl in sorted(os.listdir(root)):
        cdir = os.path.join(root, cl)
        if not os.path.isdir(cdir):
            others.append({"cliente": None, "arquivo": cdir})
            continue
        for d, _, fs in os.walk(cdir):
            rel = os.path.relpath(d, cdir)
            parts = [] if rel == "." else rel.split(os.sep)
            for f in fs:
                p = os.path.join(d, f)
                item = {"cliente": cl, "arquivo": p, "subpasta": "/".join(parts) or None,
                        "pasta_vencidas": _is_vencida_dir(parts)}
                (pdfs if f.lower().endswith(".pdf") else others).append(item)
    return pdfs, others


def _worker(item):
    t0 = time.time()
    try:
        r = parse_policy_pdf(item["arquivo"])
    except Exception as e:
        r = {"arquivo": item["arquivo"], "status_texto": "erro", "avisos": [f"{type(e).__name__}: {e}"[:200]], "confianca": {}}
    r["cliente_pasta"] = item["cliente"]
    r["subpasta"] = item["subpasta"]
    r["pasta_vencidas"] = item["pasta_vencidas"]
    r["tempo_s"] = round(time.time() - t0, 2)
    return r


def build_blocklist(recs: list[dict], min_clients: int = 5) -> dict:
    """Valores (e-mail, telefone, CPF/CNPJ) que aparecem em >= min_clients clientes diferentes = corretor/seguradora."""
    seen = {"emails": defaultdict(set), "phones": defaultdict(set), "docs": defaultdict(set)}
    for r in recs:
        c = r.get("cliente_pasta")
        if r.get("email"):
            seen["emails"][r["email"]].add(c)
        if r.get("telefone"):
            seen["phones"][re.sub(r"\D", "", r["telefone"])].add(c)
        if r.get("cpf_cnpj"):
            seen["docs"][re.sub(r"\D", "", r["cpf_cnpj"])].add(c)
    old = load_blocklist()
    out = {}
    for k, d in seen.items():
        out[k] = sorted(set(old.get(k, [])) | {v for v, cs in d.items() if len(cs) >= min_clients})
    return out


def client_status(pols: list[dict], today: str):
    def end(p):
        return p.get("fim_vigencia")

    valid = [p for p in pols if p.get("tipo_documento") not in ("boleto",)]
    fora = [p for p in valid if not p.get("pasta_vencidas")]
    futuras = [p for p in valid if end(p) and end(p) >= today]
    ativas = [p for p in fora if end(p) and end(p) >= today]
    st = "ATIVO" if ativas else "INATIVO"
    crit = {
        "tem_apolice_fora_pasta_vencidas": bool(fora),
        "tem_apolice_com_vigencia_futura": bool(futuras),
        "apolices_ativas": len(ativas),
        "divergencia": None,
    }
    if fora and not ativas:
        crit["divergencia"] = "apolices_fora_da_pasta_vencidas_mas_vigencia_passada_ou_desconhecida"
    elif futuras and not ativas:
        crit["divergencia"] = "vigencia_futura_somente_na_pasta_vencidas"
    return st, crit


CAD_FIELDS = ["nome_segurado", "cpf_cnpj", "tipo_pessoa", "data_nascimento", "cnh", "telefone", "email",
              "endereco", "bairro", "cidade", "uf", "cep"]


def consolidate(recs: list[dict], others: list[dict], today: str) -> list[dict]:
    by = defaultdict(list)
    for r in recs:
        by[r["cliente_pasta"]].append(r)
    oth = defaultdict(list)
    for o in others:
        oth[o["cliente"]].append(o["arquivo"])
    clients = []
    for cl in sorted(set(by) | {k for k in oth if k}):
        pols = by.get(cl, [])

        def key(p):
            return p.get("data_emissao") or p.get("inicio_vigencia") or p.get("fim_vigencia") or ""

        srt = sorted(pols, key=key, reverse=True)
        docs = Counter(p["cpf_cnpj"] for p in pols if p.get("cpf_cnpj"))
        cad = {}
        for f in CAD_FIELDS:
            if f == "cpf_cnpj" and docs:
                # documento mais frequente; empate -> mais recente
                top = docs.most_common()
                best = top[0][1]
                cand = [d for d, n in top if n == best]
                for p in srt:
                    if p.get("cpf_cnpj") in cand:
                        cad[f] = p["cpf_cnpj"]
                        break
                continue
            for p in srt:
                if p.get(f) and p.get("confianca", {}).get(f, 0) >= 0.5:
                    cad[f] = p[f]
                    break
            else:
                cad[f] = None
        if cad.get("cpf_cnpj"):
            cad["tipo_pessoa"] = "PF" if len(re.sub(r"\D", "", cad["cpf_cnpj"])) == 11 else "PJ"
        st, crit = client_status(pols, today)
        prox = sorted([p["fim_vigencia"] for p in pols if p.get("fim_vigencia") and p["fim_vigencia"] >= today and not p.get("pasta_vencidas")])
        clients.append({
            "cliente": cl,
            **cad,
            "documentos_encontrados": sorted(docs),
            "status": st,
            "criterios_status": crit,
            "proximo_vencimento": prox[0] if prox else None,
            "seguradoras": sorted({p["seguradora"] for p in pols if p.get("seguradora")}),
            "n_pdfs": len(pols),
            "apolices": [{
                "arquivo": p["arquivo"],
                "tipo_documento": p.get("tipo_documento"), "seguradora": p.get("seguradora"), "ramo": p.get("ramo"),
                "numero_apolice": p.get("numero_apolice"), "inicio_vigencia": p.get("inicio_vigencia"),
                "fim_vigencia": p.get("fim_vigencia"), "premio_total": p.get("premio_total"),
                "forma_pagamento": p.get("forma_pagamento"), "n_parcelas": p.get("n_parcelas"),
                "placa": p.get("placa"), "veiculo": p.get("veiculo"), "pasta_vencidas": p.get("pasta_vencidas"),
                "status_texto": p.get("status_texto"),
            } for p in srt],
            "arquivos_nao_pdf": oth.get(cl, []),
        })
    return clients


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--today", default=date.today().isoformat())
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    pdfs, others = scan(a.root)
    print(f"{len(pdfs)} PDFs, {len(others)} outros arquivos", flush=True)
    with Pool(a.workers) as pool:
        recs = pool.map(_worker, pdfs, chunksize=4)
    # 2ª passada: bloquear contatos/documentos do corretor/seguradoras que se repetem entre clientes
    bl = build_blocklist(recs)
    with open(BLOCKLIST_PATH, "w", encoding="utf-8") as f:
        json.dump(bl, f, ensure_ascii=False, indent=1)
    global _BLOCKLIST_CACHE
    _BLOCKLIST_CACHE = bl
    sets = {k: set(v) for k, v in bl.items()}
    redo = [i for i, r in enumerate(recs) if (r.get("email") in sets["emails"]) or
            (r.get("telefone") and re.sub(r"\D", "", r["telefone"]) in sets["phones"]) or
            (r.get("cpf_cnpj") and re.sub(r"\D", "", r["cpf_cnpj"]) in sets["docs"])]
    if redo:
        with Pool(a.workers) as pool:
            again = pool.map(_worker, [pdfs[i] for i in redo], chunksize=4)
        for i, r in zip(redo, again):
            recs[i] = r
    print(f"reprocessados (blocklist): {len(redo)}; tempo {time.time()-t0:.1f}s", flush=True)

    clients = consolidate(recs, others, a.today)
    with open(os.path.join(a.out, "policies.json"), "w", encoding="utf-8") as f:
        json.dump(recs, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, "clients.json"), "w", encoding="utf-8") as f:
        json.dump(clients, f, ensure_ascii=False, indent=1)
    from .report import write_report
    write_report(recs, clients, others, os.path.join(a.out, "report.md"), a.today, time.time() - t0)
    print(f"ok em {time.time()-t0:.1f}s -> {a.out}")


if __name__ == "__main__":
    main()
