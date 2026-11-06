/* eslint-disable */
// Originkit — Text Carousel (https://www.originkit.dev/components/text-carousel)
// Adaptado: estilo via classes Tailwind, respeita prefers-reduced-motion e pausa quando a aba está oculta.
"use client";

import * as React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";

type Props = {
  prefix?: string;
  texts: string[];
  className?: string;
  prefixClassName?: string;
  badgeClassName?: string;
  badgePaddingX?: number;
  interval?: number;
  duration?: number;
  stagger?: number;
};

const splitChars = (text: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
    return Array.from(seg.segment(text), (p) => p.segment);
  }
  return Array.from(text);
};

export default function TextCarousel({
  prefix,
  texts,
  className = "",
  prefixClassName = "",
  badgeClassName = "",
  badgePaddingX = 14,
  interval = 2200,
  duration = 0.45,
  stagger = 0.03,
}: Props) {
  const safe = texts.length ? texts : ["—"];
  const [idx, setIdx] = useState(0);
  const contentRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const animating = useRef(false);
  const sized = useRef(false);
  const words = useMemo(() => {
    const w = (safe[idx] ?? "").split(" ");
    return w.map((word, i) => ({ chars: splitChars(word), space: i !== w.length - 1 }));
  }, [safe, idx]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (safe.length <= 1) return;
    const id = window.setInterval(() => {
      if (animating.current || document.hidden) return;
      const chars = contentRef.current?.querySelectorAll(".char");
      if (reduce || !chars || chars.length === 0) {
        setIdx((i) => (i + 1) % safe.length);
        return;
      }
      animating.current = true;
      gsap.to(chars, {
        yPercent: -120,
        opacity: 0,
        duration: duration * 0.8,
        stagger: { each: stagger },
        ease: "power2.in",
        onComplete: () => setIdx((i) => (i + 1) % safe.length),
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [safe.length, interval, duration, stagger]);

  useEffect(() => {
    const chars = contentRef.current?.querySelectorAll(".char");
    if (!chars || chars.length === 0) {
      animating.current = false;
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      animating.current = false;
      return;
    }
    gsap.killTweensOf(chars);
    animating.current = true;
    gsap.fromTo(chars, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration, stagger: { each: stagger }, ease: "power2.out", onComplete: () => (animating.current = false) });
    return () => {
      gsap.killTweensOf(chars);
    };
  }, [idx, words, duration, stagger]);

  useLayoutEffect(() => {
    const badge = badgeRef.current;
    const content = contentRef.current;
    if (!badge || !content) return;
    const w = content.scrollWidth + badgePaddingX * 2;
    gsap.killTweensOf(badge);
    if (!sized.current) {
      sized.current = true;
      gsap.set(badge, { width: w });
      return;
    }
    gsap.to(badge, { width: w, duration, ease: "power2.out" });
  }, [idx, words, badgePaddingX, duration]);

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {prefix ? <span className={prefixClassName} style={{ whiteSpace: "pre" }}>{prefix}</span> : null}
      <span
        ref={badgeRef}
        className={`relative inline-flex items-center justify-center overflow-hidden ${badgeClassName}`}
        style={{ paddingLeft: badgePaddingX, paddingRight: badgePaddingX, boxSizing: "border-box" }}
      >
        <span className="sr-only">{safe[idx]}</span>
        <span ref={contentRef} aria-hidden="true" className="relative inline-flex whitespace-nowrap">
          {words.map((w, wi) => (
            <span key={`${idx}-${wi}`} className="inline-flex">
              {w.chars.map((c, ci) => (
                <span key={`${idx}-${wi}-${ci}`} className="char inline-block will-change-transform">
                  {c}
                </span>
              ))}
              {w.space ? <span style={{ whiteSpace: "pre" }}> </span> : null}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
