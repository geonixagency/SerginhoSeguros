"use client";

/**
 * Quiz "Qual seguro é pra você?": 3 perguntas → recomendação (ramo principal + complementar)
 * → pedido de contato que vira lead no CRM (api.leads.submitSite, origem "site").
 */
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Building2, Car, Check, HeartHandshake, Home, KeyRound, PiggyBank, RotateCcw, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { RAMO_LABEL, RAMOS, type Ramo } from "@/lib/types";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; hint?: string; icon?: LucideIcon; weights: Partial<Record<Ramo, number>> };
type Question = { id: string; title: string; options: Option[] };

const QUESTIONS: Question[] = [
  {
    id: "alvo",
    title: "O que você mais quer proteger agora?",
    options: [
      { id: "carro", label: "Meu automóvel", hint: "Carro, moto, caminhão e outros veículos", icon: Car, weights: { AUTO: 5 } },
      { id: "casa", label: "Minha casa", icon: Home, weights: { RESIDENCIAL: 5 } },
      { id: "familia", label: "Minha família", icon: HeartHandshake, weights: { VIDA: 5 } },
      { id: "negocio", label: "Meu negócio", icon: Building2, weights: { EMPRESARIAL: 5 } },
      { id: "aluguel", label: "Um imóvel alugado", icon: KeyRound, weights: { IMOBILIARIO: 5 } },
      { id: "compra", label: "Quero comprar um bem", icon: PiggyBank, weights: { CONSORCIO: 5 } },
    ],
  },
  {
    id: "momento",
    title: "Qual frase combina mais com o seu momento?",
    options: [
      { id: "novo", label: "Acabei de comprar ou me mudar", hint: "Veículo novo, casa nova, empresa nova", weights: { AUTO: 1, RESIDENCIAL: 2, EMPRESARIAL: 1 } },
      { id: "filhos", label: "Tenho gente que depende de mim", hint: "Filhos, cônjuge, pais", weights: { VIDA: 3, RESIDENCIAL: 1 } },
      { id: "economia", label: "Quero pagar menos no que já tenho", hint: "Revisar o seguro atual", weights: { AUTO: 2, EMPRESARIAL: 1 } },
      { id: "plano", label: "Estou planejando os próximos anos", hint: "Sem pressa, sem juros", weights: { CONSORCIO: 3, VIDA: 1 } },
    ],
  },
  {
    id: "prioridade",
    title: "O que pesa mais na sua decisão?",
    options: [
      { id: "preco", label: "Melhor preço", hint: "Comparar várias seguradoras", weights: {} },
      { id: "cobertura", label: "Cobertura completa", hint: "Não quero surpresa no sinistro", weights: { VIDA: 1, RESIDENCIAL: 1 } },
      { id: "atendimento", label: "Alguém que resolva por mim", hint: "Atendimento pessoal", weights: {} },
    ],
  },
];

const PITCH: Record<Ramo, string> = {
  AUTO: "Comparamos as seguradoras para o seu perfil de motorista, com guincho, carro reserva e cobertura para terceiros.",
  VIDA: "Uma proteção que cabe no orçamento e garante tranquilidade para quem depende de você.",
  RESIDENCIAL: "Proteção contra incêndio e danos elétricos, com chaveiro, encanador e eletricista 24h.",
  EMPRESARIAL: "Patrimônio, estoque e responsabilidade civil do seu negócio cobertos, para você focar em crescer.",
  IMOBILIARIO: "Fiança locatícia e seguro do imóvel alugado: tranquilidade para proprietário e inquilino.",
  CONSORCIO: "Planeje a compra do carro ou do imóvel sem juros, com parcelas que cabem no mês.",
};

const TITLE: Record<Ramo, string> = {
  AUTO: "Seguro Auto",
  VIDA: "Seguro de Vida",
  RESIDENCIAL: "Seguro Residencial",
  EMPRESARIAL: "Seguro Empresarial",
  IMOBILIARIO: "Seguro para Imóveis",
  CONSORCIO: "Consórcio",
};

const ICON: Record<Ramo, LucideIcon> = { AUTO: Car, VIDA: HeartHandshake, RESIDENCIAL: Home, EMPRESARIAL: Building2, IMOBILIARIO: KeyRound, CONSORCIO: PiggyBank };

function recommend(answers: Record<string, string>): [Ramo, Ramo] {
  const score = Object.fromEntries(RAMOS.map((r) => [r, 0])) as Record<Ramo, number>;
  for (const q of QUESTIONS) {
    const opt = q.options.find((o) => o.id === answers[q.id]);
    for (const [r, w] of Object.entries(opt?.weights ?? {})) score[r as Ramo] += w ?? 0;
  }
  const order = [...RAMOS].sort((a, b) => score[b] - score[a]);
  const first = order[0]!;
  // complementar: segundo colocado, ou um par que faz sentido quando não houve empate útil
  const pair: Record<Ramo, Ramo> = { AUTO: "VIDA", VIDA: "RESIDENCIAL", RESIDENCIAL: "VIDA", EMPRESARIAL: "VIDA", IMOBILIARIO: "RESIDENCIAL", CONSORCIO: "VIDA" };
  const second = order[1] && score[order[1]] > 0 ? order[1] : pair[first];
  return [first, second];
}

export function InsuranceQuiz({ onQuote }: { onQuote: (r: Ramo) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dir, setDir] = useState(1);
  const [lead, setLead] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const done = step >= QUESTIONS.length;
  const [primary, secondary] = useMemo(() => (done ? recommend(answers) : (["AUTO", "VIDA"] as [Ramo, Ramo])), [done, answers]);

  const advancing = useRef(false);
  function pick(q: Question, o: Option) {
    // ignora cliques durante a transição ou numa pergunta que já está saindo
    if (advancing.current || QUESTIONS[step]?.id !== q.id) return;
    advancing.current = true;
    setAnswers((a) => ({ ...a, [q.id]: o.id }));
    setDir(1);
    window.setTimeout(() => {
      setStep((s) => s + 1);
      advancing.current = false;
    }, 180);
  }
  function back() {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  }
  function reset() {
    setDir(-1);
    setAnswers({});
    setStep(0);
    setLead("idle");
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get("nome") ?? "").trim();
    const telefone = String(fd.get("telefone") ?? "").trim();
    if (nome.length < 3) return setError("Conte pra gente seu nome.");
    if (telefone.replace(/\D/g, "").length < 10) return setError("Informe um WhatsApp com DDD.");
    setError(null);
    setLead("sending");
    const resumo = QUESTIONS.map((q) => `${q.title} ${q.options.find((o) => o.id === answers[q.id])?.label ?? "-"}`).join(" | ");
    try {
      await api.leads.submitSite({
        nome,
        telefone,
        produto: primary,
        origem: "site",
        mensagem: `Quiz do site: recomendado ${RAMO_LABEL[primary]} (+ ${RAMO_LABEL[secondary]}). ${resumo}`,
      });
      setLead("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível enviar agora. Tente pelo WhatsApp.");
      setLead("idle");
    }
  }

  const progress = Math.min(step, QUESTIONS.length) / QUESTIONS.length;
  const q = QUESTIONS[step];
  const PrimaryIcon = ICON[primary];
  const SecondaryIcon = ICON[secondary];

  return (
    <section id="quiz" className="scroll-mt-10 border-y border-border bg-surface-2 py-20 sm:py-28" aria-labelledby="quiz-title">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="mb-3 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-accent-text">
            <span className="h-px w-8 bg-gold-500" aria-hidden /> Descubra em 30 segundos
          </p>
          <h2 id="quiz-title" className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.015em] sm:text-5xl">
            Qual seguro é <span className="text-accent-text">pra você?</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted sm:text-lg">Três perguntas rápidas e a gente indica por onde começar. Se gostar, o Sergio ou a Vivian preparam a cotação.</p>
        </div>

        <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-6 shadow-[var(--shadow-lift)] sm:p-9">
          <div className="mb-6 flex items-center gap-4">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={Math.min(step, QUESTIONS.length)} aria-label="Progresso do quiz">
              <motion.div className="h-full origin-left rounded-full bg-gold-gradient" animate={{ scaleX: progress }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
            </div>
            <span className="tabular text-xs font-bold text-subtle">{done ? "Pronto!" : `${step + 1}/${QUESTIONS.length}`}</span>
          </div>

          <AnimatePresence mode="wait" custom={dir} initial={false}>
            {!done && q ? (
              <motion.fieldset
                key={q.id}
                custom={dir}
                initial={{ opacity: 0, x: 40 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 * dir }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                <legend className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{q.title}</legend>
                <div className={cn("mt-6 grid gap-3", q.options.length > 4 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
                  {q.options.map((o) => {
                    const Icon = o.icon;
                    const sel = answers[q.id] === o.id;
                    return (
                      <motion.button
                        key={o.id}
                        type="button"
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => pick(q, o)}
                        aria-pressed={sel}
                        className={cn(
                          "group flex min-h-[64px] items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                          Icon && "flex-col items-start sm:min-h-[112px]",
                          sel ? "border-gold-500 bg-gold-400/15" : "border-border-strong hover:border-gold-500/70 hover:bg-accent-soft/40",
                        )}
                      >
                        {Icon && (
                          <span className={cn("grid size-10 place-items-center rounded-xl transition-colors", sel ? "bg-gold-gradient text-ink-950" : "bg-accent-soft text-accent-text group-hover:bg-gold-gradient group-hover:text-ink-950")}>
                            <Icon className="size-5" />
                          </span>
                        )}
                        <span>
                          <span className="block text-[15px] font-semibold leading-snug">{o.label}</span>
                          {o.hint && <span className="mt-0.5 block text-[13px] text-muted">{o.hint}</span>}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                {step > 0 && (
                  <button type="button" onClick={back} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-foreground">
                    <ArrowLeft className="size-4" /> Voltar
                  </button>
                )}
              </motion.fieldset>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
                  <Sparkles className="size-4" /> Nossa sugestão para você
                </p>
                <div className="mt-4 flex items-start gap-4">
                  <motion.span
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 15, delay: 0.1 }}
                    className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gold-gradient text-ink-950 shadow-[0_16px_36px_-12px_rgba(238,189,37,0.7)]"
                  >
                    <PrimaryIcon className="size-8" />
                  </motion.span>
                  <div>
                    <h3 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">{TITLE[primary]}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{PITCH[primary]}</p>
                  </div>
                </div>
                <p className="mt-5 flex items-center gap-2 rounded-xl bg-accent-soft/60 px-4 py-3 text-sm">
                  <SecondaryIcon className="size-4 shrink-0 text-accent-text" />
                  <span>
                    Vale olhar também: <strong>{TITLE[secondary]}</strong>
                  </span>
                </p>

                <AnimatePresence mode="wait">
                  {lead === "done" ? (
                    <motion.p key="ok" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} role="status" className="mt-6 flex items-center gap-3 rounded-2xl border border-gold-500/40 bg-gold-400/10 p-4 text-[15px] font-semibold">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold-gradient text-ink-950">
                        <Check className="size-4" />
                      </span>
                      Recebemos! Em breve chamamos você no WhatsApp com a cotação.
                    </motion.p>
                  ) : (
                    <motion.form key="form" onSubmit={submit} noValidate className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                      <label className="sr-only" htmlFor="quiz-nome">
                        Seu nome
                      </label>
                      <Input id="quiz-nome" name="nome" autoComplete="name" placeholder="Seu nome" />
                      <label className="sr-only" htmlFor="quiz-tel">
                        WhatsApp com DDD
                      </label>
                      <Input id="quiz-tel" name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="WhatsApp com DDD" />
                      <Button type="submit" variant="gold" loading={lead === "sending"} data-cursor="Enviar">
                        Quero a cotação <ArrowRight />
                      </Button>
                      {error && (
                        <p role="alert" className="text-sm font-medium text-danger sm:col-span-3">
                          {error}
                        </p>
                      )}
                    </motion.form>
                  )}
                </AnimatePresence>

                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-5 text-sm font-semibold">
                  <button type="button" onClick={() => onQuote(primary)} className="inline-flex items-center gap-1.5 text-accent-text hover:text-foreground">
                    Prefiro o formulário completo <ArrowRight className="size-4" />
                  </button>
                  <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-muted hover:text-foreground">
                    <RotateCcw className="size-4" /> Refazer
                  </button>
                </div>
                <p className="mt-4 text-xs text-subtle">Usamos seus dados só para preparar a cotação, conforme a LGPD.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
