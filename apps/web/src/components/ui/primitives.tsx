"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Input / Textarea / Label ---------- */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-[10px] border border-border-strong bg-surface px-3 text-sm text-foreground placeholder:text-subtle transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:border-gold-500 focus-visible:ring-3 focus-visible:ring-gold-400/25",
        "disabled:opacity-60 aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-24 w-full rounded-[10px] border border-border-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-subtle",
        "focus-visible:outline-none focus-visible:border-gold-500 focus-visible:ring-3 focus-visible:ring-gold-400/25",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-[13px] font-semibold text-foreground", className)} {...props} />
));
Label.displayName = "Label";

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs font-medium text-danger" role="alert">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/* ---------- Native select (acessível e leve) ---------- */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-10 w-full appearance-none rounded-[10px] border border-border-strong bg-surface pl-3 pr-9 text-sm text-foreground",
          "focus-visible:outline-none focus-visible:border-gold-500 focus-visible:ring-3 focus-visible:ring-gold-400/25",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  ),
);
NativeSelect.displayName = "NativeSelect";

/* ---------- Switch ---------- */
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors duration-200",
      "data-[state=checked]:bg-gold-gradient data-[state=unchecked]:bg-border-strong",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-md transition-transform duration-200 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5" />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";

/* ---------- Checkbox ---------- */
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer size-[18px] shrink-0 rounded-[5px] border border-border-strong bg-surface transition-colors data-[state=checked]:border-gold-600 data-[state=checked]:bg-gold-gradient focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-ink-950">
      <Check className="size-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

/* ---------- Tooltip ---------- */
export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-ivory-100 shadow-lg data-[state=delayed-open]:animate-in dark:bg-ivory-100 dark:text-ink-950"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ---------- Card ---------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-soft)]", className)} {...props} />;
}
export function CardHeader({ className, title, description, action, icon }: { className?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-text [&_svg]:size-4">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
type Tone = "neutral" | "gold" | "success" | "warning" | "danger" | "info" | "ink";
const toneCls: Record<Tone, string> = {
  neutral: "bg-sunken text-muted border-border",
  gold: "bg-accent-soft text-accent-text border-gold-300/50 dark:border-gold-700/50",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
  ink: "bg-ink-900 text-gold-300 border-ink-700 dark:bg-gold-400 dark:text-ink-950 dark:border-gold-500",
};
export function Badge({ tone = "neutral", className, dot, children }: { tone?: Tone; className?: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-semibold leading-5", toneCls[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("relative overflow-hidden rounded-md bg-sunken", className)} aria-hidden><div className="shine-sweep absolute inset-0 opacity-60" /></div>;
}

/* ---------- Avatar (iniciais) ---------- */
export function Avatar({ nome, className, tone = "ink", src }: { nome: string; className?: string; tone?: "ink" | "gold"; src?: string | null }) {
  const p = nome.trim().split(/\s+/);
  const ini = ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data URL pequena, sem otimização do Next
      <img src={src} alt="" aria-hidden className={cn("inline-block size-9 shrink-0 rounded-full object-cover ring-1 ring-gold-500/40", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-bold",
        tone === "ink" ? "bg-ink-900 text-gold-300 ring-1 ring-gold-500/30 dark:bg-ink-800" : "bg-gold-gradient text-ink-950",
        className,
      )}
    >
      {ini}
    </span>
  );
}

/* ---------- Empty / Error states ---------- */
export function EmptyState({ icon, title, description, action, className }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="relative mb-4 grid size-14 place-items-center rounded-2xl border border-gold-500/30 bg-accent-soft text-accent-text [&_svg]:size-6">
        {icon}
        <span className="absolute -inset-2 -z-10 rounded-3xl border border-dashed border-gold-500/25" aria-hidden />
      </div>
      <p className="font-display text-xl font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
      </div>
      <p className="text-sm font-semibold">Não foi possível carregar</p>
      <p className="max-w-sm text-sm text-muted">{message ?? "Tente novamente em instantes."}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-semibold text-accent-text underline-offset-4 hover:underline">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/* ---------- Progress ---------- */
export function Progress({ value, className, tone = "gold" }: { value: number; className?: string; tone?: "gold" | "success" | "danger" }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-sunken", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", tone === "gold" ? "bg-gold-gradient" : tone === "success" ? "bg-success" : "bg-danger")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
