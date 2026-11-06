"use client";

/**
 * Meu perfil: foto (recorte quadrado e redução para 256 px feitos no navegador),
 * nome e redefinição de senha por link no e-mail.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, KeyRound, Mail, Trash2, UserRound, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const OUT = 256; // px da foto final
const VIEW = 224; // px da área de recorte na tela

type Crop = { img: HTMLImageElement; url: string; zoom: number; x: number; y: number };

/** Escala mínima para a imagem cobrir o quadrado. */
const coverScale = (img: HTMLImageElement, size: number) => size / Math.min(img.naturalWidth, img.naturalHeight);

function clampOffset(c: Crop): Crop {
  const s = coverScale(c.img, VIEW) * c.zoom;
  const maxX = Math.max(0, (c.img.naturalWidth * s - VIEW) / 2);
  const maxY = Math.max(0, (c.img.naturalHeight * s - VIEW) / 2);
  return { ...c, x: Math.min(maxX, Math.max(-maxX, c.x)), y: Math.min(maxY, Math.max(-maxY, c.y)) };
}

function render(c: Crop): string {
  const canvas = document.createElement("canvas");
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
  const k = OUT / VIEW;
  const s = coverScale(c.img, VIEW) * c.zoom * k;
  const w = c.img.naturalWidth * s;
  const h = c.img.naturalHeight * s;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c.img, (OUT - w) / 2 + c.x * k, (OUT - h) / 2 + c.y * k, w, h);
  return canvas.toDataURL("image/jpeg", 0.86);
}

export function ProfileCard() {
  const { user, updateUser } = useAuth();
  const [nome, setNome] = useState(user?.nome ?? "");
  const [crop, setCrop] = useState<Crop | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => setNome(user?.nome ?? ""), [user?.nome]);
  useEffect(() => () => (crop ? URL.revokeObjectURL(crop.url) : undefined), [crop]);

  const save = useMutation({
    mutationFn: (data: { nome?: string; avatar?: string | null }) => api.auth.updateProfile(data),
    onSuccess: (u, vars) => {
      updateUser(u);
      toast.success(vars.avatar !== undefined ? (vars.avatar ? "Foto atualizada" : "Foto removida") : "Nome atualizado");
      setCrop(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: () => api.auth.forgotPassword(user!.email),
    onSuccess: () => {
      setMailError(null);
      toast.success("Link enviado", { description: `Confira a caixa de entrada de ${user?.email}. O link vale por 1 hora.` });
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError && e.status === 503 ? e.message : e.message || "Não foi possível enviar o e-mail agora.";
      setMailError(msg);
      toast.error(msg);
    },
  });

  function pickFile(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(f.type) && !/\.(jpe?g|png|webp|gif)$/i.test(f.name)) {
      toast.error("Escolha uma imagem (JPG, PNG ou WebP).");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      toast.error("Imagem grande demais (máx. 15 MB).");
      return;
    }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => setCrop({ img, url, zoom: 1, x: 0, y: 0 });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Não foi possível abrir essa imagem.");
    };
    img.src = url;
  }

  if (!user) return null;
  const scale = crop ? coverScale(crop.img, VIEW) * crop.zoom : 1;

  return (
    <Card>
      <CardHeader icon={<UserRound />} title="Meu perfil" description="Sua foto e seu nome aparecem no menu e no topo do sistema." />
      <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-[auto_1fr]">
        {/* foto */}
        <div className="flex flex-col items-center gap-3">
          {crop ? (
            <>
              <div
                className="relative cursor-grab touch-none overflow-hidden rounded-full ring-2 ring-gold-500 active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, ox: crop.x, oy: crop.y };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  setCrop((c) => (c ? clampOffset({ ...c, x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }) : c));
                }}
                onPointerUp={() => (drag.current = null)}
                role="img"
                aria-label="Área de recorte da foto: arraste para posicionar"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) */}
                <img
                  src={crop.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: crop.img.naturalWidth * scale,
                    height: crop.img.naturalHeight * scale,
                    transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))`,
                  }}
                />
              </div>
              <label className="flex w-full max-w-[224px] items-center gap-2 text-xs font-semibold text-muted">
                <ZoomIn className="size-4 shrink-0" />
                <span className="sr-only">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={crop.zoom}
                  onChange={(e) => setCrop((c) => (c ? clampOffset({ ...c, zoom: Number(e.target.value) }) : c))}
                  className="w-full accent-[var(--gold-500)]"
                />
              </label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCrop(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  loading={save.isPending}
                  onClick={() => {
                    try {
                      save.mutate({ avatar: render(crop) });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Falha ao processar a imagem");
                    }
                  }}
                >
                  Usar foto
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <Avatar nome={user.nome} src={user.avatar} tone="gold" className="size-28 text-4xl" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid size-10 place-items-center rounded-full border-2 border-surface bg-ink-900 text-gold-300 shadow-lg transition-transform hover:scale-105"
                  aria-label="Trocar foto"
                >
                  <Camera className="size-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  {user.avatar ? "Trocar foto" : "Adicionar foto"}
                </Button>
                {user.avatar && (
                  <Button variant="ghost" size="sm" onClick={() => save.mutate({ avatar: null })} aria-label="Remover foto" loading={save.isPending && save.variables?.avatar === null}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            aria-label="Escolher foto de perfil"
            onChange={(e) => {
              pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>

        {/* nome e senha */}
        <div className="grid min-w-0 content-start gap-5">
          <form
            className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (nome.trim().length < 2) return toast.error("Informe seu nome.");
              save.mutate({ nome: nome.trim() });
            }}
          >
            <Field label="Nome de usuário" htmlFor="perfil-nome" hint="Como você aparece para a equipe e na auditoria.">
              <Input id="perfil-nome" value={nome} maxLength={120} autoComplete="name" onChange={(e) => setNome(e.target.value)} />
            </Field>
            <Button type="submit" loading={save.isPending && save.variables?.nome !== undefined} disabled={nome.trim() === user.nome}>
              Salvar nome
            </Button>
          </form>
          <Field label="E-mail de acesso" htmlFor="perfil-email">
            <Input id="perfil-email" value={user.email} readOnly className="bg-sunken text-muted" />
          </Field>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-accent-text" /> Redefinir senha
            </p>
            <p className="mt-1 text-sm text-muted">Enviamos um link para o seu e-mail. Ele vale por 1 hora e só funciona uma vez.</p>
            <Button variant="outline" className="mt-3 max-w-full" onClick={() => reset.mutate()} loading={reset.isPending}>
              <Mail /> <span className="truncate">Enviar link para {user.email}</span>
            </Button>
            {mailError && (
              <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                {mailError}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
