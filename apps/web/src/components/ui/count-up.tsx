"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/** Número animado (0 → valor) quando entra na tela. Formatação pt-BR. */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("pt-BR"),
  duration = 1.4,
  delay = 0,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px 0px" });
  const reduce = useReducedMotion();
  const fmt = useRef(format);
  fmt.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = fmt.current(value);
      return;
    }
    if (!inView) return;
    const from = Number(el.dataset.v ?? 0);
    const c = animate(from, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt.current(v);
        el.dataset.v = String(v);
      },
    });
    return () => c.stop();
  }, [inView, value, duration, delay, reduce]);

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {format(0)}
    </span>
  );
}
