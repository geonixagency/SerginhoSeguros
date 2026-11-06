"use client";

import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { MessageAttachment } from "@/lib/types";

export const ANEXO_MAX_MB = 10;
export const ANEXO_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.pptx,application/pdf,image/jpeg,image/png,image/webp";

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Escolhe e sobe um arquivo (até 10 MB) para mandar no WhatsApp.
 * O arquivo é enviado na hora para o servidor (que confere tipo e tamanho) e volta como documento.
 */
export function AttachmentPicker({
  value,
  onChange,
  clientId,
  label = "Anexar arquivo",
}: {
  value: Pick<MessageAttachment, "documentId" | "nome"> & Partial<MessageAttachment> | null;
  onChange: (a: MessageAttachment | null) => void;
  clientId?: string;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: (f: File) => api.messaging.uploadAttachment(f, clientId),
    onSuccess: (a) => onChange(a),
    onError: (e: Error) => toast.error("Não foi possível anexar", { description: e.message }),
  });
  const pick = (f: File | undefined) => {
    if (ref.current) ref.current.value = "";
    if (!f) return;
    if (f.size > ANEXO_MAX_MB * 1024 * 1024) {
      toast.error(`O anexo passa de ${ANEXO_MAX_MB} MB`, { description: `${f.name} tem ${formatBytes(f.size)}.` });
      return;
    }
    up.mutate(f);
  };
  const isImg = value?.mimeType?.startsWith("image/");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={ref} type="file" accept={ANEXO_ACCEPT} className="sr-only" aria-label={label} onChange={(e) => pick(e.target.files?.[0])} />
      {value ? (
        <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-surface-2 py-1.5 pl-2.5 pr-1 text-sm">
          {isImg ? <ImageIcon className="size-4 shrink-0 text-accent-text" /> : <FileText className="size-4 shrink-0 text-accent-text" />}
          <span className="truncate font-medium">{value.nome}</span>
          {value.tamanho !== undefined && <span className="shrink-0 text-xs text-muted tabular">{formatBytes(value.tamanho)}</span>}
          <button type="button" onClick={() => onChange(null)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-foreground" aria-label="Remover anexo">
            <X className="size-3.5" />
          </button>
        </span>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()} loading={up.isPending}>
          <Paperclip /> {up.isPending ? "Enviando arquivo…" : label}
        </Button>
      )}
      {!value && !up.isPending && <span className="text-xs text-subtle">PDF, imagem ou Word/Excel, até {ANEXO_MAX_MB} MB</span>}
    </div>
  );
}
