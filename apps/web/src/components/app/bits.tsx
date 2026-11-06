"use client";

import { Building2, Car, HeartPulse, Home, KeyRound, PiggyBank } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { InstallmentStatus, IntegrationStatus, LeadOrigem, MessageStatus, PolicyStatus, QuoteStatus, Ramo } from "@/lib/types";
import { LEAD_ORIGEM_LABEL, RAMO_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

export const RAMO_ICON: Record<Ramo, typeof Car> = {
  AUTO: Car,
  VIDA: HeartPulse,
  RESIDENCIAL: Home,
  EMPRESARIAL: Building2,
  IMOBILIARIO: KeyRound,
  CONSORCIO: PiggyBank,
};

export function RamoTag({ ramo, className }: { ramo: Ramo; className?: string }) {
  const Icon = RAMO_ICON[ramo];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/85", className)}>
      <Icon className="size-3.5 text-accent-text" /> {RAMO_LABEL[ramo]}
    </span>
  );
}

export function InsurerMark({ nome, cor, className }: { nome: string; cor?: string; className?: string }) {
  const ini = nome
    .replace(/Seguros?/i, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("inline-grid size-9 shrink-0 place-items-center rounded-[10px] text-[12px] font-extrabold tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]", className)}
      style={{ background: `linear-gradient(140deg, ${cor ?? "#555"} 0%, color-mix(in oklab, ${cor ?? "#555"} 70%, black) 100%)` }}
    >
      {ini}
    </span>
  );
}

export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  const map = { VIGENTE: ["success", "Vigente"], VENCIDA: ["danger", "Vencida"], CANCELADA: ["neutral", "Cancelada"], RENOVADA: ["info", "Renovada"] } as const;
  const [tone, label] = map[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
export function InstallmentStatusBadge({ status }: { status: InstallmentStatus }) {
  const map = { PAGO: ["success", "Paga"], PENDENTE: ["gold", "Em aberto"], ATRASADO: ["danger", "Atrasada"], FALHOU: ["danger", "Falhou"] } as const;
  const [tone, label] = map[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
export function IntegrationBadge({ status }: { status: IntegrationStatus }) {
  const map = {
    CONECTADA: ["success", "Conectada"],
    ERRO: ["danger", "Com erro"],
    NAO_CONFIGURADA: ["neutral", "Não configurada"],
    MANUAL: ["warning", "Manual (sem API)"],
  } as const;
  const [tone, label] = map[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const map = {
    NA_FILA: ["neutral", "Na fila"],
    ENVIANDO: ["gold", "Enviando"],
    ENVIADA: ["info", "Enviada"],
    ENTREGUE: ["success", "Entregue"],
    LIDA: ["success", "Lida"],
    FALHOU: ["danger", "Falhou"],
    CANCELADA: ["neutral", "Cancelada"],
  } as const;
  const [tone, label] = map[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const map = { PROCESSANDO: ["gold", "Processando"], CONCLUIDA: ["success", "Concluída"], ENVIADA: ["info", "Enviada"], ERRO: ["danger", "Erro"] } as const;
  const [tone, label] = map[status];
  return (
    <Badge tone={tone} dot>
      {label}
    </Badge>
  );
}
export function OrigemTag({ origem }: { origem: LeadOrigem }) {
  return <span className="text-xs font-semibold text-muted">{LEAD_ORIGEM_LABEL[origem]}</span>;
}

/** Selo de confiança da leitura do PDF */
export function ConfidenceSeal({ value }: { value: number }) {
  const level = value >= 0.85 ? "alto" : value >= 0.65 ? "medio" : "baixo";
  const cfg = {
    alto: { label: "Alta", cls: "bg-success-soft text-success border-success/25", bars: 3 },
    medio: { label: "Média", cls: "bg-warning-soft text-warning border-warning/25", bars: 2 },
    baixo: { label: "Baixa", cls: "bg-danger-soft text-danger border-danger/25", bars: 1 },
  }[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold", cfg.cls)} title={`Confiança ${cfg.label.toLowerCase()} (${Math.round(value * 100)}%)`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((b) => (
          <span key={b} className={cn("w-[3px] rounded-full bg-current", b <= cfg.bars ? "opacity-100" : "opacity-25")} style={{ height: 4 + b * 2 }} />
        ))}
      </span>
      {cfg.label} · {Math.round(value * 100)}%
    </span>
  );
}
