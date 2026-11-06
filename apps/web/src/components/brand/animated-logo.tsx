"use client";

/**
 * Marca Serginho Seguros recriada em vetor (traçados gerados de Cormorant Garamond
 * por scripts/gen-logo-paths.mjs) e animada em < 2 s:
 *   1. anel dourado é traçado e o disco nanquim surge
 *   2. os dois "S" são desenhados (stroke) e preenchidos em ouro
 *   3. o letreiro vertical é revelado de cima para baixo; "Consórcios e planos" sobe
 *   4. um brilho atravessa o ouro
 * prefers-reduced-motion: mostra o estado final, sem animação.
 */
import { motion, useReducedMotion, type Transition } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { S_LEFT, S_RIGHT, TAG_1, TAG_2, WORDMARK } from "./logo-paths";

const T_LEFT = "matrix(1.16 0 0 1 -18.88 0)";
const T_RIGHT = "matrix(1.16 0 0 1 -91.84 0)";
const T_WORD = "translate(529 54) rotate(90)";
const ease = [0.65, 0, 0.35, 1] as const;

export function AnimatedLogo({
  className,
  animate = true,
  delay = 0,
  withDisc = true,
  onComplete,
  title = "Serginho Seguros — Consórcios e Planos",
  uid = "ss",
}: {
  className?: string;
  animate?: boolean;
  delay?: number;
  withDisc?: boolean;
  onComplete?: () => void;
  title?: string;
  /** prefixo único dos ids SVG (gradientes/máscaras) quando há mais de uma logo na página */
  uid?: string;
}) {
  const reduce = useReducedMotion();
  const id = uid;
  const play = animate && !reduce;
  const t = (d: number, duration: number, extra?: Partial<Transition>): Transition =>
    play ? { delay: delay + d, duration, ease, ...extra } : { duration: 0 };

  const gold = `url(#g-${id})`;
  useEffect(() => {
    if (!play) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <svg viewBox="0 0 1000 1000" role="img" aria-label={title} className={cn("block", className)}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe286" />
          <stop offset="0.32" stopColor="#f2c62e" />
          <stop offset="0.62" stopColor="#c9930f" />
          <stop offset="0.82" stopColor="#e9b51f" />
          <stop offset="1" stopColor="#fbe286" />
        </linearGradient>
        <radialGradient id={`d-${id}`} cx="0.42" cy="0.36" r="0.75">
          <stop offset="0" stopColor="#1b1b1e" />
          <stop offset="0.7" stopColor="#09090a" />
          <stop offset="1" stopColor="#050505" />
        </radialGradient>
        <linearGradient id={`s-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fffbe8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`m-${id}`}>
          <path d={S_LEFT} transform={T_LEFT} fill="#fff" />
          <path d={S_RIGHT} transform={T_RIGHT} fill="#fff" />
          <path d={WORDMARK} transform={T_WORD} fill="#fff" />
        </mask>
        <clipPath id={`c-${id}`}>
          <motion.rect
            x="440"
            y="40"
            width="120"
            initial={{ height: play ? 0 : 830 }}
            animate={{ height: 830 }}
            transition={t(0.85, 0.6)}
          />
        </clipPath>
      </defs>

      {withDisc && (
        <>
          <motion.circle
            cx="500"
            cy="500"
            r="488"
            fill={`url(#d-${id})`}
            initial={{ opacity: play ? 0 : 1, scale: play ? 0.92 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={t(0.05, 0.6)}
            style={{ transformOrigin: "500px 500px" }}
          />
          <motion.circle
            cx="500"
            cy="500"
            r="476"
            fill="none"
            stroke={gold}
            strokeWidth="3"
            initial={{ pathLength: play ? 0 : 1, opacity: play ? 1 : 0.55 }}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={t(0, 0.9)}
            style={{ rotate: -90, transformOrigin: "500px 500px" }}
          />
        </>
      )}

      {/* S esquerdo e direito: traço → preenchimento */}
      {[
        { d: S_LEFT, tr: T_LEFT, at: 0.22 },
        { d: S_RIGHT, tr: T_RIGHT, at: 0.38 },
      ].map((s) => (
        <g key={s.tr} transform={s.tr}>
          <motion.path
            d={s.d}
            fill={gold}
            initial={{ fillOpacity: play ? 0 : 1 }}
            animate={{ fillOpacity: 1 }}
            transition={t(s.at + 0.6, 0.45)}
          />
          <motion.path
            d={s.d}
            fill="none"
            stroke={gold}
            strokeWidth="2.5"
            initial={{ pathLength: play ? 0 : 1, opacity: play ? 1 : 0 }}
            animate={{ pathLength: 1, opacity: 0 }}
            transition={
              play
                ? { pathLength: { delay: delay + s.at, duration: 0.8, ease }, opacity: { delay: delay + s.at + 0.85, duration: 0.3 } }
                : { duration: 0 }
            }
          />
        </g>
      ))}

      {/* Letreiro vertical revelado de cima para baixo */}
      <g clipPath={`url(#c-${id})`}>
        <path d={WORDMARK} transform={T_WORD} fill={gold} />
      </g>

      {/* Consórcios e planos */}
      <motion.g
        initial={{ opacity: play ? 0 : 1, y: play ? 14 : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={t(1.1, 0.5)}
        fill="#d9a520"
      >
        <path d={TAG_1} />
        <path d={TAG_2} />
      </motion.g>

      {/* Brilho atravessando o ouro */}
      {play && (
        <g mask={`url(#m-${id})`}>
          <g transform="skewX(-18)">
            <motion.rect
              y="0"
              width="240"
              height="1000"
              fill={`url(#s-${id})`}
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 1300, opacity: [0, 1, 1, 0] }}
              transition={{ delay: delay + 1.25, duration: 0.65, ease: "easeInOut" }}
              onAnimationComplete={onComplete}
            />
          </g>
        </g>
      )}
    </svg>
  );
}
