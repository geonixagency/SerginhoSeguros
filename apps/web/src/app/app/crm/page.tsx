"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, Calculator, GripVertical, Plus, UserCheck, KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { OrigemTag, RAMO_ICON } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, ErrorState, Field, Input, NativeSelect, Skeleton, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";
import { api } from "@/lib/api";
import { LEAD_ORIGEM_LABEL, LEAD_STAGES, RAMOS, RAMO_LABEL, type Lead, type LeadOrigem, type LeadStage, type Ramo } from "@/lib/types";
import { cn, daysUntil, firstName, formatBRL, formatDate, formatPhone, formatRelative, whatsappLink } from "@/lib/utils";

const STAGE_TONE: Record<LeadStage, string> = {
  NOVO: "bg-info",
  EM_CONTATO: "bg-chart-5",
  COTACAO_ENVIADA: "bg-gold-500",
  NEGOCIACAO: "bg-chart-3",
  FECHADO: "bg-success",
  PERDIDO: "bg-subtle",
};

function LeadCard({ lead, overlay, onOpen }: { lead: Lead; overlay?: boolean; onOpen?: () => void }) {
  const Icon = RAMO_ICON[lead.produto];
  const d = lead.proximoContato ? daysUntil(lead.proximoContato) : null;
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-soft)] transition-[box-shadow,border-color]",
        overlay ? "rotate-[2deg] border-gold-500/60 shadow-[var(--shadow-lift)]" : "hover:border-gold-500/40",
      )}
    >
      <div className="flex items-start gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left" aria-label={`Abrir lead ${lead.nome}`}>
          <p className="truncate text-sm font-semibold">{lead.nome}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <Icon className="size-3.5 text-accent-text" /> {RAMO_LABEL[lead.produto]} · <OrigemTag origem={lead.origem} />
          </p>
        </button>
        <GripVertical className="size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {lead.valorEstimado ? <span className="text-xs font-bold tabular text-foreground/80">{formatBRL(lead.valorEstimado)}</span> : <span />}
        {d !== null && lead.etapa !== "FECHADO" && lead.etapa !== "PERDIDO" && (
          <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold", d < 0 ? "bg-danger-soft text-danger" : d === 0 ? "bg-warning-soft text-warning" : "bg-sunken text-muted")}>
            <CalendarClock className="size-3" />
            {d < 0 ? `atrasado ${Math.abs(d)}d` : d === 0 ? "hoje" : formatDate(lead.proximoContato)}
          </span>
        )}
        {lead.responsavel && <Avatar nome={lead.responsavel} className="size-6 text-[10px]" />}
      </div>
    </div>
  );
}

function DraggableLead({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { lead } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("touch-none", isDragging && "opacity-30")}>
      <LeadCard lead={lead} onOpen={onOpen} />
    </div>
  );
}

function Column({ stage, label, leads, onOpen }: { stage: LeadStage; label: string; leads: Lead[]; onOpen: (l: Lead) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = leads.reduce((s, l) => s + (l.valorEstimado ?? 0), 0);
  return (
    <section ref={setNodeRef} aria-label={label} className={cn("flex w-[272px] shrink-0 flex-col rounded-[var(--radius-lg)] border bg-surface-2 transition-colors min-[1700px]:w-auto min-[1700px]:min-w-0", isOver ? "border-gold-500 bg-accent-soft/60" : "border-border")}>
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className={cn("size-2 rounded-full", STAGE_TONE[stage])} />
        <h2 className="text-sm font-bold">{label}</h2>
        <span className="rounded-full bg-sunken px-1.5 text-[11px] font-bold tabular text-muted">{leads.length}</span>
        {total > 0 && <span className="ml-auto text-[11px] font-semibold tabular text-subtle">{formatBRL(total).replace(/,\d{2}$/, "")}</span>}
      </header>
      <div className="scrollbar-thin flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2 lg:max-h-[calc(100dvh-280px)]">
        {leads.map((l) => (
          <motion.div key={l.id} layout transition={{ type: "spring", stiffness: 500, damping: 40 }}>
            <DraggableLead lead={l} onOpen={() => onOpen(l)} />
          </motion.div>
        ))}
        {leads.length === 0 && <p className="grid flex-1 place-items-center rounded-lg border border-dashed border-border px-2 py-6 text-center text-xs text-subtle">Arraste um lead para cá</p>}
      </div>
    </section>
  );
}

function LeadDetail({ lead, open, onOpenChange }: { lead: Lead | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [notas, setNotas] = useState(lead?.notas ?? "");
  const [prox, setProx] = useState(lead?.proximoContato?.slice(0, 10) ?? "");
  const [lastId, setLastId] = useState<string | null>(null);
  if (lead && lead.id !== lastId) {
    setLastId(lead.id);
    setNotas(lead.notas);
    setProx(lead.proximoContato?.slice(0, 10) ?? "");
  }
  const update = useMutation({
    mutationFn: (data: Partial<Lead>) => api.leads.update(lead!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead atualizado");
    },
  });
  const convert = useMutation({
    mutationFn: () => api.leads.convert(lead!.id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Lead virou cliente!", { action: { label: "Abrir ficha", onClick: () => router.push(`/app/clientes/${r.clientId}`) } });
      onOpenChange(false);
    },
  });
  if (!lead) return null;
  const Icon = RAMO_ICON[lead.produto];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" title={lead.nome} description={`Lead de ${LEAD_ORIGEM_LABEL[lead.origem]} · criado ${formatRelative(lead.criadoEm)}`}>
        <div className="grid grid-cols-1 gap-6 p-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Produto</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-semibold">
                <Icon className="size-4 text-accent-text" /> {RAMO_LABEL[lead.produto]}
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Valor estimado</p>
              <p className="mt-0.5 font-semibold tabular">{lead.valorEstimado ? formatBRL(lead.valorEstimado) : "—"}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Telefone</p>
              <p className="mt-0.5 font-semibold tabular">{formatPhone(lead.telefone)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">E-mail</p>
              <p className="mt-0.5 truncate font-semibold">{lead.email ?? "—"}</p>
            </div>
          </div>
          <Field label="Etapa" htmlFor="lead-stage">
            <NativeSelect id="lead-stage" defaultValue={lead.etapa} onChange={(e) => update.mutate({ etapa: e.target.value as LeadStage })}>
              {LEAD_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Próximo contato" htmlFor="lead-next">
            <Input id="lead-next" type="date" value={prox} onChange={(e) => setProx(e.target.value)} onBlur={() => prox && update.mutate({ proximoContato: new Date(prox + "T12:00:00").toISOString() })} />
          </Field>
          <Field label="Notas" htmlFor="lead-notes">
            <Textarea id="lead-notes" rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} onBlur={() => notas !== lead.notas && update.mutate({ notas })} />
          </Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="outline" asChild>
              <a href={whatsappLink(lead.telefone, `Olá ${firstName(lead.nome)}, aqui é da Serginho Seguros! Recebemos seu pedido de cotação de ${RAMO_LABEL[lead.produto].toLowerCase()}.`)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-4 text-[#1fa855]" /> WhatsApp
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/app/cotacoes?nova=1&lead=${lead.id}`}>
                <Calculator /> Nova cotação
              </Link>
            </Button>
          </div>
          {lead.clientId ? (
            <Button variant="subtle" asChild>
              <Link href={`/app/clientes/${lead.clientId}`}>
                <UserCheck /> Ver cliente
              </Link>
            </Button>
          ) : (
            lead.etapa !== "PERDIDO" && (
              <Button variant="gold" size="lg" onClick={() => convert.mutate()} loading={convert.isPending}>
                <UserCheck /> Fechou! Converter em cliente
              </Button>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (fd: FormData) =>
      api.leads.create({
        nome: String(fd.get("nome")),
        telefone: String(fd.get("telefone")),
        email: String(fd.get("email") || "") || undefined,
        produto: String(fd.get("produto")) as Ramo,
        origem: String(fd.get("origem")) as LeadOrigem,
        mensagem: String(fd.get("notas") || ""),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead criado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Novo lead" description="Entra na coluna Novo.">
        <form
          className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(new FormData(e.currentTarget));
          }}
        >
          <Field label="Nome" htmlFor="nl-nome" className="sm:col-span-2">
            <Input id="nl-nome" name="nome" required minLength={3} />
          </Field>
          <Field label="WhatsApp" htmlFor="nl-tel">
            <Input id="nl-tel" name="telefone" type="tel" required />
          </Field>
          <Field label="E-mail" htmlFor="nl-email">
            <Input id="nl-email" name="email" type="email" />
          </Field>
          <Field label="Produto" htmlFor="nl-prod">
            <NativeSelect id="nl-prod" name="produto" defaultValue="AUTO">
              {RAMOS.map((r) => (
                <option key={r} value={r}>
                  {RAMO_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Origem" htmlFor="nl-orig">
            <NativeSelect id="nl-orig" name="origem" defaultValue="whatsapp">
              {Object.entries(LEAD_ORIGEM_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Notas" htmlFor="nl-notas" className="sm:col-span-2">
            <Textarea id="nl-notas" name="notas" rows={3} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Criar lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CrmPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["leads"], queryFn: api.leads.list });
  const [active, setActive] = useState<Lead | null>(null);
  const [detail, setDetail] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor));

  const move = useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: LeadStage }) => api.leads.update(id, { etapa }),
    onMutate: async ({ id, etapa }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const prev = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(["leads"], (old) => old?.map((l) => (l.id === id ? { ...l, etapa } : l)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["leads"], ctx.prev);
      toast.error("Não foi possível mover o lead");
    },
  });

  const grouped = useMemo(() => {
    const g = Object.fromEntries(LEAD_STAGES.map((s) => [s.id, [] as Lead[]])) as Record<LeadStage, Lead[]>;
    data?.forEach((l) => g[l.etapa].push(l));
    return g;
  }, [data]);

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current as { lead: Lead }).lead);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const lead = (e.active.data.current as { lead: Lead } | undefined)?.lead;
    const to = e.over?.id as LeadStage | undefined;
    if (!lead || !to || to === lead.etapa) return;
    move.mutate({ id: lead.id, etapa: to });
    if (to === "FECHADO") toast.success(`${firstName(lead.nome)} fechou negócio!`, { description: "Abra o lead para convertê-lo em cliente." });
  };

  const total = data?.filter((l) => l.etapa !== "FECHADO" && l.etapa !== "PERDIDO").reduce((s, l) => s + (l.valorEstimado ?? 0), 0) ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Funil de vendas"
        title="CRM"
        description={data ? `${data.length} leads · ${formatBRL(total)} em negociação. Arraste os cartões entre as etapas.` : "Leads do site, WhatsApp e indicações."}
        actions={
          <Button variant="gold" onClick={() => setNewOpen(true)}>
            <Plus /> Novo lead
          </Button>
        }
      />
      {isError ? (
        <Card>
          <ErrorState onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {LEAD_STAGES.map((s) => (
            <Skeleton key={s.id} className="h-[480px] w-[280px] shrink-0 rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <Card>
          <EmptyState icon={<KanbanSquare />} title="Nenhum lead ainda" description="Pedidos de cotação do site caem aqui automaticamente." />
        </Card>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 min-[1700px]:mx-0 min-[1700px]:grid min-[1700px]:grid-cols-6 min-[1700px]:overflow-visible min-[1700px]:px-0">
            {LEAD_STAGES.map((s) => (
              <Column
                key={s.id}
                stage={s.id}
                label={s.label}
                leads={grouped[s.id]}
                onOpen={(l) => {
                  setDetail(l);
                  setDetailOpen(true);
                }}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>{active ? <LeadCard lead={active} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
      <LeadDetail lead={detail} open={detailOpen} onOpenChange={setDetailOpen} />
      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
