"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/* ---------------- Dialog ---------------- */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  side,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  side?: "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/50 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_.2s_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border border-border bg-surface shadow-[var(--shadow-lift)] focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 h-full w-full max-w-[520px] rounded-l-[var(--radius-xl)] data-[state=open]:animate-[slideIn_.28s_cubic-bezier(.2,.8,.2,1)]"
            : "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-xl)] data-[state=open]:animate-[popIn_.22s_cubic-bezier(.2,.8,.2,1)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <DialogPrimitive.Title className="font-display text-2xl font-semibold leading-tight">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-foreground" aria-label="Fechar">
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/* ---------------- Tabs com sublinhado dourado animado ---------------- */
export function Tabs({
  value,
  onValueChange,
  items,
  className,
  children,
  layoutId = "tabs",
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: React.ReactNode; count?: number }[];
  className?: string;
  children?: React.ReactNode;
  layoutId?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções">
        {items.map((it) => (
          <TabsPrimitive.Trigger
            key={it.value}
            value={it.value}
            className="relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold text-muted transition-colors hover:text-foreground data-[state=active]:text-foreground"
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className="rounded-full bg-sunken px-1.5 text-[11px] font-bold tabular text-muted">{it.count}</span>
            )}
            {value === it.value && (
              <motion.span layoutId={layoutId} className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gold-gradient" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            )}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ---------------- Segmented (pílulas) ---------------- */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  layoutId,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  layoutId: string;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-[10px] border border-border bg-sunken p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn("relative h-8 rounded-[8px] px-3 text-[13px] font-semibold transition-colors", active ? "text-foreground" : "text-muted hover:text-foreground")}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-[8px] bg-surface shadow-sm ring-1 ring-border" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Dropdown ---------------- */
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export function DropdownMenuContent({ className, children, align = "end" }: { className?: string; children: React.ReactNode; align?: "start" | "end" | "center" }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lift)] data-[state=open]:animate-[popIn_.16s_ease-out]", className)}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn("flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 text-sm outline-none data-[highlighted]:bg-sunken [&_svg]:size-4 [&_svg]:text-muted", className)}
      {...props}
    />
  );
}
export const DropdownMenuSeparator = () => <DropdownPrimitive.Separator className="my-1 h-px bg-border" />;
export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownPrimitive.Label className="px-2.5 py-1.5 text-xs font-semibold text-muted">{children}</DropdownPrimitive.Label>;
}
