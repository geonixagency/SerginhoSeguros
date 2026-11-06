"use client";

/** Equipe real: lista de usuários, convite por e-mail, troca de perfil e remoção (desativação). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MoreHorizontal, ShieldCheck, UserCog, UserMinus, UserPlus, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, ErrorState, Field, Input, NativeSelect, Skeleton } from "@/components/ui/primitives";
import { Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { InviteResult, Perfil, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const PERFIL: Record<Perfil, string> = { ADMIN: "Administrador", OPERADOR: "Operador" };

export function TeamCard() {
  const { user: me } = useAuth();
  const isAdmin = me?.perfil === "ADMIN";
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["equipe"], queryFn: () => api.equipe.list() });
  /** undefined = fechado; null = convite novo; User = reenviar para essa pessoa. */
  const [inviteOf, setInviteOf] = useState<User | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<User | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["equipe"] });

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; perfil?: Perfil; ativo?: boolean }) => api.equipe.update(id, data),
    onSuccess: (u) => {
      toast.success(u.ativo === false ? "Acesso desativado" : `${u.nome} agora é ${PERFIL[u.perfil].toLowerCase()}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.equipe.remove(id),
    onSuccess: (u) => {
      toast.success(`${u.nome} foi removido(a) da equipe`, { description: "O histórico e a auditoria continuam guardados." });
      setConfirm(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativos = (team.data ?? []).filter((u) => u.ativo !== false);
  const inativos = (team.data ?? []).filter((u) => u.ativo === false);

  return (
    <Card>
      <CardHeader
        icon={<Users />}
        title="Equipe"
        description="Quem acessa o sistema."
        action={
          isAdmin ? (
            <Button variant="outline" size="sm" onClick={() => setInviteOf(null)}>
              <UserPlus /> Convidar
            </Button>
          ) : undefined
        }
      />
      {team.isLoading ? (
        <div className="grid gap-3 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : team.isError ? (
        <ErrorState message={(team.error as Error).message} onRetry={() => team.refetch()} />
      ) : (
        <ul className="divide-y divide-border p-2 pt-3">
          {[...ativos, ...inativos].map((m) => {
            const self = m.id === me?.id;
            const pendente = m.ativo !== false && m.ultimoLogin === null;
            return (
              <li key={m.id} className={cn("flex items-center gap-3 px-3 py-3", m.ativo === false && "opacity-55")}>
                <Avatar nome={m.nome} src={m.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {m.nome} {self && <span className="text-xs font-medium text-muted">(você)</span>}
                  </p>
                  {m.email && <p className="truncate text-xs text-muted">{m.email}</p>}
                </div>
                <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                  {pendente && <Badge tone="warning">Convite pendente</Badge>}
                  {m.ativo === false && <Badge>Sem acesso</Badge>}
                  <Badge tone={m.perfil === "ADMIN" ? "gold" : "neutral"}>
                    <UserCog className="size-3" /> {PERFIL[m.perfil]}
                  </Badge>
                </div>
                {isAdmin && !self && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${m.nome}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {m.ativo === false ? (
                        <DropdownMenuItem onSelect={() => update.mutate({ id: m.id, ativo: true })}>
                          <UserRound className="size-4" /> Reativar acesso
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem onSelect={() => update.mutate({ id: m.id, perfil: m.perfil === "ADMIN" ? "OPERADOR" : "ADMIN" })}>
                            <ShieldCheck className="size-4" /> {m.perfil === "ADMIN" ? "Tornar operador" : "Tornar administrador"}
                          </DropdownMenuItem>
                          {pendente && (
                            <DropdownMenuItem onSelect={() => setInviteOf(m)}>
                              <UserPlus className="size-4" /> Reenviar convite
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-danger" onSelect={() => setConfirm(m)}>
                            <UserMinus className="size-4" /> Remover da equipe
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <InviteDialog key={inviteOf?.id ?? "novo"} preset={inviteOf ?? null} open={inviteOf !== undefined} onOpenChange={(o) => !o && setInviteOf(undefined)} onDone={refresh} />

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title="Remover da equipe?" description={confirm ? `${confirm.nome} perde o acesso ao sistema agora. O histórico e a auditoria continuam guardados, e dá para reativar depois.` : undefined}>
          <div className="flex justify-end gap-2 p-5 pt-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => confirm && remove.mutate(confirm.id)}>
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function InviteDialog({ open, onOpenChange, onDone, preset }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; preset: User | null }) {
  const [nome, setNome] = useState(preset?.nome ?? "");
  const [email, setEmail] = useState(preset?.email ?? "");
  const [perfil, setPerfil] = useState<Perfil>(preset?.perfil ?? "OPERADOR");
  const [result, setResult] = useState<InviteResult | null>(null);

  const invite = useMutation({
    mutationFn: () => api.equipe.invite({ nome: nome.trim(), email: email.trim(), perfil }),
    onSuccess: (r) => {
      onDone();
      if (r.emailEnviado) {
        toast.success("Convite enviado", { description: `${r.user.email} recebeu o link para criar a senha (vale 72 h).` });
        close(false);
      } else setResult(r);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function close(o: boolean) {
    onOpenChange(o);
    if (!o) {
      setNome("");
      setEmail("");
      setPerfil("OPERADOR");
      setResult(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Convidar para a equipe" description="A pessoa recebe por e-mail um link para criar a própria senha. O link vale 72 horas.">
        {result?.link ? (
          <div className="grid gap-3 p-5 pt-2">
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
              Acesso criado, mas o e-mail não pôde ser enviado (SMTP não configurado no servidor). Mande este link para <strong>{result.user.email}</strong> por outro canal. Ele vale 72 horas e só funciona uma vez.
            </p>
            <Input readOnly value={result.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Link de primeiro acesso" />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(result.link!).then(() => toast.success("Link copiado"));
                }}
              >
                <Copy /> Copiar link
              </Button>
              <Button onClick={() => close(false)}>Pronto</Button>
            </div>
          </div>
        ) : (
          <form
            className="grid gap-4 p-5 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (nome.trim().length < 2) return toast.error("Informe o nome");
              if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Informe um e-mail válido");
              invite.mutate();
            }}
          >
            <Field label="Nome" htmlFor="inv-nome">
              <Input id="inv-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoComplete="off" />
            </Field>
            <Field label="E-mail" htmlFor="inv-email">
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Perfil" htmlFor="inv-perfil" hint="Administrador também gerencia a equipe, as integrações e a importação da carteira.">
              <NativeSelect id="inv-perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
                <option value="OPERADOR">Operador</option>
                <option value="ADMIN">Administrador</option>
              </NativeSelect>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="gold" loading={invite.isPending}>
                Enviar convite
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
