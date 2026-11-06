"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/primitives";

/** Visualizador de PDF embutido (usa o leitor nativo do navegador). */
export function PdfViewer({ load, nome, className }: { load: () => Promise<string>; nome: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    setUrl(null);
    setError(null);
    load()
      .then((u) => {
        if (!alive) return;
        if (u.startsWith("blob:")) created = u;
        setUrl(u);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [load]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 rounded-t-xl border border-b-0 border-border bg-surface-2 px-3 py-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <FileText className="size-4 shrink-0 text-accent-text" />
          <span className="truncate">{nome}</span>
        </span>
        {url && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em nova aba">
                <ExternalLink />
              </a>
            </Button>
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={url} download={nome} aria-label="Baixar PDF">
                <Download />
              </a>
            </Button>
          </div>
        )}
      </div>
      <div className="relative h-[560px] overflow-hidden rounded-b-xl border border-border bg-sunken">
        {error ? (
          <ErrorState message={error} />
        ) : !url ? (
          <div className="grid h-full place-items-center text-sm text-muted">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Abrindo documento…
            </span>
          </div>
        ) : (
          <iframe src={`${url}#toolbar=1&navpanes=0&view=FitH`} title={`Visualização de ${nome}`} className="size-full" />
        )}
      </div>
    </div>
  );
}
