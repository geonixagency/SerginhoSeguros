"""Extrator de apólices de seguro (PDF). API pública: parse_policy_pdf(path) -> dict."""
from .extract import FIELDS, parse_policy_pdf

__all__ = ["parse_policy_pdf", "FIELDS"]
