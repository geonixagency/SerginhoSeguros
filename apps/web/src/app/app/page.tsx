"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Cake,
  ChevronRight,
  FileUp,
  Info,
  PieChart as PieIcon,
  Plus,
  Receipt,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { InstallmentStatusBadge, RamoTag } from "@/components/app/bits";
import { InsurerBarChart, NewClientsChart, RamoDonut, Sparkline } from "@/components/app/charts";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/count-up";
import { Badge, Card, CardHeader, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn, firstName, formatBRL, formatDate, formatDayMonth, formatPhone, whatsappLink } from "@/lib/utils";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";

function greeting() {
  const h = Number(new Date().toLocaleString("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold tabular", up ? "text-success" : "text-danger")}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {up ? "+" : ""}
      {v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

const card = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

function KpiCard({ icon, label, value, delta, hint, i, href }: { icon: React.ReactNode; label: string; value: number; delta?: number; hint?: string; i: number; href?: string }) {
  const body = (
    <motion.div {...card} transition={{ delay: 0.05 * i, duration: 0.45, ease: [0.16, 1, 0.3, 1] }} className="group relative h-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] hover:border-gold-500/40 hover:shadow-[var(--shadow-lift)]">
      <div className="flex items-center justify-between">
        <span className="grid size-9 place-items-center rounded-[10px] bg-accent-soft text-accent-text [&_svg]:size-[18px]">{icon}</span>
        {typeof delta === "number" && <Delta v={delta} />}
      </div>
      <p className="mt-4 text-[13px] font-semibold text-muted">{label}</p>
      <p className="mt-0.5 font-display text-[40px] font-bold leading-none tracking-tight tabular">
        <CountUp value={value} delay={0.05 * i} />
      </p>
      {hint && <p className="mt-2 text-xs text-subtle">{hint}</p>}
      <span className="absolute inset-x-5 bottom-0 h-[2px] origin-left scale-x-0 bg-gold-gradient transition-transform duration-500 group-hover:scale-x-100" aria-hidden />
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-[var(--radius-lg)]">
      {body}
    </Link>
  ) : (
    body
  );
}

function Kpis() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dash", "summary"], queryFn: api.dashboard.summary });
  const charts = useQuery({ queryKey: ["dash", "charts"], queryFn: api.dashboard.charts });
  if (isError) return <Card><ErrorState onRetry={() => refetch()} /></Card>;
  if (isLoading || !data)
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Skeleton className="h-[188px] rounded-[var(--radius-lg)] sm:col-span-2" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[188px] rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <motion.div {...card} transition={{ duration: 0.5 }} className="relative overflow-hidden rounded-[var(--radius-lg)] border border-ink-800 bg-ink-950 p-5 text-ivory-100 shadow-[var(--shadow-lift)] sm:col-span-2 dark:border-gold-700/25">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,rgba(238,189,37,0.22),transparent_65%)]" aria-hidden />
        <div className="relative flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ivory-100/70">
            <TrendingUp className="size-4 text-gold-400" /> Prêmio da carteira
          </span>
          {data.variacao ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-bold text-[#7ed9a2]">+{data.variacao.premioCarteira.toLocaleString("pt-BR")}% no ano</span>
          ) : data.vencendo ? (
            <span className="rounded-full bg-gold-400/15 px-2 py-0.5 text-xs font-bold text-gold-300">{data.vencendo.d30} vencem em 30 dias</span>
          ) : null}
        </div>
        <p className="relative mt-4 font-display text-[44px] font-bold leading-none tracking-tight text-gold-gradient tabular sm:text-[52px]">
          <CountUp value={data.premioCarteira} format={(n) => formatBRL(n).replace(/,\d{2}$/, "")} duration={1.8} />
        </p>
        <p className="relative mt-1 text-xs text-ivory-100/50">soma dos prêmios das apólices vigentes</p>
        <div className="relative mt-3 -mx-1">{charts.data && <Sparkline data={charts.data.novosPorMes.map((m) => m.novos + m.renovacoes)} />}</div>
      </motion.div>
      <KpiCard i={1} icon={<UserCheck />} label="Clientes ativos" value={data.ativos} delta={data.variacao?.ativos} hint="com apólice vigente" href="/app/clientes?status=ATIVO" />
      <KpiCard i={2} icon={<UserMinus />} label="Inativos" value={data.inativos} hint="oportunidade de reativação" href="/app/clientes?status=INATIVO" />
      <KpiCard i={3} icon={<UserPlus />} label="Novos no mês" value={data.novosMes} delta={data.variacao?.novosMes} hint="cadastrados desde o dia 1º" />
      <KpiCard i={4} icon={<ShieldCheck />} label="Apólices vigentes" value={data.apolicesVigentes} delta={data.variacao?.apolicesVigentes} />
    </div>
  );
}

function Expiring() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dash", "expiring", days], queryFn: () => api.dashboard.expiring(days) });
  return (
    <Card className="flex flex-col xl:col-span-2">
      <CardHeader
        icon={<CalendarClock />}
        title="Apólices a vencer"
        description="Renove antes do cliente lembrar."
        action={<Segmented ariaLabel="Período" layoutId="exp-days" value={days} onChange={setDays} options={[7, 15, 30, 60].map((d) => ({ value: d, label: `${d}d` }))} />}
      />
      <div className="mt-4 flex-1">
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-2 px-5 pb-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState icon={<ShieldCheck />} title="Nada vencendo" description={`Nenhuma apólice vence nos próximos ${days} dias.`} />
        ) : (
          <ul className="scrollbar-thin max-h-[392px] divide-y divide-border overflow-y-auto">
            {data.map((p, i) => (
              <motion.li key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.025 }} className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2">
                <div className={cn("grid w-14 shrink-0 place-items-center rounded-xl border py-1.5 text-center", p.diasRestantes <= 7 ? "border-danger/30 bg-danger-soft text-danger" : p.diasRestantes <= 15 ? "border-warning/30 bg-warning-soft text-warning" : "border-border bg-sunken text-foreground")}>
                  <span className="font-display text-xl font-bold leading-none tabular">{p.diasRestantes}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">{p.diasRestantes === 1 ? "dia" : "dias"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/app/clientes/${p.clientId}`} className="block truncate text-sm font-semibold hover:text-accent-text">
                    {p.clientNome}
                  </Link>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <RamoTag ramo={p.ramo} className="text-xs" />
                    <span>{p.seguradora}</span>
                    <span className="hidden tabular sm:inline">nº {p.numero}</span>
                    {p.item?.placa && <span className="rounded bg-sunken px-1.5 font-mono text-[11px] font-semibold text-foreground">{p.item.placa}</span>}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold tabular">{formatBRL(p.premioTotal)}</p>
                  <p className="text-xs text-muted tabular">{formatDate(p.fimVigencia)}</p>
                </div>
                <a
                  href={whatsappLink(p.telefone, `Olá ${firstName(p.clientNome)}! Seu seguro ${p.seguradora} vence em ${formatDate(p.fimVigencia)}. Já estou preparando a renovação — podemos conversar?`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-[#1fa855] transition-colors hover:bg-[#25d366]/10"
                  aria-label={`Falar com ${p.clientNome} no WhatsApp`}
                >
                  <WhatsAppIcon className="size-[18px]" />
                </a>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Alerts() {
  const { data, isLoading } = useQuery({ queryKey: ["dash", "summary"], queryFn: api.dashboard.summary });
  const cfg = {
    critico: { icon: AlertOctagon, cls: "text-danger bg-danger-soft", ring: "before:bg-danger" },
    atencao: { icon: AlertTriangle, cls: "text-warning bg-warning-soft", ring: "before:bg-warning" },
    info: { icon: Info, cls: "text-info bg-info-soft", ring: "before:bg-info" },
  };
  return (
    <Card id="alertas" className="scroll-mt-24">
      <CardHeader icon={<AlertTriangle />} title="Alertas" description="O que precisa da sua atenção hoje." />
      <ul className="grid grid-cols-1 gap-2 p-5 pt-4">
        {isLoading &&
          [0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-[74px]" />
            </li>
          ))}
        {data?.alertas.map((a, i) => {
          const c = cfg[a.nivel];
          const Icon = c.icon;
          return (
            <motion.li key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}>
              <Link href={a.href ?? "#"} className={cn("group relative flex gap-3 overflow-hidden rounded-xl border border-border bg-surface-2 p-3 pl-4 transition-colors hover:border-border-strong before:absolute before:inset-y-0 before:left-0 before:w-[3px]", c.ring)}>
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", c.cls)}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{a.titulo}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{a.descricao}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 self-center text-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
}

function InstallmentsDue() {
  const [tab, setTab] = useState<"hoje" | "semana" | "atrasadas">("hoje");
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dash", "installments"], queryFn: api.dashboard.installmentsDue });
  const list = data?.[tab] ?? [];
  const total = list.reduce((s, i) => s + i.valor, 0);
  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Receipt />}
        title="Parcelas vencendo"
        description={data ? `${list.length} parcela${list.length === 1 ? "" : "s"} · ${formatBRL(total)}` : "Carregando…"}
        action={
          <Segmented
            ariaLabel="Período das parcelas"
            layoutId="inst-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: "hoje", label: `Hoje${data ? ` ${data.hoje.length}` : ""}` },
              { value: "semana", label: "Semana" },
              { value: "atrasadas", label: "Atraso" },
            ]}
          />
        }
        className="flex-wrap"
      />
      <div className="mt-4 flex-1">
        {isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-2 px-5 pb-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Tudo em dia" description="Nenhuma parcela neste período." />
        ) : (
          <ul className="scrollbar-thin max-h-[340px] divide-y divide-border overflow-y-auto">
            {list.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/clientes/${it.clientId}`} className="block truncate text-sm font-semibold hover:text-accent-text">
                    {it.clientNome}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {it.seguradora} · parcela {it.numero}/{it.total} · {it.formaPagamento.toLowerCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular">{formatBRL(it.valor)}</p>
                  <p className="text-xs text-muted tabular">{formatDate(it.vencimento)}</p>
                </div>
                <div className="hidden w-[92px] justify-end sm:flex">
                  <InstallmentStatusBadge status={it.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border px-5 py-3">
        <Link href="/app/disparos" className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
          Ver réguas de cobrança <ArrowRight className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

function Birthdays() {
  const { data, isLoading } = useQuery({ queryKey: ["dash", "birthdays"], queryFn: api.dashboard.birthdays });
  return (
    <Card className="flex flex-col">
      <CardHeader icon={<Cake />} title="Aniversariantes" description="Hoje e nos próximos 7 dias." />
      <ul className="grid grid-cols-1 gap-1 p-3 pt-4">
        {isLoading &&
          [0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-12" />
            </li>
          ))}
        {data && data.length === 0 && <EmptyState icon={<Cake />} title="Sem aniversários" description="Ninguém faz aniversário nesta semana." />}
        {data?.map((b) => (
          <li key={b.clientId} className={cn("flex items-center gap-3 rounded-xl px-2.5 py-2", b.hoje && "bg-accent-soft")}>
            <div className={cn("grid w-12 shrink-0 place-items-center rounded-lg py-1 text-center", b.hoje ? "bg-gold-gradient text-ink-950" : "bg-sunken")}>
              <span className="text-[10px] font-bold uppercase">{b.hoje ? "Hoje" : formatDayMonth(b.data).split(" ")[1]}</span>
              <span className="font-display text-lg font-bold leading-none">{new Date(b.data).getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/app/clientes/${b.clientId}`} className="block truncate text-sm font-semibold hover:text-accent-text">
                {b.nome}
              </Link>
              <p className="text-xs text-muted">
                {b.idade} anos · {formatPhone(b.telefone)}
              </p>
            </div>
            {b.hoje &&
              (b.mensagemEnviada ? (
                <Badge tone="success">Parabéns enviado</Badge>
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <a href={whatsappLink(b.telefone, `Bom dia ${firstName(b.nome)}, tudo bem! Hoje é seu dia e a Serginho Seguros está passando para lhe desejar Feliz Aniversário, muitas felicidades!`)} target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon className="size-3.5 text-[#1fa855]" /> Parabenizar
                  </a>
                </Button>
              ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ChartsRow() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dash", "charts"], queryFn: api.dashboard.charts });
  if (isError) return <Card><ErrorState onRetry={() => refetch()} /></Card>;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader icon={<BarChart3 />} title="Por seguradora" description="Apólices vigentes" />
        <div className="p-4 pt-2">{isLoading || !data ? <Skeleton className="h-[300px]" /> : <InsurerBarChart data={data.porSeguradora} />}</div>
      </Card>
      <Card>
        <CardHeader icon={<PieIcon />} title="Por ramo" description="Participação e prêmio" />
        <div className="p-5">{isLoading || !data ? <Skeleton className="h-[260px]" /> : <RamoDonut data={data.porRamo} />}</div>
      </Card>
      <Card>
        <CardHeader icon={<TrendingUp />} title="Novos por mês" description="Clientes novos vs. renovações" />
        <div className="p-4 pt-2">{isLoading || !data ? <Skeleton className="h-[260px]" /> : <NewClientsChart data={data.novosPorMes} />}</div>
        <div className="flex gap-4 px-5 pb-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded bg-chart-1" /> Novos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-chart-2 opacity-60" /> Renovações
          </span>
        </div>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
  return (
    <>
      <PageHeader
        eyebrow={today}
        title={
          <>
            {greeting()}, <span className="italic text-accent-text">{firstName(user?.nome ?? "")}</span>.
          </>
        }
        description="Aqui está o pulso da carteira hoje."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/app/cotacoes?nova=1">
                <Plus /> Nova cotação
              </Link>
            </Button>
            <Button variant="gold" asChild>
              <Link href="/app/clientes/novo">
                <FileUp /> Cadastrar por PDF
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4">
        <Kpis />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Expiring />
          <Alerts />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InstallmentsDue />
          <Birthdays />
        </div>
        <ChartsRow />
      </div>
    </>
  );
}
