/* eslint-disable */
// Originkit — Focus Reveal (https://www.originkit.dev/components/focus-reveal)
// Cada caractere entra de um desfoque com escala, em stagger. Usa motion/react.
"use client";

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useEffect, useMemo, useRef, type CSSProperties, type ElementType } from "react";

type StaggerFrom = "start" | "center" | "end" | "random";
type TransitionValue = { duration?: number; delay?: number; ease?: string | number[]; staggerChildren?: number };

export type FocusRevealProps = {
  text: string;
  className?: string;
  charClassName?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span";
  blur?: number;
  staggerFrom?: StaggerFrom;
  transition?: TransitionValue;
  onComplete?: () => void;
  style?: CSSProperties;
};

const START_SCALE = 1.45;
const MAX_BLUR = 20;
const EASE_OUT = [0.215, 0.61, 0.355, 1] as const;
const DEFAULT_TRANSITION: TransitionValue = { duration: 0.4, delay: 0, ease: "easeOut", staggerChildren: 0.035 };
const MOTION_TAGS = { h1: motion.h1, h2: motion.h2, h3: motion.h3, p: motion.p, span: motion.span } as const satisfies Record<string, ElementType>;

const resolveEase = (ease: TransitionValue["ease"]): Transition["ease"] => {
  if (Array.isArray(ease)) return ease as [number, number, number, number];
  if (ease === "linear") return "linear";
  if (ease === "easeIn") return [0.55, 0.085, 0.68, 0.53];
  if (ease === "easeInOut") return [0.645, 0.045, 0.355, 1];
  return EASE_OUT as unknown as [number, number, number, number];
};

const buildStaggerDelays = (count: number, each: number, from: StaggerFrom, baseDelay: number): number[] => {
  if (count === 0) return [];
  if (from === "end") return Array.from({ length: count }, (_, i) => baseDelay + (count - 1 - i) * each);
  if (from === "center") {
    const mid = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => baseDelay + Math.abs(i - mid) * each);
  }
  if (from === "random") {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order.map((rank) => baseDelay + rank * each);
  }
  return Array.from({ length: count }, (_, i) => baseDelay + i * each);
};

export default function FocusReveal({
  text,
  className = "",
  charClassName = "",
  as: Tag = "h1",
  blur = 16,
  staggerFrom = "start",
  transition = DEFAULT_TRANSITION,
  onComplete,
  style,
}: FocusRevealProps) {
  const reduceMotion = useReducedMotion();
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const duration = transition.duration ?? DEFAULT_TRANSITION.duration!;
  const baseDelay = transition.delay ?? 0;
  const staggerEach = transition.staggerChildren ?? DEFAULT_TRANSITION.staggerChildren!;
  const chars = useMemo(() => text.split(""), [text]);
  const lastIndex = chars.length - 1;
  const safeBlur = Math.min(Math.max(blur, 0), MAX_BLUR);
  const skipMotion = reduceMotion === true;

  const delays = useMemo(
    () => buildStaggerDelays(chars.length, skipMotion ? 0 : staggerEach, staggerFrom, baseDelay),
    [chars.length, skipMotion, staggerFrom, baseDelay, staggerEach],
  );

  const words = useMemo(() => {
    const parts: { chars: string[]; startIndex: number }[] = [];
    let startIndex = 0;
    for (const token of text.split(/(\s+)/)) {
      if (!token) continue;
      parts.push({ chars: token.split(""), startIndex });
      startIndex += token.length;
    }
    return parts;
  }, [text]);

  useEffect(() => {
    if (!skipMotion || completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  }, [skipMotion]);

  const MotionTag = MOTION_TAGS[Tag];
  const hidden = skipMotion ? { opacity: 0 } : { opacity: 0, scale: START_SCALE, filter: `blur(${safeBlur}px)` };
  const visible = skipMotion ? { opacity: 1 } : { opacity: 1, scale: 1, filter: "blur(0px)" };

  return (
    <MotionTag aria-label={text} className={className} style={{ margin: 0, ...style }}>
      {words.map((word, wi) => {
        const ws = word.chars.every((c) => /\s/.test(c));
        return (
          <span key={wi} className={ws ? undefined : "inline-block whitespace-nowrap"} aria-hidden="true">
            {word.chars.map((char, ci) => {
              const index = word.startIndex + ci;
              return (
                <motion.span
                  key={`${char}-${index}`}
                  className={`inline-block will-change-[transform,opacity,filter] ${charClassName}`}
                  initial={hidden}
                  animate={visible}
                  transition={{ type: "tween", duration: skipMotion ? 0.15 : duration, delay: delays[index] ?? 0, ease: resolveEase(transition.ease) }}
                  onAnimationComplete={() => {
                    if (index === lastIndex && !completedRef.current) {
                      completedRef.current = true;
                      onCompleteRef.current?.();
                    }
                  }}
                >
                  {char === " " ? " " : char}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </MotionTag>
  );
}
