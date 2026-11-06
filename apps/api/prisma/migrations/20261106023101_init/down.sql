-- DropForeignKey
ALTER TABLE "public"."refresh_tokens" DROP CONSTRAINT "refresh_tokens_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."insurer_credentials" DROP CONSTRAINT "insurer_credentials_insurer_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."policies" DROP CONSTRAINT "policies_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."policies" DROP CONSTRAINT "policies_insurer_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."policies" DROP CONSTRAINT "policies_document_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."policies" DROP CONSTRAINT "policies_endosso_de_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."installments" DROP CONSTRAINT "installments_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."insured_items" DROP CONSTRAINT "insured_items_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."documents" DROP CONSTRAINT "documents_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."documents" DROP CONSTRAINT "documents_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."leads" DROP CONSTRAINT "leads_responsavel_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."leads" DROP CONSTRAINT "leads_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."quotes" DROP CONSTRAINT "quotes_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."quotes" DROP CONSTRAINT "quotes_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."message_rules" DROP CONSTRAINT "message_rules_template_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_installment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_template_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."messages" DROP CONSTRAINT "messages_anexo_document_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tasks" DROP CONSTRAINT "tasks_client_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tasks" DROP CONSTRAINT "tasks_insurer_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropTable
DROP TABLE "public"."users";

-- DropTable
DROP TABLE "public"."refresh_tokens";

-- DropTable
DROP TABLE "public"."clients";

-- DropTable
DROP TABLE "public"."insurers";

-- DropTable
DROP TABLE "public"."insurer_credentials";

-- DropTable
DROP TABLE "public"."policies";

-- DropTable
DROP TABLE "public"."installments";

-- DropTable
DROP TABLE "public"."insured_items";

-- DropTable
DROP TABLE "public"."documents";

-- DropTable
DROP TABLE "public"."leads";

-- DropTable
DROP TABLE "public"."quotes";

-- DropTable
DROP TABLE "public"."message_templates";

-- DropTable
DROP TABLE "public"."message_rules";

-- DropTable
DROP TABLE "public"."messages";

-- DropTable
DROP TABLE "public"."messaging_settings";

-- DropTable
DROP TABLE "public"."tasks";

-- DropTable
DROP TABLE "public"."audit_logs";

-- DropEnum
DROP TYPE "public"."Perfil";

-- DropEnum
DROP TYPE "public"."ClientStatus";

-- DropEnum
DROP TYPE "public"."FormaPagamento";

-- DropEnum
DROP TYPE "public"."PolicyStatus";

-- DropEnum
DROP TYPE "public"."InstallmentStatus";

-- DropEnum
DROP TYPE "public"."StatusIntegracao";

-- DropEnum
DROP TYPE "public"."InsurerCategoria";

-- DropEnum
DROP TYPE "public"."LeadEtapa";

-- DropEnum
DROP TYPE "public"."QuoteStatus";

-- DropEnum
DROP TYPE "public"."MessageStatus";

-- DropEnum
DROP TYPE "public"."RuleGatilho";

-- DropEnum
DROP TYPE "public"."DocumentTipo";

-- DropEnum
DROP TYPE "public"."TaskStatus";

