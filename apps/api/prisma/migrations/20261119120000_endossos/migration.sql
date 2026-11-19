-- AlterTable
ALTER TABLE "policies" ADD COLUMN "condutor_principal" TEXT;

-- CreateTable
CREATE TABLE "endorsements" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "document_id" TEXT,
    "numero" TEXT,
    "emissao" DATE,
    "motivos" TEXT[],
    "premio" DECIMAL(12,2),
    "restituicao" BOOLEAN NOT NULL DEFAULT false,
    "cancelou" BOOLEAN NOT NULL DEFAULT false,
    "alteracoes" JSONB NOT NULL,
    "observacao" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "endorsements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "endorsements_document_id_key" ON "endorsements"("document_id");

-- CreateIndex
CREATE INDEX "endorsements_client_id_idx" ON "endorsements"("client_id");

-- CreateIndex
CREATE INDEX "endorsements_policy_id_idx" ON "endorsements"("policy_id");

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
