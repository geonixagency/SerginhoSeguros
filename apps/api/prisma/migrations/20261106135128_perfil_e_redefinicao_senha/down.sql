-- Reversão manual desta migração (Prisma não aplica down automaticamente):
--   psql "$DATABASE_URL" -f down.sql  e depois remova a linha em _prisma_migrations.
DROP TABLE IF EXISTS "password_reset_tokens";
ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar";
