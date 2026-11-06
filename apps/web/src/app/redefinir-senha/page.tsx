"use client";

/**
 * Redefinição de senha.
 * Sem token: pede o e-mail e envia o link. Com ?token=: cria a senha nova (uso único, 1 h).
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail } from "lucide-react";
import { AnimatedLogo } from "@/components/brand/animated-logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, ApiError } from "@/lib/api";

const MIN = 10;

function PedirLink() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Informe um e-mail válido.");
    setLoading(true);
    try {
      await api.auth.forgotPassword(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar agora. Tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <div role="status" className="grid gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <p>
            Se <strong className="font-semibold">{email.trim()}</strong> estiver cadastrado, você vai receber um e-mail com o link para criar uma senha nova. Ele vale por 1 hora.
          </p>
        </div>
        <p className="text-sm text-muted">Não chegou? Confira o spam ou peça de novo daqui a alguns minutos.</p>
        <Button variant="outline" onClick={() => setEnviado(false)}>
          Enviar de novo
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="email">E-mail de acesso</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 pl-9" aria-invalid={!!error} />
        </div>
      </div>
      {error && <Erro msg={error} />}
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Enviar link
      </Button>
    </form>
  );
}

function NovaSenha({ token }: { token: string }) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (senha.length < MIN) return setError(`A senha precisa ter pelo menos ${MIN} caracteres.`);
    if (senha !== confirma) return setError("As duas senhas não são iguais.");
    setLoading(true);
    try {
      await api.auth.resetPassword(token, senha);
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar agora. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  if (ok) {
    return (
      <div role="status" className="grid gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <p>Senha alterada. Por segurança, as sessões abertas em outros aparelhos foram encerradas.</p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">Entrar com a senha nova</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="senha">Senha nova</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input id="senha" type={show ? "text" : "password"} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className="h-11 px-9" aria-invalid={!!error} aria-describedby="senha-dica" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-foreground" aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p id="senha-dica" className="text-xs text-muted">
          Pelo menos {MIN} caracteres. Uma frase fácil de lembrar funciona bem.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirma">Repita a senha nova</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input id="confirma" type={show ? "text" : "password"} autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} className="h-11 pl-9" aria-invalid={!!error} />
        </div>
      </div>
      {error && <Erro msg={error} />}
      {error?.startsWith("Link inválido") && (
        <Link href="/redefinir-senha" className="-mt-2 text-sm font-semibold text-accent-text hover:underline">
          Pedir um link novo
        </Link>
      )}
      <Button type="submit" size="lg" loading={loading} className="w-full">
        Salvar senha nova
      </Button>
    </form>
  );
}

function Erro({ msg }: { msg: string }) {
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {msg}
    </motion.p>
  );
}

function Conteudo() {
  const params = useSearchParams();
  const token = params.get("token");
  // Tira o token da barra de endereço (histórico e capturas de tela) depois de lido.
  const [tk] = useState(token);
  useEffect(() => {
    if (token) window.history.replaceState(null, "", "/redefinir-senha");
  }, [token]);

  return (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-text">{tk ? "Nova senha" : "Esqueci minha senha"}</p>
      <h1 className="mt-2 font-display text-4xl font-semibold leading-tight">{tk ? "Crie sua senha nova." : "Vamos te ajudar a entrar."}</h1>
      <p className="mt-2 text-[15px] text-muted">{tk ? "Depois de salvar, use a senha nova para entrar." : "Informe o e-mail de acesso. Enviamos um link para você criar uma senha nova."}</p>
      <div className="mt-7">{tk ? <NovaSenha token={tk} /> : <PedirLink />}</div>
    </>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <div className="flex min-h-dvh flex-col px-5 py-8 sm:px-10">
      <div className="flex items-center justify-between">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar ao login
        </Link>
        <ThemeToggle className="hover:bg-sunken" />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
        <div className="mx-auto mb-8 grid size-20 place-items-center">
          <AnimatedLogo uid="reset" animate={false} className="w-full" />
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <Suspense fallback={null}>
            <Conteudo />
          </Suspense>
          <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
            <KeyRound className="size-3.5" /> O link só funciona uma vez e expira em 1 hora.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
