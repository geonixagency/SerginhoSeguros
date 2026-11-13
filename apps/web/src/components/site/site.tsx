"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Building2,
  Car,
  Check,
  HeartPulse,
  Home,
  KeyRound,
  Menu,
  PiggyBank,
  Scale,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { AnimatedLogo } from "@/components/brand/animated-logo";
import FocusReveal from "@/components/originkit/focus-reveal";
import TextCarousel from "@/components/originkit/text-carousel";
import { CountUp } from "@/components/ui/count-up";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { ThemeToggle } from "@/components/theme-toggle";
import { WhatsAppIcon } from "./whatsapp-icon";
import { IntroSplash } from "./intro-splash";
import { HeroShield } from "./hero-shield";
import { HowItWorks } from "./how-it-works";
import { InsuranceQuiz } from "./insurance-quiz";
import { Magnetic, SiteCursor, TiltGlare, useTilt } from "./interactive";
import { api, ApiError } from "@/lib/api";
import { RAMO_LABEL, type Ramo } from "@/lib/types";
import { cn, whatsappLink } from "@/lib/utils";

const FoilDrift = dynamic(() => import("@/components/originkit/foil-drift"), { ssr: false });

const WHATS = process.env.NEXT_PUBLIC_WHATSAPP ?? "5500000000000";
const WHATS_MSG = "Olá, Serginho Seguros! Vim pelo site e gostaria de uma cotação.";

const NAV = [
  { href: "#produtos", label: "Produtos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#quiz", label: "Qual seguro?" },
  { href: "#sobre", label: "Quem somos" },
  { href: "#cotacao", label: "Cotação" },
];

const PRODUCTS: { ramo: Ramo; icon: typeof Car; title: string; text: string; points: string[]; span: string }[] = [
  {
    ramo: "AUTO",
    icon: Car,
    title: "Seguro Auto",
    text: "Carro, moto, caminhão e outros veículos. Comparamos as principais seguradoras para o seu perfil — e quando acontece algo, é com a gente que você fala, não com uma central.",
    points: ["Colisão, roubo e terceiros", "Carro reserva e guincho 24h", "Renovação sem dor de cabeça"],
    span: "lg:col-span-7 lg:row-span-2",
  },
  {
    ramo: "VIDA",
    icon: HeartPulse,
    title: "Seguro de Vida",
    text: "Proteção para quem depende de você, com coberturas que cabem no orçamento da família.",
    points: ["Morte e invalidez", "Doenças graves", "Assistência funeral"],
    span: "lg:col-span-5",
  },
  {
    ramo: "EMPRESARIAL",
    icon: Building2,
    title: "Empresarial",
    text: "Seu comércio ou escritório protegido contra incêndio, roubo e responsabilidade civil.",
    points: ["Patrimônio e estoque", "Lucros cessantes"],
    span: "lg:col-span-5",
  },
  {
    ramo: "RESIDENCIAL",
    icon: Home,
    title: "Residencial",
    text: "Casa segura com assistência para chaveiro, encanador e eletricista quando precisar.",
    points: ["Incêndio e danos elétricos", "Assistências 24h"],
    span: "lg:col-span-4",
  },
  {
    ramo: "IMOBILIARIO",
    icon: KeyRound,
    title: "Imóveis",
    text: "Fiança locatícia e seguro do imóvel alugado: tranquilidade para proprietário e inquilino.",
    points: ["Fiança locatícia", "Seguro incêndio locação"],
    span: "lg:col-span-4",
  },
  {
    ramo: "CONSORCIO",
    icon: PiggyBank,
    title: "Consórcio",
    text: "Planeje a compra do carro ou do imóvel sem juros, com parcelas que cabem no mês.",
    points: ["Imóveis e veículos", "Sem juros, com parcelas planejadas"],
    span: "lg:col-span-4",
  },
];

const DIFERENCIAIS = [
  { icon: UserRound, title: "Você fala com quem decide", text: "Sergio e Vivian atendem pessoalmente. Sem robô, sem fila, sem protocolo perdido." },
  { icon: Scale, title: "Várias seguradoras, uma conversa", text: "Cotamos nas principais companhias do mercado e explicamos a diferença em português claro." },
  { icon: BellRing, title: "A gente avisa antes", text: "Avisamos pelo WhatsApp antes do vencimento da parcela e da renovação, e lembramos dos pagamentos em aberto. Seu seguro não vence por esquecimento." },
  { icon: ShieldCheck, title: "Do seu lado no sinistro", text: "Quando o imprevisto acontece, acompanhamos cada etapa junto da seguradora até a solução." },
];

function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-x-0 top-0 z-30 text-ink-950 dark:text-ivory-100">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3" aria-label="Serginho Seguros — início">
          <AnimatedLogo uid="hdr" animate={false} className="size-10" />
          <span className="leading-none">
            <span className="block font-display text-[19px] font-bold tracking-wide">Serginho Seguros</span>
            <span className="block whitespace-nowrap text-[11.5px] font-semibold text-gold-700 sm:text-[10.5px] sm:uppercase sm:tracking-[0.22em] dark:text-gold-300/80">Sua escolha inteligente em seguros</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-900/75 transition-colors hover:text-gold-700 dark:text-ivory-100/80 dark:hover:text-gold-300">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle className="hover:bg-ink-950/5 dark:hover:bg-white/10" />
          <button className="grid size-10 place-items-center rounded-[10px] lg:hidden" onClick={() => setOpen((v) => !v)} aria-label={open ? "Fechar menu" : "Abrir menu"} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 rounded-2xl border border-white/10 bg-ink-900/95 p-2 text-ivory-100 backdrop-blur lg:hidden"
            aria-label="Menu"
          >
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-base font-medium hover:bg-white/5">
                {n.label}
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero({ replay }: { replay: number }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const light = mounted && resolvedTheme === "light";
  return (
    <section
      className="group/hero relative isolate overflow-hidden bg-ivory-100 text-ink-950 dark:bg-ink-950 dark:text-ivory-100"
      aria-labelledby="hero-title"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      <div className="absolute inset-0 -z-10 opacity-90">
        {light ? (
          <FoilDrift key="light" background="transparent" baseColor="#efe6d2" accentColor="#c9930f" highlight="#ffffff" density={7000} />
        ) : (
          <FoilDrift key="dark" background="transparent" baseColor="#1c1c22" accentColor="#d8a218" highlight="#fff1c9" density={7000} />
        )}
      </div>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_75%_40%,transparent,rgba(247,243,234,0.6)_60%,#f7f3ea)] dark:bg-[radial-gradient(70%_60%_at_75%_40%,transparent,rgba(9,9,10,0.55)_60%,#09090a)]" />
      <div className="grain absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay" />
      {/* holofote que segue o mouse */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover/hero:opacity-100"
        style={{ background: "radial-gradient(520px circle at var(--mx,50%) var(--my,40%), rgba(238,189,37,0.13), transparent 65%)" }}
        aria-hidden
      />

      <div className="mx-auto grid min-h-[92svh] max-w-6xl items-center gap-10 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6">
        <div className="relative" key={replay}>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-800 dark:border-gold-500/30 dark:bg-gold-400/5 dark:text-gold-300"
          >
            <span className="size-1.5 rounded-full bg-gold-400" /> Corretora de seguros · +10 anos
          </motion.p>
          <FocusReveal
            as="h1"
            text="Seguro bom é aquele que tem gente por trás."
            className="max-w-[16ch] font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.02em] text-ink-950 sm:text-6xl lg:text-[76px] dark:text-ivory-50"
            blur={14}
            transition={{ duration: 0.45, delay: 0.35, staggerChildren: 0.018, ease: "easeOut" }}
          />
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.6 }} className="mt-7 text-lg text-ink-900/80 sm:text-xl dark:text-ivory-100/80">
            <TextCarousel
              prefix="Cuidamos do seu"
              texts={["veículo", "futuro", "negócio", "lar", "imóvel", "consórcio"]}
              className="font-medium"
              prefixClassName="text-ink-900/75 dark:text-ivory-100/75"
              badgeClassName="rounded-lg bg-gold-gradient py-0.5 font-display text-[1.35em] font-bold italic text-ink-950"
            />
          </motion.div>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, duration: 0.6 }} className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-900/70 dark:text-ivory-100/65">
            Sergio e Vivian Rosalim comparam as melhores seguradoras para você e continuam por perto depois da assinatura — na renovação, na parcela e, principalmente, no sinistro.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.6 }} className="mt-9 flex flex-wrap gap-3">
            <Magnetic>
              <Button variant="gold" size="lg" asChild>
                <a href="#cotacao" data-cursor="Cotar">
                  Pedir minha cotação <ArrowRight />
                </a>
              </Button>
            </Magnetic>
            <Button size="lg" asChild className="border border-ink-950/15 bg-white/60 text-ink-950 shadow-none hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-ivory-50 dark:hover:bg-white/10">
              <a href={whatsappLink(WHATS, WHATS_MSG)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-[18px] text-[#25d366]" /> Falar no WhatsApp
              </a>
            </Button>
          </motion.div>
        </div>

        <div className="relative mx-auto w-[min(88vw,440px)] lg:mr-0 lg:w-full lg:max-w-[500px]" key={`shield-${replay}`}>
          <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(circle,rgba(238,189,37,0.2),transparent_65%)] blur-2xl" aria-hidden />
          <HeroShield />
        </div>
      </div>

      {/* faixa de números */}
      <div className="relative border-t border-ink-950/10 bg-ivory-50/70 backdrop-blur-sm dark:border-white/10 dark:bg-ink-950/70">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 divide-ink-950/10 px-4 dark:divide-white/10 sm:px-6 md:grid-cols-4 md:divide-x">
          {[
            { v: 10, pre: "+", suf: " anos", l: "de mercado" },
            { v: 500, pre: "+", suf: "", l: "clientes atendidos" },
            { v: 6, pre: "", suf: "", l: "linhas de proteção" },
            { v: 20, pre: "+", suf: "", l: "seguradoras parceiras" },
          ].map((s, i) => (
            <div key={s.l} className="py-6 md:px-6 md:first:pl-0">
              <dt className="sr-only">{s.l}</dt>
              <dd>
                <span className="font-display text-4xl font-bold text-gold-gradient sm:text-5xl">
                  {s.pre}
                  <CountUp value={s.v} delay={0.15 * i} duration={1.6} />
                  <span className="text-3xl sm:text-4xl">{s.suf}</span>
                </span>
                <span className="mt-1 block text-[13px] font-medium uppercase tracking-[0.14em] text-ink-900/60 dark:text-ivory-100/55">{s.l}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, text, id }: { eyebrow: string; title: React.ReactNode; text?: string; id: string }) {
  return (
    <div className="max-w-2xl">
      <p className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-accent-text">
        <span className="h-px w-8 bg-gold-500" aria-hidden /> {eyebrow}
      </p>
      <h2 id={id} className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.015em] sm:text-5xl">
        {title}
      </h2>
      {text && <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">{text}</p>}
    </div>
  );
}

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
};

function ProductCard({ p, i, onPick }: { p: (typeof PRODUCTS)[number]; i: number; onPick: (r: Ramo) => void }) {
  const Icon = p.icon;
  const feature = i === 0;
  const tilt = useTilt<HTMLElement>(feature ? 4 : 7);
  return (
    <motion.article
      ref={tilt.ref}
      {...tilt.bind}
      style={tilt.style}
      {...reveal}
      transition={{ ...reveal.transition, delay: i * 0.05 }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] border p-6 transition-[border-color,box-shadow] duration-300 sm:p-7",
        feature ? "border-ink-800 bg-ink-950 text-ivory-100 dark:border-gold-700/30" : "border-border bg-surface hover:border-gold-500/50 hover:shadow-[var(--shadow-lift)]",
        p.span,
      )}
    >
      <TiltGlare dark={feature} />
      {feature && (
        <>
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgba(238,189,37,0.25),transparent_65%)]" aria-hidden />
          <span className="pointer-events-none absolute -bottom-10 right-4 select-none font-display text-[200px] font-bold leading-none text-gold-gradient opacity-[0.13]" aria-hidden>
            01
          </span>
        </>
      )}
      <div className="relative flex items-center justify-between">
        <motion.span
          whileHover={{ rotate: -8, scale: 1.08 }}
          className={cn("grid size-11 place-items-center rounded-xl transition-transform", feature ? "bg-gold-gradient text-ink-950" : "bg-accent-soft text-accent-text group-hover:bg-gold-gradient group-hover:text-ink-950")}
        >
          <Icon className="size-5" />
        </motion.span>
        <span className={cn("font-display text-lg font-semibold", feature ? "text-gold-300/60" : "text-subtle")}>{String(i + 1).padStart(2, "0")}</span>
      </div>
      <h3 className={cn("relative mt-6 font-display font-semibold leading-tight", feature ? "text-4xl sm:text-5xl" : "text-2xl")}>{p.title}</h3>
      <p className={cn("relative mt-3 max-w-md text-[15px] leading-relaxed", feature ? "text-ivory-100/70" : "text-muted")}>{p.text}</p>
      <ul className="relative mt-5 space-y-2">
        {p.points.map((pt) => (
          <li key={pt} className={cn("flex items-center gap-2 text-sm font-medium", feature ? "text-ivory-100/85" : "text-foreground/85")}>
            <Check className={cn("size-4", feature ? "text-gold-400" : "text-accent-text")} /> {pt}
          </li>
        ))}
      </ul>
      <div className="relative mt-auto pt-7">
        <button
          onClick={() => onPick(p.ramo)}
          data-cursor="Cotar"
          className={cn("inline-flex items-center gap-1.5 text-sm font-bold transition-colors", feature ? "text-gold-300 hover:text-gold-200" : "text-accent-text hover:text-foreground")}
        >
          Cotar {p.title.replace("Seguro ", "").toLowerCase()} <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </button>
      </div>
    </motion.article>
  );
}

function Products({ onPick }: { onPick: (r: Ramo) => void }) {
  return (
    <section id="produtos" className="scroll-mt-10 py-20 sm:py-28" aria-labelledby="produtos-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionTitle id="produtos-title" eyebrow="Produtos" title={<>Proteção para cada <em className="text-accent-text">capítulo</em> da sua vida.</>} />
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">Do primeiro carro à empresa da família. Escolha um produto e a gente prepara a cotação com as seguradoras que mais combinam com você.</p>
        </div>

        <div className="mt-12 grid auto-rows-[minmax(0,auto)] gap-4 lg:grid-cols-12">
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.ramo} p={p} i={i} onPick={onPick} />
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="sobre" className="scroll-mt-10 border-y border-border bg-surface-2 py-20 sm:py-28" aria-labelledby="sobre-title">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <motion.div {...reveal} className="relative order-2 lg:order-1">
          <div className="relative overflow-hidden rounded-[28px] bg-ink-950 p-8 text-ivory-100 shadow-[var(--shadow-lift)] sm:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_10%,rgba(238,189,37,0.18),transparent)]" aria-hidden />
            <div className="relative flex items-end gap-4">
              <span className="font-display text-[120px] font-bold leading-[0.8] text-gold-gradient sm:text-[150px]">S</span>
              <span className="mb-4 font-display text-4xl italic text-gold-300/70">&amp;</span>
              <span className="font-display text-[120px] font-bold leading-[0.8] text-gold-gradient sm:text-[150px]">V</span>
            </div>
            <div className="gold-hairline relative my-8 opacity-60" />
            <blockquote className="relative font-display text-2xl leading-snug text-ivory-50 sm:text-[28px]">
              “Cada apólice tem um nome, um telefone e uma história. É assim que a gente trabalha.”
            </blockquote>
            <p className="relative mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-gold-300/80">Sergio &amp; Vivian Rosalim</p>
          </div>
          <div className="absolute -bottom-5 -right-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-[var(--shadow-lift)] sm:-right-6">
            <p className="font-display text-3xl font-bold text-accent-text">
              +<CountUp value={500} />
            </p>
            <p className="text-xs font-semibold text-muted">clientes atendidos</p>
          </div>
        </motion.div>

        <motion.div {...reveal} className="order-1 lg:order-2">
          <SectionTitle id="sobre-title" eyebrow="Quem somos" title="Uma corretora de família, para famílias e negócios." />
          <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed text-muted">
            <p>
              A Serginho Seguros nasceu do jeito mais simples: atender bem quem confia na gente. À frente da corretora, <strong className="text-foreground">Sergio e Vivian Rosalim</strong> somam mais de dez anos cuidando de seguros de vida, automóveis, residência, empresas, imóveis e consórcios.
            </p>
            <p>
              Não vendemos a apólice mais cara nem a mais barata — vendemos a certa. Comparamos as seguradoras, explicamos cada cobertura e ficamos disponíveis no WhatsApp para o que der e vier.
            </p>
          </div>
          <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-border pt-8">
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.16em] text-subtle">Atendimento</dt>
              <dd className="mt-1 font-display text-2xl font-semibold">Pessoal, pelo WhatsApp</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.16em] text-subtle">Experiência</dt>
              <dd className="mt-1 font-display text-2xl font-semibold">+10 anos no mercado</dd>
            </div>
          </dl>
        </motion.div>
      </div>
    </section>
  );
}

function Differentials() {
  return (
    <section id="diferenciais" className="scroll-mt-10 py-20 sm:py-28" aria-labelledby="dif-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionTitle id="dif-title" eyebrow="Por que nós" title="O que muda quando seu corretor conhece você." />
        <ol className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-xl)] border border-border bg-border sm:grid-cols-2">
          {DIFERENCIAIS.map((d, i) => {
            const Icon = d.icon;
            return (
              <motion.li key={d.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }} className="group relative bg-surface p-7 sm:p-9">
                <div className="flex items-start gap-5">
                  <span className="font-display text-5xl font-bold leading-none text-gold-gradient">{i + 1}</span>
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-bold">
                      <Icon className="size-[18px] text-accent-text" /> {d.title}
                    </h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{d.text}</p>
                  </div>
                </div>
                <span className="absolute inset-x-9 bottom-0 h-[2px] origin-left scale-x-0 bg-gold-gradient transition-transform duration-500 group-hover:scale-x-100" aria-hidden />
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function QuoteForm({ produto, setProduto }: { produto: Ramo; setProduto: (r: Ramo) => void }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get("nome") ?? "").trim();
    const telefone = String(fd.get("telefone") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const mensagem = String(fd.get("mensagem") ?? "").trim();
    const errs: Record<string, string> = {};
    if (nome.length < 3) errs.nome = "Conte pra gente seu nome completo.";
    if (telefone.replace(/\D/g, "").length < 10) errs.telefone = "Informe um WhatsApp com DDD.";
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errs.email = "Esse e-mail parece incompleto.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setState("sending");
    setServerError(null);
    try {
      await api.leads.submitSite({ nome, telefone, email: email || undefined, produto, origem: "site", mensagem: mensagem || undefined });
      setState("done");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Não foi possível enviar agora. Tente pelo WhatsApp.");
      setState("idle");
    }
  }

  return (
    <section id="cotacao" className="scroll-mt-10 bg-ink-950 py-20 text-ivory-100 sm:py-28" aria-labelledby="cot-title">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div>
          <p className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-gold-300">
            <span className="h-px w-8 bg-gold-500" aria-hidden /> Cotação com qualidade e rapidez
          </p>
          <h2 id="cot-title" className="font-display text-4xl font-semibold leading-[1.02] sm:text-5xl">
            Conte o que você quer proteger. <span className="text-gold-gradient">A gente faz o resto.</span>
          </h2>
          <p className="mt-5 max-w-md text-[15.5px] leading-relaxed text-ivory-100/65">Respondemos no mesmo dia útil, pelo WhatsApp, com as opções comparadas lado a lado.</p>
          <ul className="mt-8 space-y-3 text-sm text-ivory-100/80">
            {["Comparação entre várias seguradoras", "Explicação de cada cobertura, sem letra miúda", "Retorno rápido pelo WhatsApp"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded-full bg-gold-400/15 text-gold-300">
                  <Check className="size-3.5" />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <a href={whatsappLink(WHATS, WHATS_MSG)} target="_blank" rel="noopener noreferrer" className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 transition-colors hover:border-[#25d366]/50">
            <WhatsAppIcon className="size-7 text-[#25d366]" />
            <span>
              <span className="block text-xs text-ivory-100/60">Prefere conversar?</span>
              <span className="block font-semibold">Chame no WhatsApp</span>
            </span>
          </a>
        </div>

        <div className="relative rounded-[28px] border border-white/10 bg-ivory-50 p-6 text-ink-950 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] sm:p-9 dark:bg-ink-850 dark:text-ivory-100">
          <AnimatePresence mode="wait">
            {state === "done" ? (
              <motion.div key="ok" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex min-h-[420px] flex-col items-center justify-center text-center" role="status">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="grid size-20 place-items-center rounded-full bg-gold-gradient text-ink-950">
                  <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <motion.path d="M5 12.5 10 17 19 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.5 }} />
                  </svg>
                </motion.div>
                <p className="mt-6 font-display text-3xl font-semibold">Pedido recebido!</p>
                <p className="mt-2 max-w-xs text-[15px] text-stone-600 dark:text-ivory-100/65">Em breve o Sergio ou a Vivian chamam você no WhatsApp com a cotação de {RAMO_LABEL[produto].toLowerCase()}.</p>
                <Button variant="outline" className="mt-6" onClick={() => setState("idle")}>
                  Fazer outro pedido
                </Button>
              </motion.div>
            ) : (
              <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={onSubmit} noValidate className="grid gap-5">
                <fieldset>
                  <legend className="mb-3 text-[13px] font-semibold">O que você quer cotar?</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PRODUCTS.map((p) => {
                      const Icon = p.icon;
                      const active = p.ramo === produto;
                      return (
                        <label
                          key={p.ramo}
                          className={cn(
                            "flex h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold-500",
                            active ? "border-gold-500 bg-gold-400/15 text-ink-950 dark:text-gold-200" : "border-border-strong hover:border-gold-500/60",
                          )}
                        >
                          <input type="radio" name="produto" value={p.ramo} checked={active} onChange={() => setProduto(p.ramo)} className="sr-only" />
                          <Icon className={cn("size-4", active ? "text-gold-700 dark:text-gold-300" : "text-muted")} />
                          {RAMO_LABEL[p.ramo]}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Nome completo" htmlFor="nome" error={errors.nome} className="sm:col-span-2">
                    <Input id="nome" name="nome" autoComplete="name" placeholder="Como podemos chamar você?" aria-invalid={!!errors.nome} />
                  </Field>
                  <Field label="WhatsApp" htmlFor="telefone" error={errors.telefone}>
                    <Input id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(16) 99999-0000" aria-invalid={!!errors.telefone} />
                  </Field>
                  <Field label="E-mail (opcional)" htmlFor="email" error={errors.email}>
                    <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@email.com" aria-invalid={!!errors.email} />
                  </Field>
                  <Field label="Algum detalhe? (opcional)" htmlFor="mensagem" className="sm:col-span-2" hint="Ex.: modelo e ano do carro, CEP, quantas vidas…">
                    <Textarea id="mensagem" name="mensagem" rows={3} />
                  </Field>
                </div>
                {serverError && (
                  <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                    {serverError}
                  </p>
                )}
                <Button type="submit" variant="gold" size="lg" loading={state === "sending"} className="w-full">
                  {state === "sending" ? "Enviando…" : "Quero minha cotação"}
                </Button>
                <p className="text-center text-xs leading-relaxed text-stone-500 dark:text-ivory-100/50">
                  Usamos seus dados apenas para preparar a cotação, conforme a LGPD. Você pode pedir a exclusão a qualquer momento.
                </p>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-ink-950 text-ivory-100/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <AnimatedLogo uid="ftr" animate={false} className="size-14" />
          <div>
            <p className="font-display text-xl font-bold text-ivory-50">Serginho Seguros</p>
            <p className="text-sm">Sua escolha inteligente em seguros · Sergio &amp; Vivian Rosalim</p>
          </div>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-gold-300">
              {n.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/5">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-ivory-100/45 sm:px-6">
          © {new Date().getFullYear()} Serginho Seguros. Seguros de vida, auto, empresarial, residencial, imóveis e consórcio. Dados tratados conforme a LGPD.
        </p>
      </div>
    </footer>
  );
}

export function Site() {
  const [produto, setProduto] = useState<Ramo>("AUTO");
  const [replay, setReplay] = useState(0);
  const pick = (r: Ramo) => {
    setProduto(r);
    document.getElementById("cotacao")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <div className="site-root">
      <IntroSplash onDone={(played) => played && setReplay((n) => n + 1)} />
      <SiteCursor />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-gold-400 focus:px-4 focus:py-2 focus:text-ink-950">
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <main id="conteudo">
        <Hero replay={replay} />
        <Products onPick={pick} />
        <HowItWorks />
        <About />
        <InsuranceQuiz onQuote={pick} />
        <Differentials />
        <QuoteForm produto={produto} setProduto={setProduto} />
      </main>
      <Footer />
      <motion.a
        href={whatsappLink(WHATS, WHATS_MSG)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Conversar no WhatsApp"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 2, type: "spring", stiffness: 260, damping: 20 }}
        className="fixed bottom-5 right-5 z-40 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-[0_12px_30px_-8px_rgba(37,211,102,0.7)] transition-transform hover:scale-105"
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-[#25d366] opacity-20" aria-hidden />
        <WhatsAppIcon className="relative size-7" />
      </motion.a>
    </div>
  );
}
