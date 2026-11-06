"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  FileUp,
  Link2,
  Loader2,
  RotateCcw,
  ScanText,
  ShieldCheck,
  Sparkles,
  UserRound,
  Car,
  CreditCard,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { ConfidenceSeal } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Card, Input, Switch } from "@/components/ui/primitives";
import { api, ApiError, IS_DEMO } from "@/lib/api";
import type { ParseResult, ParsedField } from "@/lib/types";
import { RAMO_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

type Stage = "upload" | "reading" | "review" | "saved";

const STEPS = [
  { id: "up", label: "Recebendo o PDF", detail: "arquivo criptografado em trânsito" },
  { id: "ins", label: "Identificando a seguradora", detail: "layout e cabeçalho" },
  { id: "cli", label: "Lendo dados do segurado", detail: "nome, CPF, contato, endereço" },
  { id: "pol", label: "Lendo apólice e item", detail: "vigência, prêmio, veículo" },
  { id: "conf", label: "Calculando confiança", detail: "campo a campo" },
];

const GROUPS: { id: ParsedField["grupo"]; label: string; icon: typeof UserRound }[] = [
  { id: "cliente", label: "Segurado", icon: UserRound },
  { id: "apolice", label: "Apólice", icon: ShieldCheck },
  { id: "item", label: "Item segurado", icon: Car },
  { id: "pagamento", label: "Pagamento", icon: CreditCard },
];

/* ---------------- Dropzone ---------------- */
function Dropzone({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const accept = (f: File | undefined | null) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setErr("Envie um arquivo PDF (apólice, proposta ou endosso).");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setErr("Arquivo acima de 20 MB. Tente uma versão compactada.");
      return;
    }
    setErr(null);
    onFile(f);
  };

  const useSample = async () => {
    const blob = await fetch("/demo/apolice-demo.pdf").then((r) => r.blob());
    accept(new File([blob], "Apolice_Auto_exemplo.pdf", { type: "application/pdf" }));
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <motion.label
        htmlFor="pdf-input"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        animate={{ scale: over ? 1.01 : 1 }}
        className={cn(
          "group relative flex min-h-[340px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[var(--radius-xl)] border-2 border-dashed px-6 py-12 text-center transition-colors",
          over ? "border-gold-500 bg-accent-soft" : "border-border-strong bg-surface hover:border-gold-500/60",
        )}
      >
        <div className={cn("pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100", over && "opacity-100")} aria-hidden>
          <div className="absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(238,189,37,0.18),transparent_60%)]" />
        </div>
        <motion.div animate={over ? { y: -6, rotate: -4 } : { y: 0, rotate: 0 }} className="relative">
          <div className="absolute -inset-3 rounded-3xl bg-gold-gradient opacity-20 blur-xl" aria-hidden />
          <div className="relative grid size-20 place-items-center rounded-2xl bg-ink-950 text-gold-400 shadow-[var(--shadow-lift)] ring-1 ring-gold-500/30">
            <UploadCloud className="size-9" />
          </div>
        </motion.div>
        <p className="relative mt-6 font-display text-3xl font-semibold">{over ? "Pode soltar!" : "Arraste o PDF da apólice"}</p>
        <p className="relative mt-2 max-w-md text-[15px] text-muted">
          A gente lê o documento, preenche o cadastro e mostra a confiança de cada campo para você revisar. <span className="font-semibold text-foreground">ou clique para escolher</span>
        </p>
        <p className="relative mt-4 text-xs text-subtle">PDF até 20 MB · Porto, Allianz, Tokio, HDI, Azul, Mapfre, Yelum e outras</p>
        <input ref={input} id="pdf-input" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => accept(e.target.files?.[0])} />
      </motion.label>
      {err && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {err}
        </p>
      )}
      {IS_DEMO && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          Sem um PDF à mão?
          <Button variant="outline" size="sm" onClick={useSample}>
            <Sparkles /> Usar apólice de exemplo
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Animação de leitura ---------------- */
const DOC_LINES = [
  { w: "62%", h: 10, gap: 18, bold: true },
  { w: "40%", h: 6, gap: 22 },
  { w: "88%", h: 6, gap: 10, field: "cliente" },
  { w: "70%", h: 6, gap: 10, field: "cliente" },
  { w: "78%", h: 6, gap: 22, field: "cliente" },
  { w: "52%", h: 8, gap: 12, bold: true },
  { w: "84%", h: 6, gap: 10, field: "apolice" },
  { w: "66%", h: 6, gap: 22, field: "apolice" },
  { w: "48%", h: 8, gap: 12, bold: true },
  { w: "90%", h: 6, gap: 10, field: "item" },
  { w: "58%", h: 6, gap: 22, field: "item" },
  { w: "74%", h: 6, gap: 10, field: "pagamento" },
  { w: "36%", h: 6, gap: 10 },
];

function ReadingAnimation({ fileName, step, foundFields, seguradora }: { fileName: string; step: number; foundFields: ParsedField[]; seguradora: string | null }) {
  const reduce = useReducedMotion();
  const activeGroup = step >= 3 ? ["cliente", "apolice", "item", "pagamento"] : step >= 2 ? ["cliente"] : [];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Documento sendo escaneado */}
      <div className="relative mx-auto w-full max-w-[420px]">
        <div className="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle,rgba(238,189,37,0.18),transparent_65%)] blur-xl" aria-hidden />
        <motion.div
          initial={{ rotateX: 18, y: 30, opacity: 0 }}
          animate={{ rotateX: 0, y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1200 }}
          className="relative aspect-[1/1.32] overflow-hidden rounded-2xl border border-border bg-[#fffdf8] p-7 shadow-[var(--shadow-lift)] dark:bg-[#f4efe4]"
        >
          <div className="mb-6 flex items-center justify-between">
            <div className="h-3 w-24 rounded bg-ink-900/80" />
            <AnimatePresence>
              {step >= 1 && seguradora && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="rounded-full bg-ink-950 px-2.5 py-1 text-[10px] font-bold text-gold-300">
                  {seguradora}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {DOC_LINES.map((l, i) => {
            const hit = l.field && activeGroup.includes(l.field);
            return (
              <div key={i} className="relative" style={{ marginBottom: l.gap }}>
                <div className={cn("rounded-full", l.bold ? "bg-ink-900/70" : "bg-ink-900/15")} style={{ width: l.w, height: l.h }} />
                <AnimatePresence>
                  {hit && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0.3 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ duration: 0.35, delay: (i % 4) * 0.08 }}
                      className="absolute -inset-x-1.5 -inset-y-1 origin-left rounded-md border border-gold-500 bg-gold-400/25"
                      style={{ width: `calc(${l.w} + 12px)` }}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {/* feixe dourado */}
          {!reduce && step < 5 && (
            <motion.div
              className="pointer-events-none absolute inset-x-0 h-24"
              initial={{ top: "-15%" }}
              animate={{ top: ["-15%", "100%"] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
            >
              <div className="h-full w-full bg-gradient-to-b from-transparent via-gold-400/25 to-transparent" />
              <div className="absolute inset-x-0 top-1/2 h-[2px] bg-gold-400 shadow-[0_0_18px_4px_rgba(238,189,37,0.65)]" />
            </motion.div>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-ink-900/10 bg-white/60 px-4 py-2 text-[11px] font-semibold text-ink-900/70 backdrop-blur">
            <FileText className="size-3.5" /> <span className="truncate">{fileName}</span>
          </div>
        </motion.div>
      </div>

      {/* Etapas + campos encontrados */}
      <div className="grid content-start gap-5">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm font-bold">
            <ScanText className="size-4 text-accent-text" /> Lendo o documento
          </p>
          <ol className="mt-4 grid gap-3" aria-live="polite">
            {STEPS.map((s, i) => {
              const done = step > i;
              const active = step === i;
              return (
                <li key={s.id} className="flex items-center gap-3">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border transition-colors", done ? "border-transparent bg-gold-gradient text-ink-950" : active ? "border-gold-500 text-accent-text" : "border-border text-subtle")}>
                    {done ? (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <Check className="size-4" strokeWidth={3} />
                      </motion.span>
                    ) : active ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <span className="text-xs font-bold">{i + 1}</span>
                    )}
                  </span>
                  <span className={cn("text-sm", done || active ? "font-semibold text-foreground" : "text-muted")}>
                    {s.label}
                    {i === 1 && done && seguradora && <span className="ml-2 font-bold text-accent-text">· {seguradora}</span>}
                    <span className="block text-xs font-normal text-subtle">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <AnimatePresence>
            {foundFields.map((f) => (
              <motion.div
                key={f.chave}
                layout
                initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-muted">{f.rotulo}</span>
                  <span className="block truncate text-sm font-semibold">{f.valor}</span>
                </span>
                <ConfidenceSeal value={f.confianca} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Revisão ---------------- */
function Review({
  result,
  values,
  setValue,
  fileUrl,
  attach,
  setAttach,
  onSave,
  saving,
  onRestart,
}: {
  result: ParseResult;
  values: Record<string, string>;
  setValue: (k: string, v: string) => void;
  fileUrl: string | null;
  attach: boolean;
  setAttach: (v: boolean) => void;
  onSave: () => void;
  saving: boolean;
  onRestart: () => void;
}) {
  const counts = useMemo(() => {
    const c = { alto: 0, medio: 0, baixo: 0 };
    result.campos.forEach((f) => (f.confianca >= 0.65 ? c.alto++ : f.confianca >= 0.4 ? c.medio++ : c.baixo++));
    return c;
  }, [result]);
  const [showPdf, setShowPdf] = useState(true);

  return (
    <div className="grid grid-cols-1 gap-5">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-gold-500/30 bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-gold-gradient text-ink-950">
            <CheckCircle2 className="size-6" />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold leading-tight">
              {result.campos.length} campos lidos em {(result.duracaoMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s
            </p>
            <p className="text-sm text-muted">
              {result.seguradora ?? "Seguradora não identificada"} · {result.ramo ? RAMO_LABEL[result.ramo] : "ramo não identificado"} · {result.paginas} páginas — revise os destaques em amarelo e vermelho.
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-xs font-bold">
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">{counts.alto} alta</span>
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-warning">{counts.medio} média</span>
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">{counts.baixo} baixa</span>
        </div>
      </motion.div>

      {result.clienteExistente && (
        <div className="flex flex-col gap-3 rounded-xl border border-info/25 bg-info-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm">
            <Link2 className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              Este CPF já pertence a <strong>{result.clienteExistente.nome}</strong>. Anexar a apólice a esse cadastro em vez de criar um novo?
            </span>
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Switch checked={attach} onCheckedChange={setAttach} aria-label="Anexar ao cliente existente" /> Anexar
          </label>
        </div>
      )}

      <div className={cn("grid gap-5", showPdf && fileUrl && "xl:grid-cols-[1fr_460px]")}>
        <div className="grid content-start gap-4">
          {GROUPS.map((g) => {
            const fields = result.campos.filter((f) => f.grupo === g.id);
            if (!fields.length) return null;
            const Icon = g.icon;
            return (
              <Card key={g.id} className="p-5">
                <p className="mb-4 flex items-center gap-2 text-sm font-bold">
                  <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent-text">
                    <Icon className="size-4" />
                  </span>
                  {g.label}
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {fields.map((f, i) => {
                    const low = f.confianca < 0.4;
                    const mid = !low && f.confianca < 0.65;
                    return (
                      <motion.div key={f.chave} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className={cn("grid gap-1.5", f.chave === "endereco" && "sm:col-span-2")}>
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor={`f-${f.chave}`} className="text-[13px] font-semibold">
                            {f.rotulo}
                          </label>
                          <ConfidenceSeal value={f.confianca} />
                        </div>
                        <Input
                          id={`f-${f.chave}`}
                          value={values[f.chave] ?? ""}
                          onChange={(e) => setValue(f.chave, e.target.value)}
                          className={cn(low && "border-danger/60 bg-danger-soft/40", mid && "border-warning/50 bg-warning-soft/40")}
                        />
                        {low && <p className="text-xs font-medium text-danger">Confira no PDF — leitura incerta.</p>}
                      </motion.div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
        {showPdf && fileUrl && (
          <div className="hidden xl:block">
            <div className="sticky top-24">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold">Documento original</p>
                <Button variant="ghost" size="sm" onClick={() => setShowPdf(false)}>
                  Ocultar
                </Button>
              </div>
              <iframe src={`${fileUrl}#view=FitH&toolbar=0`} title="PDF enviado" className="h-[calc(100dvh-170px)] w-full rounded-xl border border-border bg-sunken" />
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-[var(--shadow-lift)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onRestart}>
          <RotateCcw /> Enviar outro PDF
        </Button>
        <Button variant="gold" size="lg" onClick={onSave} loading={saving}>
          {saving ? "Salvando…" : attach && result.clienteExistente ? "Anexar ao cliente" : "Salvar cliente e apólice"}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Página ---------------- */
export default function NewClientFromPdfPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [found, setFound] = useState<ParsedField[]>([]);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [attach, setAttach] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => () => void (fileUrl && URL.revokeObjectURL(fileUrl)), [fileUrl]);

  const start = useCallback(
    async (f: File) => {
      setFile(f);
      setFileUrl(URL.createObjectURL(f));
      setStage("reading");
      setStep(0);
      setFound([]);
      const tick = reduce ? 60 : 620;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        const parsing = api.documents.parse(f);
        await sleep(tick);
        setStep(1);
        const res = await parsing;
        setResult(res);
        await sleep(tick);
        setStep(2);
        const show = async (grupo: ParsedField["grupo"][]) => {
          for (const fld of res.campos.filter((c) => grupo.includes(c.grupo))) {
            setFound((prev) => [...prev, fld]);
            await sleep(reduce ? 0 : 110);
          }
        };
        await show(["cliente"]);
        setStep(3);
        await show(["apolice", "item", "pagamento"]);
        setStep(4);
        await sleep(tick);
        setStep(5);
        await sleep(reduce ? 0 : 450);
        setValues(Object.fromEntries(res.campos.map((c) => [c.chave, c.valor])));
        setAttach(!!res.clienteExistente);
        setStage("review");
      } catch (e) {
        toast.error("Não conseguimos ler este PDF", { description: e instanceof ApiError ? e.message : "Tente outro arquivo ou cadastre manualmente." });
        setStage("upload");
      }
    },
    [reduce],
  );

  const save = useMutation({
    mutationFn: () =>
      api.clients.fromPdf({ documentId: result!.documentId, campos: values, anexarAoCliente: attach && result?.clienteExistente ? result.clienteExistente.id : null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
      setSavedId(r.clientId);
      setStage("saved");
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const restart = () => {
    setStage("upload");
    setResult(null);
    setFile(null);
    setFound([]);
  };

  return (
    <>
      <Link href="/app/clientes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <PageHeader
        eyebrow="Cadastro inteligente"
        title={
          <>
            Novo cliente <span className="italic text-accent-text">a partir do PDF</span>
          </>
        }
        description="Envie a apólice, confira o que foi lido e salve. Nada é gravado sem a sua revisão."
      />

      <AnimatePresence mode="wait">
        {stage === "upload" && (
          <motion.div key="up" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Dropzone onFile={start} />
          </motion.div>
        )}
        {stage === "reading" && file && (
          <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <ReadingAnimation fileName={file.name} step={step} foundFields={found} seguradora={result?.seguradora ?? null} />
          </motion.div>
        )}
        {stage === "review" && result && (
          <motion.div key="rev" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Review result={result} values={values} setValue={(k, v) => setValues((p) => ({ ...p, [k]: v }))} fileUrl={fileUrl} attach={attach} setAttach={setAttach} onSave={() => save.mutate()} saving={save.isPending} onRestart={restart} />
          </motion.div>
        )}
        {stage === "saved" && (
          <motion.div key="ok" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
            <Card className="relative overflow-hidden px-6 py-14 text-center">
              <div className="absolute left-1/2 top-0 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(238,189,37,0.25),transparent_65%)]" aria-hidden />
              <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 220, damping: 16 }} className="relative mx-auto grid size-20 place-items-center rounded-full bg-gold-gradient text-ink-950 shadow-[0_16px_40px_-12px_rgba(216,162,24,0.8)]">
                <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <motion.path d="M5 12.5 10 17 19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5 }} />
                </svg>
              </motion.div>
              <p className="relative mt-6 font-display text-4xl font-semibold">{attach && result?.clienteExistente ? "Apólice anexada!" : "Cliente cadastrado!"}</p>
              <p className="relative mx-auto mt-2 max-w-md text-muted">
                {values.nome} já está na carteira, com apólice, parcelas e o PDF guardado. As réguas de cobrança passam a valer automaticamente.
              </p>
              <div className="relative mt-8 flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={restart}>
                  <FileUp /> Cadastrar outro
                </Button>
                <Button variant="gold" onClick={() => savedId && router.push(`/app/clientes/${savedId}`)}>
                  Abrir ficha do cliente
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
