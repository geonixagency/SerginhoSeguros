"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Textarea } from "@/components/ui/primitives";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";
import { api } from "@/lib/api";
import { formatPhone } from "@/lib/utils";

/** Pré-visualização estilo WhatsApp + envio pela instância da corretora (Evolution, via backend). */
export function SendWhatsAppDialog({
  open,
  onOpenChange,
  clientId,
  nome,
  telefone,
  textoInicial,
  anexo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  nome: string;
  telefone: string;
  textoInicial: string;
  anexo?: string;
}) {
  const [texto, setTexto] = useState(textoInicial);
  useEffect(() => {
    if (open) setTexto(textoInicial);
  }, [open, textoInicial]);
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => api.messaging.send(clientId, texto, anexo),
    onSuccess: () => {
      toast.success("Mensagem enviada", { description: `Para ${nome} · ${formatPhone(telefone)}` });
      qc.invalidateQueries({ queryKey: ["client-messages", clientId] });
      qc.invalidateQueries({ queryKey: ["messaging"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Não foi possível enviar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Enviar por WhatsApp" description={`${nome} · ${formatPhone(telefone)}`}>
        <div className="grid grid-cols-1 gap-4 p-6">
          <div className="rounded-2xl bg-[#e9e2d6] p-4 dark:bg-[#0b141a]" aria-label="Pré-visualização">
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
              {anexo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 text-xs font-semibold dark:bg-white/10">
                  <Paperclip className="size-3.5" /> {anexo}
                </div>
              )}
              <p className="whitespace-pre-wrap">{texto || "…"}</p>
              <p className="mt-1 flex items-center justify-end gap-1 text-[10.5px] opacity-60">
                agora <CheckCheck className="size-3.5 text-[#53bdeb]" />
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <label htmlFor="wa-text" className="text-[13px] font-semibold">
              Mensagem
            </label>
            <Textarea id="wa-text" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!texto.trim()} className="bg-[#1fa855] text-white hover:brightness-110 dark:bg-[#25d366] dark:text-ink-950">
              {send.isPending ? "Enviando…" : (
                <>
                  <WhatsAppIcon className="size-4" /> Enviar agora <Send className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
