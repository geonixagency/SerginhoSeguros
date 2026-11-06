-- Cliente passa a ser identificado pela pasta da base (CPF/CNPJ pode repetir entre clientes).
DROP INDEX "clients_cpf_cnpj_key";
CREATE INDEX "clients_cpf_cnpj_idx" ON "clients"("cpf_cnpj");
ALTER TABLE "clients" ADD COLUMN "pasta" TEXT;
CREATE UNIQUE INDEX "clients_pasta_key" ON "clients"("pasta");
