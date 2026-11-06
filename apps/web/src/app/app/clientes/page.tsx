"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, FileUp, Search, SlidersHorizontal, UserPlus, Users, X } from "lucide-react";
import { ClientFormDialog } from "@/components/app/client-forms";
import { PageHeader } from "@/components/app/shell";
import { RAMO_ICON } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, NativeSelect, Skeleton, Tooltip } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/overlays";
import { api, IS_DEMO } from "@/lib/api";
import { RAMOS, RAMO_LABEL, type Ramo } from "@/lib/types";
import { cn, daysUntil, formatBRL, formatCpfCnpj, formatDate, formatPhone, maskCpf } from "@/lib/utils";

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function ClientsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "TODOS");
  const [ramo, setRamo] = useState("TODOS");
  const [seguradora, setSeguradora] = useState("TODAS");
  const [sort, setSort] = useState("nome");
  const [page, setPage] = useState(1);
  const [novo, setNovo] = useState(false);
  const dq = useDebounced(q);
  const pageSize = 12;

  useEffect(() => setPage(1), [dq, status, ramo, seguradora, sort]);

  const insurers = useQuery({ queryKey: ["insurers"], queryFn: api.insurers.list });
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["clients", { dq, status, ramo, seguradora, sort, page }],
    queryFn: () => api.clients.list({ q: dq, status, ramo, seguradora, sort, page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const activeFilters = useMemo(() => [ramo !== "TODOS", seguradora !== "TODAS"].filter(Boolean).length, [ramo, seguradora]);

  return (
    <>
      <PageHeader
        eyebrow="Carteira"
        title="Clientes"
        description="Busque por nome, CPF, placa ou número da apólice."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setNovo(true)}>
              <UserPlus /> Novo cliente
            </Button>
            <Button variant="gold" asChild>
              <Link href="/app/clientes/novo">
                <FileUp /> Novo por PDF
              </Link>
            </Button>
          </div>
        }
      />
      <ClientFormDialog open={novo} onOpenChange={setNovo} onSaved={(c) => router.push(`/app/clientes/${c.id}?novo=1`)} />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Juliana, 123.456, RTA4E21, POR553…" className="pl-9 pr-9" aria-label="Buscar clientes" />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-sunken" aria-label="Limpar busca">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Status"
              layoutId="cli-status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "TODOS", label: "Todos" },
                { value: "ATIVO", label: "Ativos" },
                { value: "INATIVO", label: "Inativos" },
              ]}
            />
            <div className="w-[150px]">
              <NativeSelect value={ramo} onChange={(e) => setRamo(e.target.value)} aria-label="Filtrar por ramo">
                <option value="TODOS">Todos os ramos</option>
                {RAMOS.map((r) => (
                  <option key={r} value={r}>
                    {RAMO_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-[170px]">
              <NativeSelect value={seguradora} onChange={(e) => setSeguradora(e.target.value)} aria-label="Filtrar por seguradora">
                <option value="TODAS">Todas as seguradoras</option>
                {insurers.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-[160px]">
              <NativeSelect value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
                <option value="nome">Ordem: nome</option>
                {IS_DEMO && <option value="vencimento">Ordem: vencimento</option>}
                {IS_DEMO && <option value="premio">Ordem: prêmio</option>}
                <option value="recentes">Ordem: recentes</option>
              </NativeSelect>
            </div>
            {activeFilters > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRamo("TODOS");
                  setSeguradora("TODAS");
                }}
              >
                <SlidersHorizontal /> Limpar {activeFilters}
              </Button>
            )}
          </div>
        </div>

        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={dq ? "Ninguém encontrado" : "Nenhum cliente aqui"}
            description={dq ? `Nada para “${dq}”. Confira a grafia, o CPF ou a placa.` : "Ajuste os filtros ou cadastre um cliente a partir do PDF da apólice."}
            action={
              <Button variant="outline" asChild>
                <Link href="/app/clientes/novo">
                  <FileUp /> Cadastrar por PDF
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            {/* Tabela (md+) */}
            <div className={cn("hidden overflow-x-auto transition-opacity md:block", isFetching && "opacity-70")}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
                    <th className="px-4 py-3 font-bold">Cliente</th>
                    <th className="px-4 py-3 font-bold">Contato</th>
                    <th className="px-4 py-3 font-bold">{IS_DEMO ? "Ramos" : "Apólices"}</th>
                    <th className="px-4 py-3 font-bold">Seguradoras</th>
                    {IS_DEMO && <th className="px-4 py-3 text-right font-bold">Prêmio vigente</th>}
                    <th className="px-4 py-3 font-bold">Próx. vencimento</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((c, i) => {
                    const d = c.proximoVencimento ? daysUntil(c.proximoVencimento) : null;
                    return (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        onClick={() => router.push(`/app/clientes/${c.id}`)}
                        className="group cursor-pointer transition-colors hover:bg-surface-2"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar nome={c.nome} className="size-9 text-sm" />
                            <div className="min-w-0">
                              <Link href={`/app/clientes/${c.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[240px] truncate font-semibold group-hover:text-accent-text">
                                {c.nome}
                              </Link>
                              <span className="font-mono text-xs text-muted">{c.cpfCnpj.length === 11 ? maskCpf(c.cpfCnpj) : formatCpfCnpj(c.cpfCnpj)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          <span className="block tabular">{formatPhone(c.telefone)}</span>
                          <span className="block max-w-[200px] truncate text-xs">{c.email ?? "sem e-mail"}</span>
                        </td>
                        <td className="px-4 py-3">
                          {!IS_DEMO && <span className="font-semibold tabular">{c.apolicesVigentes}</span>}
                          <div className="flex gap-1">
                            {c.ramos.map((r: Ramo) => {
                              const Icon = RAMO_ICON[r];
                              return (
                                <Tooltip key={r} content={RAMO_LABEL[r]}>
                                  <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-text">
                                    <Icon className="size-3.5" />
                                    <span className="sr-only">{RAMO_LABEL[r]}</span>
                                  </span>
                                </Tooltip>
                              );
                            })}
                            {c.placas[0] && <span className="ml-1 self-center rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] font-semibold">{c.placas[0]}</span>}
                          </div>
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3 text-muted">{c.seguradoras.join(", ") || "—"}</td>
                        {IS_DEMO && <td className="px-4 py-3 text-right font-semibold tabular">{c.premioTotal ? formatBRL(c.premioTotal) : "—"}</td>}
                        <td className="px-4 py-3">
                          {c.proximoVencimento ? (
                            <span className={cn("tabular", d !== null && d <= 30 ? "font-semibold text-warning" : "text-muted")}>
                              {formatDate(c.proximoVencimento)}
                              {d !== null && d <= 30 && <span className="ml-1 text-xs">({d}d)</span>}
                            </span>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge tone={c.status === "ATIVO" ? "success" : "neutral"} dot>
                              {c.status === "ATIVO" ? "Ativo" : "Inativo"}
                            </Badge>
                            {c.optOut && (
                              <Tooltip content="Pediu para não receber mensagens (SAIR)">
                                <span className="text-[11px] font-bold text-subtle">opt-out</span>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lista (mobile) */}
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                    <Avatar nome={c.nome} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.nome}</p>
                      <p className="truncate text-xs text-muted">
                        {c.seguradoras.join(", ") || "sem apólice"}
                        {c.placas[0] ? ` · ${c.placas[0]}` : ""}
                      </p>
                    </div>
                    <Badge tone={c.status === "ATIVO" ? "success" : "neutral"} dot>
                      {c.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
              <p className="text-muted">
                <span className="font-semibold text-foreground tabular">{data.total}</span> cliente{data.total === 1 ? "" : "s"}
                <span className="hidden sm:inline"> · página {page} de {pages}</span>
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior">
                  <ChevronLeft />
                </Button>
                <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Próxima página">
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsInner />
    </Suspense>
  );
}
