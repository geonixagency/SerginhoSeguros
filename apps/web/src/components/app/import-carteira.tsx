"use client";

/**
 * Importar carteira (só ADMIN).
 * 1) PDFs: .zip com a pasta base/seguradora (ou PDFs soltos), um arquivo por requisição.
 * 2) clients.json + policies.json do extrator: roda em segundo plano no servidor, com progresso.
 * Reimportar é seguro: clientes casam pela pasta (nome da pasta = cliente; o CPF pode repetir), apólices por seguradora + número, PDFs pelo caminho/hash.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Database, FileArchive, FileJson, FlaskConical, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, Checkbox, Field, Input, Progress } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import type { ImportJob, ImportStats, PdfBatchStats } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_FILE = 60 * 1024 * 1024; // igual ao limite do servidor
const nf = new Intl.NumberFormat("pt-BR");
const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
const somar = (a: PdfBatchStats, b: PdfBatchStats): PdfBatchStats => ({
  recebidos: a.recebidos + b.recebidos,
  gravados: a.gravados + b.gravados,
  iguais: a.iguais + b.iguais,
  substituidos: a.substituidos + b.substituidos,
  semDestino: a.semDestino + b.semDestino,
  invalidos: a.invalidos + b.invalidos,
});
const ZERO: PdfBatchStats = { recebidos: 0, gravados: 0, iguais: 0, substituidos: 0, semDestino: 0, invalidos: 0 };

type PdfRun = { total: number; feitos: number; bytesTotal: number; bytesFeitos: number; atual: string | null; stats: PdfBatchStats; falhas: { nome: string; erro: string }[]; fim: boolean };

export function ImportCarteira() {
  const qc = useQueryClient();
  const estado = useQuery({ queryKey: ["import-estado"], queryFn: () => api.importacao.estado(), refetchOnWindowFocus: false });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader icon={<Database />} title="Importar carteira" description="Traga os PDFs e as planilhas do extrator para o sistema. Pode repetir: nada é duplicado." />
        <div className="grid gap-4 p-5">
          <ol className="grid gap-2 text-sm text-muted sm:grid-cols-3">
            {["Envie os PDFs (.zip com a pasta seguradora ou PDFs soltos).", "Envie clients.json e policies.json. Dá para simular antes.", "Mandou mais PDFs depois? Rode o passo 2 de novo para ligá-los."].map((t, i) => (
              <li key={t} className="flex gap-2 rounded-xl border border-border bg-surface-2 p-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-gradient text-xs font-bold text-ink-950">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: "Clientes", v: estado.data?.clientes },
              { l: "Apólices", v: estado.data?.apolices },
              { l: "Documentos", v: estado.data?.documentos },
              { l: "PDFs no índice", v: estado.data?.indicePdfs },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-border p-3">
                <dt className="text-xs font-semibold text-muted">{s.l}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular">{s.v === undefined ? "–" : nf.format(s.v)}</dd>
              </div>
            ))}
          </dl>
          {estado.data?.importacaoEmAndamento && (
            <p className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="size-4" /> Há uma importação em andamento no servidor.
            </p>
          )}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PdfUpload onDone={() => qc.invalidateQueries({ queryKey: ["import-estado"] })} />
        <JsonImport onDone={() => qc.invalidateQueries()} />
      </div>
      <LimparCarteira emAndamento={Boolean(estado.data?.importacaoEmAndamento)} onDone={() => qc.invalidateQueries()} />
    </div>
  );
}

/* ---------------- Passo 1: PDFs ---------------- */
function PdfUpload({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [run, setRun] = useState<PdfRun | null>(null);
  const cancel = useRef(false);
  const busy = !!run && !run.fim;
  const totalBytes = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files]);
  const grandes = files.filter((f) => f.size > MAX_FILE);

  async function enviar() {
    const fila = files.filter((f) => f.size <= MAX_FILE);
    if (!fila.length) return;
    cancel.current = false;
    let st: PdfRun = { total: fila.length, feitos: 0, bytesTotal: fila.reduce((a, f) => a + f.size, 0), bytesFeitos: 0, atual: null, stats: ZERO, falhas: [], fim: false };
    setRun(st);
    for (const f of fila) {
      if (cancel.current) break;
      st = { ...st, atual: f.name };
      setRun(st);
      try {
        const r = await api.importacao.pdfs([f]);
        st = { ...st, stats: somar(st.stats, r) };
      } catch (e) {
        st = { ...st, falhas: [...st.falhas, { nome: f.name, erro: e instanceof Error ? e.message : "falha" }] };
      }
      st = { ...st, feitos: st.feitos + 1, bytesFeitos: st.bytesFeitos + f.size };
      setRun(st);
    }
    st = { ...st, atual: null, fim: true };
    setRun(st);
    onDone();
    if (st.falhas.length) toast.error(`${st.falhas.length} arquivo(s) não foram enviados`, { description: "Veja a lista e envie esses de novo." });
    else toast.success("PDFs enviados", { description: `${nf.format(st.stats.gravados)} gravados, ${nf.format(st.stats.iguais)} já existiam.` });
  }

  const pct = run ? (run.bytesTotal ? (run.bytesFeitos / run.bytesTotal) * 100 : 100) : 0;

  return (
    <Card>
      <CardHeader icon={<FileArchive />} title="1. PDFs da carteira" description="Arquivos .zip (até 60 MB cada) ou PDFs soltos. Vários de uma vez." />
      <div className="grid gap-4 p-5">
        <label className={cn("grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-border-strong p-6 text-center transition-colors hover:border-gold-500 hover:bg-accent-soft/40", busy && "pointer-events-none opacity-60")}>
          <Upload className="size-6 text-accent-text" />
          <span className="text-sm font-semibold">Escolher .zip ou .pdf</span>
          <span className="text-xs text-muted">Dentro do zip: seguradora/&lt;cliente&gt;/arquivo.pdf</span>
          <input
            type="file"
            multiple
            accept=".zip,.pdf,application/zip,application/pdf"
            className="sr-only"
            aria-label="Arquivos de PDF ou zip"
            disabled={busy}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setRun(null);
            }}
          />
        </label>
        {files.length > 0 && (
          <p className="text-sm">
            <strong>{nf.format(files.length)}</strong> arquivo(s) · {mb(totalBytes)}
            {grandes.length > 0 && <span className="text-danger"> · {grandes.length} acima de 60 MB serão ignorados</span>}
          </p>
        )}
        {run && (
          <div className="grid gap-2" aria-live="polite">
            <div className="flex justify-between text-xs font-semibold text-muted">
              <span className="truncate pr-2">{run.fim ? "Concluído" : run.atual ? `Enviando ${run.atual}` : "Preparando…"}</span>
              <span className="tabular shrink-0">
                {run.feitos}/{run.total} · {mb(run.bytesFeitos)} de {mb(run.bytesTotal)}
              </span>
            </div>
            <Progress value={pct} tone={run.fim ? (run.falhas.length ? "danger" : "success") : "gold"} className="h-2" />
            <Resumo
              itens={[
                ["PDFs lidos", run.stats.recebidos],
                ["Gravados", run.stats.gravados],
                ["Já existiam", run.stats.iguais],
                ["Substituídos", run.stats.substituidos],
                ["Sem destino", run.stats.semDestino, run.stats.semDestino > 0],
                ["Inválidos", run.stats.invalidos, run.stats.invalidos > 0],
              ]}
            />
            {run.stats.semDestino > 0 && <p className="text-xs text-muted">“Sem destino”: PDF solto cujo nome não está no último policies.json. Envie o policies.json (passo 2) e mande esses PDFs de novo, ou envie dentro de um zip com a pasta do cliente.</p>}
            {run.falhas.length > 0 && (
              <ul className="grid gap-1 rounded-lg bg-danger-soft p-3 text-xs text-danger">
                {run.falhas.map((f) => (
                  <li key={f.nome}>
                    <strong>{f.nome}</strong>: {f.erro}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {busy && (
            <Button variant="outline" onClick={() => (cancel.current = true)}>
              Parar depois do atual
            </Button>
          )}
          <Button variant="gold" onClick={enviar} loading={busy} disabled={!files.length || files.length === grandes.length}>
            Enviar PDFs
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Passo 2: JSON ---------------- */
function JsonImport({ onDone }: { onDone: () => void }) {
  const [clients, setClients] = useState<File | null>(null);
  const [policies, setPolicies] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const job = useQuery({
    queryKey: ["import-job", jobId],
    queryFn: () => api.importacao.job(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "processando" ? false : 1000),
  });
  const j = job.data;

  const finished = useRef<string | null>(null);
  useEffect(() => {
    if (!j || j.status === "processando" || finished.current === j.id) return;
    finished.current = j.id;
    if (j.status === "erro") toast.error("A importação falhou", { description: j.erro ?? undefined });
    else {
      toast.success(j.dryRun ? "Simulação concluída (nada foi gravado)" : "Carteira importada");
      if (!j.dryRun) onDone();
    }
  }, [j, onDone]);

  async function iniciar() {
    if (!clients || !policies) return;
    setStarting(true);
    try {
      const r = await api.importacao.carteira(clients, policies, dryRun);
      setJobId(r.jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar");
    } finally {
      setStarting(false);
    }
  }

  const running = j?.status === "processando";

  return (
    <Card>
      <CardHeader icon={<FileJson />} title="2. Clientes e apólices" description="Arquivos do extrator: clients.json e policies.json." />
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <JsonPicker label="clients.json" file={clients} onChange={setClients} disabled={running} />
          <JsonPicker label="policies.json" file={policies} onChange={setPolicies} disabled={running} />
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
          <Checkbox className="mt-0.5" checked={dryRun} onCheckedChange={(v) => setDryRun(v === true)} disabled={running} aria-label="Simular sem gravar" />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <FlaskConical className="size-4 text-accent-text" /> Simular (não grava nada)
            </span>
            <span className="text-muted">Mostra quantos clientes, apólices e PDFs seriam criados. Desmarque para importar de verdade.</span>
          </span>
        </label>

        {j && (
          <div className="grid gap-2" aria-live="polite">
            <div className="flex justify-between text-xs font-semibold text-muted">
              <span className="flex items-center gap-1.5">
                {j.status === "concluido" ? <CheckCircle2 className="size-3.5 text-success" /> : j.status === "erro" ? <AlertTriangle className="size-3.5 text-danger" /> : null}
                {j.status === "processando" ? "Processando apólices…" : j.status === "concluido" ? (j.dryRun ? "Simulação concluída" : "Importação concluída") : "Falhou"}
                {j.dryRun && <Badge tone="gold">simulação</Badge>}
              </span>
              <span className="tabular">
                {nf.format(j.feitos)}/{nf.format(j.total)}
              </span>
            </div>
            <Progress value={j.total ? (j.feitos / j.total) * 100 : 0} tone={j.status === "erro" ? "danger" : j.status === "concluido" ? "success" : "gold"} className="h-2" />
            {j.erro && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{j.erro}</p>}
            {j.resultado && <ResumoImport r={j.resultado} job={j} />}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant={dryRun ? "outline" : "gold"} onClick={iniciar} loading={starting || running} disabled={!clients || !policies}>
            {dryRun ? "Simular importação" : "Importar carteira"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function JsonPicker({ label, file, onChange, disabled }: { label: string; file: File | null; onChange: (f: File | null) => void; disabled?: boolean }) {
  return (
    <label className={cn("grid cursor-pointer gap-1 rounded-xl border border-dashed border-border-strong p-3 text-sm transition-colors hover:border-gold-500", file && "border-solid border-gold-500 bg-accent-soft/40", disabled && "pointer-events-none opacity-60")}>
      <span className="font-mono text-xs font-semibold">{label}</span>
      <span className="truncate text-muted">{file ? `${file.name} · ${mb(file.size)}` : "Escolher arquivo"}</span>
      <input type="file" accept=".json,application/json" className="sr-only" aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

function ResumoImport({ r, job }: { r: NonNullable<ImportJob["resultado"]>; job: ImportJob }) {
  const s: ImportStats = r.stats;
  const naoMapeadas = Object.entries(r.seguradorasNaoMapeadas ?? {});
  const verbo = job.dryRun ? "a criar" : "criados";
  return (
    <div className="grid gap-3">
      <Resumo
        itens={[
          ["Clientes lidos", s.clientesLidos],
          [`Clientes ${verbo}`, s.clientesCriados],
          ["Clientes completados", s.clientesAtualizados],
          ["Sem CPF válido", s.clientesSemCpf, s.clientesSemCpf > 0],
          [job.dryRun ? "Apólices a criar" : "Apólices criadas", s.apolicesCriadas],
          ["Apólices já existentes", s.apolicesDuplicadas],
          ["Sem seguradora", s.apolicesSemSeguradora, s.apolicesSemSeguradora > 0],
          ["Apólices corrigidas", s.apolicesCorrigidas ?? 0],
          ["Endossos ligados", s.endossosVinculados ?? 0],
          ["Endossos sem apólice", s.endossosSemApolice ?? 0, (s.endossosSemApolice ?? 0) > 0],
          ["Apólices canceladas", s.apolicesCanceladas ?? 0],
          [job.dryRun ? "PDFs a ligar" : "PDFs ligados", s.documentosCriados],
          ["PDFs já ligados", s.documentosJaExistentes],
          ["PDFs não enviados", s.arquivosInexistentes, s.arquivosInexistentes > 0],
          ["Parcelas", s.parcelas],
          ["Itens segurados", s.itens],
        ]}
      />
      {s.arquivosInexistentes > 0 && <p className="text-xs text-muted">“PDFs não enviados”: a apólice foi registrada, mas o PDF ainda não está no servidor. Envie os zips no passo 1 e rode este passo de novo.</p>}
      {naoMapeadas.length > 0 && (
        <p className="text-xs text-muted">
          Seguradoras sem cadastro: {naoMapeadas.map(([k, v]) => `${k} (${nf.format(v)})`).join(", ")}.
        </p>
      )}
      {r.status && (
        <p className="text-xs text-muted">
          Status após recálculo: {Object.entries(r.status).map(([k, v]) => `${k.toLowerCase()} ${nf.format(v)}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Resumo({ itens }: { itens: [string, number, boolean?][] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {itens.map(([l, v, alerta]) => (
        <div key={l} className={cn("rounded-lg border border-border px-3 py-2", alerta && "border-warning/40 bg-warning-soft")}>
          <dt className="text-[11px] font-semibold text-muted">{l}</dt>
          <dd className="font-semibold tabular">{nf.format(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- Limpar carteira ---------------- */
const FRASE = "LIMPAR CARTEIRA";

function LimparCarteira({ emAndamento, onDone }: { emAndamento: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const limpar = useMutation({
    mutationFn: () => api.importacao.limpar(texto.trim()),
    onSuccess: (r) => {
      toast.success("Carteira limpa", { description: `${nf.format(r.clientes)} clientes e ${nf.format(r.apolices)} apólices removidos. Agora reimporte os PDFs e os JSON.` });
      setOpen(false);
      setTexto("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="border-danger/30">
      <CardHeader
        icon={<Trash2 />}
        title="Limpar carteira"
        description="Apaga todos os clientes, apólices, parcelas, itens e documentos, e os PDFs importados. Use antes de reimportar uma base nova do zero. Não dá para desfazer."
        action={
          <Button variant="danger" size="sm" disabled={emAndamento} onClick={() => setOpen(true)}>
            <Trash2 /> Limpar
          </Button>
        }
      />
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTexto(""); }}>
        <DialogContent title="Limpar toda a carteira?" description="Todos os clientes e seus dados saem do sistema agora. O histórico de mensagens e os leads ficam, sem o vínculo com o cliente.">
          <form
            className="grid gap-4 p-5 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (texto.trim() === FRASE) limpar.mutate();
            }}
          >
            <Field label={`Digite ${FRASE} para confirmar`} htmlFor="limpar-confirmacao">
              <Input id="limpar-confirmacao" value={texto} autoComplete="off" onChange={(e) => setTexto(e.target.value.toUpperCase())} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" loading={limpar.isPending} disabled={texto.trim() !== FRASE}>
                Apagar tudo
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
