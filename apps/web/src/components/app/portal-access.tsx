"use client";

/**
 * Configurações > Acessos dos portais.
 * Lista o login de cada plataforma (seguradoras e plataformas como o Aggilizador) e deixa a equipe trocar
 * a senha quando o portal exigir. Os valores vão direto ao servidor, ficam cifrados no cofre e nunca voltam
 * para a tela. O robô usa esse acesso no próximo login dele no portal.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  KeyRound,
  PlugZap,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Skeleton,
} from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import type { PortalAccess } from "@/lib/types";
import { formatDate, formatRelative } from "@/lib/utils";

/** Senha com mais de 90 dias recebe aviso (muitos portais expiram nesse prazo). */
const DIAS_AVISO = 90;
const DAY = 86_400_000;

const CAMPO_LABEL: Record<string, string> = {
  usuario: "Usuário",
  cpf: "CPF de login",
  login: "Login",
  senha: "Senha",
  password: "Senha",
  susep: "SUSEP",
  clientId: "Client ID",
  clientSecret: "Client Secret",
  apiKey: "API key",
  token: "Token",
};

type Estado = {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  icon: React.ReactNode;
};

function estadoDo(a: PortalAccess): Estado {
  const c = a.credencial;
  if (!c)
    return {
      label: "Sem acesso cadastrado",
      tone: "neutral",
      icon: <KeyRound className="size-3.5" />,
    };
  if (c.ultimoErro)
    return {
      label: /senha|credencial|recus|inv[aá]lid|401/i.test(c.ultimoErro)
        ? "Senha recusada"
        : "Falhou no último teste",
      tone: "danger",
      icon: <ShieldAlert className="size-3.5" />,
    };
  if (c.ultimoTeste)
    return {
      label: "Acesso funcionando",
      tone: "success",
      icon: <CheckCircle2 className="size-3.5" />,
    };
  return {
    label: "Salvo, ainda não testado",
    tone: "info",
    icon: <Clock className="size-3.5" />,
  };
}

const diasDesde = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));

function UpdateAccessDialog({
  access,
  open,
  onOpenChange,
}: {
  access: PortalAccess;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const existentes = useMemo(
    () => access.credencial?.campos ?? {},
    [access.credencial],
  );
  // Campos do formulário: o usuário/senha sempre; SUSEP se já existir ou se o portal for do robô.
  const campos = useMemo(() => {
    const base = Object.keys(existentes).length
      ? Object.keys(existentes)
      : ["usuario", "senha"];
    const set = new Set(base);
    if (
      !set.has("usuario") &&
      !set.has("cpf") &&
      !set.has("login") &&
      !set.has("clientId") &&
      !set.has("apiKey")
    )
      set.add("usuario");
    if (
      !set.has("senha") &&
      !set.has("password") &&
      !set.has("clientSecret") &&
      !set.has("apiKey") &&
      !set.has("token")
    )
      set.add("senha");
    if (access.usaRobo) set.add("susep");
    const ordem = ["usuario", "cpf", "login", "senha", "password", "susep"];
    return [...set].sort(
      (a, b) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99),
    );
  }, [existentes, access.usaRobo]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const novo = !access.credencial;
  const preenchidos = Object.entries(valores).filter(([, v]) => v.trim());
  // Primeiro cadastro precisa de usuário e senha; depois basta o que mudou.
  const pronto = novo
    ? campos
        .filter((c) => c !== "susep")
        .every((c) => (valores[c] ?? "").trim().length > 0)
    : preenchidos.length > 0;
  const testar = useAccessTest();

  const save = useMutation({
    mutationFn: () =>
      api.insurers.patchCredential(access.insurerId, {
        valores: Object.fromEntries(preenchidos.map(([k, v]) => [k, v.trim()])),
      }),
    onSuccess: () => {
      setValores({});
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      qc.invalidateQueries({ queryKey: ["insurer", access.insurerId] });
      qc.invalidateQueries({ queryKey: ["insurer-creds", access.insurerId] });
      qc.invalidateQueries({ queryKey: ["insurers"] });
      if (access.usaRobo) {
        toast.success("Acesso salvo", {
          description: "O robô vai testar o login agora.",
        });
        testar.mutate(access);
      } else
        toast.success("Acesso salvo", {
          description: "Guardado com criptografia no servidor.",
        });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setValores({});
        onOpenChange(v);
      }}
    >
      <DialogContent
        title={
          novo
            ? `Cadastrar acesso · ${access.nome}`
            : `Atualizar acesso · ${access.nome}`
        }
        description={
          novo
            ? "Informe o login que vocês usam no portal. Fica guardado com criptografia e ninguém consegue ver depois."
            : "Preencha só o que mudou. Os campos em branco continuam como estão."
        }
      >
        <form
          className="grid grid-cols-1 gap-5 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (pronto) save.mutate();
          }}
        >
          {campos.map((c) => {
            const secreto = /senha|password|secret|token|apikey/i.test(c);
            const atual = existentes[c];
            return (
              <Field
                key={c}
                label={`${CAMPO_LABEL[c] ?? c}${c === "susep" ? " (opcional)" : ""}`}
                htmlFor={`acc-${c}`}
                hint={
                  atual
                    ? `Atual: ${atual}`
                    : c === "susep"
                      ? "Só se o portal pedir no login."
                      : undefined
                }
              >
                <Input
                  id={`acc-${c}`}
                  type={secreto ? "password" : "text"}
                  autoComplete={secreto ? "new-password" : "off"}
                  spellCheck={false}
                  value={valores[c] ?? ""}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [c]: e.target.value }))
                  }
                  placeholder={
                    atual ? (secreto ? "Nova senha" : "Manter o atual") : ""
                  }
                />
              </Field>
            );
          })}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!pronto}>
              Salvar acesso
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Testa o acesso: no portal do robô faz o login de verdade; nas APIs chama o teste de conexão. */
function useAccessTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a: PortalAccess,
    ): Promise<{ ok: boolean; aviso?: boolean; detalhe?: string }> => {
      if (a.usaRobo) {
        const r = await api.insurers.renewRobotSession(a.insurerId);
        return {
          ok: r.status === "valid",
          aviso: r.status === "needs_human",
          detalhe: r.detalhe,
        };
      }
      const r = await api.insurers.test(a.insurerId);
      return { ok: r.ok, detalhe: r.detalhe };
    },
    onSuccess: (r, a) => {
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      qc.invalidateQueries({ queryKey: ["insurer-robot", a.insurerId] });
      if (r.ok)
        toast.success(`${a.nome}: acesso funcionando`, {
          description: r.detalhe,
        });
      else if (r.aviso)
        toast.warning(`${a.nome}: o portal pediu verificação`, {
          description: r.detalhe,
        });
      else
        toast.error(`${a.nome}: o acesso não funcionou`, {
          description: r.detalhe,
        });
    },
    onError: (e: Error, a) => {
      qc.invalidateQueries({ queryKey: ["portal-access"] });
      toast.error(`${a.nome}: ${e.message}`);
    },
  });
}

function AccessRow({ a, onEdit }: { a: PortalAccess; onEdit: () => void }) {
  const testar = useAccessTest();
  const st = estadoDo(a);
  const c = a.credencial;
  const login = c
    ? (c.campos.usuario ?? c.campos.cpf ?? c.campos.login ?? c.campos.clientId)
    : undefined;
  const dias = c ? diasDesde(c.atualizadoEm) : 0;
  const velha = !!c && dias >= DIAS_AVISO;
  return (
    <li className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{a.nome}</p>
          {a.usaRobo && (
            <Badge tone="gold">
              <Bot className="size-3.5" /> Robô
            </Badge>
          )}
          {a.categoria === "PLATAFORMA" && (
            <Badge tone="neutral">Plataforma</Badge>
          )}
          <Badge tone={st.tone}>
            {st.icon} {st.label}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {login && (
            <span>
              Login: <span className="tabular text-foreground/80">{login}</span>
            </span>
          )}
          {c && (
            <span
              className={
                velha
                  ? "font-semibold text-gold-700 dark:text-gold-300"
                  : undefined
              }
              title={formatDate(c.atualizadoEm)}
            >
              {dias === 0
                ? "Senha atualizada hoje"
                : `Senha atualizada há ${dias} dia${dias > 1 ? "s" : ""}`}
              {velha && " · vale conferir"}
            </span>
          )}
          {c?.ultimoTeste && (
            <span>Testado {formatRelative(c.ultimoTeste)}</span>
          )}
          {a.portalUrl && (
            <a
              href={a.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline"
            >
              Abrir portal <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        {c?.ultimoErro && (
          <p className="mt-1.5 text-sm text-danger">{c.ultimoErro}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {c && (
          <Button
            variant="outline"
            size="sm"
            loading={testar.isPending}
            onClick={() => testar.mutate(a)}
          >
            {!testar.isPending && <PlugZap />} Testar
          </Button>
        )}
        <Button variant={c ? "outline" : "gold"} size="sm" onClick={onEdit}>
          <KeyRound /> {c ? "Atualizar senha" : "Cadastrar acesso"}
        </Button>
      </div>
    </li>
  );
}

export function PortalAccessCard() {
  const list = useQuery({
    queryKey: ["portal-access"],
    queryFn: () => api.insurers.acessos(),
  });
  const [editing, setEditing] = useState<PortalAccess | null>(null);
  const [q, setQ] = useState("");
  const itens = useMemo(() => {
    const all = list.data ?? [];
    const t = q.trim().toLowerCase();
    const filtrados = t
      ? all.filter((a) => a.nome.toLowerCase().includes(t))
      : all;
    // Primeiro o que precisa de atenção, depois os do robô, depois o resto.
    const peso = (a: PortalAccess) =>
      a.credencial?.ultimoErro
        ? 0
        : a.usaRobo && !a.credencial
          ? 1
          : a.usaRobo
            ? 2
            : a.credencial
              ? 3
              : 4;
    return [...filtrados].sort(
      (a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome),
    );
  }, [list.data, q]);
  const recusados = (list.data ?? []).filter(
    (a) => a.credencial?.ultimoErro,
  ).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<KeyRound />}
        title="Acessos dos portais"
        description="Login e senha de cada portal. Quando a seguradora pedir troca de senha, atualize aqui: o robô passa a usar a nova no próximo acesso."
      />
      <div className="flex flex-col gap-3 border-y border-border px-5 py-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar portal"
            className="pl-9"
            aria-label="Buscar portal"
          />
        </div>
        {recusados > 0 && (
          <p className="text-sm font-semibold text-danger sm:ml-auto">
            {recusados} acesso{recusados > 1 ? "s" : ""} precisa{recusados > 1 ? "m" : ""} de atenção
          </p>
        )}
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="grid gap-2 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !itens.length ? (
        <EmptyState
          icon={<KeyRound />}
          title="Nenhum portal encontrado"
          description={
            q ? "Tente outro nome." : "Cadastre as seguradoras primeiro."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {itens.map((a) => (
            <AccessRow key={a.insurerId} a={a} onEdit={() => setEditing(a)} />
          ))}
        </ul>
      )}
      <div className="border-t border-border px-5 py-3 text-xs text-subtle">
        As senhas ficam criptografadas no servidor e não aparecem em nenhuma
        tela. Hoje o robô entra sozinho nos portais marcados com “Robô”; os
        demais ficam guardados para quando ele passar a atendê-los.
      </div>
      {editing && (
        <UpdateAccessDialog
          key={editing.insurerId}
          access={editing}
          open
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </Card>
  );
}
