"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Barcode, Check, ClipboardCopy, ExternalLink, FileSearch, ListChecks, Lock, Search, ShieldQuestion, Siren, UserRound, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/shell";
import { InstallmentStatusBadge } from "@/components/app/bits";
import { SendWhatsAppDialog } from "@/components/app/send-whatsapp";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, Input, Skeleton, Tooltip } from "@/components/ui/primitives";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";
import { api, IS_DEMO } from "@/lib/api";
import type { ActionId, ActionResult, ClientAction, ClientListItem } from "@/lib/types";
import { cn, firstName, formatBRL, formatDate, formatDateTime, maskCpf } from "@/lib/utils";

const ACTION_ICON: Record<ActionId, typeof Zap> = { BOLETO_2VIA: Barcode, STATUS_APOLICE: FileSearch, STATUS_PARCELAS: ListChecks, SINISTROS: Siren };

function Step({ n, title, active, done }: { n: number; title: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn("grid size-7 place-items-center rounded-full text-xs font-bold transition-colors", done ? "bg-gold-gradient text-ink-950" : active ? "bg-ink-900 text-gold-300 dark:bg-gold-400 dark:text-ink-950" : "bg-sunken text-subtle")}>
        {done ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <span className={cn("text-sm font-semibold", active || done ? "text-foreground" : "text-subtle")}>{title}</span>
    </div>
  );
}

function ActionsInner() {
  const sp = useSearchParams();
  const [q, setQ] = useState("");
  const [client, setClient] = useState<ClientListItem | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [wa, setWa] = useState(false);

  const preset = sp.get("cliente");
  const presetQ = useQuery({ queryKey: ["client", preset], queryFn: () => api.clients.get(preset!), enabled: !!preset });
  useEffect(() => {
    if (presetQ.data && !client) setClient(presetQ.data);
  }, [presetQ.data, client]);

  const search = useQuery({ queryKey: ["acoes-search", q], queryFn: () => api.clients.list({ q, status: "ATIVO", pageSize: 8 }) });
  const actions = useQuery({ queryKey: ["actions", client?.id], queryFn: () => api.clients.actions(client!.id), enabled: !!client });

  const byPolicy = useMemo(() => {
    const m = new Map<string, ClientAction[]>();
    actions.data?.forEach((a) => m.set(a.policyId, [...(m.get(a.policyId) ?? []), a]));
    return [...m.values()];
  }, [actions.data]);

  const run = useMutation({
    mutationFn: (a: ClientAction) => api.clients.runAction(client!.id, a.id, a.policyId),
    onMutate: (a) => {
      setRunning(`${a.policyId}-${a.id}`);
      setResult(null);
    },
    onSuccess: (r) => setResult(r),
    onError: (e: Error) => toast.error("A seguradora não respondeu", { description: e.message }),
    onSettled: () => setRunning(null),
  });

  const stepNow = !client ? 1 : !result ? 2 : 3;

  return (
    <>
      <PageHeader eyebrow="Ações por API" title="Ações na seguradora" description="Segunda via de boleto, status da apólice e das parcelas — direto da seguradora, sem abrir portal." />
      <div className="mb-6 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-border bg-surface px-5 py-3">
        <Step n={1} title="Escolha o cliente" active={stepNow === 1} done={stepNow > 1} />
        <Step n={2} title="Escolha a ação" active={stepNow === 2} done={stepNow > 2} />
        <Step n={3} title="Resultado e envio" active={stepNow === 3} done={false} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        {/* 1. cliente */}
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF ou placa" className="pl-9" aria-label="Buscar cliente" />
            </div>
          </div>
          <ul className="scrollbar-thin max-h-[520px] flex-1 overflow-y-auto p-2" aria-label="Clientes">
            {search.isLoading &&
              [0, 1, 2, 3].map((i) => (
                <li key={i} className="p-1">
                  <Skeleton className="h-14" />
                </li>
              ))}
            {search.data?.items.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => {
                    setClient(c);
                    setResult(null);
                  }}
                  aria-pressed={client?.id === c.id}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", client?.id === c.id ? "bg-accent-soft ring-1 ring-gold-500/40" : "hover:bg-sunken")}
                >
                  <Avatar nome={c.nome} className="size-9 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{c.nome}</span>
                    <span className="block truncate text-xs text-muted">
                      {maskCpf(c.cpfCnpj)} · {c.seguradoras.join(", ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {search.data?.items.length === 0 && <EmptyState icon={<UserRound />} title="Ninguém encontrado" className="py-8" />}
          </ul>
        </Card>

        {/* 2 e 3 */}
        <div className="grid content-start gap-4">
          {!client ? (
            <Card>
              <EmptyState icon={<Zap />} title="Escolha um cliente" description="Mostramos apenas as ações que a seguradora de cada apólice oferece por API." />
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar nome={client.nome} tone="gold" className="size-11" />
                  <div>
                    <p className="font-display text-2xl font-semibold leading-tight">{client.nome}</p>
                    <p className="text-sm text-muted">{client.apolicesVigentes} apólice(s){IS_DEMO ? " vigente(s)" : ""}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-5">
                  {actions.isLoading && <Skeleton className="h-32" />}
                  {actions.data?.length === 0 && <EmptyState icon={<ShieldQuestion />} title="Sem apólice vigente" description="Não há ações disponíveis para este cliente." className="py-6" />}
                  {byPolicy.map((acts) => (
                    <div key={acts[0].policyId}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-subtle">
                        {acts[0].seguradora} · apólice <span className="font-mono normal-case tracking-normal">{acts[0].apoliceNumero}</span>
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
                        {acts.map((a) => {
                          const Icon = ACTION_ICON[a.id];
                          const key = `${a.policyId}-${a.id}`;
                          const btn = (
                            <button
                              disabled={!a.disponivel || !!running}
                              onClick={() => run.mutate(a)}
                              aria-disabled={!a.disponivel}
                              className={cn(
                                "group relative flex w-full flex-col items-start gap-2 overflow-hidden rounded-xl border p-3.5 text-left transition-all",
                                a.disponivel ? "border-border bg-surface hover:-translate-y-0.5 hover:border-gold-500/60 hover:shadow-[var(--shadow-soft)]" : "cursor-not-allowed border-dashed border-border bg-surface-2 opacity-60",
                              )}
                            >
                              <span className={cn("grid size-9 place-items-center rounded-lg", a.disponivel ? "bg-accent-soft text-accent-text" : "bg-sunken text-subtle")}>
                                {running === key ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : a.disponivel ? <Icon className="size-[18px]" /> : <Lock className="size-4" />}
                              </span>
                              <span className="text-sm font-semibold">{a.rotulo}</span>
                              <span className="text-xs text-muted">{a.disponivel ? a.descricao : a.motivo}</span>
                              {running === key && <span className="shine-sweep absolute inset-0" aria-hidden />}
                            </button>
                          );
                          return a.disponivel ? (
                            <div key={key}>{btn}</div>
                          ) : (
                            <Tooltip key={key} content={a.motivo}>
                              <div>{btn}</div>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <AnimatePresence mode="wait">
                {result && (
                  <motion.div key={result.executadoEm} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <Card className="overflow-hidden">
                      <div className="flex flex-col gap-3 border-b border-border bg-surface-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success">
                            <Check className="size-5" strokeWidth={3} />
                          </span>
                          <div>
                            <p className="font-semibold">{result.titulo}</p>
                            <p className="text-sm text-muted">{result.resumo}</p>
                          </div>
                        </div>
                        <Badge tone="neutral">{formatDateTime(result.executadoEm)}</Badge>
                      </div>
                      <div className="grid grid-cols-1 gap-5 p-5">
                        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          {result.dados.map((d) => (
                            <div key={d.rotulo}>
                              <dt className="text-xs text-muted">{d.rotulo}</dt>
                              <dd className="text-sm font-semibold">{d.valor}</dd>
                            </div>
                          ))}
                        </dl>
                        {result.linhaDigitavel && (
                          <div className="flex items-center gap-2 rounded-xl border border-border bg-sunken p-3">
                            <Barcode className="size-5 shrink-0 text-muted" />
                            <code className="min-w-0 flex-1 truncate font-mono text-sm">{result.linhaDigitavel}</code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard?.writeText(result.linhaDigitavel!);
                                toast.success("Linha digitável copiada");
                              }}
                            >
                              <ClipboardCopy /> Copiar
                            </Button>
                          </div>
                        )}
                        {result.parcelas && (
                          <ul className="divide-y divide-border rounded-xl border border-border">
                            {result.parcelas.map((p) => (
                              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <span className="tabular">
                                  {p.numero}/{p.total}
                                </span>
                                <span className="tabular text-muted">{formatDate(p.vencimento)}</span>
                                <span className="font-semibold tabular">{formatBRL(p.valor)}</span>
                                <InstallmentStatusBadge status={p.status} />
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex flex-wrap justify-end gap-2">
                          {result.portalUrl && (
                            <Button variant="outline" asChild>
                              <a href={result.portalUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink /> Abrir portal da seguradora
                              </a>
                            </Button>
                          )}
                          {result.documento && (
                            <Button variant="outline" asChild>
                              <a href={result.documento.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink /> Ver boleto
                              </a>
                            </Button>
                          )}
                          <Button onClick={() => setWa(true)} disabled={client.optOut} className="bg-[#1fa855] text-white hover:brightness-110 dark:bg-[#25d366] dark:text-ink-950">
                            <WhatsAppIcon className="size-4" /> Enviar por WhatsApp
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>

      {client && result && (
        <SendWhatsAppDialog
          open={wa}
          onOpenChange={setWa}
          clientId={client.id}
          nome={client.nome}
          telefone={client.telefone}
          anexo={result.documento?.nome}
          textoInicial={
            result.acao === "BOLETO_2VIA"
              ? `Olá ${firstName(client.nome)}, tudo bem? Segue a 2ª via do boleto do seu seguro (${result.dados.find((d) => d.rotulo === "Parcela")?.valor ?? ""}), com vencimento em ${result.dados.find((d) => d.rotulo === "Vencimento")?.valor ?? ""}. Qualquer dúvida, estou à disposição!`
              : `Olá ${firstName(client.nome)}, tudo bem? ${result.resumo}`
          }
        />
      )}
    </>
  );
}

export default function ActionsPage() {
  return (
    <Suspense fallback={null}>
      <ActionsInner />
    </Suspense>
  );
}
