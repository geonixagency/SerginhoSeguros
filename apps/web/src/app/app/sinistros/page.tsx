"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Siren } from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { CLAIM_STATUS, ClaimDialog, ClaimItem, useClaimActions } from "@/components/app/claims";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, ErrorState, Input, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import type { ClaimStatus } from "@/lib/types";

const PAGE = 20;

export default function SinistrosPage() {
  const [novo, setNovo] = useState(false);
  const [status, setStatus] = useState<ClaimStatus | "TODOS">("TODOS");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { setEditing, setRemoving, dialogs } = useClaimActions();
  const list = useQuery({
    queryKey: ["claims", { status, q: dq, page }],
    queryFn: () => api.claims.list({ status: status === "TODOS" ? undefined : status, q: dq || undefined, page, pageSize: PAGE }),
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Sinistros"
        title="Sinistros"
        description="Registre o que aconteceu com a apólice do cliente. Tudo fica no histórico do perfil dele."
        actions={
          <Button variant="gold" onClick={() => setNovo(true)}>
            <Plus /> Registrar sinistro
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
          <div className="relative lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome do cliente" className="pl-9" aria-label="Buscar sinistro pelo cliente" />
          </div>
          <div className="-mx-1 overflow-x-auto px-1 lg:ml-auto">
            <Segmented
              ariaLabel="Situação"
              layoutId="sin-status"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={[{ value: "TODOS" as const, label: "Todos" }, ...(Object.keys(CLAIM_STATUS) as ClaimStatus[]).map((s) => ({ value: s, label: CLAIM_STATUS[s].label }))]}
            />
          </div>
        </div>
        {list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <div className="grid gap-2 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : !list.data?.items.length ? (
          <EmptyState
            icon={<Siren />}
            title={dq || status !== "TODOS" ? "Nada encontrado" : "Nenhum sinistro registrado"}
            description={dq || status !== "TODOS" ? "Tente outro nome ou situação." : "Quando um cliente tiver um sinistro, registre aqui escolhendo o cliente e a apólice."}
            action={
              !dq && status === "TODOS" ? (
                <Button variant="gold" onClick={() => setNovo(true)}>
                  <Plus /> Registrar sinistro
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {list.data.items.map((c) => (
                <ClaimItem key={c.id} c={c} showClient onEdit={() => setEditing(c)} onDelete={() => setRemoving(c)} />
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm text-muted">
              <span>{list.data.total} sinistro(s)</span>
              {pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span className="tabular">
                    {page}/{pages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Próxima
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
      <ClaimDialog open={novo} onOpenChange={setNovo} />
      {dialogs}
    </>
  );
}
