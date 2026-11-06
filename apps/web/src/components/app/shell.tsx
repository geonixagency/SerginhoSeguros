"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Bell,
  ChevronsUpDown,
  LogOut,
  Menu,
  Search,
  Settings,
  Globe,
  UserRound,
} from "lucide-react";
import { AnimatedLogo } from "@/components/brand/animated-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "./command-palette";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { Avatar, Badge } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { IS_DEMO } from "@/lib/api";
import { cn } from "@/lib/utils";

import { NAV } from "./nav";
export { NAV };

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link href="/app" onClick={onNavigate} className="flex items-center gap-3 px-5 pb-6 pt-6">
        <AnimatedLogo uid="side" animate={false} className="size-10" />
        <span className="leading-none">
          <span className="block font-display text-[19px] font-bold tracking-wide text-ivory-50">Serginho</span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.24em] text-gold-400/80">Seguros</span>
        </span>
      </Link>
      <div className="mx-5 gold-hairline opacity-30" />
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-4" aria-label="Menu principal">
        <ul className="grid grid-cols-1 gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-semibold transition-colors",
                    active ? "text-ivory-50" : "text-sidebar-muted hover:bg-white/[0.04] hover:text-ivory-100",
                  )}
                >
                  {active && (
                    <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] border border-gold-500/25 bg-gradient-to-r from-gold-400/[0.14] to-transparent" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
                  )}
                  {active && <motion.span layoutId="nav-bar" className="absolute -left-3 top-2 h-6 w-[3px] rounded-r-full bg-gold-gradient" />}
                  <Icon className={cn("relative size-[18px]", active ? "text-gold-400" : "text-sidebar-muted group-hover:text-ivory-100")} />
                  <span className="relative">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.04]">
            <Avatar nome={user?.nome ?? "Equipe"} src={user?.avatar} className="size-9" tone="gold" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ivory-50">{user?.nome ?? "—"}</span>
              <span className="block truncate text-xs text-sidebar-muted">{user?.perfil === "ADMIN" ? "Administradora" : "Operador"}</span>
            </span>
            <ChevronsUpDown className="size-4 text-sidebar-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => router.push("/app/configuracoes?aba=perfil")}>
              <UserRound /> Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/app/configuracoes")}>
              <Settings /> Configurações
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.open("/", "_blank")}>
              <Globe /> Ver site
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await logout();
                router.replace("/login");
              }}
              className="text-danger [&_svg]:text-danger"
            >
              <LogOut /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-dvh bg-background">
      <a href="#app-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:text-ink-950">
        Pular para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-sidebar-border lg:block">
        <SidebarContent />
      </aside>

      <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[280px] shadow-2xl data-[state=open]:animate-[slideInLeft_.25s_ease-out] lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Navegação principal</DialogPrimitive.Description>
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
            <button className="grid size-10 place-items-center rounded-[10px] hover:bg-sunken lg:hidden" onClick={() => setDrawer(true)} aria-label="Abrir menu">
              <Menu className="size-5" />
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3 text-left text-sm text-subtle shadow-[var(--shadow-soft)] transition-colors hover:border-border-strong sm:max-w-md"
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">Buscar cliente, CPF, placa, apólice…</span>
              <kbd className="ml-auto hidden shrink-0 rounded-md border border-border bg-sunken px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted sm:inline">Ctrl K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1">
              {IS_DEMO && (
                <Badge tone="gold" className="hidden md:inline-flex" dot>
                  Demonstração
                </Badge>
              )}
              <Link href="/app#alertas" className="relative grid size-10 place-items-center rounded-[10px] text-foreground hover:bg-sunken" aria-label="Alertas">
                <Bell className="size-[18px]" />
                <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-gold-500 ring-2 ring-background" />
              </Link>
              <ThemeToggle className="hover:bg-sunken" />
              <Link
                href="/app/configuracoes?aba=perfil"
                aria-label="Meu perfil"
                title={user?.nome}
                className="ml-1 rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-gold-500"
              >
                <Avatar nome={user?.nome ?? "Equipe"} src={user?.avatar} className="size-8 text-[13px]" tone="gold" />
              </Link>
            </div>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main
            id="app-main"
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-accent-text">{eyebrow}</p>}
        <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[40px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
