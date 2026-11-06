"use client";

import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building, Download, Monitor, Moon, Palette, ShieldCheck, Sun, UserCog, Users } from "lucide-react";
import { PageHeader } from "@/components/app/shell";
import { ImportCarteira } from "@/components/app/import-carteira";
import { ProfileCard } from "@/components/app/profile-card";
import { Tabs, TabsContent } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { IS_DEMO, API_BASE as API_BASE_LABEL } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const ABAS = ["geral", "perfil", "importar"] as const;
type Aba = (typeof ABAS)[number];

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const isAdmin = user?.perfil === "ADMIN";
  const pedida = params.get("aba") as Aba | null;
  const aba: Aba = pedida && ABAS.includes(pedida) && (pedida !== "importar" || isAdmin) ? pedida : "geral";
  const setAba = (v: string) => router.replace(v === "geral" ? "/app/configuracoes" : `/app/configuracoes?aba=${v}`, { scroll: false });

  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configurações" description="Seu perfil, corretora, equipe, aparência e privacidade." />
      <Tabs
        value={aba}
        onValueChange={setAba}
        layoutId="config-tabs"
        items={[
          { value: "geral", label: "Geral" },
          { value: "perfil", label: "Meu perfil" },
          ...(isAdmin ? [{ value: "importar", label: "Importar carteira" }] : []),
        ]}
      >
        <TabsContent value="geral" className="pt-5 outline-none">
          <Geral />
        </TabsContent>
        <TabsContent value="perfil" className="pt-5 outline-none">
          <ProfileCard />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="importar" className="pt-5 outline-none">
            <ImportCarteira />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function Geral() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<Building />} title="Corretora" description="Aparece nas mensagens e no site." />
          <form
            className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Dados da corretora salvos");
            }}
          >
            <Field label="Nome fantasia" htmlFor="c-nome" className="sm:col-span-2">
              <Input id="c-nome" defaultValue="Serginho Seguros — Consórcios e Planos" />
            </Field>
            <Field label="Responsáveis" htmlFor="c-resp">
              <Input id="c-resp" defaultValue="Sergio e Viviani Rosalim" />
            </Field>
            <Field label="WhatsApp comercial" htmlFor="c-wa">
              <Input id="c-wa" placeholder="(16) 99000-0000" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader icon={<Palette />} title="Aparência" description="Tema da interface neste navegador." />
          <div className="grid grid-cols-3 gap-3 p-5" role="radiogroup" aria-label="Tema">
            {[
              { v: "light", l: "Claro", i: Sun },
              { v: "dark", l: "Escuro", i: Moon },
              { v: "system", l: "Sistema", i: Monitor },
            ].map(({ v, l, i: Icon }) => {
              const active = mounted && theme === v;
              return (
                <button
                  key={v}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(v)}
                  className={cn("flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-semibold transition-colors", active ? "border-gold-500 bg-accent-soft" : "border-border hover:border-border-strong")}
                >
                  <Icon className={cn("size-5", active ? "text-accent-text" : "text-muted")} />
                  {l}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Users />} title="Equipe" description="Quem acessa o sistema." action={<Button variant="outline" size="sm">Convidar</Button>} />
          <ul className="divide-y divide-border p-2 pt-3">
            {[
              { nome: "Viviani Rosalim", email: "viviani@serginhoseguros.com.br", perfil: "Administradora" },
              { nome: "Sergio Rosalim", email: "sergio@serginhoseguros.com.br", perfil: "Administrador" },
            ].map((m) => (
              <li key={m.email} className="flex items-center gap-3 px-3 py-3">
                <Avatar nome={m.nome} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {m.nome} {user?.email === m.email && <span className="text-xs font-medium text-muted">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                <Badge tone="gold">
                  <UserCog className="size-3" /> {m.perfil}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader icon={<ShieldCheck />} title="Privacidade e LGPD" description="Direitos do titular e auditoria." />
          <div className="grid grid-cols-1 gap-3 p-5">
            <p className="text-sm text-muted">Toda alteração de cadastro e todo download de PDF ficam registrados com usuário, data e IP. Clientes que respondem “SAIR” deixam de receber mensagens automáticas.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => toast("Informe o CPF do titular na ficha do cliente para exportar os dados.")}>
                <Download /> Exportar dados de um titular
              </Button>
            </div>
            <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted">
              Ambiente: <strong className="text-foreground">{IS_DEMO ? "demonstração (dados fictícios)" : "produção"}</strong> · API: <span className="font-mono">{API_BASE_LABEL}</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
