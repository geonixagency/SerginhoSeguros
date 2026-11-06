-- Reversão (falha se houver CPF/CNPJ repetido).
DROP INDEX "clients_pasta_key";
ALTER TABLE "clients" DROP COLUMN "pasta";
DROP INDEX "clients_cpf_cnpj_idx";
CREATE UNIQUE INDEX "clients_cpf_cnpj_key" ON "clients"("cpf_cnpj");
