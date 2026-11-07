"use client";

/**
 * Animação do hero: um escudo dourado se forma no centro e "liga" carro, casa, família e empresa.
 * - o escudo é traçado (stroke) e preenchido; ondas de proteção pulsam a partir dele;
 * - linhas de energia fluem de cada bem até o escudo; partículas douradas sobem ao fundo;
 * - a cada 2 s um bem é "protegido" (destaque + legenda); passar o mouse escolhe o bem;
 * - o conjunto inclina com o mouse (parallax em camadas) só em ponteiro fino;
 * - prefers-reduced-motion: estado final estático.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { Building2, Car, HeartHandshake, Home, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Node = { key: string; icon: LucideIcon; label: string; caption: string; x: number; y: number };

const NODES: Node[] = [
  { key: "auto", icon: Car, label: "Auto", caption: "Seu veículo, protegido.", x: 64, y: 92 },
  { key: "casa", icon: Home, label: "Casa", caption: "Sua casa, protegida.", x: 336, y: 92 },
  { key: "familia", icon: HeartHandshake, label: "Família", caption: "Sua família, amparada.", x: 64, y: 308 },
  { key: "empresa", icon: Building2, label: "Empresa", caption: "Seu negócio, seguro.", x: 336, y: 308 },
];

const C = 200; // centro do viewBox 400×400
const SHIELD = "M200 112 L266 136 V198 C266 244 238 274 200 292 C162 274 134 244 134 198 V136 Z";

/** gerador determinístico (sem Math.random) para as partículas: SSR e cliente iguais */
function seeded(n: number) {
  let s = 1337;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: n }, () => ({ x: r() * 100, size: 1.5 + r() * 2.5, dur: 6 + r() * 7, delay: -r() * 12, drift: (r() - 0.5) * 40 }));
}

function useLayer(mx: MotionValue<number>, my: MotionValue<number>, depth: number) {
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth);
  return { x, y };
}

export function HeroShield({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const particles = useMemo(() => seeded(22), []);

  // mouse → -1..1 (suavizado)
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, { stiffness: 60, damping: 18, mass: 0.6 });
  const my = useSpring(rawY, { stiffness: 60, damping: 18, mass: 0.6 });
  const rotateY = useTransform(mx, (v) => v * 10);
  const rotateX = useTransform(my, (v) => v * -10);
  const back = useLayer(mx, my, -10);
  const mid = useLayer(mx, my, 8);
  const front = useLayer(mx, my, 20);

  useEffect(() => {
    if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduce, rawX, rawY]);

  useEffect(() => {
    if (reduce || hovering) return;
    const t = window.setInterval(() => setActive((a) => (a + 1) % NODES.length), 2000);
    return () => window.clearInterval(t);
  }, [reduce, hovering]);

  const play = !reduce;
  const current = NODES[active]!;

  return (
    <div className={cn("relative aspect-square w-full select-none [perspective:1100px]", className)}>
      {/* partículas */}
      <motion.div style={back} className="pointer-events-none absolute inset-0 overflow-hidden rounded-full [mask-image:radial-gradient(circle,black_45%,transparent_72%)]" aria-hidden>
        {play &&
          particles.map((p, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 rounded-full bg-gold-500 dark:bg-gold-300"
              style={{ left: `${p.x}%`, width: p.size, height: p.size, boxShadow: "0 0 8px rgba(251,226,134,0.8)" }}
              animate={{ y: [0, -460], x: [0, p.drift], opacity: [0, 0.9, 0] }}
              transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "linear" }}
            />
          ))}
      </motion.div>

      <motion.div style={play ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined} className="absolute inset-0">
        {/* camada SVG: órbita, linhas, ondas e escudo */}
        <motion.svg style={mid} viewBox="0 0 400 400" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="hs-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fbe286" />
              <stop offset="0.4" stopColor="#f2c62e" />
              <stop offset="0.75" stopColor="#c9930f" />
              <stop offset="1" stopColor="#fbe286" />
            </linearGradient>
            <radialGradient id="hs-fill" cx="0.5" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#2a2414" />
              <stop offset="1" stopColor="#0e0d0b" />
            </radialGradient>
            <filter id="hs-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* órbita tracejada girando */}
          <motion.g
            style={{ originX: "200px", originY: "200px" }}
            animate={play ? { rotate: 360 } : undefined}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          >
            <circle cx={C} cy={C} r={172} fill="none" stroke="rgba(238,189,37,0.18)" strokeWidth="1" strokeDasharray="2 7" />
            <circle cx={C} cy={C - 172} r="3" fill="#f2c62e" />
            <circle cx={C + 172} cy={C} r="2" fill="#fbe286" opacity="0.7" />
          </motion.g>
          <circle cx={C} cy={C} r={128} fill="none" stroke="rgba(238,189,37,0.1)" strokeWidth="1" />

          {/* linhas bem → escudo */}
          {NODES.map((n, i) => {
            const on = i === active;
            return (
              <g key={n.key}>
                <line x1={n.x} y1={n.y} x2={C} y2={C} stroke="rgba(238,189,37,0.16)" strokeWidth="1" />
                <motion.line
                  x1={n.x}
                  y1={n.y}
                  x2={C}
                  y2={C}
                  stroke="url(#hs-gold)"
                  strokeWidth={on ? 2.2 : 1.2}
                  strokeLinecap="round"
                  strokeDasharray="3 10"
                  initial={{ opacity: play ? 0 : 0.45 }}
                  animate={{ opacity: on ? 1 : 0.45, strokeDashoffset: play ? [0, -26] : 0 }}
                  transition={{
                    opacity: { duration: 0.5 },
                    strokeDashoffset: { duration: 1.1, repeat: Infinity, ease: "linear" },
                  }}
                />
              </g>
            );
          })}

          {/* ondas de proteção */}
          {play &&
            [0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={C}
                cy={C + 2}
                r={70}
                fill="none"
                stroke="#eebd25"
                strokeWidth="1.2"
                style={{ originX: "200px", originY: "202px" }}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: [0.9, 2.1], opacity: [0.5, 0] }}
                transition={{ duration: 3.6, delay: 1.4 + i * 1.2, repeat: Infinity, ease: "easeOut" }}
              />
            ))}

          {/* escudo */}
          <motion.path
            d={SHIELD}
            fill="url(#hs-fill)"
            initial={{ opacity: play ? 0 : 1 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          />
          <motion.path
            d={SHIELD}
            fill="none"
            stroke="url(#hs-gold)"
            strokeWidth="4"
            strokeLinejoin="round"
            filter="url(#hs-glow)"
            initial={{ pathLength: play ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.15, duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.path
            d="M200 128 L252 147 V198 C252 235 230 259 200 274 C170 259 148 235 148 198 V147 Z"
            fill="none"
            stroke="rgba(251,226,134,0.35)"
            strokeWidth="1"
            initial={{ pathLength: play ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
          />
          <motion.path
            d="M174 202 L193 221 L229 182"
            fill="none"
            stroke="url(#hs-gold)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: play ? 0 : 1 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 1.15, duration: 0.5, ease: "easeOut" }}
          />
          {/* brilho que atravessa o escudo */}
          {play && (
            <motion.path
              d={SHIELD}
              fill="none"
              stroke="#fff6d8"
              strokeWidth="2"
              strokeDasharray="40 600"
              animate={{ strokeDashoffset: [0, -640] }}
              transition={{ duration: 3.2, delay: 1.6, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
            />
          )}
        </motion.svg>

        {/* camada HTML: bens com ícones */}
        <motion.div style={front} className="absolute inset-0">
          {NODES.map((n, i) => {
            const Icon = n.icon;
            const on = i === active;
            return (
              <motion.button
                key={n.key}
                type="button"
                data-cursor="Proteger"
                onPointerEnter={() => {
                  setHovering(true);
                  setActive(i);
                }}
                onPointerLeave={() => setHovering(false)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                aria-label={`${n.label}: ${n.caption}`}
                aria-pressed={on}
                className="absolute -translate-x-1/2 -translate-y-1/2 outline-none focus-visible:ring-2 focus-visible:ring-gold-400 rounded-2xl"
                style={{ left: `${(n.x / 400) * 100}%`, top: `${(n.y / 400) * 100}%` }}
                initial={play ? { opacity: 0, scale: 0.4 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + i * 0.12, type: "spring", stiffness: 240, damping: 16 }}
              >
                <motion.span
                  animate={play ? { y: [0, -6, 0] } : undefined}
                  transition={{ duration: 3.4 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
                  className="flex flex-col items-center gap-2"
                >
                  <span
                    className={cn(
                      "relative grid size-14 place-items-center rounded-2xl border backdrop-blur-md transition-all duration-500 sm:size-16",
                      on
                        ? "border-gold-300/80 bg-gold-gradient text-ink-950 shadow-[0_0_0_6px_rgba(238,189,37,0.14),0_18px_40px_-10px_rgba(238,189,37,0.65)]"
                        : "border-ink-950/10 bg-white/85 text-gold-700 shadow-[0_14px_30px_-12px_rgba(70,50,12,0.3)] dark:border-white/12 dark:bg-ink-900/70 dark:text-gold-200 dark:shadow-[0_14px_30px_-12px_rgba(0,0,0,0.8)]",
                    )}
                  >
                    <Icon className="size-6 sm:size-7" strokeWidth={1.8} />
                    {on && (
                      <motion.span
                        layoutId="hs-ring"
                        className="absolute -inset-2 rounded-[20px] border border-gold-400/70"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                  </span>
                  <span className={cn("text-[11px] font-bold uppercase tracking-[0.18em] transition-colors", on ? "text-gold-700 dark:text-gold-200" : "text-ink-900/50 dark:text-ivory-100/50")}>{n.label}</span>
                </motion.span>
              </motion.button>
            );
          })}
        </motion.div>
      </motion.div>

      {/* legenda */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-2 flex justify-center sm:bottom-0" aria-live="polite">
        <motion.p
          key={current.key}
          initial={play ? { opacity: 0, y: 8, filter: "blur(6px)" } : false}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-white/85 px-4 py-1.5 text-[13px] font-semibold text-ink-950 backdrop-blur dark:bg-ink-900/80 dark:text-ivory-100"
        >
          <span className="size-1.5 rounded-full bg-[#3ddc84] shadow-[0_0_8px_#3ddc84]" aria-hidden />
          {current.caption}
        </motion.p>
      </div>
    </div>
  );
}
