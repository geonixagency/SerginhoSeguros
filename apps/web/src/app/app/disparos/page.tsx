"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Cake,
  CalendarClock,
  FileSpreadsheet,
  Gauge,
  Upload,
  CheckCheck,
  Clock,
  Filter,
  History,
  ListOrdered,
  Paperclip,
  PauseCircle,
  Pencil,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  Unplug,
  Users,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { MessageStatusBadge } from "@/components/app/bits";
import { AttachmentPicker } from "@/components/app/attachment-picker";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Input, Label, NativeSelect, Progress, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, Tabs, TabsContent } from "@/components/ui/overlays";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";
import { api, IS_DEMO } from "@/lib/api";
import {
  FORMA_PAGAMENTO_LABEL,
  RAMOS,
  RAMO_LABEL,
  type BroadcastFilter,
  type BroadcastOptions,
  type BroadcastPreview,
  type BroadcastSource,
  type FormaPagamento,
  type MessageAttachment,
  type MessageRule,
  type MessagingPacing,
  type RuleTrigger,
} from "@/lib/types";
import { columnVar, estimateSchedule, mapCsvContacts, parseCsv, type CsvMapping, type CsvTable } from "@ss/shared";
import { cn, formatDateTime, formatPhone, formatRelative, renderTemplate } from "@/lib/utils";

const VARS = ["nome", "seguradora", "apolice", "valor", "vencimento", "placa"] as const;
const SAMPLE: Record<string, string> = { nome: "Juliana", seguradora: "Porto Seguro", apolice: "POR5531907", valor: "R$ 384,22", vencimento: "16/11/2026", placa: "RTA4E21" };
const TRIGGER_ICON: Record<RuleTrigger, typeof Clock> = { PRIMEIRA_PARCELA: Receipt, PROBLEMA_SEM_BOLETO: AlertTriangle, PROBLEMA_COM_BOLETO: Paperclip, ANIVERSARIO: Cake, RENOVACAO: CalendarClock };

/* ---------- Bolha de prévia ---------- */
function Bubble({ texto, anexo }: { texto: string; anexo?: boolean | string | null }) {
  return (
    <div className="rounded-2xl bg-[#efe9df] p-4 dark:bg-[#0b141a]">
      <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
        {anexo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs font-semibold dark:bg-white/10">
            <Paperclip className="size-3.5 shrink-0" /> <span className="truncate">{typeof anexo === "string" ? anexo : "boleto.pdf"}</span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{texto}</p>
        <p className="mt-1 flex items-center justify-end gap-1 text-[10.5px] opacity-60">
          09:00 <CheckCheck className="size-3.5 text-[#53bdeb]" />
        </p>
      </div>
    </div>
  );
}

/* ---------- Editor com variáveis ---------- */
function TemplateEditor({ id, value, onChange, rows = 5, vars = VARS }: { id: string; value: string; onChange: (v: string) => void; rows?: number; vars?: readonly string[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (v: string) => {
    const el = ref.current;
    const token = `{{${v}}}`;
    if (!el) return onChange(value + token);
    const s = el.selectionStart ?? value.length;
    const e = el.selectionEnd ?? value.length;
    const next = value.slice(0, s) + token + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };
  return (
    <div className="grid grid-cols-1 gap-2">
      <Textarea id={id} ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted">Inserir:</span>
        {vars.map((v) => (
          <button key={v} type="button" onClick={() => insert(v)} className="rounded-md border border-gold-500/30 bg-accent-soft px-2 py-0.5 font-mono text-[11.5px] font-semibold text-accent-text transition-colors hover:border-gold-500">
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- QR fictício para o modo demo ---------- */
function FakeQr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const out: boolean[] = [];
    for (let i = 0; i < 29 * 29; i++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      out.push((h >>> 0) % 100 < 46);
    }
    return out;
  }, [seed]);
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [[0, 0], [22, 0], [0, 22]]) {
      if (inBox(ox, oy)) {
        const dx = x - ox, dy = y - oy;
        return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
      }
    }
    return -1;
  };
  return (
    <svg viewBox="0 0 29 29" className="size-full" shapeRendering="crispEdges" role="img" aria-label="QR code para conectar o WhatsApp">
      <rect width="29" height="29" fill="#fff" />
      {cells.map((on, i) => {
        const x = i % 29, y = Math.floor(i / 29);
        const f = finder(x, y);
        const fill = f === -1 ? on : f === 1;
        return fill ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0f0f11" /> : null;
      })}
    </svg>
  );
}

/* ---------- Conexão ---------- */
function ConnectionTab() {
  const qc = useQueryClient();
  const { data: inst, isLoading, isError, refetch } = useQuery({ queryKey: ["messaging", "instance"], queryFn: api.messaging.instance, refetchInterval: (q) => (q.state.data?.status === "AGUARDANDO_QR" ? 4000 : false) });
  const set = (d: Awaited<ReturnType<typeof api.messaging.instance>>) => qc.setQueryData(["messaging", "instance"], d);
  const connect = useMutation({ mutationFn: api.messaging.connect, onSuccess: set });
  const confirm = useMutation({ mutationFn: api.messaging.confirmDemo, onSuccess: (d) => {
      set(d);
      toast.success("WhatsApp conectado");
    },
  });
  const disconnect = useMutation({ mutationFn: api.messaging.disconnect, onSuccess: set });
  const pause = useMutation({ mutationFn: (pausado: boolean) => api.messaging.updateInstance({ pausado }), onSuccess: set });

  // O QR do WhatsApp expira em ~20 s: enquanto espera a leitura, busca um código novo sozinho
  // (e um primeiro, se a tela abriu já "aguardando" sem QR em mãos).
  const aguardando = inst?.status === "AGUARDANDO_QR";
  const semQr = aguardando && !inst?.qrCode;
  const connectRef = useRef(connect.mutate);
  connectRef.current = connect.mutate;
  useEffect(() => {
    if (!aguardando || IS_DEMO) return;
    if (semQr) connectRef.current();
    const t = setInterval(() => connectRef.current(), 20_000);
    return () => clearInterval(t);
  }, [aguardando, semQr]);

  if (isError) return <Card><ErrorState onRetry={() => refetch()} /></Card>;
  if (isLoading || !inst) return <Skeleton className="h-80 rounded-[var(--radius-lg)]" />;
  const pct = (inst.enviadasHoje / inst.limiteDiario) * 100;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Card className="relative overflow-hidden">
        <div className={cn("absolute inset-x-0 top-0 h-1", inst.status === "CONECTADO" ? "bg-[#25d366]" : inst.status === "AGUARDANDO_QR" ? "bg-gold-gradient" : "bg-danger")} aria-hidden />
        <div className="grid grid-cols-1 gap-6 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="relative mx-auto grid size-48 place-items-center rounded-2xl border border-border bg-surface-2 p-3">
            <AnimatePresence mode="wait">
              {inst.status === "AGUARDANDO_QR" && inst.qrCode ? (
                <motion.div key="qr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative size-full overflow-hidden rounded-lg">
                  {inst.qrCode.startsWith("data:image") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={inst.qrCode} alt="QR code para conectar o WhatsApp" className="size-full" />
                  ) : (
                    <FakeQr seed={inst.qrCode} />
                  )}
                  <motion.div className="absolute inset-x-0 h-0.5 bg-[#25d366] shadow-[0_0_12px_2px_rgba(37,211,102,0.6)]" animate={{ top: ["0%", "100%", "0%"] }} transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }} />
                </motion.div>
              ) : (
                <motion.div key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative grid place-items-center">
                  {inst.status === "CONECTADO" && <span className="absolute size-24 animate-ping rounded-full bg-[#25d366]/20" />}
                  <span className={cn("relative grid size-24 place-items-center rounded-full", inst.status === "CONECTADO" ? "bg-[#25d366] text-white" : "bg-sunken text-subtle")}>
                    <WhatsAppIcon className="size-12" />
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-subtle">WhatsApp da corretora</p>
            <p className="mt-1 font-display text-3xl font-semibold">
              {inst.status === "CONECTADO" ? "Conectado" : inst.status === "AGUARDANDO_QR" ? "Leia o QR code" : "Desconectado"}
            </p>
            {inst.status === "CONECTADO" && (
              <p className="mt-1 text-sm text-muted">
                <Smartphone className="mr-1 inline size-4" />
                {[inst.nome, inst.numero ? formatPhone(inst.numero) : null].filter(Boolean).join(" · ")}
                {IS_DEMO && ` · desde ${formatRelative(inst.atualizadoEm)}`}
              </p>
            )}
            {inst.status === "AGUARDANDO_QR" && (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted">
                <li>Abra o WhatsApp no celular da corretora</li>
                <li>Toque em Aparelhos conectados → Conectar aparelho</li>
                <li>Aponte a câmera para o código ao lado</li>
              </ol>
            )}
            {inst.status === "DESCONECTADO" && <p className="mt-1 text-sm text-muted">As réguas ficam em espera até reconectar.</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              {inst.status === "CONECTADO" ? (
                <Button variant="outline" onClick={() => disconnect.mutate()} loading={disconnect.isPending}>
                  <Unplug /> Desconectar
                </Button>
              ) : inst.status === "AGUARDANDO_QR" ? (
                <>
                  <Button variant="outline" onClick={() => connect.mutate()} loading={connect.isPending}>
                    <RefreshCw /> Novo código
                  </Button>
                  {IS_DEMO && (
                    <Button variant="gold" onClick={() => confirm.mutate()} loading={confirm.isPending}>
                      Simular leitura (demo)
                    </Button>
                  )}
                </>
              ) : (
                <Button variant="gold" onClick={() => connect.mutate()} loading={connect.isPending}>
                  <QrCode /> Gerar QR code
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<PauseCircle />} title="Envio controlado" description="Proteções contra bloqueio do número." />
        <div className="grid grid-cols-1 gap-5 p-5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-2 p-4">
            <div>
              <p className="text-sm font-semibold">Pausa geral</p>
              <p className="text-xs text-muted">Interrompe réguas e disparos imediatamente.</p>
            </div>
            <Switch checked={inst.pausado} onCheckedChange={(v) => pause.mutate(v)} aria-label="Pausar todos os envios" />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-semibold">Enviadas hoje</span>
              <span className="tabular text-muted">
                {inst.enviadasHoje} / {inst.limiteDiario}
              </span>
            </div>
            <Progress value={pct} />
          </div>
          <ul className="grid grid-cols-1 gap-2 text-sm text-muted">
            <li className="flex items-center gap-2">
              <Clock className="size-4 text-accent-text" /> Janela de envio: 8h às 20h
            </li>
            <li className="flex items-center gap-2">
              <Users className="size-4 text-accent-text" /> Respeita quem respondeu “SAIR” (opt-out)
            </li>
          </ul>
        </div>
      </Card>
      <PacingCard />
    </div>
  );
}

/* ---------- Ritmo dos disparos ---------- */
type PacingDraft = { min: string; max: string; lote: string; pausaH: string };
const toDraft = (p: MessagingPacing): PacingDraft => ({
  min: String(p.intervaloMinSeg),
  max: String(p.intervaloMaxSeg),
  lote: String(p.loteTamanho),
  pausaH: String(Math.round((p.lotePausaMin / 60) * 100) / 100).replace(".", ","),
});
function parseDraft(d: PacingDraft) {
  const n = (s: string) => Number(s.replace(",", "."));
  const p = { intervaloMinSeg: Math.round(n(d.min)), intervaloMaxSeg: Math.round(n(d.max)), loteTamanho: Math.round(n(d.lote)), lotePausaMin: Math.round(n(d.pausaH) * 60) };
  let erro: string | null = null;
  if (Object.values(p).some((v) => !Number.isFinite(v))) erro = "Preencha só com números.";
  else if (p.intervaloMinSeg < 5 || p.intervaloMaxSeg > 540) erro = "O intervalo vai de 5 a 540 segundos.";
  else if (p.intervaloMinSeg > p.intervaloMaxSeg) erro = "O mínimo não pode passar do máximo.";
  else if (p.loteTamanho < 1 || p.loteTamanho > 500) erro = "O lote vai de 1 a 500 mensagens.";
  else if (p.lotePausaMin < 0 || p.lotePausaMin > 1440) erro = "A pausa vai de 0 a 24 horas.";
  return { p, erro };
}
/** "110 contatos ≈ 5 lotes, término previsto 07/11/2026, 14:20" */
function estimateText(total: number, lotes: number, termino: string) {
  return `${total} ${total === 1 ? "contato" : "contatos"} ≈ ${lotes} ${lotes === 1 ? "lote" : "lotes"}, término previsto ${formatDateTime(termino)}`;
}

function PacingCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["messaging", "pacing"], queryFn: api.messaging.pacing });
  const [draft, setDraft] = useState<PacingDraft | null>(null);
  const [amostra, setAmostra] = useState("110");
  const base = q.data;
  const d = draft ?? (base ? toDraft(base) : null);
  const save = useMutation({
    mutationFn: (p: Partial<MessagingPacing>) => api.messaging.updatePacing(p),
    onSuccess: (p) => {
      qc.setQueryData(["messaging", "pacing"], p);
      setDraft(null);
      toast.success("Ritmo dos disparos salvo");
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });
  if (q.isError) return <Card className="lg:col-span-2"><ErrorState onRetry={() => q.refetch()} /></Card>;
  if (!base || !d) return <Skeleton className="h-56 rounded-[var(--radius-lg)] lg:col-span-2" />;
  const { p, erro } = parseDraft(d);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(base));
  const n = Math.max(0, Math.min(5000, Math.round(Number(amostra) || 0)));
  const est = !erro && n > 0 ? estimateSchedule(n, { ...base, ...p }, new Date(), base.enviadasHoje) : null;
  const set = (k: keyof PacingDraft) => (e: ChangeEvent<HTMLInputElement>) => setDraft({ ...d, [k]: e.target.value });

  return (
    <Card className="lg:col-span-2">
      <CardHeader icon={<Gauge />} title="Ritmo dos disparos" description="Vale para as réguas e o disparo em massa. O intervalo é sorteado a cada mensagem; depois de cada lote o envio pausa." />
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Intervalo mínimo (s)" htmlFor="p-min">
            <Input id="p-min" inputMode="numeric" value={d.min} onChange={set("min")} />
          </Field>
          <Field label="Intervalo máximo (s)" htmlFor="p-max">
            <Input id="p-max" inputMode="numeric" value={d.max} onChange={set("max")} />
          </Field>
          <Field label="Mensagens por lote" htmlFor="p-lote">
            <Input id="p-lote" inputMode="numeric" value={d.lote} onChange={set("lote")} />
          </Field>
          <Field label="Pausa entre lotes (h)" htmlFor="p-pausa">
            <Input id="p-pausa" inputMode="decimal" value={d.pausaH} onChange={set("pausaH")} />
          </Field>
          <p className={cn("col-span-2 text-xs sm:col-span-4", erro ? "text-danger" : "text-muted")} role={erro ? "alert" : undefined}>
            {erro ?? `Cada mensagem espera de ${p.intervaloMinSeg} a ${p.intervaloMaxSeg} s (sorteado). A cada ${p.loteTamanho} envios, pausa de ${d.pausaH} h. Só das ${base.janelaInicio}h às ${base.janelaFim}h, até ${base.limiteDiario} por dia.`}
          </p>
        </div>
        <div className="grid content-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <label htmlFor="p-amostra" className="text-[13px] font-semibold">
            Simular um disparo
          </label>
          <div className="flex items-center gap-2">
            <Input id="p-amostra" inputMode="numeric" value={amostra} onChange={(e) => setAmostra(e.target.value)} className="w-24" />
            <span className="text-sm text-muted">contatos a partir de agora</span>
          </div>
          <p className="text-sm font-medium" aria-live="polite">
            {est ? estimateText(est.total, est.lotes, est.terminoPrevisto) : "—"}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                Desfazer
              </Button>
            )}
            <Button size="sm" onClick={() => save.mutate(p)} loading={save.isPending} disabled={!dirty || !!erro}>
              Salvar ritmo
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- Réguas ---------- */
function RuleDialog({ rule, open, onOpenChange }: { rule: MessageRule | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<MessageRule | null>(rule);
  const [lastId, setLastId] = useState<string | null>(null);
  if (rule && rule.id !== lastId) {
    setDraft(rule);
    setLastId(rule.id);
  }
  const save = useMutation({
    mutationFn: () => api.messaging.updateRule(draft!.id, draft!),
    onSuccess: () => {
      toast.success("Régua salva");
      qc.invalidateQueries({ queryKey: ["messaging", "rules"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!draft) return null;
  const up = (p: Partial<MessageRule>) => setDraft({ ...draft, ...p });
  const formas: FormaPagamento[] = ["BOLETO", "CARNE", "CARTAO", "DEBITO", "PIX"];
  const showDays = draft.gatilho !== "ANIVERSARIO";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={draft.nome} description={`Gatilho: ${draft.descricaoGatilho}`} className="max-w-3xl">
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_300px]">
          <div className="grid content-start gap-5">
            <div className="grid grid-cols-1 gap-1.5">
              <Label htmlFor="rule-text">Texto da mensagem</Label>
              <TemplateEditor id="rule-text" value={draft.texto} onChange={(texto) => up({ texto })} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {showDays && (
                <Field label={draft.antecedenciaDias < 0 ? "Dias após o vencimento" : "Dias de antecedência"} htmlFor="rule-days">
                  <Input id="rule-days" type="number" min={0} max={60} value={Math.abs(draft.antecedenciaDias)} onChange={(e) => up({ antecedenciaDias: (draft.antecedenciaDias < 0 ? -1 : 1) * Number(e.target.value || 0) })} />
                </Field>
              )}
              <Field label="Horário de envio" htmlFor="rule-time" hint="Entre 8h e 20h">
                <Input id="rule-time" type="time" min="08:00" max="20:00" value={draft.horario} onChange={(e) => up({ horario: e.target.value })} />
              </Field>
            </div>
            {draft.gatilho !== "ANIVERSARIO" && draft.gatilho !== "RENOVACAO" && (
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold">Formas de pagamento</legend>
                <div className="flex flex-wrap gap-3">
                  {formas.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={draft.formasPagamento.includes(f)} onCheckedChange={(v) => up({ formasPagamento: v ? [...draft.formasPagamento, f] : draft.formasPagamento.filter((x) => x !== f) })} />
                      {FORMA_PAGAMENTO_LABEL[f]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-2 p-4">
              <span>
                <span className="block text-sm font-semibold">Régua ativa</span>
                <span className="block text-xs text-muted">Envio idempotente: no máximo 1 mensagem por parcela.</span>
              </span>
              <Switch checked={draft.ativo} onCheckedChange={(ativo) => up({ ativo })} />
            </label>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold">Prévia</p>
            <Bubble texto={renderTemplate(draft.texto, SAMPLE)} anexo={draft.anexarBoleto} />
            <p className="mt-2 text-xs text-subtle">Com dados de exemplo.</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            Salvar régua
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RulesTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["messaging", "rules"], queryFn: api.messaging.rules });
  const [editing, setEditing] = useState<MessageRule | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = useMutation({
    mutationFn: (r: MessageRule) => api.messaging.updateRule(r.id, { ativo: !r.ativo }),
    onMutate: (r) => qc.setQueryData<MessageRule[]>(["messaging", "rules"], (old) => old?.map((x) => (x.id === r.id ? { ...x, ativo: !x.ativo } : x))),
  });
  if (isError) return <Card><ErrorState onRetry={() => refetch()} /></Card>;
  if (isLoading) return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-56 rounded-[var(--radius-lg)]" />)}</div>;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data?.map((r, i) => {
          const Icon = TRIGGER_ICON[r.gatilho];
          return (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={cn("flex h-full flex-col p-5 transition-opacity", !r.ativo && "opacity-70")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("grid size-10 place-items-center rounded-xl", r.ativo ? "bg-gold-gradient text-ink-950" : "bg-sunken text-subtle")}>
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="font-semibold">{r.nome}</p>
                      <p className="text-xs text-muted">
                        {r.gatilho === "ANIVERSARIO" ? "No dia" : r.antecedenciaDias < 0 ? `D+${Math.abs(r.antecedenciaDias)}` : `${r.antecedenciaDias} dia(s) antes`} · {r.horario}
                        {r.formasPagamento.length > 0 && ` · ${r.formasPagamento.map((f) => FORMA_PAGAMENTO_LABEL[f].toLowerCase()).join(", ")}`}
                      </p>
                    </div>
                  </div>
                  <Switch checked={r.ativo} onCheckedChange={() => toggle.mutate(r)} aria-label={`${r.ativo ? "Desativar" : "Ativar"} ${r.nome}`} />
                </div>
                <p className="mt-4 line-clamp-3 flex-1 rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-muted">{r.texto}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {IS_DEMO ? (
                      <>
                        <strong className="font-bold text-foreground tabular">{r.enviadas30d}</strong> envios em 30 dias
                      </>
                    ) : (
                      "réguas rodam de hora em hora"
                    )}
                    {r.anexarBoleto && (
                      <Badge tone="gold" className="ml-2">
                        <Paperclip className="size-3" /> boleto
                      </Badge>
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                  >
                    <Pencil /> Editar
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
      <RuleDialog rule={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

/* ---------- CSV de contatos ---------- */
const CSV_MAX_MB = 5;
const CSV_MAX_CONTATOS = 5000;
/** Lê o arquivo como UTF-8; se não for UTF-8 válido (Excel antigo), cai para Latin-1/Windows-1252. */
async function readCsvText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}
function guessMapping(h: string[]): CsvMapping {
  const find = (re: RegExp) => h.findIndex((c) => re.test(columnVar(c)));
  const tel = find(/tel|cel|fone|whats|phone|contato/);
  const nome = find(/^nome|nome$|^name|cliente/);
  return { telefone: tel >= 0 ? tel : 0, nome: nome >= 0 && nome !== tel ? nome : null };
}
/** Mesmo preenchimento do servidor: {{nome}} = primeiro nome, {{nome_completo}}, qualquer coluna. */
function csvSampleVars(c: { nome: string; telefone: string; vars: Record<string, string> } | undefined): Record<string, string> {
  if (!c) return {};
  const completo = c.nome || c.vars.nome || "";
  const primeiro = completo.trim().split(/\s+/)[0] ?? "";
  return { ...c.vars, nome: primeiro ? primeiro[0]!.toUpperCase() + primeiro.slice(1).toLowerCase() : "", nome_completo: completo, telefone: c.telefone };
}
const renderCsv = (texto: string, vars: Record<string, string>) => texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k.toLowerCase()] ?? "");

function CsvSource({
  csv,
  onCsv,
  map,
  onMap,
  resumo,
}: {
  csv: { nome: string; table: CsvTable } | null;
  onCsv: (c: { nome: string; table: CsvTable } | null) => void;
  map: CsvMapping;
  onMap: (m: CsvMapping) => void;
  resumo: { validos: number; invalidos: number; duplicados: number } | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);
  const pick = async (f: File | undefined) => {
    if (ref.current) ref.current.value = "";
    if (!f) return;
    if (f.size > CSV_MAX_MB * 1024 * 1024) return toast.error(`O CSV passa de ${CSV_MAX_MB} MB`);
    setLendo(true);
    try {
      const table = parseCsv(await readCsvText(f));
      if (!table.cabecalho.length || !table.linhas.length) return toast.error("CSV vazio", { description: "A primeira linha deve ter os nomes das colunas e as demais, os contatos." });
      onCsv({ nome: f.name, table });
      onMap(guessMapping(table.cabecalho));
    } catch {
      toast.error("Não foi possível ler o CSV");
    } finally {
      setLendo(false);
    }
  };
  const h = csv?.table.cabecalho ?? [];
  return (
    <div className="grid grid-cols-1 gap-3 sm:col-span-2">
      <input ref={ref} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Planilha CSV de contatos" onChange={(e) => pick(e.target.files?.[0])} />
      {!csv ? (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="grid place-items-center gap-1.5 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-8 text-center transition-colors hover:border-gold-500"
        >
          <Upload className="size-6 text-accent-text" />
          <span className="text-sm font-semibold">{lendo ? "Lendo arquivo…" : "Escolher planilha CSV"}</span>
          <span className="text-xs text-muted">Primeira linha com os nomes das colunas. Separador ; ou , (UTF-8 ou Excel). Até {CSV_MAX_CONTATOS.toLocaleString("pt-BR")} contatos.</span>
        </button>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 text-accent-text" />
              <span className="truncate font-semibold">{csv.nome}</span>
              <span className="shrink-0 text-xs text-muted tabular">
                {csv.table.linhas.length} linhas · separador “{csv.table.separador === "\t" ? "tab" : csv.table.separador}”
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => onCsv(null)}>
              Trocar arquivo
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Coluna do telefone" htmlFor="csv-tel">
              <NativeSelect id="csv-tel" value={map.telefone} onChange={(e) => onMap({ ...map, telefone: Number(e.target.value) })}>
                {h.map((c, i) => (
                  <option key={i} value={i}>
                    {c || `Coluna ${i + 1}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Coluna do nome" htmlFor="csv-nome">
              <NativeSelect id="csv-nome" value={map.nome ?? -1} onChange={(e) => onMap({ ...map, nome: Number(e.target.value) < 0 ? null : Number(e.target.value) })}>
                <option value={-1}>Sem nome</option>
                {h.map((c, i) => (
                  <option key={i} value={i}>
                    {c || `Coluna ${i + 1}`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-max text-xs">
              <thead>
                <tr className="bg-surface-2 text-left">
                  {h.map((c, i) => (
                    <th key={i} className="px-3 py-2 font-semibold">
                      <span className="block">{c || `Coluna ${i + 1}`}</span>
                      <span className="block font-mono text-[10.5px] font-medium text-accent-text">
                        {i === map.telefone ? "telefone" : i === map.nome ? "nome" : `{{${columnVar(c)}}}`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {csv.table.linhas.slice(0, 5).map((l, r) => (
                  <tr key={r}>
                    {h.map((_, i) => (
                      <td key={i} className="max-w-[180px] truncate px-3 py-1.5 text-muted">
                        {l[i] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resumo && (
            <p className="text-xs text-muted" aria-live="polite">
              <strong className="font-bold text-foreground tabular">{resumo.validos}</strong> telefones válidos
              {resumo.invalidos > 0 && <> · {resumo.invalidos} inválidos (fora)</>}
              {resumo.duplicados > 0 && <> · {resumo.duplicados} repetidos (fora)</>}
              {resumo.validos > CSV_MAX_CONTATOS && <span className="text-danger"> · passa do limite de {CSV_MAX_CONTATOS.toLocaleString("pt-BR")} por disparo</span>}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- Disparo em massa ---------- */
function BroadcastTab() {
  const qc = useQueryClient();
  const insurers = useQuery({ queryKey: ["insurers"], queryFn: api.insurers.list });
  const templates = useQuery({ queryKey: ["messaging", "templates"], queryFn: api.messaging.templates });
  // Templates com boleto anexo só servem às réguas.
  const usable = useMemo(() => (templates.data ?? []).filter((t) => !t.anexarBoleto), [templates.data]);
  const [filtro, setFiltro] = useState<BroadcastFilter>({ status: "ATIVO", ramo: "TODOS", seguradora: "TODAS" });
  const [templateId, setTemplateId] = useState("");
  const tplId = templateId || usable[0]?.id || "";
  const tpl = usable.find((t) => t.id === tplId);
  // "template" = usa um template salvo; "nova" = mensagem personalizada escrita aqui
  const [modo, setModo] = useState<"template" | "nova">("template");
  const [novoNome, setNovoNome] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [salvarTemplate, setSalvarTemplate] = useState(true);
  const source: BroadcastSource | null =
    modo === "template" ? (tplId ? { templateId: tplId } : null) : novoTexto.trim() ? { conteudo: novoTexto.trim() } : null;
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  // Origem: clientes da carteira (filtro) ou contatos de uma planilha CSV.
  const [origem, setOrigem] = useState<"carteira" | "csv">("carteira");
  const [csv, setCsv] = useState<{ nome: string; table: CsvTable } | null>(null);
  const [map, setMap] = useState<CsvMapping>({ telefone: 0, nome: null });
  const [anexo, setAnexo] = useState<MessageAttachment | null>(null);
  const mapped = useMemo(() => (csv ? mapCsvContacts(csv.table, map) : null), [csv, map]);
  const csvVarNames = useMemo(() => {
    if (!csv) return [] as string[];
    const cols = csv.table.cabecalho.map(columnVar).filter((v, i) => i !== map.telefone && i !== map.nome && v !== "nome" && v !== "telefone");
    return [...(map.nome !== null ? ["nome", "nome_completo"] : []), "telefone", ...new Set(cols)];
  }, [csv, map]);
  const csvOk = origem === "carteira" || (!!mapped && mapped.contatos.length > 0 && mapped.contatos.length <= CSV_MAX_CONTATOS);
  const opts: BroadcastOptions = { anexoDocumentId: anexo?.documentId ?? null, ...(origem === "csv" && mapped ? { contatos: mapped.contatos } : {}) };
  const amostraVars = csvSampleVars(mapped?.contatos[0]);
  const reset = () => setPreview(null);
  const salvar = useMutation({
    mutationFn: () => api.messaging.createTemplate({ nome: novoNome.trim(), texto: novoTexto.trim() }),
    onSuccess: (t) => {
      toast.success("Template salvo", { description: `"${t.nome}" agora aparece na lista de templates.` });
      qc.invalidateQueries({ queryKey: ["messaging", "templates"] });
      setTemplateId(t.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const prev = useMutation({ mutationFn: () => api.messaging.broadcastPreview(filtro, source!, opts), onSuccess: setPreview, onError: (e: Error) => toast.error(e.message) });
  const send = useMutation({
    onError: (e: Error) => toast.error(e.message),
    mutationFn: async () => {
      // Mensagem nova com "salvar como template": salva (uma vez) e dispara pelo template salvo.
      if (modo === "nova" && salvarTemplate) {
        const t = salvar.data ?? (await salvar.mutateAsync());
        return api.messaging.broadcast(filtro, { templateId: t.id }, opts);
      }
      return api.messaging.broadcast(filtro, source!, opts);
    },
    onSuccess: (r) => {
      toast.success(`${r.enfileiradas} mensagens na fila`, {
        description: r.terminoPrevisto ? estimateText(r.enfileiradas, r.lotes, r.terminoPrevisto) : "Envio espaçado, só dentro da janela de envio.",
      });
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["messaging"] });
    },
  });
  const up = (p: Partial<BroadcastFilter>) => {
    setFiltro((f) => ({ ...f, ...p }));
    setPreview(null);
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader icon={<Filter />} title="Quem vai receber" description={origem === "csv" ? "Contatos de uma planilha; as colunas viram variáveis." : "Combine filtros da carteira."} />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div role="radiogroup" aria-label="Origem dos contatos" className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1 sm:col-span-2">
            {(
              [
                ["carteira", "Clientes da carteira", Users],
                ["csv", "Planilha CSV", FileSpreadsheet],
              ] as const
            ).map(([o, label, Icon]) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={origem === o}
                onClick={() => {
                  setOrigem(o);
                  reset();
                }}
                className={cn("flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors", origem === o ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          {origem === "csv" ? (
            <CsvSource
              csv={csv}
              onCsv={(c) => {
                setCsv(c);
                reset();
              }}
              map={map}
              onMap={(m) => {
                setMap(m);
                reset();
              }}
              resumo={mapped ? { validos: mapped.contatos.length, invalidos: mapped.invalidos, duplicados: mapped.duplicados } : null}
            />
          ) : (
          <>
          <Field label="Status" htmlFor="b-status">
            <NativeSelect id="b-status" value={filtro.status} onChange={(e) => up({ status: e.target.value as BroadcastFilter["status"] })}>
              <option value="TODOS">Todos</option>
              <option value="ATIVO">Ativos</option>
              <option value="INATIVO">Inativos</option>
            </NativeSelect>
          </Field>
          <Field label="Ramo" htmlFor="b-ramo">
            <NativeSelect id="b-ramo" value={filtro.ramo} onChange={(e) => up({ ramo: e.target.value as BroadcastFilter["ramo"] })}>
              <option value="TODOS">Todos os ramos</option>
              {RAMOS.map((r) => (
                <option key={r} value={r}>
                  {RAMO_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Seguradora" htmlFor="b-seg">
            <NativeSelect id="b-seg" value={filtro.seguradora} onChange={(e) => up({ seguradora: e.target.value })}>
              <option value="TODAS">Todas</option>
              {insurers.data?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </NativeSelect>
          </Field>
          </>
          )}
          <div className="grid grid-cols-1 gap-3 sm:col-span-2">
            <div role="radiogroup" aria-label="Mensagem do disparo" className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1">
              {(
                [
                  ["template", "Usar template"],
                  ["nova", "Criar mensagem"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modo === m}
                  onClick={() => {
                    setModo(m);
                    setPreview(null);
                  }}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
                    modo === m ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                  )}
                >
                  {m === "template" ? <ListOrdered className="size-4" /> : <Pencil className="size-4" />} {label}
                </button>
              ))}
            </div>

            {modo === "template" ? (
              <>
                <Field label="Template" htmlFor="b-tpl">
                  <NativeSelect
                    id="b-tpl"
                    value={tplId}
                    disabled={!usable.length}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      setPreview(null);
                    }}
                  >
                    {!usable.length && <option value="">{templates.isLoading ? "Carregando…" : "Nenhum template disponível"}</option>}
                    {usable.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-1 gap-1.5">
                  <p className="text-xs font-semibold text-muted">Texto do template</p>
                  <p className="whitespace-pre-line rounded-[10px] border border-border bg-surface-2 p-3 text-sm leading-relaxed">{tpl?.texto ?? "Escolha um template."}</p>
                  {origem === "csv" && tpl && /\{\{\s*(seguradora|apolice|valor|vencimento|placa)\s*\}\}/.test(tpl.texto) && (
                    <p className="text-xs text-warning">Este template usa dados da apólice; nos contatos do CSV essas variáveis ficam vazias, a não ser que exista uma coluna com o mesmo nome.</p>
                  )}
                  <p className="text-xs text-subtle">
                    Quer outro texto?{" "}
                    <button type="button" className="font-semibold text-accent-text hover:underline" onClick={() => setModo("nova")}>
                      Crie uma mensagem personalizada
                    </button>
                    .
                  </p>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                <Field
                  label="Mensagem"
                  htmlFor="b-novo-texto"
                  hint={origem === "csv" ? "As variáveis vêm das colunas da planilha ({{nome}} é o primeiro nome)." : "As variáveis são preenchidas com os dados de cada cliente (apólice vigente mais próxima do vencimento)."}
                >
                  <TemplateEditor
                    id="b-novo-texto"
                    rows={5}
                    vars={origem === "csv" && csv ? csvVarNames : VARS}
                    value={novoTexto}
                    onChange={(v) => {
                      setNovoTexto(v);
                      setPreview(null);
                      salvar.reset();
                    }}
                  />
                </Field>
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <Checkbox checked={salvarTemplate} onCheckedChange={(v) => setSalvarTemplate(v === true)} />
                  Salvar como template reutilizável
                </label>
                {salvarTemplate && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Field label="Nome do template" htmlFor="b-novo-nome">
                      <Input
                        id="b-novo-nome"
                        value={novoNome}
                        maxLength={80}
                        placeholder="Ex.: Revisão de fim de ano"
                        onChange={(e) => {
                          setNovoNome(e.target.value);
                          salvar.reset();
                        }}
                      />
                    </Field>
                    <Button
                      variant="outline"
                      onClick={() => salvar.mutate()}
                      loading={salvar.isPending}
                      disabled={novoNome.trim().length < 2 || !novoTexto.trim() || salvar.isSuccess}
                    >
                      {salvar.isSuccess ? "Salvo" : "Salvar template"}
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1.5">
                  <p className="text-xs font-semibold text-muted">{origem === "csv" && mapped?.contatos.length ? "Pré-visualização (1º contato da planilha)" : "Pré-visualização (dados de exemplo)"}</p>
                  {novoTexto.trim() ? (
                    <Bubble texto={origem === "csv" && mapped?.contatos.length ? renderCsv(novoTexto, amostraVars) : renderTemplate(novoTexto, SAMPLE)} anexo={anexo?.nome} />
                  ) : (
                    <p className="rounded-[10px] border border-dashed border-border p-3 text-sm text-subtle">Escreva a mensagem para ver como ela chega no WhatsApp.</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-1.5">
              <p className="text-[13px] font-semibold">Anexo para todos (opcional)</p>
              <AttachmentPicker
                value={anexo}
                onChange={(a) => {
                  setAnexo(a);
                  reset();
                }}
                label="Anexar documento"
              />
              <p className="text-xs text-subtle">O arquivo é guardado uma vez e vai junto de cada mensagem.</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => prev.mutate()} loading={prev.isPending} disabled={!source || !csvOk || (modo === "nova" && salvarTemplate && novoNome.trim().length < 2)}>
            Ver prévia
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader icon={<Send />} title="Prévia do disparo" description="Confira antes de enfileirar." />
        <div className="flex-1 p-5">
          {!preview ? (
            <EmptyState icon={<Send />} title="Monte o filtro e clique em Ver prévia" description="Mostramos quantas pessoas recebem e como a mensagem chega." />
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-accent-soft p-3">
                  <p className="text-xs font-semibold text-muted">Destinatários</p>
                  <p className="font-display text-3xl font-bold tabular text-accent-text">{preview.total}</p>
                </div>
                <div className="rounded-xl bg-sunken p-3">
                  <p className="text-xs font-semibold text-muted">Opt-out (fora)</p>
                  <p className="font-display text-3xl font-bold tabular">{preview.optOut}</p>
                </div>
                <div className="rounded-xl bg-sunken p-3">
                  <p className="text-xs font-semibold text-muted">Lotes</p>
                  <p className="font-display text-3xl font-bold tabular">{preview.lotes}</p>
                </div>
              </div>
              {preview.total > 0 && (
                <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-sm">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-accent-text" />
                  <span>
                    {estimateText(preview.total, preview.lotes, preview.terminoPrevisto)}
                    <span className="block text-xs text-muted">Começa {formatDateTime(preview.inicioPrevisto)}. Estimativa pelo intervalo médio; o sorteio real muda alguns minutos.</span>
                  </span>
                </p>
              )}
              {(preview.invalidos > 0 || preview.duplicados > 0) && (
                <p className="text-xs text-muted">
                  Fora do disparo: {preview.invalidos} telefone(s) inválido(s) e {preview.duplicados} repetido(s).
                </p>
              )}
              {origem === "csv" && mapped?.contatos[0] && source && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted">
                    Para {mapped.contatos[0].nome || "o 1º contato"} · {formatPhone(mapped.contatos[0].telefone)}
                  </p>
                  <Bubble texto={renderCsv("conteudo" in source ? source.conteudo : (tpl?.texto ?? ""), amostraVars)} anexo={anexo?.nome} />
                </div>
              )}
              {preview.amostra.slice(0, 2).map((a) => (
                <div key={a.clientId}>
                  <p className="mb-1 text-xs font-semibold text-muted">
                    Para {a.nome}
                    {a.telefone ? ` · ${formatPhone(a.telefone)}` : ""}
                  </p>
                  <Bubble texto={a.texto} anexo={anexo?.nome} />
                </div>
              ))}
            </motion.div>
          )}
        </div>
        {preview && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <p className="text-xs text-muted">Envio só dentro da janela, com intervalo sorteado e pausa entre lotes.</p>
            <Button variant="gold" onClick={() => send.mutate()} loading={send.isPending} disabled={preview.total === 0}>
              Enfileirar {preview.total} mensagens
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Fila e histórico ---------- */
function QueueTab() {
  const queue = useQuery({ queryKey: ["messaging", "queue"], queryFn: api.messaging.queue, refetchInterval: 10000 });
  const hist = useQuery({ queryKey: ["messaging", "history"], queryFn: api.messaging.history });
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.4fr]">
      <Card className="flex flex-col">
        <CardHeader icon={<ListOrdered />} title="Fila" description={queue.data ? `${queue.data.length} aguardando envio` : "…"} />
        <ul className="scrollbar-thin max-h-[560px] divide-y divide-border overflow-y-auto pt-3">
          {queue.isLoading && <Skeleton className="m-5 h-40" />}
          {queue.data?.length === 0 && <EmptyState icon={<CheckCheck />} title="Fila vazia" description="Tudo enviado por enquanto." />}
          {queue.data?.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-xs font-bold tabular text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.clientNome}</p>
                <p className="truncate text-xs text-muted">{m.regra}</p>
              </div>
              <div className="text-right">
                <MessageStatusBadge status={m.status} />
                {m.agendadoPara && <p className="mt-0.5 text-[11px] text-subtle">{formatRelative(m.agendadoPara)}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col overflow-hidden">
        <CardHeader icon={<History />} title="Histórico" description="Últimos envios" />
        <div className="scrollbar-thin mt-3 max-h-[560px] overflow-auto">
          {hist.isLoading && <Skeleton className="m-5 h-40" />}
          {hist.isError && <ErrorState onRetry={() => hist.refetch()} />}
          {hist.data?.length === 0 && <EmptyState icon={<History />} title="Nenhum envio ainda" description="Quando as réguas ou um disparo rodarem, cada mensagem aparece aqui com o status." />}
          {!!hist.data?.length && (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y border-border bg-surface-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Régua</th>
                <th className="px-4 py-2.5">Enviada</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hist.data?.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[200px] truncate font-semibold">{m.clientNome}</span>
                    <span className="text-xs text-muted tabular">{formatPhone(m.telefone)}</span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2.5 text-muted">{m.regra ?? "Manual"}</td>
                  <td className="px-4 py-2.5 text-muted tabular">{formatDateTime(m.enviadoEm ?? m.criadoEm)}</td>
                  <td className="px-4 py-2.5">
                    <MessageStatusBadge status={m.status} />
                    {m.erro && <span className="block text-[11px] text-danger">{m.erro}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      </Card>
    </div>
  );
}

export default function DisparosPage() {
  const [tab, setTab] = useState("conexao");
  return (
    <>
      <PageHeader eyebrow="WhatsApp" title="Disparos" description="Conexão do número, réguas automáticas de cobrança e aniversário, envios em massa e acompanhamento da fila." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        layoutId="disp-tabs"
        items={[
          { value: "conexao", label: "Conexão" },
          { value: "reguas", label: "Réguas" },
          { value: "massa", label: "Disparo em massa" },
          { value: "fila", label: "Fila e histórico" },
        ]}
      >
        <div className="pt-5">
          <TabsContent value="conexao">
            <ConnectionTab />
          </TabsContent>
          <TabsContent value="reguas">
            <RulesTab />
          </TabsContent>
          <TabsContent value="massa">
            <BroadcastTab />
          </TabsContent>
          <TabsContent value="fila">
            <QueueTab />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

