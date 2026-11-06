"use client";

import { Command } from "cmdk";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Loader2, Plus, Search, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { formatCpfCnpj, maskCpf } from "@/lib/utils";
import { NAV } from "./nav";

function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const { data, isFetching } = useQuery({
    queryKey: ["palette", dq],
    queryFn: () => api.clients.list({ q: dq, pageSize: 6 }),
    enabled: open && dq.length >= 2,
  });

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lift)] data-[state=open]:animate-[fadeIn_.15s_ease-out]">
          <DialogPrimitive.Title className="sr-only">Busca global</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Busque clientes por nome, CPF, placa ou apólice, ou navegue pelo sistema.</DialogPrimitive.Description>
          <Command shouldFilter={false} label="Busca global" className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              {isFetching ? <Loader2 className="size-4 animate-spin text-accent-text" /> : <Search className="size-4 text-muted" />}
              <Command.Input value={q} onValueChange={setQ} placeholder="Nome, CPF, placa ou nº da apólice…" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle" />
              <kbd className="rounded-md border border-border bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted">Esc</kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[56vh] overflow-y-auto p-2">
              {dq.length >= 2 && !isFetching && (data?.items.length ?? 0) === 0 && (
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted">Nenhum cliente encontrado para “{dq}”.</Command.Empty>
              )}
              {data && data.items.length > 0 && dq.length >= 2 && (
                <Command.Group heading="Clientes" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-subtle">
                  {data.items.map((c) => (
                    <Command.Item key={c.id} value={c.id} onSelect={() => go(`/app/clientes/${c.id}`)} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 data-[selected=true]:bg-sunken">
                      <UserRound className="size-4 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.nome}</span>
                        <span className="block truncate text-xs text-muted">
                          {c.cpfCnpj.length === 11 ? maskCpf(c.cpfCnpj) : formatCpfCnpj(c.cpfCnpj)} · {c.seguradoras.join(", ") || "sem apólice"}
                          {c.placas[0] ? ` · ${c.placas[0]}` : ""}
                        </span>
                      </span>
                      <span className={c.status === "ATIVO" ? "text-xs font-semibold text-success" : "text-xs font-semibold text-subtle"}>{c.status === "ATIVO" ? "Ativo" : "Inativo"}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Ações rápidas" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-subtle">
                <Command.Item value="novo-pdf" onSelect={() => go("/app/clientes/novo")} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-sunken">
                  <FileUp className="size-4 text-accent-text" /> Cadastrar cliente a partir do PDF
                </Command.Item>
                <Command.Item value="nova-cotacao" onSelect={() => go("/app/cotacoes?nova=1")} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-sunken">
                  <Plus className="size-4 text-accent-text" /> Nova cotação (Aggilizador)
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Ir para" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-subtle">
                {NAV.map((n) => {
                  const Icon = n.icon;
                  return (
                    <Command.Item key={n.href} value={n.href} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium data-[selected=true]:bg-sunken">
                      <Icon className="size-4 text-muted" /> {n.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
