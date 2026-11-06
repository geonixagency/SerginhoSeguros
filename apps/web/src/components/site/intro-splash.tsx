"use client";

/**
 * Abertura do site: a logo é traçada sobre o nanquim e a cortina sobe revelando o hero.
 * - no máximo ~2,4 s (1,85 s de logo + 0,55 s de saída); clique/tecla pula;
 * - uma vez por sessão (sessionStorage "ss-intro");
 * - prefers-reduced-motion: não aparece.
 * O script inline em app/page.tsx marca <html class="ss-intro-seen"> antes da pintura,
 * evitando o "piscar" da cortina para quem já viu a abertura nesta sessão.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AnimatedLogo } from "@/components/brand/animated-logo";

export const INTRO_KEY = "ss-intro";
const HOLD_MS = 1850;

export function IntroSplash({ onDone }: { onDone?: (played: boolean) => void }) {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(true);
  const [off, setOff] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(INTRO_KEY) === "1";
    } catch {
      /* storage bloqueado: mostra a abertura normalmente */
    }
    if (seen || reduce) {
      setOff(true);
      onDone?.(false);
      return;
    }
    document.documentElement.style.overflow = "hidden";
    const t = window.setTimeout(() => setVisible(false), HOLD_MS);
    const skip = () => setVisible(false);
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", skip);
      document.documentElement.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  if (off) return null;

  return (
    <AnimatePresence
      onExitComplete={() => {
        document.documentElement.style.overflow = "";
        try {
          sessionStorage.setItem(INTRO_KEY, "1");
        } catch {
          /* ignore */
        }
        onDone?.(true);
      }}
    >
      {visible && (
        <motion.div
          key="intro"
          data-intro
          className="intro-splash fixed inset-0 z-[100] grid cursor-pointer place-items-center bg-ink-950"
          onClick={() => setVisible(false)}
          exit={{ clipPath: "inset(0% 0% 100% 0%)" }}
          initial={{ clipPath: "inset(0% 0% 0% 0%)" }}
          transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
          role="presentation"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_40%_at_50%_50%,rgba(238,189,37,0.16),transparent_70%)]" aria-hidden />
          <div className="grain pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" aria-hidden />
          <motion.div
            exit={{ scale: 1.12, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.45, ease: "easeIn" }}
            className="relative w-[min(56vw,260px)]"
          >
            <AnimatedLogo uid="intro" className="w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.6)]" />
          </motion.div>
          <motion.span
            className="absolute bottom-0 left-0 h-[2px] bg-gold-gradient"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: HOLD_MS / 1000, ease: "linear" }}
            aria-hidden
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="absolute bottom-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-ivory-100/40"
          >
            Toque para pular
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
