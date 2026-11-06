"use client";

/**
 * Cadastro e edição MANUAL (sem leitor de PDF): cliente, apólice com parcelas e anexos.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { isValidCpfCnpj, onlyDigits } from "@ss/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import type { AttachTipo, ClientDetail, ClientInput, Endereco, FormaPagamento, InstallmentInput, InstallmentStatus, Policy, PolicyInput, PolicyStatus, Ramo } from "@/lib/types";
import { FORMA_PAGAMENTO_LABEL, RAMOS, RAMO_LABEL } from "@/lib/types";

const ATTACH_LABEL: Record<AttachTipo, string> = { APOLICE: "Apólice", ENDOSSO: "Endosso", PROPOSTA: "Proposta", BOLETO: "Boleto", OUTRO: "Outro" };
const MAX_MB = 25;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";
const iso = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
const toNum = (v: string) => {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/* ------------------------------------------------------------------ cliente */
const EMPTY_END: Endereco = { logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", cep: "" };

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; client?: ClientDetail; onSaved?: (c: ClientDetail) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={client ? "Editar cliente" : "Novo cliente"} description={client ? undefined : "Cadastro manual. Depois você pode lançar a apólice e anexar os arquivos."} className="max-w-2xl">
        {open && <ClientForm client={client} onCancel={() => onOpenChange(false)} onSaved={(c) => (onOpenChange(false), onSaved?.(c))} />}
      </DialogContent>
    </Dialog>
  );
}

function ClientForm({ client, onCancel, onSaved }: { client?: ClientDetail; onCancel: () => void; onSaved: (c: ClientDetail) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<ClientInput>(() => ({
    nome: client?.nome ?? "",
    cpfCnpj: client?.cpfCnpj ?? "",
    nascimento: iso(client?.nascimento) || null,
    cnh: client?.cnh ?? "",
    telefone: client?.telefone ?? "",
    email: client?.email ?? "",
    endereco: { ...EMPTY_END, ...(client?.endereco ?? {}) },
    optOut: client?.optOut ?? false,
  }));
  const [err, setErr] = useState<Record<string, string>>({});
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const setEnd = (k: keyof Endereco, v: string) => setF((x) => ({ ...x, endereco: { ...(x.endereco ?? EMPTY_END), [k]: v } }));

  const save = useMutation({
    mutationFn: (data: ClientInput) => (client ? api.clients.edit(client.id, data) : api.clients.create(data)),
    onSuccess: (c) => {
      toast.success(client ? "Dados do cliente salvos" : "Cliente cadastrado");
      void qc.invalidateQueries({ queryKey: ["clients"] });
      void qc.invalidateQueries({ queryKey: ["client", c.id] });
      onSaved(c);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const doc = onlyDigits(f.cpfCnpj);
    const er: Record<string, string> = {};
    if (f.nome.trim().length < 2) er.nome = "Informe o nome";
    if (!isValidCpfCnpj(doc)) er.cpfCnpj = "CPF/CNPJ inválido";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = "E-mail inválido";
    const tel = onlyDigits(f.telefone ?? "");
    if (tel && (tel.length < 10 || tel.length > 13)) er.telefone = "Telefone com DDD (10 ou 11 dígitos)";
    if (f.endereco?.uf && f.endereco.uf.trim().length !== 2) er.uf = "UF com 2 letras";
    setErr(er);
    if (Object.keys(er).length) return;
    save.mutate({ ...f, cpfCnpj: doc, telefone: tel || null, nascimento: f.nascimento || null });
  }

  const e = f.endereco ?? EMPTY_END;
  return (
    <form onSubmit={submit} className="grid gap-4 p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" htmlFor="cf-nome" error={err.nome} className="sm:col-span-2">
          <Input id="cf-nome" value={f.nome} onChange={(x) => set("nome", x.target.value)} maxLength={200} aria-invalid={!!err.nome} />
        </Field>
        <Field label="CPF ou CNPJ" htmlFor="cf-doc" error={err.cpfCnpj}>
          <Input id="cf-doc" inputMode="numeric" value={f.cpfCnpj} onChange={(x) => set("cpfCnpj", x.target.value)} maxLength={18} className="font-mono" aria-invalid={!!err.cpfCnpj} />
        </Field>
        <Field label="Nascimento" htmlFor="cf-nasc">
          <Input id="cf-nasc" type="date" value={f.nascimento ?? ""} onChange={(x) => set("nascimento", x.target.value || null)} />
        </Field>
        <Field label="Telefone / WhatsApp" htmlFor="cf-tel" error={err.telefone}>
          <Input id="cf-tel" type="tel" inputMode="tel" placeholder="DDD + número" value={f.telefone ?? ""} onChange={(x) => set("telefone", x.target.value)} aria-invalid={!!err.telefone} />
        </Field>
        <Field label="E-mail" htmlFor="cf-email" error={err.email}>
          <Input id="cf-email" type="email" value={f.email ?? ""} onChange={(x) => set("email", x.target.value)} aria-invalid={!!err.email} />
        </Field>
        <Field label="CNH" htmlFor="cf-cnh">
          <Input id="cf-cnh" value={f.cnh ?? ""} onChange={(x) => set("cnh", x.target.value)} maxLength={20} className="font-mono" />
        </Field>
      </div>
      <fieldset className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-6">
        <legend className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Endereço</legend>
        <Field label="CEP" htmlFor="cf-cep" className="sm:col-span-2">
          <Input id="cf-cep" inputMode="numeric" value={e.cep} onChange={(x) => setEnd("cep", x.target.value)} maxLength={9} />
        </Field>
        <Field label="Logradouro" htmlFor="cf-log" className="sm:col-span-4">
          <Input id="cf-log" value={e.logradouro} onChange={(x) => setEnd("logradouro", x.target.value)} maxLength={200} />
        </Field>
        <Field label="Número" htmlFor="cf-num" className="sm:col-span-2">
          <Input id="cf-num" value={e.numero} onChange={(x) => setEnd("numero", x.target.value)} maxLength={20} />
        </Field>
        <Field label="Complemento" htmlFor="cf-comp" className="sm:col-span-4">
          <Input id="cf-comp" value={e.complemento ?? ""} onChange={(x) => setEnd("complemento", x.target.value)} maxLength={100} />
        </Field>
        <Field label="Bairro" htmlFor="cf-bai" className="sm:col-span-2">
          <Input id="cf-bai" value={e.bairro} onChange={(x) => setEnd("bairro", x.target.value)} maxLength={100} />
        </Field>
        <Field label="Cidade" htmlFor="cf-cid" className="sm:col-span-3">
          <Input id="cf-cid" value={e.cidade} onChange={(x) => setEnd("cidade", x.target.value)} maxLength={100} />
        </Field>
        <Field label="UF" htmlFor="cf-uf" error={err.uf} className="sm:col-span-1">
          <Input id="cf-uf" value={e.uf} onChange={(x) => setEnd("uf", x.target.value.toUpperCase())} maxLength={2} aria-invalid={!!err.uf} />
        </Field>
      </fieldset>
      {client && (
        <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
          <Checkbox className="mt-0.5" checked={!!f.optOut} onCheckedChange={(v) => set("optOut", v === true)} aria-label="Não enviar mensagens automáticas" />
          <span>
            <span className="font-semibold">Não enviar mensagens automáticas (opt-out)</span>
            <span className="block text-muted">Marque se o cliente pediu para não receber lembretes pelo WhatsApp.</span>
          </span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="gold" loading={save.isPending}>
          {client ? "Salvar alterações" : "Cadastrar cliente"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ apólice */
type ParcelaRow = { numero: number; valor: string; vencimento: string; status: InstallmentStatus };

export function PolicyFormDialog({
  open,
  onOpenChange,
  client,
  policy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client: ClientDetail;
  policy?: Policy | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={policy ? "Editar apólice" : "Nova apólice"} description={policy ? undefined : "Lançamento manual. Anexe o PDF da apólice se tiver."} className="max-w-3xl">
        {open && <PolicyForm client={client} policy={policy ?? undefined} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PolicyForm({ client, policy, onDone }: { client: ClientDetail; policy?: Policy; onDone: () => void }) {
  const qc = useQueryClient();
  const insurers = useQuery({ queryKey: ["insurers"], queryFn: () => api.insurers.list(), staleTime: 300_000 });
  const parcelasIniciais = useMemo<ParcelaRow[]>(
    () =>
      policy
        ? client.parcelas
            .filter((p) => p.policyId === policy.id)
            .sort((a, b) => a.numero - b.numero)
            .map((p) => ({ numero: p.numero, valor: fmtNum(p.valor), vencimento: iso(p.vencimento), status: p.status }))
        : [],
    [client.parcelas, policy],
  );
  const [insurerId, setInsurerId] = useState(policy?.insurerId ?? "");
  const [ramo, setRamo] = useState<Ramo>(policy?.ramo ?? "AUTO");
  const [numero, setNumero] = useState(policy && policy.numero !== "—" ? policy.numero : "");
  const [proposta, setProposta] = useState(policy?.proposta ?? "");
  const [inicio, setInicio] = useState(iso(policy?.inicioVigencia));
  const [fim, setFim] = useState(iso(policy?.fimVigencia));
  const [premio, setPremio] = useState(policy ? fmtNum(policy.premioTotal) : "");
  const [forma, setForma] = useState<FormaPagamento>(policy?.formaPagamento ?? "BOLETO");
  const [status, setStatus] = useState<PolicyStatus>(policy?.status ?? "VIGENTE");
  const [placa, setPlaca] = useState(policy?.item?.placa ?? "");
  const [modelo, setModelo] = useState(policy?.item?.modelo ?? policy?.item?.descricao ?? "");
  const [ano, setAno] = useState(policy?.item?.ano ? String(policy.item.ano) : "");
  const [parcelas, setParcelas] = useState<ParcelaRow[]>(parcelasIniciais);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [qtd, setQtd] = useState(1);

  const save = useMutation({
    mutationFn: async (data: PolicyInput) => {
      const p = policy ? await api.policies.update(policy.id, data) : await api.policies.create(data);
      if (files.length) await api.documents.attach(client.id, files, "APOLICE", p.id);
      return p;
    },
    onSuccess: () => {
      toast.success(policy ? "Apólice atualizada" : "Apólice cadastrada", files.length ? { description: `${files.length} arquivo(s) anexado(s).` } : undefined);
      void qc.invalidateQueries({ queryKey: ["client", client.id] });
      void qc.invalidateQueries({ queryKey: ["clients"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function gerarParcelas() {
    const total = toNum(premio);
    const n = qtd;
    const base = inicio ? new Date(`${inicio}T12:00:00`) : new Date();
    setParcelas(
      Array.from({ length: n }, (_, i) => {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i);
        return { numero: i + 1, valor: total ? fmtNum(Math.round((total / n) * 100) / 100) : "", vencimento: d.toISOString().slice(0, 10), status: "PENDENTE" as InstallmentStatus };
      }),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!insurerId) return setErr("Escolha a seguradora.");
    if (!numero.trim() && !proposta.trim()) return setErr("Informe o número da apólice ou da proposta.");
    if (inicio && fim && fim < inicio) return setErr("O fim da vigência é antes do início.");
    if (parcelas.some((p) => !p.vencimento)) return setErr("Toda parcela precisa de vencimento.");
    const big = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (big) return setErr(`"${big.name}" passa de ${MAX_MB} MB.`);
    const lista: InstallmentInput[] = parcelas.map((p, i) => ({ numero: i + 1, valor: toNum(p.valor), vencimento: p.vencimento, status: p.status }));
    save.mutate({
      clientId: client.id,
      insurerId,
      ramo,
      numero: numero.trim() || null,
      proposta: proposta.trim() || null,
      inicioVigencia: inicio || null,
      fimVigencia: fim || null,
      premioTotal: toNum(premio),
      formaPagamento: forma,
      status,
      item: placa.trim() || modelo.trim() ? { placa: placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null, modelo: modelo.trim() || null, ano: ano.trim() || null } : null,
      parcelas: lista,
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Seguradora" htmlFor="pf-ins" className="sm:col-span-2">
          <NativeSelect id="pf-ins" value={insurerId} onChange={(x) => setInsurerId(x.target.value)}>
            <option value="">{insurers.isLoading ? "Carregando…" : "Escolha"}</option>
            {(insurers.data ?? [])
              .slice()
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Ramo" htmlFor="pf-ramo">
          <NativeSelect id="pf-ramo" value={ramo} onChange={(x) => setRamo(x.target.value as Ramo)}>
            {RAMOS.map((r) => (
              <option key={r} value={r}>
                {RAMO_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Nº da apólice" htmlFor="pf-num">
          <Input id="pf-num" value={numero} onChange={(x) => setNumero(x.target.value)} maxLength={60} className="font-mono" />
        </Field>
        <Field label="Nº da proposta" htmlFor="pf-prop">
          <Input id="pf-prop" value={proposta} onChange={(x) => setProposta(x.target.value)} maxLength={60} className="font-mono" />
        </Field>
        <Field label="Status" htmlFor="pf-st">
          <NativeSelect id="pf-st" value={status} onChange={(x) => setStatus(x.target.value as PolicyStatus)}>
            <option value="VIGENTE">Vigente</option>
            <option value="VENCIDA">Vencida</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="RENOVADA">Renovada</option>
          </NativeSelect>
        </Field>
        <Field label="Início da vigência" htmlFor="pf-ini">
          <Input id="pf-ini" type="date" value={inicio} onChange={(x) => setInicio(x.target.value)} />
        </Field>
        <Field label="Fim da vigência" htmlFor="pf-fim">
          <Input id="pf-fim" type="date" value={fim} onChange={(x) => setFim(x.target.value)} />
        </Field>
        <Field label="Prêmio total (R$)" htmlFor="pf-pre">
          <Input id="pf-pre" inputMode="decimal" placeholder="0,00" value={premio} onChange={(x) => setPremio(x.target.value)} className="tabular" />
        </Field>
        <Field label="Forma de pagamento" htmlFor="pf-forma">
          <NativeSelect id="pf-forma" value={forma} onChange={(x) => setForma(x.target.value as FormaPagamento)}>
            {(Object.keys(FORMA_PAGAMENTO_LABEL) as FormaPagamento[]).map((k) => (
              <option key={k} value={k}>
                {FORMA_PAGAMENTO_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Placa" htmlFor="pf-placa">
          <Input id="pf-placa" value={placa} onChange={(x) => setPlaca(x.target.value.toUpperCase())} maxLength={8} className="font-mono" />
        </Field>
        <Field label="Ano" htmlFor="pf-ano">
          <Input id="pf-ano" inputMode="numeric" value={ano} onChange={(x) => setAno(x.target.value)} maxLength={9} />
        </Field>
        <Field label="Veículo / bem segurado" htmlFor="pf-mod" className="sm:col-span-3">
          <Input id="pf-mod" value={modelo} onChange={(x) => setModelo(x.target.value)} maxLength={120} />
        </Field>
      </div>

      <fieldset className="grid gap-2 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted">Parcelas</legend>
        {parcelas.length === 0 && <p className="text-sm text-muted">Nenhuma parcela. Adicione uma a uma ou gere a partir do prêmio.</p>}
        {parcelas.map((p, i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2 sm:grid-cols-[2rem_1fr_1fr_9rem_auto]">
            <span className="text-sm font-semibold tabular text-muted">{i + 1}ª</span>
            <Input aria-label={`Valor da parcela ${i + 1}`} inputMode="decimal" placeholder="0,00" value={p.valor} onChange={(x) => setParcelas((l) => l.map((y, j) => (j === i ? { ...y, valor: x.target.value } : y)))} className="tabular" />
            <Input aria-label={`Vencimento da parcela ${i + 1}`} type="date" value={p.vencimento} onChange={(x) => setParcelas((l) => l.map((y, j) => (j === i ? { ...y, vencimento: x.target.value } : y)))} />
            <div className="hidden sm:block">
            <NativeSelect aria-label={`Situação da parcela ${i + 1}`} value={p.status} onChange={(x) => setParcelas((l) => l.map((y, j) => (j === i ? { ...y, status: x.target.value as InstallmentStatus } : y)))}>
              <option value="PENDENTE">Pendente</option>
              <option value="PAGO">Paga</option>
              <option value="ATRASADO">Atrasada</option>
            </NativeSelect>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover parcela ${i + 1}`} onClick={() => setParcelas((l) => l.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setParcelas((l) => [...l, { numero: l.length + 1, valor: "", vencimento: "", status: "PENDENTE" }])}>
            <Plus /> Parcela
          </Button>
          <span className="ml-auto flex items-center gap-2">
            <NativeSelect aria-label="Quantidade de parcelas" value={qtd} onChange={(x) => setQtd(Number(x.target.value))} className="h-8 w-20 text-[13px]">
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}x
                </option>
              ))}
            </NativeSelect>
            <Button type="button" variant="ghost" size="sm" onClick={gerarParcelas}>
              Gerar pelo prêmio
            </Button>
          </span>
        </div>
      </fieldset>

      <Field label="Anexar PDF da apólice (opcional)" htmlFor="pf-files" hint={`PDF ou imagem, até ${MAX_MB} MB cada.`}>
        <Input id="pf-files" type="file" multiple accept={ACCEPT} onChange={(x) => setFiles(Array.from(x.target.files ?? []))} className="h-auto py-2" />
      </Field>

      {err && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {err}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="gold" loading={save.isPending}>
          {policy ? "Salvar apólice" : "Cadastrar apólice"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ anexos */
export function AttachDialog({ open, onOpenChange, client, policyId }: { open: boolean; onOpenChange: (o: boolean) => void; client: ClientDetail; policyId?: string | null }) {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [tipo, setTipo] = useState<AttachTipo>("APOLICE");
  const [pol, setPol] = useState<string>(policyId ?? "");
  const up = useMutation({
    mutationFn: () => api.documents.attach(client.id, files, tipo, pol || null),
    onSuccess: (docs) => {
      toast.success(`${docs.length} arquivo(s) anexado(s)`);
      void qc.invalidateQueries({ queryKey: ["client", client.id] });
      setFiles([]);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const big = files.find((f) => f.size > MAX_MB * 1024 * 1024);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Anexar arquivos" description="PDFs ou fotos guardados como estão, sem leitura automática.">
        <form
          className="grid gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!files.length) return toast.error("Escolha ao menos um arquivo.");
            if (big) return toast.error(`"${big.name}" passa de ${MAX_MB} MB.`);
            up.mutate();
          }}
        >
          <label className="grid cursor-pointer place-items-center gap-2 rounded-xl border-2 border-dashed border-border-strong p-6 text-center transition-colors hover:border-gold-500 hover:bg-accent-soft/40">
            <FileUp className="size-6 text-accent-text" />
            <span className="text-sm font-semibold">{files.length ? `${files.length} arquivo(s) escolhido(s)` : "Escolher PDFs ou imagens"}</span>
            <span className="text-xs text-muted">Até 10 por vez, {MAX_MB} MB cada (PDF, JPG, PNG, WebP).</span>
            <input type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Arquivos para anexar" onChange={(x) => setFiles(Array.from(x.target.files ?? []).slice(0, 10))} />
          </label>
          {files.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {files.map((f) => (
                <li key={f.name + f.size} className="flex justify-between gap-2 truncate">
                  <span className="truncate">{f.name}</span>
                  <span className={f.size > MAX_MB * 1024 * 1024 ? "text-danger" : "text-muted"}>{(f.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="at-tipo">
              <NativeSelect id="at-tipo" value={tipo} onChange={(x) => setTipo(x.target.value as AttachTipo)}>
                {(Object.keys(ATTACH_LABEL) as AttachTipo[]).map((k) => (
                  <option key={k} value={k}>
                    {ATTACH_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Ligar à apólice (opcional)" htmlFor="at-pol">
              <NativeSelect id="at-pol" value={pol} onChange={(x) => setPol(x.target.value)}>
                <option value="">Nenhuma</option>
                {client.apolices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.seguradora} · {p.numero}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="gold" loading={up.isPending} disabled={!files.length}>
              Anexar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
