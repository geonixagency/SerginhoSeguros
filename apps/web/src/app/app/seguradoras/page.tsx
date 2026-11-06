"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowUpRight, Building2, Plug, PlugZap, Users } from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { IntegrationBadge, InsurerMark, RAMO_ICON } from "@/components/app/bits";
import { Card, EmptyState, ErrorState, Skeleton, Tooltip } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import { RAMO_LABEL } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";

export default function InsurersPage() {
  const [filter, setFilter] = useState<"todas" | "api" | "manual" | "atencao">("todas");
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["insurers"], queryFn: api.insurers.list });

  const list = useMemo(() => {
    if (!data) return [];
    return data
      .filter((i) => (filter === "api" ? i.temApi : filter === "manual" ? !i.temApi : filter === "atencao" ? i.statusIntegracao === "ERRO" || i.statusIntegracao === "NAO_CONFIGURADA" : true))
      .sort((a, b) => (b.clientes ?? b.apolices) - (a.clientes ?? a.apolices));
  }, [data, filter]);

  const conectadas = data?.filter((i) => i.statusIntegracao === "CONECTADA").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Integrações"
        title="Seguradoras"
        description={data ? `${conectadas} de ${data.length} conectadas por API oficial. As demais funcionam por ação manual guiada.` : "Catálogo e status das integrações."}
        actions={
          <Segmented
            ariaLabel="Filtrar seguradoras"
            layoutId="ins-filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todas", label: "Todas" },
              { value: "api", label: "Com API" },
              { value: "manual", label: "Manuais" },
              { value: "atencao", label: "Atenção" },
            ]}
          />
        }
      />
      {isError ? (
        <Card>
          <ErrorState onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[230px] rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 />} title="Nenhuma seguradora neste filtro" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((ins, i) => (
            <motion.div key={ins.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.4 }}>
              <Link
                href={`/app/seguradoras/${ins.id}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-[var(--shadow-lift)]"
              >
                <div className="absolute inset-x-0 top-0 h-1 opacity-70" style={{ background: `linear-gradient(90deg, ${ins.cor}, transparent)` }} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <InsurerMark nome={ins.nome} cor={ins.cor} className="size-11 text-sm" />
                    <div>
                      <p className="font-display text-xl font-semibold leading-tight">{ins.nome}</p>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        {ins.temApi ? <PlugZap className="size-3.5 text-accent-text" /> : <Plug className="size-3.5" />}
                        {ins.temApi ? "API oficial" : "Portal do corretor"}
                      </p>
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 text-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-text" />
                </div>
                <div className="mt-4">
                  <IntegrationBadge status={ins.statusIntegracao} />
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {ins.ramos.map((r) => {
                    const Icon = RAMO_ICON[r];
                    return (
                      <Tooltip key={r} content={RAMO_LABEL[r]}>
                        <span className="inline-flex items-center gap-1 rounded-md bg-sunken px-2 py-1 text-[11.5px] font-semibold text-foreground/80">
                          <Icon className="size-3 text-accent-text" /> {RAMO_LABEL[r]}
                        </span>
                      </Tooltip>
                    );
                  })}
                </div>
                <div className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-4 text-sm">
                  {ins.clientes !== null ? (
                    <div>
                      <p className="text-[11px] font-semibold text-muted">Clientes</p>
                      <p className="flex items-center gap-1 font-display text-2xl font-bold tabular">
                        <Users className="size-3.5 text-subtle" />
                        {ins.clientes}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] font-semibold text-muted">Ramos</p>
                      <p className="font-display text-2xl font-bold tabular">{ins.ramos.length}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-semibold text-muted">Apólices</p>
                    <p className="font-display text-2xl font-bold tabular">{ins.apolices}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted">Ações</p>
                    <p className={cn("font-display text-2xl font-bold tabular", !ins.capacidades.length && "text-subtle")}>{ins.capacidades.length}</p>
                  </div>
                </div>
                {ins.ultimoTeste && ins.temApi && <p className="mt-3 text-[11px] text-subtle">Último teste {formatRelative(ins.ultimoTeste)}</p>}
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </>
  );
}
