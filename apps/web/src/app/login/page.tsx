"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";
import { AnimatedLogo } from "@/components/brand/animated-logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth";
import { ApiError, IS_DEMO } from "@/lib/api";

const FoilDrift = dynamic(() => import("@/components/originkit/foil-drift"), { ssr: false });

function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [email, setEmail] = useState(IS_DEMO ? "viviani@serginhoseguros.com.br" : "");
  const [senha, setSenha] = useState(IS_DEMO ? "demo2026" : "");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !senha) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), senha);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar agora.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-9" aria-invalid={!!error} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="senha">Senha</Label>
          <button type="button" className="text-xs font-semibold text-accent-text hover:underline" onClick={() => setError("Peça a redefinição ao administrador da corretora.")}>
            Esqueci a senha
          </button>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input id="senha" type={show ? "text" : "password"} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11 px-9" aria-invalid={!!error} />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-foreground" aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </motion.p>
      )}
      <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
        {loading ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Painel da marca */}
      <section className="relative isolate hidden overflow-hidden bg-ink-950 text-ivory-100 lg:flex lg:flex-col lg:justify-between lg:p-12" aria-hidden>
        <div className="absolute inset-0 -z-10">
          <FoilDrift background="transparent" baseColor="#1c1c22" accentColor="#d8a218" density={6000} />
        </div>
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_45%,transparent,#09090a_85%)]" />
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-ivory-100/60 hover:text-gold-300">
          <ArrowLeft className="size-4" /> Voltar ao site
        </Link>
        <div className="mx-auto w-full max-w-[380px]">
          <AnimatedLogo uid="login" className="w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.7)]" onComplete={() => setSplashDone(true)} />
        </div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: splashDone ? 1 : 0, y: splashDone ? 0 : 10 }} transition={{ duration: 0.6 }}>
          <p className="max-w-md font-display text-3xl leading-tight text-ivory-50">Carteira, cobrança e WhatsApp num só lugar.</p>
          <p className="mt-2 text-sm text-ivory-100/55">Plataforma da corretora Serginho Seguros</p>
        </motion.div>
      </section>

      {/* Formulário */}
      <section className="relative flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 lg:invisible" aria-label="Voltar ao site">
            <AnimatedLogo uid="login-sm" animate={false} className="size-9" />
            <span className="font-display text-lg font-bold">Serginho Seguros</span>
          </Link>
          <ThemeToggle className="hover:bg-sunken" />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <div className="mx-auto mb-8 w-36 lg:hidden">
            <AnimatedLogo uid="login-mobile" className="w-full" />
          </div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-text">Área do corretor</p>
            <h1 className="mt-2 font-display text-4xl font-semibold leading-tight">Bom te ver de novo.</h1>
            <p className="mt-2 text-[15px] text-muted">Entre para ver a carteira, as parcelas do dia e os leads novos.</p>
            {IS_DEMO && (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-gold-500/30 bg-accent-soft px-3.5 py-3 text-[13px] text-foreground">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-text" />
                <span>
                  <strong className="font-semibold">Modo demonstração.</strong> Dados fictícios — basta clicar em Entrar.
                </span>
              </div>
            )}
            <div className="mt-7">
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>
            <p className="mt-8 text-center text-xs text-subtle">Acesso restrito à equipe. Ações e downloads são registrados (LGPD).</p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
