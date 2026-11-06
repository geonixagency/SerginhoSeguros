-- Reversão manual desta migração (Prisma não aplica down automaticamente):
--   psql "$DATABASE_URL" -f down.sql  e depois remova a linha em _prisma_migrations.
ALTER TABLE "messaging_settings" DROP COLUMN IF EXISTS "lote_tamanho",
DROP COLUMN IF EXISTS "lote_pausa_min",
ALTER COLUMN "intervalo_min_seg" SET DEFAULT 20,
ALTER COLUMN "intervalo_max_seg" SET DEFAULT 60;
