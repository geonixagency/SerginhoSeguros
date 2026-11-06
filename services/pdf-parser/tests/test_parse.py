"""Testa o contrato do /parse com um PDF SINTÉTICO (dados fictícios gerados aqui)."""
import fitz
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

LINHAS = [
    "TOKIO MARINE SEGURADORA S.A.",
    "APOLICE DE SEGURO AUTO",
    "Apolice: 1234567890123",
    "Proposta: 998877",
    "Data de Emissao: 01/02/2026",
    "Segurado: FULANO DE TESTE DA SILVA",
    "CPF: 529.982.247-25",
    "Data de Nascimento: 10/05/1980",
    "Vigencia: das 24h de 01/02/2026 as 24h de 01/02/2027",
    "Veiculo: FIAT ARGO DRIVE 1.0   Ano Modelo: 2022/2023",
    "Placa: ABC1D23   Chassi: 9BD358A1XNYA12345",
    "Premio Total: R$ 2.400,00",
    "Forma de Pagamento: Boleto",
    "Parcela   Vencimento   Valor",
    "1   01/03/2026   R$ 600,00",
    "2   01/04/2026   R$ 600,00",
    "3   01/05/2026   R$ 600,00",
    "4   01/06/2026   R$ 600,00",
]


def make_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    for l in LINHAS:
        page.insert_text((50, y), l, fontsize=10)
        y += 18
    data = doc.tobytes()
    doc.close()
    return data


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_rejeita_nao_pdf():
    r = client.post("/parse", files={"file": ("x.pdf", b"nao sou pdf", "application/pdf")})
    assert r.status_code == 422


def test_parse_contrato():
    r = client.post("/parse", files={"file": ("a.pdf", make_pdf(), "application/pdf")})
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("seguradora", "ramo", "cliente", "apolice", "itens", "parcelas", "avisos", "paginas"):
        assert k in d
    assert set(d["cliente"]) >= {"nome", "cpfCnpj", "nascimento", "telefone", "email", "cep", "endereco"}
    assert d["seguradora"]["valor"] == "Tokio Marine"
    assert d["cliente"]["cpfCnpj"]["valor"].replace(".", "").replace("-", "") == "52998224725"
    assert d["apolice"]["fimVigencia"]["valor"] == "2027-02-01"
    assert 0 <= d["apolice"]["fimVigencia"]["confianca"] <= 1
