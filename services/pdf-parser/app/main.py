"""Leitor de PDF de apólices (FastAPI) — rede interna, chamado só pela API.

POST /parse  (multipart, campo "file")  ->  campos + confiança por campo (0..1)
GET  /health

O motor de extração é o pacote `app.extractor` (cópia de ../_dados/extrator, sem dados
de clientes). Aqui só adaptamos a saída dele para o contrato da API (ver
apps/api/src/modules/documents/pdfParser.ts -> ParserOutput).
"""
from __future__ import annotations

import hmac
import os
import re
import tempfile

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

from .extractor import parse_policy_pdf

MAX_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "20")) * 1024 * 1024
TOKEN = os.environ.get("PDF_PARSER_TOKEN") or ""

app = FastAPI(title="Serginho Seguros — pdf-parser", version="1.0.0", docs_url=None, redoc_url=None)

FORMA_MAP = {"cartao": "CARTAO", "boleto": "BOLETO", "debito": "DEBITO", "carne": "CARNE", "pix": "PIX", "a_vista": "OUTRO"}


def _f(valor, conf: float | None):
    """Campo no formato {valor, confianca}; sem valor => confiança 0."""
    if valor in (None, "", []):
        return {"valor": None, "confianca": 0.0}
    return {"valor": valor, "confianca": round(float(conf if conf is not None else 0.5), 2)}


def _ano(s):
    if not s:
        return None
    m = re.search(r"(19|20)\d{2}(\s*/\s*(19|20)\d{2})?", str(s))
    return m.group(0).replace(" ", "") if m else str(s)


def to_contract(r: dict) -> dict:
    c = r.get("confianca") or {}
    endereco = ", ".join(x for x in [r.get("endereco"), r.get("bairro"), r.get("cidade"), r.get("uf")] if x) or None
    itens = []
    if r.get("placa") or r.get("chassi") or r.get("veiculo"):
        confs = [c.get(k) for k in ("placa", "chassi", "veiculo") if c.get(k) is not None]
        itens.append({
            "placa": r.get("placa"),
            "modelo": r.get("veiculo"),
            "ano": _ano(r.get("ano_modelo")),
            "chassi": r.get("chassi"),
            "confianca": round(sum(confs) / len(confs), 2) if confs else 0.5,
        })
    pc = c.get("parcelas", 0.6)
    parcelas = [
        {"numero": int(p.get("parcela")), "valor": p.get("valor"), "vencimento": p.get("vencimento"), "confianca": round(pc, 2)}
        for p in (r.get("parcelas") or [])
        if p.get("parcela")
    ]
    avisos = list(r.get("avisos") or [])
    if r.get("status_texto") == "sem_texto":
        # TODO(ocr): PDFs digitalizados (imagem) ainda não têm OCR; o operador preenche à mão.
        avisos.append("PDF sem texto (provavelmente digitalizado): preencha os campos manualmente")
    tipo = r.get("tipo_documento")
    if tipo and tipo not in ("apolice", "endosso", "proposta"):
        avisos.append(f"documento parece ser '{tipo}', não uma apólice")
    return {
        "seguradora": _f(r.get("seguradora"), c.get("seguradora")),
        "ramo": _f(r.get("ramo"), c.get("ramo")),
        "tipoDocumento": tipo,
        "cliente": {
            "nome": _f(r.get("nome_segurado"), c.get("nome_segurado")),
            "cpfCnpj": _f(r.get("cpf_cnpj"), c.get("cpf_cnpj")),
            "nascimento": _f(r.get("data_nascimento"), c.get("data_nascimento")),
            "telefone": _f(r.get("telefone"), c.get("telefone")),
            "email": _f(r.get("email"), c.get("email")),
            "cep": _f(r.get("cep"), c.get("cep")),
            "endereco": _f(endereco, c.get("endereco")),
        },
        "apolice": {
            "numero": _f(r.get("numero_apolice"), c.get("numero_apolice")),
            "proposta": _f(r.get("proposta"), c.get("proposta")),
            "emissao": _f(r.get("data_emissao"), c.get("data_emissao")),
            "inicioVigencia": _f(r.get("inicio_vigencia"), c.get("inicio_vigencia")),
            "fimVigencia": _f(r.get("fim_vigencia"), c.get("fim_vigencia")),
            "premioTotal": _f(r.get("premio_total"), c.get("premio_total")),
            "formaPagamento": _f(FORMA_MAP.get(r.get("forma_pagamento") or ""), c.get("forma_pagamento")),
        },
        "itens": itens,
        "parcelas": parcelas,
        "avisos": avisos,
        "paginas": r.get("paginas") or 0,
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/parse")
async def parse(file: UploadFile = File(...), x_parser_token: str | None = Header(default=None)):
    if TOKEN and not hmac.compare_digest(x_parser_token or "", TOKEN):
        raise HTTPException(status_code=401, detail="token inválido")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="arquivo muito grande")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=422, detail="arquivo não é PDF")
    # Arquivo temporário apagado logo após a leitura: o parser não guarda nada.
    fd, path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        # use_filename=False: o nome temporário não traz pistas úteis (e não confiamos no do upload).
        result = parse_policy_pdf(path, use_filename=False)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    if result.get("status_texto") == "erro":
        raise HTTPException(status_code=422, detail="não foi possível abrir o PDF (corrompido ou protegido)")
    return to_contract(result)
