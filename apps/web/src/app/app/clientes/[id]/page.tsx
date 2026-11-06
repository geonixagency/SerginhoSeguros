"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BellOff,
  Paperclip,
  Pencil,
  Plus,
  CalendarDays,
  Car,
  FileText,
  History,
  IdCard,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ReceiptText,
  ShieldCheck,
  StickyNote,
  UserRound,
  Zap,
  AlertTriangle,
  CircleDollarSign,
} from "lucide-react";
import { InstallmentStatusBadge, MessageStatusBadge, PolicyStatusBadge, RamoTag } from "@/components/app/bits";
import { PdfViewer } from "@/components/app/pdf-viewer";
import { AttachDialog, ClientFormDialog, PolicyFormDialog } from "@/components/app/client-forms";
import { SendWhatsAppDialog } from "@/components/app/send-whatsapp";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Tabs, TabsContent } from "@/components/ui/overlays";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";
import { api } from "@/lib/api";
import type { ClientDetail, DocumentFile, Policy, TimelineType } from "@/lib/types";
import { FORMA_PAGAMENTO_LABEL } from "@/lib/types";
import { cn, daysUntil, firstName, formatBRL, formatCpfCnpj, formatDate, formatDateTime, formatPhone, formatRelative } from "@/lib/utils";

const DOC_LABEL: Record<DocumentFile["tipo"], string> = { APOLICE: "Apólice", BOLETO: "Boleto", ENDOSSO: "Endosso", PROPOSTA: "Proposta", CNH: "CNH", OUTRO: "Outro" };

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-sunken text-muted [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className={cn("mt-0.5 break-words text-sm font-semibold", mono && "font-mono")}>{value || "—"}</p>
      </div>
    </div>
  );
}

function DadosTab({ c }: { c: ClientDetail }) {
  const e = c.endereco;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold">Dados pessoais</h3>
        <div className="divide-y divide-border">
          <InfoRow icon={<UserRound />} label="Nome" value={c.nome} />
          <InfoRow icon={<IdCard />} label={c.cpfCnpj.length > 11 ? "CNPJ" : "CPF"} value={formatCpfCnpj(c.cpfCnpj)} mono />
          <InfoRow icon={<CalendarDays />} label="Nascimento" value={c.nascimento ? formatDate(c.nascimento) : null} />
          <InfoRow icon={<Car />} label="CNH" value={c.cnh} mono />
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold">Contato</h3>
        <div className="divide-y divide-border">
          <InfoRow icon={<Phone />} label="Telefone / WhatsApp" value={formatPhone(c.telefone)} />
          <InfoRow icon={<Mail />} label="E-mail" value={c.email} />
          <InfoRow icon={<MapPin />} label="Endereço" value={e ? `${e.logradouro}, ${e.numero} — ${e.bairro}, ${e.cidade}/${e.uf} · CEP ${e.cep}` : null} />
          <InfoRow icon={<BellOff />} label="Mensagens automáticas" value={c.optOut ? "Desativadas (cliente respondeu SAIR)" : "Ativas"} />
        </div>
      </Card>
    </div>
  );
}

function ApolicesTab({ c, onNew, onEdit }: { c: ClientDetail; onNew: () => void; onEdit: (p: Policy) => void }) {
  if (!c.apolices.length)
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title="Sem apólices"
        description="Lance a apólice manualmente ou cadastre a partir do PDF."
        action={
          <Button variant="gold" onClick={onNew}>
            <Plus /> Nova apólice
          </Button>
        }
      />
    );
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onNew}>
          <Plus /> Nova apólice
        </Button>
      </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {c.apolices.map((p, i) => {
        const d = daysUntil(p.fimVigencia);
        const total = 365;
        const elapsed = Math.min(total, Math.max(0, total - d));
        return (
          <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="relative overflow-hidden p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <RamoTag ramo={p.ramo} />
                  <p className="mt-1 font-display text-2xl font-semibold">{p.seguradora}</p>
                  <p className="font-mono text-xs text-muted">Apólice {p.numero} · proposta {p.proposta}</p>
                </div>
                <div className="flex items-center gap-1">
                  <PolicyStatusBadge status={p.status} />
                  <Button variant="ghost" size="icon-sm" onClick={() => onEdit(p)} aria-label={`Editar apólice ${p.numero}`}>
                    <Pencil />
                  </Button>
                </div>
              </div>
              {p.item && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
                  <span className="font-semibold">{p.item.descricao}</span>
                  {p.item.placa && <span className="ml-auto rounded bg-ink-900 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-gold-300">{p.item.placa}</span>}
                </div>
              )}
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">Prêmio</dt>
                  <dd className="font-semibold tabular">{formatBRL(p.premioTotal)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Pagamento</dt>
                  <dd className="font-semibold">{FORMA_PAGAMENTO_LABEL[p.formaPagamento]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Emissão</dt>
                  <dd className="font-semibold tabular">{formatDate(p.emissao)}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted">
                  <span className="tabular">{formatDate(p.inicioVigencia)}</span>
                  <span className={cn("font-semibold", p.status === "VIGENTE" && d <= 30 ? "text-warning" : "")}>
                    {p.status === "VIGENTE" ? (d >= 0 ? `vence em ${d} dias` : "vencida") : "encerrada"}
                  </span>
                  <span className="tabular">{formatDate(p.fimVigencia)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(elapsed / total) * 100}%` }} transition={{ duration: 0.9, delay: 0.2 + i * 0.05 }} className={cn("h-full rounded-full", p.status !== "VIGENTE" ? "bg-border-strong" : d <= 30 ? "bg-warning" : "bg-gold-gradient")} />
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
    </div>
  );
}

function ParcelasTab({ c }: { c: ClientDetail }) {
  if (!c.parcelas.length) return <EmptyState icon={<ReceiptText />} title="Sem parcelas" />;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
              <th className="px-4 py-3">Apólice</th>
              <th className="px-4 py-3">Parcela</th>
              <th className="px-4 py-3">Vencimento</th>
              <th className="px-4 py-3">Forma</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {c.parcelas.map((p) => (
              <tr key={p.id} className={cn("hover:bg-surface-2", p.status === "ATRASADO" && "bg-danger-soft/40")}>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs">{p.apoliceNumero}</span>
                  <span className="block text-xs text-muted">{p.seguradora}</span>
                </td>
                <td className="px-4 py-2.5 tabular">
                  {p.numero}/{p.total}
                </td>
                <td className="px-4 py-2.5 tabular">{formatDate(p.vencimento)}</td>
                <td className="px-4 py-2.5 text-muted">{FORMA_PAGAMENTO_LABEL[p.formaPagamento]}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular">{formatBRL(p.valor)}</td>
                <td className="px-4 py-2.5">
                  <InstallmentStatusBadge status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DocumentosTab({ c, onAttach }: { c: ClientDetail; onAttach: () => void }) {
  const [selId, setSelId] = useState<string | null>(c.documentos[0]?.id ?? null);
  const sel = c.documentos.find((d) => d.id === selId) ?? c.documentos[0] ?? null;
  const setSel = (d: DocumentFile) => setSelId(d.id);
  const load = useCallback(() => api.documents.fileUrl(sel?.id ?? ""), [sel?.id]);
  if (!c.documentos.length)
    return (
      <EmptyState
        icon={<FileText />}
        title="Nenhum documento"
        description="Anexe PDFs de apólices, boletos ou fotos de documentos."
        action={
          <Button variant="gold" onClick={onAttach}>
            <Paperclip /> Anexar arquivos
          </Button>
        }
      />
    );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <ul className="grid content-start gap-2" aria-label="Documentos">
        <li>
          <Button variant="outline" className="w-full" onClick={onAttach}>
            <Paperclip /> Anexar arquivos
          </Button>
        </li>
        {c.documentos.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => setSel(d)}
              aria-pressed={sel?.id === d.id}
              className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors", sel?.id === d.id ? "border-gold-500/60 bg-accent-soft" : "border-border bg-surface hover:border-border-strong")}
            >
              <span className={cn("grid h-11 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface text-[9px] font-extrabold shadow-sm", d.mimeType?.startsWith("image/") ? "text-info" : "text-danger")}>
                {d.mimeType?.startsWith("image/") ? "IMG" : "PDF"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{d.nome}</span>
                <span className="block text-xs text-muted">
                  {DOC_LABEL[d.tipo]} · {(d.tamanho / 1024).toFixed(0)} KB · {formatDate(d.criadoEm)}
                </span>
              </span>
            </button>
          </li>
        ))}
        <p className="px-1 pt-2 text-xs text-subtle">Cada abertura de documento é registrada na auditoria (LGPD).</p>
      </ul>
      {sel && <PdfViewer key={sel.id} load={load} nome={sel.nome} image={sel.mimeType?.startsWith("image/")} />}
    </div>
  );
}

function MensagensTab({ c }: { c: ClientDetail }) {
  const { data, isLoading } = useQuery({ queryKey: ["client-messages", c.id], queryFn: () => api.clients.messages(c.id) });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data?.length) return <EmptyState icon={<MessageSquare />} title="Nenhuma mensagem" description="Lembretes e conversas enviados pelo sistema aparecem aqui." />;
  return (
    <Card className="rounded-[var(--radius-xl)] bg-[#efe9df] p-4 sm:p-6 dark:bg-[#0b141a]">
      <ul className="mx-auto grid max-w-2xl gap-3">
        {data.map((m) => (
          <li key={m.id} className="ml-auto w-fit max-w-[88%]">
            <div className="rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
              {m.regra && <p className="mb-1 text-[11px] font-bold uppercase tracking-wider opacity-60">{m.regra}</p>}
              <p className="whitespace-pre-wrap">{m.texto}</p>
              <p className="mt-1 text-right text-[10.5px] opacity-60">{formatDateTime(m.enviadoEm ?? m.criadoEm)}</p>
            </div>
            <div className="mt-1 flex justify-end">
              <MessageStatusBadge status={m.status} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const TL_ICON: Record<TimelineType, { icon: typeof History; cls: string }> = {
  CADASTRO: { icon: UserRound, cls: "bg-ink-900 text-gold-300 dark:bg-gold-400 dark:text-ink-950" },
  APOLICE: { icon: ShieldCheck, cls: "bg-accent-soft text-accent-text" },
  PAGAMENTO: { icon: CircleDollarSign, cls: "bg-success-soft text-success" },
  MENSAGEM: { icon: MessageSquare, cls: "bg-info-soft text-info" },
  DOCUMENTO: { icon: FileText, cls: "bg-sunken text-muted" },
  ACAO: { icon: Zap, cls: "bg-accent-soft text-accent-text" },
  NOTA: { icon: StickyNote, cls: "bg-sunken text-muted" },
  ALERTA: { icon: AlertTriangle, cls: "bg-danger-soft text-danger" },
};

function TimelineTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["timeline", id], queryFn: () => api.clients.timeline(id) });
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data?.length) return <EmptyState icon={<History />} title="Sem eventos" />;
  return (
    <Card className="p-5 sm:p-6">
      <ol className="relative grid gap-5 before:absolute before:bottom-2 before:left-[17px] before:top-2 before:w-px before:bg-border">
        {data.map((e, i) => {
          const cfg = TL_ICON[e.tipo];
          const Icon = cfg.icon;
          return (
            <motion.li key={e.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.04 }} className="relative flex gap-4">
              <span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-surface", cfg.cls)}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-semibold">{e.titulo}</p>
                  <time className="text-xs text-muted tabular" dateTime={e.data} title={formatDateTime(e.data)}>
                    {formatDate(e.data)} · {formatRelative(e.data)}
                  </time>
                </div>
                {e.descricao && <p className="mt-0.5 text-sm text-muted">{e.descricao}</p>}
                {e.autor && <p className="mt-1 text-xs text-subtle">por {e.autor}</p>}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
}

export default function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <ClientPageInner params={params} />
    </Suspense>
  );
}

function ClientPageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const [tab, setTab] = useState("dados");
  const [wa, setWa] = useState(false);
  const [editing, setEditing] = useState(false);
  const [attach, setAttach] = useState(false);
  /** undefined = fechado; null = nova apólice; Policy = editar. */
  const [polForm, setPolForm] = useState<Policy | null | undefined>(undefined);
  // Cadastro manual recém-criado: já abre a primeira apólice.
  useEffect(() => {
    if (search.get("novo") === "1") {
      setTab("apolices");
      setPolForm(null);
      window.history.replaceState(null, "", `/app/clientes/${id}`);
    }
  }, [search, id]);
  const { data: c, isLoading, isError, error, refetch } = useQuery({ queryKey: ["client", id], queryFn: () => api.clients.get(id) });

  const stats = useMemo(() => {
    if (!c) return null;
    const vig = c.apolices.filter((p) => p.status === "VIGENTE");
    const abertas = c.parcelas.filter((p) => p.status !== "PAGO");
    return { vig: vig.length, premio: vig.reduce((s, p) => s + p.premioTotal, 0), abertas: abertas.length, atrasadas: c.parcelas.filter((p) => p.status === "ATRASADO").length };
  }, [c]);

  if (isError) return <Card><ErrorState message={(error as Error).message} onRetry={() => refetch()} /></Card>;
  if (isLoading || !c || !stats)
    return (
      <div className="grid grid-cols-1 gap-4">
        <Skeleton className="h-40 rounded-[var(--radius-xl)]" />
        <Skeleton className="h-96 rounded-[var(--radius-xl)]" />
      </div>
    );

  return (
    <>
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <div className="relative mb-6 overflow-hidden rounded-[var(--radius-xl)] border border-ink-800 bg-ink-950 p-5 text-ivory-100 sm:p-7 dark:border-gold-700/25">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgba(238,189,37,0.2),transparent_65%)]" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Avatar nome={c.nome} tone="gold" className="size-16 text-2xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold leading-tight text-ivory-50 sm:text-4xl">{c.nome}</h1>
                <Badge tone={c.status === "ATIVO" ? "success" : "neutral"} dot className="!bg-white/10 !border-white/10">
                  {c.status === "ATIVO" ? "Ativo" : "Inativo"}
                </Badge>
                {c.optOut && <Badge tone="warning">Opt-out</Badge>}
              </div>
              <p className="mt-1 text-sm text-ivory-100/60">
                <span className="font-mono">{formatCpfCnpj(c.cpfCnpj)}</span> · cliente desde {formatDate(c.criadoEm)} · origem {c.origem}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="border border-white/15 bg-white/5 text-ivory-50 shadow-none hover:bg-white/10" onClick={() => setEditing(true)}>
              <Pencil /> Editar
            </Button>
            <Button variant="gold" onClick={() => setWa(true)} disabled={c.optOut}>
              <WhatsAppIcon className="size-4" /> Mensagem
            </Button>
            <Button asChild className="border border-white/15 bg-white/5 text-ivory-50 shadow-none hover:bg-white/10">
              <Link href={`/app/acoes?cliente=${c.id}`}>
                <Zap /> Ações na seguradora
              </Link>
            </Button>
          </div>
        </div>
        <dl className="relative mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-5 sm:grid-cols-4">
          {[
            { l: "Apólices vigentes", v: String(stats.vig) },
            { l: "Prêmio vigente", v: formatBRL(stats.premio) },
            { l: "Parcelas em aberto", v: String(stats.abertas) },
            { l: "Em atraso", v: String(stats.atrasadas), warn: stats.atrasadas > 0 },
          ].map((s) => (
            <div key={s.l}>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ivory-100/45">{s.l}</dt>
              <dd className={cn("mt-1 font-display text-2xl font-bold tabular", s.warn ? "text-[#f2a08f]" : "text-gold-gradient")}>{s.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        layoutId="client-tabs"
        items={[
          { value: "dados", label: "Dados" },
          { value: "apolices", label: "Apólices", count: c.apolices.length },
          { value: "parcelas", label: "Parcelas", count: c.parcelas.length },
          { value: "documentos", label: "Documentos", count: c.documentos.length },
          { value: "mensagens", label: "Mensagens" },
          { value: "timeline", label: "Linha do tempo" },
        ]}
      >
        <div className="pt-5">
          <TabsContent value="dados">
            <DadosTab c={c} />
          </TabsContent>
          <TabsContent value="apolices">
            <ApolicesTab c={c} onNew={() => setPolForm(null)} onEdit={(p) => setPolForm(p)} />
          </TabsContent>
          <TabsContent value="parcelas">
            <ParcelasTab c={c} />
          </TabsContent>
          <TabsContent value="documentos">
            <DocumentosTab c={c} onAttach={() => setAttach(true)} />
          </TabsContent>
          <TabsContent value="mensagens">
            <MensagensTab c={c} />
          </TabsContent>
          <TabsContent value="timeline">
            <TimelineTab id={c.id} />
          </TabsContent>
        </div>
      </Tabs>

      <ClientFormDialog open={editing} onOpenChange={setEditing} client={c} />
      <PolicyFormDialog key={polForm === undefined ? "pol-closed" : `pol-${polForm?.id ?? "nova"}`} open={polForm !== undefined} onOpenChange={(o) => !o && setPolForm(undefined)} client={c} policy={polForm} />
      <AttachDialog key={attach ? "att-open" : "att-closed"} open={attach} onOpenChange={setAttach} client={c} />

      <SendWhatsAppDialog
        open={wa}
        onOpenChange={setWa}
        clientId={c.id}
        nome={c.nome}
        telefone={c.telefone}
        textoInicial={`Olá ${firstName(c.nome)}, tudo bem? Aqui é da Serginho Seguros. `}
      />
    </>
  );
}

