"""Registro de parsers por seguradora.

Cada módulo de seguradora expõe:
  PROFILE: dict  -> {"labels": {campo: [regex,...]}, "excludes": {...}, "vig_labels": [...]}
  refine(doc, R) -> ajustes específicos depois do parser genérico (opcional)
"""
from importlib import import_module

_MODULES = {
    "Tokio Marine": "tokio",
    "Bradesco": "bradesco",
    "Allianz": "allianz",
    "Azul": "azul",
    "HDI": "hdi",
    "Porto Seguro": "porto",
    "Liberty/Yelum": "yelum",
    "Itaú": "porto",
    "Suhai": "suhai",
    "Zurich": "zurich",
    "Mapfre": "mapfre",
    "Mitsui": "mitsui",
    "MBM": "mbm",
}


def get_parser(insurer: str | None):
    mod = _MODULES.get(insurer or "")
    if not mod:
        return {}, None
    try:
        m = import_module(f".{mod}", __name__)
    except ModuleNotFoundError:
        return {}, None
    return getattr(m, "PROFILE", {}), getattr(m, "refine", None)
