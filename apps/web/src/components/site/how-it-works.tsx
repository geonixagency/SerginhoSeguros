"use client";

/** "Como funciona": linha do tempo cuja trilha dourada se preenche conforme a rolagem. */
import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { BellRing, MessagesSquare, Scale, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS: { icon: LucideIcon; title: string; text: string; tag: string }[] = [
  {
    icon: MessagesSquare,
    title: "Você conta o que quer proteger",
    text: "Pelo site ou pelo WhatsApp: o carro, a casa, a família ou a empresa. Sem formulário infinito.",
    tag: "2 minutos",
  },
  {
    icon: Scale,
    title: "A gente compara as seguradoras",
    text: "Cotamos nas principais companhias e colocamos as opções lado a lado, com preço, franquia e coberturas.",
    tag: "No mesmo dia útil",
  },
  {
    icon: ShieldCheck,
    title: "Você escolhe com clareza",
    text: "Explicamos cada cobertura em português claro. Você fecha só quando tiver certeza do que está levando.",
    tag: "Sem letra miúda",
  },
  {
    icon: BellRing,
    title: "E a gente continua por perto",
    text: "Avisamos antes do vencimento e da renovação, lembramos dos pagamentos e ficamos do seu lado no sinistro.",
    tag: "O ano todo",
  },
];

function Step({ s, i, progress }: { s: (typeof STEPS)[number]; i: number; progress: MotionValue<number> }) {
  const Icon = s.icon;
  const start = i / STEPS.length;
  const lit = useTransform(progress, [start, start + 0.12], [0, 1]);
  const scale = useTransform(lit, [0, 1], [0.85, 1]);
  return (
    <motion.li
      initial={{ opacity: 0, x: 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative grid grid-cols-[56px_1fr] gap-5 pb-12 last:pb-0 sm:grid-cols-[72px_1fr] sm:gap-7"
    >
      <div className="relative flex justify-center">
        <motion.span
          style={{ scale }}
          className="relative z-10 grid size-14 place-items-center rounded-2xl border border-border bg-surface text-accent-text shadow-[var(--shadow-lift)] sm:size-[72px]"
        >
          <motion.span style={{ opacity: lit }} className="absolute inset-0 rounded-2xl bg-gold-gradient" aria-hidden />
          <Icon className="relative size-6 sm:size-7" />
        </motion.span>
      </div>
      <div className="pt-1 sm:pt-3">
        <p className="flex flex-wrap items-center gap-3">
          <span className="font-display text-sm font-bold text-subtle">0{i + 1}</span>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-text">{s.tag}</span>
        </p>
        <h3 className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">{s.title}</h3>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">{s.text}</p>
      </div>
    </motion.li>
  );
}

export function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 75%", "end 55%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });

  return (
    <section id="como-funciona" className="scroll-mt-10 py-20 sm:py-28" aria-labelledby="como-title">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-accent-text">
            <span className="h-px w-8 bg-gold-500" aria-hidden /> Como funciona
          </p>
          <h2 id="como-title" className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.015em] sm:text-5xl">
            Do primeiro “oi” à <em className="text-accent-text">renovação</em>, sem complicação.
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg">Quatro passos simples. E um corretor de verdade acompanhando cada um deles.</p>
          <div className="mt-8 hidden h-1.5 max-w-xs overflow-hidden rounded-full bg-border lg:block" aria-hidden>
            <motion.div style={{ scaleX: progress }} className="h-full origin-left bg-gold-gradient" />
          </div>
        </div>

        <ol ref={ref} className="relative">
          {/* trilha */}
          <span className="absolute bottom-6 left-[27px] top-6 w-[2px] rounded-full bg-border sm:left-[35px]" aria-hidden />
          <motion.span
            style={{ scaleY: progress }}
            className={cn("absolute bottom-6 left-[27px] top-6 w-[2px] origin-top rounded-full bg-gold-gradient sm:left-[35px]")}
            aria-hidden
          />
          {STEPS.map((s, i) => (
            <Step key={s.title} s={s} i={i} progress={progress} />
          ))}
        </ol>
      </div>
    </section>
  );
}
