/* eslint-disable */
// Originkit — Foil Drift (https://www.originkit.dev/components/foil-drift)
// Adaptado: sem minWidth/minHeight fixos, pausa fora da tela e respeita prefers-reduced-motion.
"use client";

import * as React from "react";
import { useEffect, useRef } from "react";

const MAX_DPR = 2;

const VERT_SRC = `
precision highp float;
attribute vec2 a_seed;
attribute vec4 a_rnd;
uniform vec2  uRes;
uniform float uTime, uPx, uTumble, uSharp, uDrift, uSpread, uTilt;
uniform vec2  uLight;
varying float v_spec;
void main(){
  float ar = uRes.x / max(uRes.y, 1.0);
  float par = mix(0.55, 1.35, a_rnd.z);
  vec2 q = a_seed;
  q.x = fract(q.x + uTime * uDrift * 0.010 * par);
  q.y = fract(q.y + uTime * uDrift * 0.004 * par + 0.10 * sin(uTime * 0.20 + a_rnd.x * 6.283));
  vec2 p = (q - 0.5) * 2.05 * vec2(ar, 1.0);
  float spin = uTime * uTumble * (0.50 + a_rnd.y) + a_rnd.x * 6.283;
  float amp = uTilt * a_rnd.w * a_rnd.w;
  vec3 N = normalize(vec3(amp * cos(spin), amp * sin(spin), 1.0));
  vec3 lv = vec3(uLight, uSpread) - vec3(p, 0.0);
  vec3 L = normalize(lv);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float atten = 1.0 / (1.0 + dot(lv, lv) * 0.42);
  float spec = pow(max(dot(N, H), 0.0), uSharp) * atten;
  v_spec = spec;
  float sz = uPx * (0.55 + 0.85 * fract(a_rnd.x * 7.13)) * par * (1.0 + 1.6 * spec);
  gl_PointSize = clamp(sz, 0.0, 120.0);
  gl_Position = vec4(p / vec2(ar, 1.0), 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
uniform vec3 uBase, uAccent, uHigh;
varying float v_spec;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.55, 1.0, length(q) * 2.0);
  float s = v_spec;
  vec3 col = uBase * 0.45 + mix(uAccent, uHigh, clamp(s * 0.85, 0.0, 1.0)) * s * 2.8;
  float a = m * clamp(0.055 + s * 2.6, 0.0, 1.0);
  gl_FragColor = vec4(min(col * a, vec3(1.0)), a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function parseColor(input: string | undefined, fb: [number, number, number]): [number, number, number] {
  if (!input) return fb;
  const str = String(input).trim();
  if (str.charAt(0) === "#") {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255];
    }
  }
  return fb;
}

const clampN = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flakes(n: number) {
  const R = rng(31337);
  const cols = Math.max(1, Math.round(Math.sqrt(n * 1.5)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const count = cols * rows;
  const seed = new Float32Array(count * 2);
  const rnd = new Float32Array(count * 4);
  let k = 0;
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    seed[k * 2] = (gx + R()) / cols;
    seed[k * 2 + 1] = (gy + R()) / rows;
    rnd[k * 4] = R(); rnd[k * 4 + 1] = R(); rnd[k * 4 + 2] = R(); rnd[k * 4 + 3] = R();
    k++;
  }
  return { seed, rnd, count };
}

export interface FoilDriftProps {
  className?: string;
  style?: React.CSSProperties;
  background?: string;
  baseColor?: string;
  accentColor?: string;
  highlight?: string;
  density?: number;
  dotSize?: number;
  speed?: number;
  hover?: number;
  tumble?: number;
  tilt?: number;
  sharpness?: number;
  drift?: number;
  spread?: number;
}

export default function FoilDrift({
  className,
  style,
  background = "transparent",
  baseColor = "#2A2C38",
  accentColor = "#D8A218",
  highlight = "#FFF4D6",
  density = 9800,
  dotSize = 50,
  speed = 50,
  hover = 100,
  tumble = 300,
  tilt = 300,
  sharpness = 24,
  drift = 300,
  spread = 200,
}: FoilDriftProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vRef = useRef<Record<string, number | string>>({});
  vRef.current = {
    base: baseColor,
    accent: accentColor,
    high: highlight,
    density: Math.round(clampN(density, 800, 30000)),
    dotSize: clampN(dotSize, 20, 400) / 100,
    speed: clampN(speed, 0, 100) / 50,
    hover: clampN(hover, 0, 200) / 100,
    tumble: clampN(tumble, 0, 300) / 100,
    tilt: (clampN(tilt, 10, 300) / 100) * 0.85,
    sharpness: clampN(sharpness, 20, 400) / 100,
    drift: clampN(drift, 0, 300) / 100,
    spread: clampN(spread, 10, 200) / 100,
  };
  const ptrRef = useRef({ x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, on: 0, onTarget: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
    if (!gl) return;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aSeed = gl.getAttribLocation(prog, "a_seed");
    const aRnd = gl.getAttribLocation(prog, "a_rnd");
    gl.enableVertexAttribArray(aSeed);
    gl.enableVertexAttribArray(aRnd);
    const locs: Record<string, WebGLUniformLocation | null> = {};
    const u = (name: string) => (name in locs ? locs[name] : (locs[name] = gl.getUniformLocation(prog, name)));

    const bSeed = gl.createBuffer();
    const bRnd = gl.createBuffer();
    let builtFor = 0;
    let count = 0;
    const build = (n: number) => {
      const f = flakes(n);
      gl.bindBuffer(gl.ARRAY_BUFFER, bSeed);
      gl.bufferData(gl.ARRAY_BUFFER, f.seed, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bRnd);
      gl.bufferData(gl.ARRAY_BUFFER, f.rnd, gl.STATIC_DRAW);
      builtFor = n;
      count = f.count;
    };

    let raf = 0;
    let last = performance.now();
    let clock = 12;
    let visible = true;

    const render = (nowT: number) => {
      const dt = Math.min(0.05, (nowT - last) / 1000);
      last = nowT;
      const v = vRef.current;
      clock = (clock + dt * (v.speed as number)) % 3600;
      const ptr = ptrRef.current;
      const k = 1 - Math.exp(-6 * dt);
      ptr.on += (ptr.onTarget - ptr.on) * k;
      ptr.x += ((ptr.onTarget > 0 ? ptr.tx : 0.5) - ptr.x) * k;
      ptr.y += ((ptr.onTarget > 0 ? ptr.ty : 0.5) - ptr.y) * k;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = canvas.clientWidth || 1200;
      const ch = canvas.clientHeight || 800;
      const bw = Math.max(1, Math.round(cw * dpr));
      const bh = Math.max(1, Math.round(ch * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl.viewport(0, 0, bw, bh);
      const ar = bw / Math.max(bh, 1);
      const shortEdge = Math.min(bw, bh);
      const wantN = v.density as number;
      if (wantN !== builtFor) build(wantN);

      const hv = Math.min(1, ptr.on) * (v.hover as number);
      const dx = 0.62 * ar * Math.cos(clock * 0.3);
      const dy = 0.4 * Math.sin(clock * 0.23);
      const mx = (ptr.x - 0.5) * 2.05 * ar;
      const my = (1 - ptr.y - 0.5) * 2.05;
      const lx = dx + (mx - dx) * Math.min(1, hv);
      const ly = dy + (my - dy) * Math.min(1, hv);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, bSeed);
      gl.vertexAttribPointer(aSeed, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bRnd);
      gl.vertexAttribPointer(aRnd, 4, gl.FLOAT, false, 0, 0);
      gl.uniform2f(u("uRes"), bw, bh);
      gl.uniform1f(u("uTime"), clock);
      gl.uniform1f(u("uPx"), Math.max(1.0, (shortEdge / 1080) * 5.0 * (v.dotSize as number)));
      gl.uniform1f(u("uTumble"), v.tumble as number);
      gl.uniform1f(u("uTilt"), v.tilt as number);
      gl.uniform1f(u("uSharp"), 55.0 * (v.sharpness as number));
      gl.uniform1f(u("uDrift"), v.drift as number);
      gl.uniform1f(u("uSpread"), v.spread as number);
      gl.uniform2f(u("uLight"), lx, ly);
      const cb = parseColor(v.base as string, [0.165, 0.173, 0.22]);
      const ca = parseColor(v.accent as string, [0.784, 0.698, 0.478]);
      const chh = parseColor(v.high as string, [1, 0.957, 0.839]);
      gl.uniform3f(u("uBase"), cb[0], cb[1], cb[2]);
      gl.uniform3f(u("uAccent"), ca[0], ca[1], ca[2]);
      gl.uniform3f(u("uHigh"), chh[0], chh[1], chh[2]);
      gl.drawArrays(gl.POINTS, 0, count);
      if (!reduce && visible) raf = requestAnimationFrame(render);
    };

    const track = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      ptrRef.current.tx = clampN((e.clientX - r.left) / r.width, 0, 1);
      ptrRef.current.ty = clampN((e.clientY - r.top) / r.height, 0, 1);
      ptrRef.current.onTarget = 1;
    };
    const onLeave = () => (ptrRef.current.onTarget = 0);
    const host = canvas.parentElement?.parentElement ?? canvas;
    host.addEventListener("pointermove", track as EventListener);
    host.addEventListener("pointerleave", onLeave);

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(render);
      }
    });
    io.observe(canvas);

    build(vRef.current.density as number);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      host.removeEventListener("pointermove", track as EventListener);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className={className} style={{ position: "relative", overflow: "hidden", background, width: "100%", height: "100%", ...style }} aria-hidden>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
