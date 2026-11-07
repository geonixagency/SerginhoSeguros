"use client";

/**
 * Sinistros: formulário (cliente -> apólice -> ocorrido), lista e cartão do perfil do cliente.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Hash, MapPin, Pencil, Plus, Search, Siren, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Field, Input, NativeSelect, Skeleton, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import type { Claim, ClaimInput, ClaimStatus } from "@/lib/types";
import { cn, formatBRL, formatDate } from "@/lib/utils";

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }> = {
  ABERTO: { label: "Aberto", tone: "warning" },
  EM_ANALISE: { label: "Em análise", tone: "info" },
  INDENIZADO: { label: "Indenizado", tone: "success" },
  NEGADO: { label: "Negado", tone: "danger" },
  ENCERRADO: { label: "Encerrado", tone: "neutral" },
};
export const CLAIM_TIPOS = ["Colisão", "Roubo/Furto", "Vidros", "Danos a terceiros", "Incêndio", "Fenômenos naturais", "Danos elétricos", "Assistência 24h", "Outros"];

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const s = CLAIM_STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** Campo de escolha de cliente com busca (nome, CPF ou placa). */
function ClientPicker({ value, onChange }: { value: { id: string; nome: string } | null; onChange: (c: { id: string; nome: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const search = useQuery({ queryKey: ["claim-client-search", dq], queryFn: () => api.clients.list({ q: dq, pageSize: 6 }), enabled: !value && dq.length >= 2 });
  if (value)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
        <span className="truncate text-sm font-semibold">{value.nome}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} aria-label="Trocar cliente">
          <X /> Trocar
        </Button>
      </div>
    );
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input id="sin-cliente" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite nome, CPF ou placa" className="pl-9" autoComplete="off" />
      </div>
      {dq.length >= 2 && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface p-1" aria-label="Clientes encontrados">
          {search.isLoading && <li className="px-3 py-2 text-sm text-muted">Buscando…</li>}
          {search.data?.items.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nenhum cliente encontrado.</li>}
          {search.data?.items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange({ id: c.id, nome: c.nome })} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-surface-2">
                <span className="block truncate font-semibold">{c.nome}</span>
                <span className="block truncate text-xs text-muted">{[...new Set(c.seguradoras)].join(", ") || "sem apólices"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type FormState = {
  client: { id: string; nome: string } | null;
  policyId: string;
  dataOcorrencia: string;
  tipo: string;
  descricao: string;
  local: string;
  protocolo: string;
  valor: string;
  status: ClaimStatus;
};

/** Registrar ou editar sinistro. `client` fixa o cliente (perfil); `claim` abre em modo edição. */
export function ClaimDialog({
  open,
  onOpenChange,
  client,
  claim,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: { id: string; nome: string } | null;
  claim?: Claim | null;
}) {
  const qc = useQueryClient();
  const inicial = (): FormState => ({
    client: claim ? { id: claim.clientId, nome: claim.clientNome } : (client ?? null),
    policyId: claim?.policyId ?? "",
    dataOcorrencia: claim?.dataOcorrencia ?? hoje(),
    tipo: claim?.tipo ?? "",
    descricao: claim?.descricao ?? "",
    local: claim?.local ?? "",
    protocolo: claim?.protocolo ?? "",
    valor: claim?.valor ? String(Number(claim.valor)).replace(".", ",") : "",
    status: claim?.status ?? "ABERTO",
  });
  const [f, setF] = useState<FormState>(inicial);
  useEffect(() => {
    if (open) setF(inicial());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia ao abrir
  }, [open, claim?.id, client?.id]);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const detail = useQuery({ queryKey: ["client", f.client?.id], queryFn: () => api.clients.get(f.client!.id), enabled: open && !!f.client });
  const apolices = useMemo(
    () => [...(detail.data?.apolices ?? [])].sort((a, b) => (a.status === "VIGENTE" ? 0 : 1) - (b.status === "VIGENTE" ? 0 : 1) || b.fimVigencia.localeCompare(a.fimVigencia)),
    [detail.data],
  );
  useEffect(() => {
    if (!claim && apolices.length === 1 && !f.policyId) set("policyId", apolices[0]!.id);
  }, [apolices, claim, f.policyId]);

  const valorNum = f.valor.trim() ? Number(f.valor.replace(/\./g, "").replace(",", ".")) : null;
  const erro =
    !f.client ? "Escolha o cliente." : !f.policyId ? "Escolha a apólice." : !f.dataOcorrencia ? "Informe a data." : f.tipo.trim().length < 2 ? "Informe o tipo." : f.descricao.trim().length < 3 ? "Descreva o que aconteceu." : valorNum !== null && !Number.isFinite(valorNum) ? "Valor inválido." : null;

  const save = useMutation({
    mutationFn: () => {
      const data: ClaimInput = {
        clientId: f.client!.id,
        policyId: f.policyId,
        dataOcorrencia: f.dataOcorrencia,
        tipo: f.tipo.trim(),
        descricao: f.descricao.trim(),
        local: f.local.trim() || null,
        protocolo: f.protocolo.trim() || null,
        valor: valorNum,
        status: f.status,
      };
      if (claim) {
        const rest: Partial<ClaimInput> = { ...data };
        delete rest.clientId;
        return api.claims.update(claim.id, rest);
      }
      return api.claims.create(data);
    },
    onSuccess: () => {
      toast.success(claim ? "Sinistro atualizado" : "Sinistro registrado", { description: "Fica no histórico do perfil do cliente." });
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["dash", "expiring"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={claim ? "Editar sinistro" : "Registrar sinistro"} description="Escolha o cliente e a apólice e descreva o que aconteceu." className="max-w-2xl">
        <form
          className="grid gap-4 p-5 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (erro) return toast.error(erro);
            save.mutate();
          }}
        >
          <Field label="Cliente" htmlFor="sin-cliente">
            {client || claim ? (
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold">{f.client?.nome}</div>
            ) : (
              <ClientPicker
                value={f.client}
                onChange={(c) => {
                  setF((s) => ({ ...s, client: c, policyId: "" }));
                }}
              />
            )}
          </Field>
          <Field label="Apólice" htmlFor="sin-apolice">
            <NativeSelect id="sin-apolice" value={f.policyId} onChange={(e) => set("policyId", e.target.value)} disabled={!f.client || detail.isLoading}>
              <option value="">{!f.client ? "Escolha o cliente primeiro" : detail.isLoading ? "Carregando apólices…" : apolices.length ? "Escolha a apólice" : "Cliente sem apólices"}</option>
              {apolices.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.seguradora, p.numero && p.numero !== "—" ? `nº ${p.numero}` : null, p.item?.placa, p.status === "VIGENTE" ? `vence ${formatDate(p.fimVigencia)}` : "vencida"].filter(Boolean).join(" · ")}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Data do ocorrido" htmlFor="sin-data">
              <Input id="sin-data" type="date" value={f.dataOcorrencia} max={hoje()} onChange={(e) => set("dataOcorrencia", e.target.value)} />
            </Field>
            <Field label="Tipo" htmlFor="sin-tipo">
              <Input id="sin-tipo" list="sin-tipos" value={f.tipo} maxLength={80} placeholder="Ex.: Colisão" onChange={(e) => set("tipo", e.target.value)} />
              <datalist id="sin-tipos">
                {CLAIM_TIPOS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="O que aconteceu" htmlFor="sin-desc">
            <Textarea id="sin-desc" rows={4} maxLength={4000} value={f.descricao} placeholder="Descreva o acontecimento: como foi, envolvidos, danos…" onChange={(e) => set("descricao", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Local (opcional)" htmlFor="sin-local">
              <Input id="sin-local" value={f.local} maxLength={200} onChange={(e) => set("local", e.target.value)} />
            </Field>
            <Field label="Nº do sinistro na seguradora (opcional)" htmlFor="sin-prot">
              <Input id="sin-prot" value={f.protocolo} maxLength={80} onChange={(e) => set("protocolo", e.target.value)} />
            </Field>
            <Field label="Valor estimado/indenizado (opcional)" htmlFor="sin-valor">
              <Input id="sin-valor" inputMode="decimal" value={f.valor} placeholder="0,00" onChange={(e) => set("valor", e.target.value.replace(/[^\d.,]/g, ""))} />
            </Field>
            <Field label="Situação" htmlFor="sin-status">
              <NativeSelect id="sin-status" value={f.status} onChange={(e) => set("status", e.target.value as ClaimStatus)}>
                {(Object.keys(CLAIM_STATUS) as ClaimStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CLAIM_STATUS[s].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="gold" loading={save.isPending}>
              {claim ? "Salvar" : "Registrar sinistro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Item de lista de sinistro (usado na aba e no perfil). */
export function ClaimItem({ c, showClient, onEdit, onDelete }: { c: Claim; showClient?: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{c.tipo}</span>
          <ClaimStatusBadge status={c.status} />
          {showClient && (
            <Link href={`/app/clientes/${c.clientId}`} className="truncate text-sm font-semibold text-accent-text hover:underline">
              {c.clientNome}
            </Link>
          )}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" /> {formatDate(c.dataOcorrencia)}
          </span>
          <span>
            {c.seguradora}
            {c.policyNumero ? ` · nº ${c.policyNumero}` : ""}
          </span>
          {c.placa && <span className="rounded bg-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground">{c.placa}</span>}
          {c.local && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {c.local}
            </span>
          )}
          {c.protocolo && (
            <span className="inline-flex items-center gap-1">
              <Hash className="size-3.5" /> {c.protocolo}
            </span>
          )}
          {c.valor && <span className="font-semibold text-foreground tabular">{formatBRL(Number(c.valor))}</span>}
        </p>
        <p className="mt-2 whitespace-pre-line break-words text-sm">{c.descricao}</p>
      </div>
      <div className="flex gap-1 sm:justify-end">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Editar sinistro">
          <Pencil />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Excluir sinistro">
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

/** Confirmação de exclusão + estado do diálogo de edição, compartilhados pela aba e pelo perfil. */
export function useClaimActions() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Claim | null>(null);
  const [removing, setRemoving] = useState<Claim | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.claims.remove(id),
    onSuccess: () => {
      toast.success("Sinistro excluído");
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["dash", "expiring"] });
      setRemoving(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dialogs = (
    <>
      <ClaimDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} claim={editing} />
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent title="Excluir sinistro?" description={removing ? `${removing.tipo} de ${formatDate(removing.dataOcorrencia)} sai do histórico de ${removing.clientNome}.` : undefined}>
          <div className="flex justify-end gap-2 p-5 pt-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
  return { setEditing, setRemoving, dialogs };
}

/** Cartão "Sinistros" no perfil do cliente. */
export function ClientClaimsCard({ client, className }: { client: { id: string; nome: string }; className?: string }) {
  const [novo, setNovo] = useState(false);
  const { setEditing, setRemoving, dialogs } = useClaimActions();
  const q = useQuery({ queryKey: ["claims", { clientId: client.id }], queryFn: () => api.claims.list({ clientId: client.id, pageSize: 100 }) });
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader
        icon={<Siren />}
        title="Sinistros"
        description={q.data ? `${q.data.total} registrado(s)` : "Histórico de ocorrências do cliente."}
        action={
          <Button variant="outline" size="sm" onClick={() => setNovo(true)}>
            <Plus /> Registrar
          </Button>
        }
      />
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="p-5">
          <Skeleton className="h-16" />
        </div>
      ) : !q.data?.items.length ? (
        <EmptyState icon={<Siren />} title="Nenhum sinistro" description="Quando acontecer, registre aqui para ficar no histórico." />
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {q.data.items.map((c) => (
            <ClaimItem key={c.id} c={c} onEdit={() => setEditing(c)} onDelete={() => setRemoving(c)} />
          ))}
        </ul>
      )}
      <ClaimDialog open={novo} onOpenChange={setNovo} client={client} />
      {dialogs}
    </Card>
  );
}
