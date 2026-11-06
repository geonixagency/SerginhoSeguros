"use client";

/**
 * Interações do site institucional (só com ponteiro fino e sem prefers-reduced-motion):
 * - <SiteCursor/>: anel dourado + ponto que seguem o mouse; cresce sobre links/botões e mostra
 *   o rótulo de `data-cursor` quando houver;
 * - useTilt(): inclinação 3D com reflexo seguindo o mouse (cards de produto);
 * - <Magnetic/>: elemento atraído pelo cursor (CTAs).
 */
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, type MotionStyle } from "motion/react";

function useFinePointer() {
  const reduce = useReducedMotion();
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine) and (hover: hover)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine && !reduce;
}

const INTERACTIVE = "a, button, [role='button'], label, summary, [data-cursor]";

export function SiteCursor() {
  const enabled = useFinePointer();
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 420, damping: 34, mass: 0.5 });
  const ry = useSpring(y, { stiffness: 420, damping: 34, mass: 0.5 });
  const [hover, setHover] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [hidden, setHidden] = useState(true);
  const [down, setDown] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.classList.add("ss-cursor-on");
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      setHidden(false);
      const el = e.target instanceof Element ? e.target : null;
      const field = el?.closest("input, textarea, select, [contenteditable]");
      if (field) {
        setHidden(true);
        return;
      }
      const hit = el?.closest(INTERACTIVE);
      setHover(!!hit);
      setLabel(hit?.getAttribute("data-cursor") ?? null);
    };
    const onLeave = () => setHidden(true);
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      html.classList.remove("ss-cursor-on");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled, x, y]);

  if (!enabled) return null;
  const size = label ? 84 : hover ? 52 : 34;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-hidden>
      <motion.div
        className="absolute left-0 top-0 grid place-items-center rounded-full border border-gold-400 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-950"
        style={{ x: rx, y: ry, translateX: "-50%", translateY: "-50%" }}
        animate={{
          width: size,
          height: size,
          opacity: hidden ? 0 : 1,
          scale: down ? 0.85 : 1,
          backgroundColor: label ? "rgba(242,198,46,0.95)" : hover ? "rgba(242,198,46,0.14)" : "rgba(242,198,46,0)",
          borderColor: hover ? "rgba(242,198,46,0.9)" : "rgba(242,198,46,0.75)",
        }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
      >
        {label && (
          <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}>
            {label}
          </motion.span>
        )}
      </motion.div>
      <motion.div
        className="absolute left-0 top-0 size-1.5 rounded-full bg-gold-400 shadow-[0_0_10px_rgba(242,198,46,0.9)]"
        style={{ x, y, translateX: "-50%", translateY: "-50%" }}
        animate={{ opacity: hidden || label ? 0 : 1 }}
      />
    </div>
  );
}

/** Inclinação 3D + reflexo. Aplique `bind` ao elemento e renderize `glare` dentro dele. */
export function useTilt<T extends HTMLElement>(max = 7) {
  const enabled = useFinePointer();
  const ref = useRef<T>(null);
  const rxRaw = useMotionValue(0);
  const ryRaw = useMotionValue(0);
  const rotateX = useSpring(rxRaw, { stiffness: 200, damping: 20 });
  const rotateY = useSpring(ryRaw, { stiffness: 200, damping: 20 });

  const onPointerMove = (e: React.PointerEvent<T>) => {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ryRaw.set((px - 0.5) * 2 * max);
    rxRaw.set((0.5 - py) * 2 * max);
    ref.current.style.setProperty("--gx", `${px * 100}%`);
    ref.current.style.setProperty("--gy", `${py * 100}%`);
  };
  const onPointerLeave = () => {
    rxRaw.set(0);
    ryRaw.set(0);
  };
  const style: MotionStyle = enabled ? { rotateX, rotateY, transformPerspective: 1000 } : {};
  return { ref, bind: { onPointerMove, onPointerLeave }, style, enabled };
}

export function TiltGlare({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      style={{
        background: `radial-gradient(420px circle at var(--gx,50%) var(--gy,50%), ${dark ? "rgba(251,226,134,0.16)" : "rgba(238,189,37,0.14)"}, transparent 60%)`,
      }}
    />
  );
}

export function Magnetic({ children, strength = 0.35, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const enabled = useFinePointer();
  const ref = useRef<HTMLDivElement>(null);
  const xRaw = useMotionValue(0);
  const yRaw = useMotionValue(0);
  const x = useSpring(xRaw, { stiffness: 220, damping: 15, mass: 0.4 });
  const y = useSpring(yRaw, { stiffness: 220, damping: 15, mass: 0.4 });
  return (
    <motion.div
      ref={ref}
      className={className ?? "inline-flex"}
      style={enabled ? { x, y } : undefined}
      onPointerMove={(e) => {
        if (!enabled || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        xRaw.set((e.clientX - (r.left + r.width / 2)) * strength);
        yRaw.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        xRaw.set(0);
        yRaw.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
