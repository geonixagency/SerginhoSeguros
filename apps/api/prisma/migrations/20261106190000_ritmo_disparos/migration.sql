-- Ritmo dos disparos: intervalo padrão 50–230 s e lotes de 25 com pausa de 4 h.
ALTER TABLE "messaging_settings" ALTER COLUMN "intervalo_min_seg" SET DEFAULT 50,
ALTER COLUMN "intervalo_max_seg" SET DEFAULT 230,
ADD COLUMN "lote_tamanho" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN "lote_pausa_min" INTEGER NOT NULL DEFAULT 240;

-- Quem ainda usa o padrão antigo (20–60 s) passa para o novo.
UPDATE "messaging_settings" SET "intervalo_min_seg" = 50, "intervalo_max_seg" = 230
WHERE "intervalo_min_seg" = 20 AND "intervalo_max_seg" = 60;
