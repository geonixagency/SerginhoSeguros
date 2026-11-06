"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardCharts } from "@/lib/types";
import { RAMO_LABEL } from "@/lib/types";
import { formatBRL, formatBRLCompact } from "@/lib/utils";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

function TooltipBox({ active, payload, label, money }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-lift)]">
      {label && <p className="mb-1 font-semibold capitalize text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold tabular text-foreground">{money ? formatBRL(Number(p.value)) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function InsurerBarChart({ data }: { data: DashboardCharts["porSeguradora"] }) {
  const rows = data.slice(0, 8);
  return (
    <div className="h-[300px] w-full" role="img" aria-label={`Apólices vigentes por seguradora: ${rows.map((r) => `${r.nome} ${r.apolices}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} allowDecimals={false} />
          <YAxis type="category" dataKey="nome" width={112} tickLine={false} axisLine={false} tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
          <Tooltip cursor={{ fill: "var(--surface-sunken)", opacity: 0.6 }} content={<TooltipBox />} />
          <Bar dataKey="apolices" name="Apólices" radius={[0, 6, 6, 0]} fill="var(--chart-1)" animationDuration={900} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RamoDonut({ data }: { data: DashboardCharts["porRamo"] }) {
  const total = data.reduce((s, d) => s + d.apolices, 0);
  const rows = data.map((d) => ({ ...d, nome: RAMO_LABEL[d.ramo] }));
  return (
    <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative mx-auto size-[180px]" role="img" aria-label={`Distribuição por ramo: ${rows.map((r) => `${r.nome} ${r.apolices}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="apolices" nameKey="nome" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="var(--surface)" strokeWidth={2} animationDuration={900}>
              {rows.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-3xl font-bold leading-none tabular">{total}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">apólices</p>
          </div>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-2">
        {rows.map((r, i) => (
          <li key={r.ramo} className="flex items-center gap-2.5 text-sm">
            <span className="size-2.5 rounded-[3px]" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 font-medium">{r.nome}</span>
            <span className="tabular text-muted">{formatBRLCompact(r.premio)}</span>
            <span className="w-10 text-right font-semibold tabular">{Math.round((r.apolices / Math.max(total, 1)) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewClientsChart({ data }: { data: DashboardCharts["novosPorMes"] }) {
  return (
    <div className="h-[260px] w-full" role="img" aria-label="Novos clientes e renovações nos últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="gNovos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} allowDecimals={false} />
          <Tooltip content={<TooltipBox />} cursor={{ stroke: "var(--border-strong)" }} />
          <Area type="monotone" dataKey="renovacoes" name="Renovações" stroke="var(--chart-2)" strokeOpacity={0.5} strokeDasharray="4 4" fill="none" strokeWidth={1.5} animationDuration={900} />
          <Area type="monotone" dataKey="novos" name="Novos clientes" stroke="var(--chart-1)" fill="url(#gNovos)" strokeWidth={2.5} animationDuration={900} dot={false} activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ data }: { data: number[] }) {
  const rows = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-14 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="gSpark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#eebd25" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#eebd25" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="#eebd25" strokeWidth={2} fill="url(#gSpark)" animationDuration={1200} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export { formatBRLCompact };
