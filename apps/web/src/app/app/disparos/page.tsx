"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Cake,
  CalendarClock,
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
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Checkbox, EmptyState, ErrorState, Field, Input, Label, NativeSelect, Progress, Skeleton, Switch, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, Tabs, TabsContent } from "@/components/ui/overlays";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";
import { api, IS_DEMO } from "@/lib/api";
import { FORMA_PAGAMENTO_LABEL, RAMOS, RAMO_LABEL, type BroadcastFilter, type BroadcastPreview, type FormaPagamento, type MessageRule, type RuleTrigger } from "@/lib/types";
import { cn, formatDateTime, formatPhone, formatRelative, renderTemplate } from "@/lib/utils";

const VARS = ["nome", "seguradora", "apolice", "valor", "vencimento", "placa"] as const;
const SAMPLE: Record<string, string> = { nome: "Juliana", seguradora: "Porto Seguro", apolice: "POR5531907", valor: "R$ 384,22", vencimento: "16/11/2026", placa: "RTA4E21" };
const TRIGGER_ICON: Record<RuleTrigger, typeof Clock> = { PRIMEIRA_PARCELA: Receipt, PROBLEMA_SEM_BOLETO: AlertTriangle, PROBLEMA_COM_BOLETO: Paperclip, ANIVERSARIO: Cake, RENOVACAO: CalendarClock };

/* ---------- Bolha de prévia ---------- */
function Bubble({ texto, anexo }: { texto: string; anexo?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#efe9df] p-4 dark:bg-[#0b141a]">
      <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
        {anexo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs font-semibold dark:bg-white/10">
            <Paperclip className="size-3.5" /> boleto.pdf
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
function TemplateEditor({ id, value, onChange, rows = 5 }: { id: string; value: string; onChange: (v: string) => void; rows?: number }) {
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
        {VARS.map((v) => (
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
              <RefreshCw className="size-4 text-accent-text" /> Intervalo aleatório de 20 a 60 s entre mensagens
            </li>
            <li className="flex items-center gap-2">
              <Users className="size-4 text-accent-text" /> Respeita quem respondeu “SAIR” (opt-out)
            </li>
          </ul>
        </div>
      </Card>
    </div>
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
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const prev = useMutation({ mutationFn: () => api.messaging.broadcastPreview(filtro, tplId), onSuccess: setPreview, onError: (e: Error) => toast.error(e.message) });
  const send = useMutation({
    onError: (e: Error) => toast.error(e.message),
    mutationFn: () => api.messaging.broadcast(filtro, tplId),
    onSuccess: (r) => {
      toast.success(`${r.enfileiradas} mensagens na fila`, { description: "Envio espaçado de 20 a 60 s, das 8h às 20h." });
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
        <CardHeader icon={<Filter />} title="Quem vai receber" description="Combine filtros da carteira." />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
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
          <Field label="Mensagem (template)" htmlFor="b-tpl">
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
          <div className="grid grid-cols-1 gap-1.5 sm:col-span-2">
            <p className="text-xs font-semibold text-muted">Texto do template</p>
            <p className="whitespace-pre-line rounded-[10px] border border-border bg-surface-2 p-3 text-sm leading-relaxed">{tpl?.texto ?? "Escolha um template."}</p>
            <p className="text-xs text-subtle">Para mudar o texto, edite a régua correspondente na aba Réguas.</p>
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => prev.mutate()} loading={prev.isPending} disabled={!tplId}>
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
                  <p className="text-xs font-semibold text-muted">Duração est.</p>
                  <p className="font-display text-3xl font-bold tabular">
                    {preview.estimativaMin}
                    <span className="text-base"> min</span>
                  </p>
                </div>
              </div>
              {preview.amostra.slice(0, 2).map((a) => (
                <div key={a.clientId}>
                  <p className="mb-1 text-xs font-semibold text-muted">
                    Para {a.nome}
                    {a.telefone ? ` · ${formatPhone(a.telefone)}` : ""}
                  </p>
                  <Bubble texto={a.texto} />
                </div>
              ))}
            </motion.div>
          )}
        </div>
        {preview && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
            <p className="text-xs text-muted">Envio só entre 8h e 20h, com intervalos aleatórios.</p>
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

