-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('ABERTO', 'EM_ANALISE', 'INDENIZADO', 'NEGADO', 'ENCERRADO');

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "data_ocorrencia" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "local" TEXT,
    "protocolo" TEXT,
    "valor" DECIMAL(12,2),
    "status" "ClaimStatus" NOT NULL DEFAULT 'ABERTO',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "claims_client_id_idx" ON "claims"("client_id");

-- CreateIndex
CREATE INDEX "claims_policy_id_idx" ON "claims"("policy_id");

-- CreateIndex
CREATE INDEX "claims_data_ocorrencia_idx" ON "claims"("data_ocorrencia");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
