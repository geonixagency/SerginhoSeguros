"use client";

/**
 * Subir endosso: lê o PDF, acha a apólice endossada e mostra o que muda (veículo, endereço,
 * condutor, prêmio). O operador confere, ajusta e registra: as mudanças são aplicadas e o
 * PDF fica guardado na ficha do cliente, na aba Endossos.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, FileSignature, FileUp, RotateCcw, Search } from "lucide-react";
import type { EndorsementCampo, EndorsementPreviewDTO } from "@ss/shared";
import { Button } from "@/components/ui/button";
import { Badge, Checkbox, Field, Input, NativeSelect, Switch, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import { cn, formatBRL, formatDate } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = { VIGENTE: "vigente", VENCIDA: "vencida", CANCELADA: "cancelada", RENOVADA: "renovada" };
const VIA_LABEL = { numero: "pelo número da apólice", chassi: "pelo chassi", placa: "pela placa" } as const;
const MAX_MB = 20;

/** Valor mostrado/editado: dinheiro em pt-BR, o resto como veio. */
const showValue = (campo: string, v: string | null) => (v == null ? "" : campo === "policy.premioTotal" ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v);
const toApiValue = (campo: string, v: string) => {
  const t = v.trim();
  if (!t) return null;
  if (campo !== "policy.premioTotal") return t;
  const n = Number(t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2) : t;
};

function ClientPicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["clients", "endosso-picker", dq],
    queryFn: () => api.clients.list({ q: dq, page: 1, pageSize: 6 }),
    enabled: dq.length >= 2,
    placeholderData: keepPreviousData,
  });
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF, placa ou apólice" className="pl-9" aria-label="Buscar cliente" autoFocus />
      </div>
      {dq.length >= 2 && (
        <ul className="grid gap-1" aria-busy={isFetching}>
          {data?.items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-gold-500 hover:bg-accent-soft/40">
                <span className="truncate font-semibold">{c.nome}</span>
                <ArrowRight className="size-4 shrink-0 text-muted" />
              </button>
            </li>
          ))}
          {data && !data.items.length && <li className="text-sm text-muted">Nenhum cliente encontrado.</li>}
        </ul>
      )}
    </div>
  );
}

export function EndorsementDialog({
  open,
  onOpenChange,
  clientId: clientIdFixo,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Aberto dentro da ficha: o endosso é deste cliente. */
  clientId?: string;
  onSaved?: (clientId: string) => void;
}) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<EndorsementPreviewDTO | null>(null);
  const [policyId, setPolicyId] = useState("");
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [valores, setValores] = useState<Record<string, string>>({});
  const [numero, setNumero] = useState("");
  const [cancelar, setCancelar] = useState(false);
  const [observacao, setObservacao] = useState("");

  const reset = () => {
    setFile(null);
    setPreview(null);
    setPolicyId("");
    setMarcados({});
    setValores({});
    setNumero("");
    setCancelar(false);
    setObservacao("");
  };
  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const ler = useMutation({
    mutationFn: ({ f, cid }: { f: File; cid?: string | null }) => api.endorsements.parse(f, cid ?? clientIdFixo ?? null),
    onSuccess: (p) => {
      setPreview(p);
      setNumero(p.endosso.numero ?? "");
      setCancelar(p.endosso.cancelamento);
      setPolicyId(p.apoliceSugeridaId ?? p.apolices[0]?.id ?? "");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setFile(null);
    },
  });

  const escolher = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return toast.error(`O PDF passa de ${MAX_MB} MB.`);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return toast.error("Escolha o PDF do endosso.");
    setFile(f);
    setPreview(null);
    ler.mutate({ f });
  };

  const apolice = preview?.apolices.find((a) => a.id === policyId) ?? null;
  // Ao trocar de apólice, as mudanças propostas são as dela: tudo marcado e com o valor lido.
  useEffect(() => {
    if (!apolice) return;
    setMarcados(Object.fromEntries(apolice.alteracoes.map((a) => [a.campo, true])));
    setValores(Object.fromEntries(apolice.alteracoes.map((a) => [a.campo, showValue(a.campo, a.depois)])));
  }, [apolice]);

  const escolhidas = useMemo(
    () => (apolice?.alteracoes ?? []).filter((a) => marcados[a.campo]).map((a) => ({ campo: a.campo as EndorsementCampo, label: a.label, depois: toApiValue(a.campo, valores[a.campo] ?? "") })),
    [apolice, marcados, valores],
  );

  const salvar = useMutation({
    mutationFn: () => {
      if (!file || !preview?.cliente || !apolice) throw new Error("Escolha o cliente e a apólice.");
      return api.endorsements.create(file, {
        clientId: preview.cliente.id,
        policyId: apolice.id,
        itemId: apolice.itemId,
        numero: numero.trim() || null,
        emissao: preview.endosso.emissao,
        motivos: preview.endosso.motivos,
        premio: preview.endosso.premio,
        restituicao: preview.endosso.restituicao,
        cancelar,
        alteracoes: escolhidas,
        observacao: observacao.trim() || null,
      });
    },
    onSuccess: (r) => {
      const n = r.alteracoes.length;
      toast.success(`Endosso registrado na apólice ${r.apoliceNumero ?? ""}${n ? ` · ${n} ${n === 1 ? "mudança aplicada" : "mudanças aplicadas"}` : ""}${r.cancelou ? " · apólice cancelada" : ""}`);
      void qc.invalidateQueries({ queryKey: ["client", r.clientId] });
      void qc.invalidateQueries({ queryKey: ["client-endorsements", r.clientId] });
      void qc.invalidateQueries({ queryKey: ["timeline", r.clientId] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["dash"] });
      onOpenChange(false);
      onSaved?.(r.clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const e = preview?.endosso;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" title="Subir endosso" description="Leio o PDF, acho a apólice endossada e mostro o que mudou para você conferir.">
        {!preview ? (
          <div className="grid gap-4 p-6">
            <label
              onDragOver={(x) => {
                x.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(x) => {
                x.preventDefault();
                setDrag(false);
                escolher(x.dataTransfer.files?.[0]);
              }}
              className={cn(
                "grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
                drag ? "border-gold-500 bg-accent-soft/60" : "border-border-strong hover:border-gold-500 hover:bg-accent-soft/40",
                ler.isPending && "pointer-events-none opacity-70",
              )}
            >
              <FileSignature className="size-7 text-accent-text" />
              <span className="text-sm font-semibold">{ler.isPending ? `Lendo ${file?.name ?? "o endosso"}…` : "Arraste o PDF do endosso ou clique para escolher"}</span>
              <span className="text-xs text-muted">Troca de veículo, endereço, condutor, cobrança ou cancelamento. Até {MAX_MB} MB.</span>
              <input type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="PDF do endosso" disabled={ler.isPending} onChange={(x) => escolher(x.target.files?.[0])} />
            </label>
          </div>
        ) : (
          <form
            className="grid gap-5 p-6"
            onSubmit={(x) => {
              x.preventDefault();
              salvar.mutate();
            }}
          >
            {/* Resumo do que o PDF diz */}
            <div className="grid gap-3 rounded-xl border border-border bg-surface-2 p-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted">Seguradora · apólice no PDF</p>
                <p className="font-semibold">
                  {e?.seguradora ?? "—"} · <span className="font-mono">{e?.apoliceNumero ?? "sem número"}</span>
                </p>
              </div>
              <Field label="Nº do endosso" htmlFor="end-num">
                <Input id="end-num" value={numero} onChange={(x) => setNumero(x.target.value)} placeholder="—" className="h-9" />
              </Field>
              <div>
                <p className="text-xs font-semibold text-muted">Emissão</p>
                <p className="font-semibold">{e?.emissao ? formatDate(e.emissao) : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted">Valor do endosso</p>
                <p className="font-semibold">{e?.premio != null ? `${formatBRL(e.premio)} ${e.restituicao ? "(devolvido ao cliente)" : "(cobrado)"}` : "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-semibold text-muted">O que o endosso altera</p>
                <div className="flex flex-wrap gap-1.5">
                  {e?.motivos.length ? e.motivos.map((m) => <Badge key={m} tone={m === "Cancelamento" ? "danger" : "gold"}>{m}</Badge>) : <span className="text-muted">Não identificado no texto. Confira as mudanças abaixo.</span>}
                </div>
              </div>
            </div>

            {(preview.jaRegistrado || preview.avisos.length > 0) && (
              <ul className="grid gap-2">
                {preview.jaRegistrado && (
                  <li className="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Este PDF já foi registrado como endosso. Registrar de novo aplicaria as mudanças duas vezes.
                  </li>
                )}
                {preview.avisos.map((a) => (
                  <li key={a} className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {a}
                  </li>
                ))}
              </ul>
            )}

            {/* Cliente */}
            {!preview.cliente ? (
              <Field label="Cliente do endosso" htmlFor="end-cli">
                <ClientPicker onPick={(id) => file && ler.mutate({ f: file, cid: id })} />
              </Field>
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    Cliente:{" "}
                    <Link href={`/app/clientes/${preview.cliente.id}`} className="font-semibold text-accent-text hover:underline" onClick={() => onOpenChange(false)}>
                      {preview.cliente.nome}
                    </Link>
                  </span>
                  {ler.isPending && <span className="text-xs text-muted">Relendo…</span>}
                </div>

                {preview.apolices.length === 0 ? (
                  <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">Este cliente ainda não tem apólice cadastrada. Cadastre a apólice antes de registrar o endosso.</p>
                ) : (
                  <Field label="Apólice endossada" htmlFor="end-pol" hint={preview.via && policyId === preview.apoliceSugeridaId ? `Achei ${VIA_LABEL[preview.via]}.` : undefined}>
                    <NativeSelect id="end-pol" value={policyId} onChange={(x) => setPolicyId(x.target.value)}>
                      {preview.apolices.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.seguradora} · {a.numero ?? "sem número"}
                          {a.placa ? ` · ${a.placa}` : ""} · {STATUS_LABEL[a.status] ?? a.status}
                          {a.fimVigencia ? ` até ${formatDate(a.fimVigencia)}` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                )}

                {apolice && (
                  <div className="grid gap-2">
                    <p className="text-sm font-bold">Mudanças na apólice e no cadastro</p>
                    {apolice.alteracoes.length === 0 ? (
                      <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
                        Não achei diferença nos campos acompanhados (veículo, endereço, condutor e prêmio). O endosso fica registrado e o PDF guardado na ficha.
                      </p>
                    ) : (
                      <ul className="grid gap-2">
                        {apolice.alteracoes.map((a) => (
                          <li key={a.campo} className={cn("grid gap-2 rounded-xl border p-3 sm:grid-cols-[auto_120px_1fr] sm:items-center", marcados[a.campo] ? "border-gold-500/50 bg-accent-soft/30" : "border-border")}>
                            <Checkbox id={`alt-${a.campo}`} checked={!!marcados[a.campo]} onCheckedChange={(v) => setMarcados((m) => ({ ...m, [a.campo]: v === true }))} aria-label={`Aplicar ${a.label}`} />
                            <label htmlFor={`alt-${a.campo}`} className="text-sm font-semibold">
                              {a.label}
                            </label>
                            <div className="grid min-w-0 gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
                              <span className={cn("truncate text-sm text-muted", marcados[a.campo] && "line-through")} title={a.antes ?? ""}>
                                {a.antes ? showValue(a.campo, a.antes) : "vazio"}
                              </span>
                              <ArrowRight className="hidden size-4 text-muted sm:block" />
                              <Input
                                value={valores[a.campo] ?? ""}
                                onChange={(x) => setValores((v) => ({ ...v, [a.campo]: x.target.value }))}
                                disabled={!marcados[a.campo]}
                                className="h-9"
                                aria-label={`Novo valor de ${a.label}`}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {apolice.alteracoes.some((a) => a.campo === "policy.premioTotal") && (
                      <p className="text-xs text-muted">Prêmio: quando o endosso traz só a diferença, somei (ou descontei, se for devolução) ao prêmio atual. Confira antes de salvar.</p>
                    )}
                  </div>
                )}

                {apolice && (
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
                    <span>
                      <span className="font-semibold">Cancelar a apólice</span>
                      <span className="block text-xs text-muted">Use quando o endosso for de cancelamento.</span>
                    </span>
                    <Switch checked={cancelar} onCheckedChange={setCancelar} aria-label="Cancelar a apólice" />
                  </label>
                )}

                <Field label="Observação (opcional)" htmlFor="end-obs">
                  <Textarea id="end-obs" rows={2} value={observacao} onChange={(x) => setObservacao(x.target.value)} maxLength={1000} />
                </Field>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" onClick={reset}>
                <RotateCcw /> Outro PDF
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gold" loading={salvar.isPending} disabled={!preview.cliente || !apolice || preview.jaRegistrado || ler.isPending}>
                  <FileUp /> Registrar endosso
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
