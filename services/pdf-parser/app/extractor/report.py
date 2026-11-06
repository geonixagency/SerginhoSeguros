"""Geração do report.md (estatísticas, taxa de preenchimento por seguradora). Nunca imprime CPF completo."""
from __future__ import annotations

import os
from collections import Counter, defaultdict

CRITICAL = ["nome_segurado", "cpf_cnpj", "seguradora", "numero_apolice", "inicio_vigencia", "fim_vigencia",
            "premio_total", "forma_pagamento", "n_parcelas", "parcelas"]
OTHER = ["data_nascimento", "cnh", "telefone", "email", "endereco", "cep", "cidade", "proposta", "data_emissao",
         "ramo", "tipo_documento", "veiculo", "placa", "chassi", "ano_modelo", "classe_bonus"]


def _filled(r, f):
    v = r.get(f)
    if f == "fim_vigencia" and r.get("confianca", {}).get("fim_vigencia_fonte") == "nome_arquivo":
        return False  # só conta o que veio do PDF
    return v not in (None, "", [])


def fill_table(recs, fields, group_key="seguradora", min_n=1):
    groups = defaultdict(list)
    for r in recs:
        groups[r.get(group_key) or "(desconhecida)"].append(r)
    rows = []
    order = sorted(groups, key=lambda g: -len(groups[g]))
    tot = {f: 0 for f in fields}
    for g in order:
        rs = groups[g]
        if len(rs) < min_n:
            continue
        cells = []
        for f in fields:
            n = sum(_filled(r, f) for r in rs)
            tot[f] += n
            cells.append(f"{100*n/len(rs):.0f}")
        rows.append(f"| {g} | {len(rs)} | " + " | ".join(cells) + " |")
    n_all = len(recs) or 1
    rows.append(f"| **TOTAL** | {len(recs)} | " + " | ".join(f"**{100*tot[f]/n_all:.0f}**" for f in fields) + " |")
    head = "| seguradora | n | " + " | ".join(fields) + " |\n|" + "---|" * (len(fields) + 2)
    return head + "\n" + "\n".join(rows)


def write_report(recs, clients, others, path, today, elapsed):
    ok = [r for r in recs if r.get("status_texto") == "ok"]
    sem = [r for r in recs if r.get("status_texto") == "sem_texto"]
    err = [r for r in recs if r.get("status_texto") == "erro"]
    pol_like = [r for r in ok if r.get("tipo_documento") in ("apolice", "endosso", "proposta", "carta_verde")]
    st = Counter(c["status"] for c in clients)
    L = []
    L.append("# Relatório de extração de apólices\n")
    L.append(f"Data de referência (status): **{today}** · tempo de processamento: {elapsed:.0f}s\n")
    L.append("## Visão geral\n")
    L.append(f"- Clientes (pastas): **{len(clients)}** — ATIVOS: **{st.get('ATIVO',0)}**, INATIVOS: **{st.get('INATIVO',0)}**")
    L.append(f"- PDFs: **{len(recs)}** — com texto: {len(ok)}, sem texto (imagem): **{len(sem)}**, erro de leitura: {len(err)}")
    L.append(f"- Arquivos não-PDF registrados (ignorados): {len(others)}")
    L.append(f"- PDFs nas pastas de vencidas: {sum(1 for r in recs if r.get('pasta_vencidas'))}")
    crit = Counter()
    for c in clients:
        k = c["criterios_status"]
        crit[(k["tem_apolice_fora_pasta_vencidas"], k["tem_apolice_com_vigencia_futura"])] += 1
    L.append("\n### Critérios de status (pasta x data)\n")
    L.append("| tem apólice fora de 'vencidas' | tem vigência >= hoje | clientes |\n|---|---|---|")
    for (a, b), n in sorted(crit.items(), key=lambda x: -x[1]):
        L.append(f"| {'sim' if a else 'não'} | {'sim' if b else 'não'} | {n} |")
    div = Counter(c["criterios_status"]["divergencia"] for c in clients if c["criterios_status"]["divergencia"])
    for k, n in div.items():
        L.append(f"\n- Divergência `{k}`: {n} clientes")

    L.append("\n## Documentos por tipo\n")
    for k, n in Counter(r.get("tipo_documento") or "?" for r in recs).most_common():
        L.append(f"- {k}: {n}")
    L.append("\n## Ramos\n")
    for k, n in Counter(r.get("ramo") or "?" for r in recs).most_common():
        L.append(f"- {k}: {n}")
    L.append("\n## PDFs por seguradora\n")
    L.append("| seguradora | PDFs | clientes |\n|---|---|---|")
    cs = defaultdict(set)
    for r in recs:
        cs[r.get("seguradora") or "(desconhecida)"].add(r.get("cliente_pasta"))
    for k, n in Counter(r.get("seguradora") or "(desconhecida)" for r in recs).most_common():
        L.append(f"| {k} | {n} | {len(cs[k])} |")

    apol = [r for r in ok if r.get("tipo_documento") == "apolice"]
    L.append(f"\n## Taxa de preenchimento (%) — campos críticos, somente APÓLICES com texto ({len(apol)})\n")
    L.append("`fim_vigencia` conta apenas valor extraído do PDF (não o do nome do arquivo).\n")
    L.append(fill_table(apol, CRITICAL))
    for tipo in ("endosso", "carta_verde"):
        sub = [r for r in ok if r.get("tipo_documento") == tipo]
        L.append(f"\n### Campos críticos — {tipo} ({len(sub)}); endossos muitas vezes não têm prêmio/parcelas\n")
        L.append(fill_table(sub, CRITICAL, min_n=3))
    L.append(f"\n### Campos críticos — todos os documentos de seguro ({len(pol_like)})\n")
    L.append(fill_table(pol_like, CRITICAL))
    L.append("\n## Taxa de preenchimento (%) — demais campos\n")
    L.append(fill_table(pol_like, OTHER))
    auto = [r for r in pol_like if r.get("ramo") in ("auto", "frota")]
    L.append(f"\n(veículo/placa/chassi/ano/bônus fazem sentido só para auto: {len(auto)} docs auto/frota)\n")
    L.append(fill_table(auto, ["veiculo", "placa", "chassi", "ano_modelo", "classe_bonus"]))

    L.append("\n## Forma de pagamento\n")
    for k, n in Counter(r.get("forma_pagamento") or "?" for r in pol_like).most_common():
        L.append(f"- {k}: {n}")

    L.append("\n## Avisos frequentes\n")
    av = Counter(a.split("(")[0].split("=")[0].split(":")[0] for r in recs for a in r.get("avisos", []))
    for k, n in av.most_common(15):
        L.append(f"- {k}: {n}")

    L.append(f"\n## PDFs sem texto ({len(sem)}) — precisam de OCR\n")
    for r in sem:
        L.append(f"- `{os.path.basename(r['arquivo'])}` ({r.get('cliente_pasta')})")
    L.append(f"\n## Falhas de leitura ({len(err)})\n")
    for r in err:
        L.append(f"- `{os.path.basename(r['arquivo'])}` — {'; '.join(r.get('avisos', []))[:150]}")
    L.append(f"\n## Arquivos não-PDF ({len(others)})\n")
    for o in others:
        L.append(f"- `{os.path.basename(o['arquivo'])}` ({o.get('cliente')})")
    L.append("\n## Documentos com campos críticos faltando (amostra)\n")
    miss = Counter()
    for r in pol_like:
        for f in CRITICAL:
            if not _filled(r, f):
                miss[(r.get("seguradora"), f)] += 1
    for (s, f), n in miss.most_common(25):
        L.append(f"- {s} / {f}: {n}")
    L.append("\n> CPF/CNPJ completos ficam apenas em policies.json / clients.json (arquivos locais). Este relatório não lista documentos.\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
