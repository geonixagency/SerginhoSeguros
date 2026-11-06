"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Bot, CheckCircle2, ExternalLink, KeyRound, Lock, Minus, Pencil, PlugZap, RefreshCw, ShieldAlert, Timer, UserCog, XCircle } from "lucide-react";
import { IntegrationBadge, InsurerMark, RAMO_ICON } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, ErrorState, Field, Input, Skeleton } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import { CAPABILITY_LABEL, RAMO_LABEL, type Capability, type CredentialTipo, type InsurerCredential, type RobotSession, type RobotSessionStatus, type TestConnectionResult } from "@/lib/types";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

const ALL_CAPS: Capability[] = ["testConnection", "findPolicy", "listInstallments", "getBoletoPdf", "getPolicyStatus", "getClaims", "quote"];
const CAP_DESC: Record<Capability, string> = {
  testConnection: "Valida as credenciais na seguradora",
  findPolicy: "Localiza apólice por CPF, placa ou número",
  listInstallments: "Consulta parcelas pagas e em aberto",
  getBoletoPdf: "Baixa o PDF do boleto para enviar ao cliente",
  getPolicyStatus: "Situação e vigência na seguradora",
  getClaims: "Avisos de sinistro vinculados",
  quote: "Cotação direta (fora do Aggilizador)",
};

const FIELD_LABEL: Record<string, string> = { clientId: "Client ID", clientSecret: "Client Secret", apiKey: "API key", token: "Token", usuarioApi: "Usuário da API", senhaApi: "Senha da API", usuario: "Usuário do portal", senha: "Senha do portal", susep: "SUSEP (opcional)" };

/**
 * A API guarda a credencial como um conjunto (tipo + campos) e substitui tudo a cada
 * gravação; por isso o formulário pede todos os campos de uma vez.
 */
function CredentialEditor({ insurerId, current, open, onOpenChange, defaultFields = ["clientId", "clientSecret"], defaultTipo = "OAUTH_CLIENT", optionalFields = [] }: { insurerId: string; current: InsurerCredential[]; open: boolean; onOpenChange: (v: boolean) => void; defaultFields?: string[]; defaultTipo?: CredentialTipo; optionalFields?: string[] }) {
  const fields = current.length ? current.map((c) => c.rotulo) : defaultFields;
  const tipo = (current[0]?.tipo as CredentialTipo | undefined) ?? defaultTipo;
  const [valores, setValores] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const obrigatorios = fields.filter((f) => !optionalFields.includes(f));
  const complete = obrigatorios.every((f) => (valores[f] ?? "").trim().length >= 4);
  const save = useMutation({
    // Campos opcionais vazios (ex.: SUSEP) não são enviados.
    mutationFn: () => api.insurers.saveCredential(insurerId, { tipo, valores: Object.fromEntries(fields.map((f) => [f, (valores[f] ?? "").trim()]).filter(([, v]) => v.length > 0)) }),
    onSuccess: () => {
      toast.success("Credencial atualizada", { description: "Valores criptografados no servidor. Teste a conexão." });
      qc.invalidateQueries({ queryKey: ["insurer-creds", insurerId] });
      qc.invalidateQueries({ queryKey: ["insurer", insurerId] });
      setValores({});
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={current.length ? "Atualizar credencial" : "Adicionar credencial"} description="Os valores vão direto ao servidor e ficam guardados com criptografia AES-256. Depois ninguém consegue vê-los, nem você.">
        <form
          className="grid grid-cols-1 gap-5 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (complete) save.mutate();
          }}
        >
          {fields.map((f, k) => (
            <Field key={f} label={FIELD_LABEL[f] ?? f} htmlFor={`cred-${f}`} hint={k === 0 ? "Cole exatamente como aparece no portal da seguradora." : undefined}>
              <Input id={`cred-${f}`} type="password" autoComplete="off" value={valores[f] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [f]: e.target.value }))} placeholder="••••••••" />
            </Field>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!complete}>
              Salvar com segurança
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ROBOT_STATUS_UI: Record<RobotSessionStatus, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  valid: { label: "Sessão ativa", tone: "success" },
  expired: { label: "Sessão expirada", tone: "warning" },
  needs_human: { label: "Precisa de login assistido", tone: "warning" },
  invalid_credentials: { label: "Credencial recusada", tone: "danger" },
  error: { label: "Robô indisponível", tone: "danger" },
};
const TONE_CLASS = {
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-gold-400/40 bg-gold-50 text-gold-700 dark:bg-gold-500/10 dark:text-gold-300",
  danger: "border-danger/30 bg-danger-soft text-danger",
  muted: "border-border bg-sunken text-muted",
} as const;

/**
 * Canal rpa: a integração reaproveita a sessão logada do robô no portal da seguradora.
 * Mostra o estado da sessão e permite renová-la (login). Quando o portal pede captcha/2FA,
 * o status vira "precisa de login assistido" e a renovação abre o fluxo pelo noVNC.
 */
function RobotSessionCard({ insurerId }: { insurerId: string }) {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["insurer-robot", insurerId], queryFn: () => api.insurers.robotSession(insurerId), refetchOnWindowFocus: false });
  const renew = useMutation({
    mutationFn: () => api.insurers.renewRobotSession(insurerId),
    onSuccess: (r: RobotSession) => {
      qc.setQueryData(["insurer-robot", insurerId], r);
      qc.invalidateQueries({ queryKey: ["insurer", insurerId] });
      qc.invalidateQueries({ queryKey: ["insurers"] });
      if (r.status === "valid") toast.success("Sessão renovada", { description: "Login no portal concluído pelo robô." });
      else if (r.status === "needs_human") toast.warning("Login assistido necessário", { description: r.detalhe });
      else toast.error("Não foi possível renovar", { description: r.detalhe });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const s = session.data;
  const ui = s ? ROBOT_STATUS_UI[s.status] : null;
  return (
    <Card>
      <CardHeader icon={<Bot />} title="Sessão do robô" description="A Porto e a Tokio não têm API: o robô consulta o portal usando a sessão logada da corretora." />
      <div className="p-5">
        {session.isLoading ? (
          <Skeleton className="h-20" />
        ) : session.isError || !s || !ui ? (
          <ErrorState onRetry={() => session.refetch()} />
        ) : (
          <div className={cn("flex items-start gap-3 rounded-xl border p-4", TONE_CLASS[ui.tone])}>
            {s.status === "valid" ? <CheckCircle2 className="mt-0.5 size-5" /> : s.status === "needs_human" ? <UserCog className="mt-0.5 size-5" /> : <ShieldAlert className="mt-0.5 size-5" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{ui.label}</p>
              {s.detalhe && <p className="mt-0.5 text-sm text-foreground/80">{s.detalhe}</p>}
              {s.status === "needs_human" && s.vncUrl && (
                <a href={s.vncUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold underline">
                  Abrir acesso assistido (noVNC) <ExternalLink className="size-3.5" />
                </a>
              )}
              <p className="mt-1 text-xs text-subtle">Verificada {formatRelative(s.verificadoEm)}</p>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-border px-5 py-4">
        <Button variant="outline" onClick={() => renew.mutate()} loading={renew.isPending}>
          {!renew.isPending && <RefreshCw />} Renovar sessão
        </Button>
        <p className="mt-2 text-xs text-subtle">Usa a credencial do portal guardada no cofre. Se houver captcha/2FA, conclua pelo acesso assistido.</p>
      </div>
    </Card>
  );
}

export default function InsurerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [lastTest, setLastTest] = useState<TestConnectionResult | null>(null);
  const ins = useQuery({ queryKey: ["insurer", id], queryFn: () => api.insurers.get(id) });
  const creds = useQuery({ queryKey: ["insurer-creds", id], queryFn: () => api.insurers.credentials(id) });
  const test = useMutation({
    mutationFn: () => api.insurers.test(id),
    onSuccess: (r) => {
      setLastTest(r);
      qc.invalidateQueries({ queryKey: ["insurer", id] });
      qc.invalidateQueries({ queryKey: ["insurers"] });
    },
    onError: (e: Error) => setLastTest({ ok: false, detalhe: e.message }),
  });

  if (ins.isError) return <Card><ErrorState onRetry={() => ins.refetch()} /></Card>;
  if (!ins.data) return <Skeleton className="h-96 rounded-[var(--radius-xl)]" />;
  const i = ins.data;
  const isRpa = i.canal === "rpa";

  return (
    <>
      <Link href="/app/seguradoras" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Seguradoras
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <InsurerMark nome={i.nome} cor={i.cor} className="size-14 rounded-2xl text-base" />
          <div>
            <h1 className="font-display text-4xl font-semibold leading-tight">{i.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <IntegrationBadge status={i.statusIntegracao} />
              <span className="text-sm text-muted">
                {i.clientes !== null ? `${i.clientes} clientes · ` : ""}{i.apolices} apólices
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={i.portalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Portal do corretor
            </a>
          </Button>
          {i.temApi && (
            <Button variant="gold" onClick={() => test.mutate()} loading={test.isPending}>
              {!test.isPending && <PlugZap />} {test.isPending ? "Testando…" : "Testar conexão"}
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {lastTest && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            role="status"
          >
            <div className={cn("mb-6 flex items-start gap-3 rounded-xl border p-4", lastTest.ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft")}>
              {lastTest.ok ? <CheckCircle2 className="mt-0.5 size-5 text-success" /> : <XCircle className="mt-0.5 size-5 text-danger" />}
              <div className="flex-1">
                <p className={cn("font-semibold", lastTest.ok ? "text-success" : "text-danger")}>{lastTest.ok ? "Conexão funcionando" : "Falha na conexão"}</p>
                <p className="text-sm text-foreground/80">{lastTest.detalhe}</p>
              </div>
              {typeof lastTest.latenciaMs === "number" && lastTest.latenciaMs > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                  <Timer className="size-3.5" /> {lastTest.latenciaMs} ms
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isRpa && (
        <div className="mb-4">
          <RobotSessionCard insurerId={i.id} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.15fr]">
        <Card>
          <CardHeader icon={<KeyRound />} title="Credenciais" description={isRpa ? "Usuário e senha do portal. Guardados no cofre; usados só pelo robô." : "Mascaradas. Valores reais ficam só no servidor, criptografados."} />
          <div className="p-5">
            {!i.temApi && !isRpa ? (
              <EmptyState icon={<ShieldAlert />} title="Sem API oficial" description="Por segurança não automatizamos login com senha. As ações desta seguradora viram tarefas guiadas pelo portal." />
            ) : creds.isLoading ? (
              <Skeleton className="h-40" />
            ) : !creds.data?.length ? (
              <EmptyState
                icon={<KeyRound />}
                title="Nenhuma credencial"
                description={isRpa ? "Cadastre o usuário e a senha do portal da seguradora." : "Cadastre o Client ID e o Secret emitidos pela seguradora."}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditOpen(true);
                    }}
                  >
                    Adicionar credencial
                  </Button>
                }
              />
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {creds.data.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
                    <span className="grid size-9 place-items-center rounded-lg bg-ink-900 text-gold-300 dark:bg-ink-800">
                      <Lock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-muted">{c.rotulo}</p>
                      <p className="truncate font-mono text-sm font-semibold tracking-wider">{c.valorMascarado}</p>
                      {c.ultimoErro ? (
                        <p className="mt-0.5 text-xs font-medium text-danger">{c.ultimoErro}</p>
                      ) : c.ultimoTeste ? (
                        <p className="mt-0.5 text-xs text-subtle" title={formatDateTime(c.ultimoTeste)}>
                          Validada {formatRelative(c.ultimoTeste)}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Atualizar ${c.rotulo}`}
                      onClick={() => {
                        setEditOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-subtle">Ramos atendidos</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {i.ramos.map((r) => {
                const Icon = RAMO_ICON[r];
                return (
                  <span key={r} className="inline-flex items-center gap-1 rounded-md bg-sunken px-2 py-1 text-xs font-semibold">
                    <Icon className="size-3 text-accent-text" /> {RAMO_LABEL[r]}
                  </span>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<PlugZap />} title="Matriz de capacidades" description="O que o conector desta seguradora consegue fazer pela API." />
          <ul className="divide-y divide-border p-2 pt-3">
            {ALL_CAPS.map((cap, k) => {
              const has = i.capacidades.includes(cap);
              return (
                <motion.li key={cap} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.04 }} className="flex items-center gap-3 px-3 py-3">
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", has ? "bg-success-soft text-success" : "bg-sunken text-subtle")}>
                    {has ? <CheckCircle2 className="size-4" /> : <Minus className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-semibold", !has && "text-muted")}>{CAPABILITY_LABEL[cap]}</p>
                    <p className="text-xs text-subtle">{CAP_DESC[cap]}</p>
                  </div>
                  <span className={cn("text-xs font-bold", has ? "text-success" : "text-subtle")}>{has ? "Disponível" : "—"}</span>
                </motion.li>
              );
            })}
          </ul>
        </Card>
      </div>
      <CredentialEditor
        insurerId={i.id}
        current={creds.data ?? []}
        open={editOpen}
        onOpenChange={setEditOpen}
        {...(isRpa ? { defaultFields: ["usuario", "senha", "susep"], defaultTipo: "USUARIO_SENHA_API" as CredentialTipo, optionalFields: ["susep"] } : {})}
      />
    </>
  );
}
