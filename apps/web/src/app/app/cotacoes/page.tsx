"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Award, Calculator, Crown, Loader2, Plus, Send, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { InsurerMark, QuoteStatusBadge, RAMO_ICON } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, ErrorState, Field, Input, NativeSelect, Skeleton, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import { RAMOS, RAMO_LABEL, type Quote, type Ramo } from "@/lib/types";
import { cn, formatBRL, formatDate, formatRelative } from "@/lib/utils";

const INSURER_COLOR: Record<string, string> = {
  "Porto Seguro": "#1d4f91",
  Allianz: "#003781",
  "Tokio Marine": "#0a7a5a",
  "HDI Seguros": "#0f6e3a",
  "Azul Seguros": "#0072bc",
  "Yelum Seguros": "#4b2c83",
  Mapfre: "#d81e05",
};

function QuoteDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: q, isLoading } = useQuery({
    queryKey: ["quote", id],
    queryFn: () => api.quotes.get(id),
    refetchInterval: (query) => (query.state.data?.status === "PROCESSANDO" ? 2000 : false),
  });
  useEffect(() => {
    if (q && q.status !== "PROCESSANDO") qc.invalidateQueries({ queryKey: ["quotes"] });
  }, [q?.status, qc, q]);
  const send = useMutation({
    mutationFn: () => api.quotes.send(id),
    onSuccess: () => {
      toast.success("Comparativo enviado pelo WhatsApp");
      qc.invalidateQueries({ queryKey: ["quote", id] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  if (isLoading || !q) return <Skeleton className="h-[480px] rounded-[var(--radius-lg)]" />;
  const Icon = RAMO_ICON[q.ramo];
  const min = Math.min(...q.resultados.map((r) => r.premio));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-subtle">
            <Icon className="size-3.5 text-accent-text" /> {RAMO_LABEL[q.ramo]} · Aggilizador {q.aggilizadorId}
          </p>
          <p className="mt-1 font-display text-3xl font-semibold leading-tight">{q.nome}</p>
          <p className="text-sm text-muted">{q.descricao}</p>
        </div>
        <div className="flex items-center gap-2">
          <QuoteStatusBadge status={q.status} />
          {q.status === "CONCLUIDA" && (
            <Button variant="gold" onClick={() => send.mutate()} loading={send.isPending}>
              <Send /> Enviar comparativo
            </Button>
          )}
        </div>
      </div>
      <div className="p-5">
        <AnimatePresence mode="wait">
          {q.status === "PROCESSANDO" ? (
            <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Loader2 className="size-4 animate-spin text-accent-text" /> Consultando seguradoras no Aggilizador…
              </p>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="relative h-16 overflow-hidden rounded-xl border border-border bg-surface-2">
                  <div className="shine-sweep absolute inset-0" style={{ animationDelay: `${i * 0.15}s` }} />
                </div>
              ))}
            </motion.div>
          ) : q.resultados.length === 0 ? (
            <EmptyState icon={<Calculator />} title="Sem resultados" description="Nenhuma seguradora retornou proposta." />
          ) : (
            <motion.ol key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 gap-3">
              {q.resultados.map((r, i) => (
                <motion.li
                  key={r.seguradora}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className={cn("relative overflow-hidden rounded-xl border p-4", r.destaque === "melhor_preco" ? "border-gold-500/60 bg-accent-soft" : "border-border bg-surface")}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-5 text-center font-display text-xl font-bold text-subtle">{i + 1}</span>
                    <InsurerMark nome={r.seguradora} cor={INSURER_COLOR[r.seguradora]} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {r.seguradora}
                        {r.destaque === "melhor_preco" && (
                          <Badge tone="ink">
                            <Crown className="size-3" /> Melhor preço
                          </Badge>
                        )}
                        {r.destaque === "melhor_custo_beneficio" && (
                          <Badge tone="gold">
                            <Award className="size-3" /> Custo-benefício
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {r.parcelas}
                        {r.franquia ? ` · franquia ${formatBRL(r.franquia)}` : ""}
                      </p>
                    </div>
                    <p className="font-display text-2xl font-bold tabular">{formatBRL(r.premio)}</p>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(8, (min / r.premio) * 100)}%` }} transition={{ delay: 0.2 + i * 0.07, duration: 0.7 }} className={cn("h-full rounded-full", i === 0 ? "bg-gold-gradient" : "bg-border-strong")} />
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {r.coberturas.map((c) => (
                      <li key={c} className="rounded-md bg-sunken px-2 py-0.5 text-[11.5px] font-medium text-foreground/80">
                        {c}
                      </li>
                    ))}
                  </ul>
                </motion.li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

function NewQuoteDialog({ open, onOpenChange, onCreated, leadId }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (q: Quote) => void; leadId?: string }) {
  const qc = useQueryClient();
  const leads = useQuery({ queryKey: ["leads"], queryFn: api.leads.list, enabled: open });
  const lead = leads.data?.find((l) => l.id === leadId);
  const [ramo, setRamo] = useState<Ramo>(lead?.produto ?? "AUTO");
  useEffect(() => {
    if (lead) setRamo(lead.produto);
  }, [lead]);
  const create = useMutation({
    mutationFn: (fd: FormData) =>
      api.quotes.create({
        leadId,
        nome: String(fd.get("nome")),
        ramo,
        cpfCnpj: String(fd.get("cpf")),
        cep: String(fd.get("cep")),
        veiculo: ramo === "AUTO" ? { placa: String(fd.get("placa") || ""), modelo: String(fd.get("modelo") || ""), ano: Number(fd.get("ano") || 0) || undefined } : undefined,
        observacoes: String(fd.get("obs") || ""),
      }),
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Cotação enviada ao Aggilizador", { description: "Os resultados chegam em instantes." });
      onCreated(q);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nova cotação" description="Enviada ao Aggilizador para várias seguradoras de uma vez." className="max-w-xl">
        <form
          key={lead?.id ?? "novo"}
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(new FormData(e.currentTarget));
          }}
        >
          <Field label="Nome do segurado" htmlFor="q-nome" className="sm:col-span-2">
            <Input id="q-nome" name="nome" required defaultValue={lead?.nome} />
          </Field>
          <Field label="Ramo" htmlFor="q-ramo">
            <NativeSelect id="q-ramo" value={ramo} onChange={(e) => setRamo(e.target.value as Ramo)}>
              {RAMOS.map((r) => (
                <option key={r} value={r}>
                  {RAMO_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="CPF/CNPJ" htmlFor="q-cpf">
            <Input id="q-cpf" name="cpf" required inputMode="numeric" placeholder="000.000.000-00" />
          </Field>
          <Field label="CEP de pernoite" htmlFor="q-cep">
            <Input id="q-cep" name="cep" required inputMode="numeric" placeholder="14000-000" />
          </Field>
          {ramo === "AUTO" && (
            <>
              <Field label="Placa" htmlFor="q-placa">
                <Input id="q-placa" name="placa" placeholder="ABC1D23" className="uppercase" />
              </Field>
              <Field label="Modelo" htmlFor="q-modelo">
                <Input id="q-modelo" name="modelo" placeholder="Ex.: Jeep Compass Longitude" />
              </Field>
              <Field label="Ano" htmlFor="q-ano">
                <Input id="q-ano" name="ano" type="number" min={1990} max={2030} placeholder="2022" />
              </Field>
            </>
          )}
          <Field label="Observações" htmlFor="q-obs" className="sm:col-span-2">
            <Textarea id="q-obs" name="obs" rows={2} defaultValue={lead?.notas} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="gold" loading={create.isPending}>
              <Sparkles /> Cotar agora
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuotesInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["quotes"], queryFn: api.quotes.list });
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(sp.get("nova") === "1");
  const leadId = sp.get("lead") ?? undefined;
  const selected = sel ?? data?.[0]?.id ?? null;

  const stats = useMemo(() => {
    if (!data) return null;
    return { total: data.length, enviadas: data.filter((q) => q.status === "ENVIADA").length, proc: data.filter((q) => q.status === "PROCESSANDO").length };
  }, [data]);

  return (
    <>
      <PageHeader
        eyebrow="Aggilizador"
        title="Cotações"
        description={stats ? `${stats.total} cotações · ${stats.enviadas} enviadas ao cliente${stats.proc ? ` · ${stats.proc} processando` : ""}` : "Multicálculo integrado."}
        actions={
          <Button variant="gold" onClick={() => setOpen(true)}>
            <Plus /> Nova cotação
          </Button>
        }
      />
      {isError ? (
        <Card>
          <ErrorState onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <Skeleton className="h-[480px] rounded-[var(--radius-lg)]" />
          <Skeleton className="h-[480px] rounded-[var(--radius-lg)]" />
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState icon={<Calculator />} title="Nenhuma cotação" description="Crie a primeira a partir de um lead ou do zero." action={<Button onClick={() => setOpen(true)}>Nova cotação</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="overflow-hidden">
            <ul className="scrollbar-thin max-h-[calc(100dvh-240px)] divide-y divide-border overflow-y-auto" aria-label="Cotações">
              {data.map((q) => {
                const Icon = RAMO_ICON[q.ramo];
                const best = q.resultados[0];
                return (
                  <li key={q.id}>
                    <button onClick={() => setSel(q.id)} aria-pressed={selected === q.id} className={cn("relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors", selected === q.id ? "bg-accent-soft" : "hover:bg-surface-2")}>
                      {selected === q.id && <motion.span layoutId="quote-sel" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gold-gradient" />}
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sunken text-accent-text">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{q.nome}</span>
                          <QuoteStatusBadge status={q.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{q.descricao || RAMO_LABEL[q.ramo]}</span>
                        <span className="mt-1 flex justify-between text-xs">
                          <span className="text-subtle" title={formatDate(q.criadoEm)}>
                            {formatRelative(q.criadoEm)}
                          </span>
                          {best && <span className="font-semibold tabular">a partir de {formatBRL(best.premio)}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          {selected && <QuoteDetail key={selected} id={selected} />}
        </div>
      )}
      <NewQuoteDialog
        open={open}
        leadId={leadId}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && sp.get("nova")) router.replace("/app/cotacoes");
        }}
        onCreated={(q) => setSel(q.id)}
      />
    </>
  );
}

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuotesInner />
    </Suspense>
  );
}
