-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'OPERADOR');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('BOLETO', 'CARTAO', 'DEBITO', 'CARNE', 'PIX', 'OUTRO');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('VIGENTE', 'VENCIDA', 'CANCELADA', 'RENOVADA', 'EM_EMISSAO');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDENTE', 'PAGO', 'ATRASADO', 'FALHOU');

-- CreateEnum
CREATE TYPE "StatusIntegracao" AS ENUM ('SEM_API', 'NAO_CONFIGURADA', 'CONFIGURADA', 'OK', 'ERRO');

-- CreateEnum
CREATE TYPE "InsurerCategoria" AS ENUM ('SEGURADORA', 'PLATAFORMA');

-- CreateEnum
CREATE TYPE "LeadEtapa" AS ENUM ('NOVO', 'EM_CONTATO', 'COTACAO_ENVIADA', 'NEGOCIACAO', 'FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PROCESSANDO', 'CONCLUIDA', 'ERRO');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('AGENDADA', 'ENVIANDO', 'ENVIADA', 'FALHOU', 'CANCELADA', 'IGNORADA');

-- CreateEnum
CREATE TYPE "RuleGatilho" AS ENUM ('PRIMEIRA_PARCELA', 'PROBLEMA_SEM_BOLETO', 'PROBLEMA_COM_BOLETO', 'ANIVERSARIO');

-- CreateEnum
CREATE TYPE "DocumentTipo" AS ENUM ('APOLICE', 'PROPOSTA', 'ENDOSSO', 'BOLETO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ABERTA', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf_cnpj" TEXT NOT NULL,
    "nascimento" DATE,
    "cnh" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "endereco" JSONB,
    "status" "ClientStatus" NOT NULL DEFAULT 'INATIVO',
    "origem" TEXT,
    "opt_out" BOOLEAN NOT NULL DEFAULT false,
    "opt_out_em" TIMESTAMP(3),
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurers" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoria" "InsurerCategoria" NOT NULL DEFAULT 'SEGURADORA',
    "ramos" TEXT[],
    "portal_url" TEXT,
    "tem_api" BOOLEAN NOT NULL DEFAULT false,
    "status_integracao" "StatusIntegracao" NOT NULL DEFAULT 'SEM_API',
    "capacidades" JSONB NOT NULL DEFAULT '[]',
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_credentials" (
    "id" TEXT NOT NULL,
    "insurer_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "ambiente" TEXT NOT NULL DEFAULT 'PRODUCAO',
    "segredo_criptografado" TEXT NOT NULL,
    "mascara" JSONB NOT NULL,
    "ultimo_teste" TIMESTAMP(3),
    "ultimo_erro" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurer_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "insurer_id" TEXT NOT NULL,
    "ramo" TEXT NOT NULL,
    "numero" TEXT,
    "proposta" TEXT,
    "emissao" DATE,
    "inicio_vigencia" DATE,
    "fim_vigencia" DATE,
    "premio_total" DECIMAL(12,2),
    "forma_pagamento" "FormaPagamento" NOT NULL DEFAULT 'OUTRO',
    "status" "PolicyStatus" NOT NULL DEFAULT 'VIGENTE',
    "document_id" TEXT,
    "endosso_de_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(12,2),
    "vencimento" DATE NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDENTE',
    "boleto_document_id" TEXT,
    "verificado_em" TIMESTAMP(3),
    "pago_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insured_items" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'VEICULO',
    "placa" TEXT,
    "modelo" TEXT,
    "ano" TEXT,
    "chassi" TEXT,
    "endereco" TEXT,
    "descricao" TEXT,

    CONSTRAINT "insured_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "policy_id" TEXT,
    "tipo" "DocumentTipo" NOT NULL DEFAULT 'APOLICE',
    "nome_arquivo" TEXT NOT NULL,
    "caminho" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "extraido" JSONB,
    "confianca" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "cpf_cnpj" TEXT,
    "produto" TEXT,
    "origem" TEXT,
    "etapa" "LeadEtapa" NOT NULL DEFAULT 'NOVO',
    "responsavel_id" TEXT,
    "proximo_contato" TIMESTAMP(3),
    "valor_estimado" DECIMAL(12,2),
    "notas" TEXT,
    "motivo_perda" TEXT,
    "client_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT,
    "client_id" TEXT,
    "ramo" TEXT NOT NULL,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "aggilizador_id" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PROCESSANDO',
    "resultados" JSONB NOT NULL DEFAULT '[]',
    "erro" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "gatilho" "RuleGatilho",
    "anexar_boleto" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_rules" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "gatilho" "RuleGatilho" NOT NULL,
    "template_id" TEXT NOT NULL,
    "antecedencia_dias" INTEGER NOT NULL DEFAULT 0,
    "horario" TEXT NOT NULL DEFAULT '09:00',
    "formas_pagamento" "FormaPagamento"[],
    "seguradoras" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultima_execucao" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "client_id" TEXT,
    "telefone" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'AGENDADA',
    "erro" TEXT,
    "rule_id" TEXT,
    "installment_id" TEXT,
    "template_id" TEXT,
    "anexo_document_id" TEXT,
    "broadcast_id" TEXT,
    "dedupe_key" TEXT,
    "agendada_para" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_em" TIMESTAMP(3),
    "evolution_id" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pausado" BOOLEAN NOT NULL DEFAULT false,
    "limite_diario" INTEGER NOT NULL DEFAULT 200,
    "janela_inicio" INTEGER NOT NULL DEFAULT 8,
    "janela_fim" INTEGER NOT NULL DEFAULT 20,
    "intervalo_min_seg" INTEGER NOT NULL DEFAULT 20,
    "intervalo_max_seg" INTEGER NOT NULL DEFAULT 60,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'ABERTA',
    "client_id" TEXT,
    "insurer_id" TEXT,
    "policy_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "antes" JSONB,
    "depois" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_familia_idx" ON "refresh_tokens"("familia");

-- CreateIndex
CREATE UNIQUE INDEX "clients_cpf_cnpj_key" ON "clients"("cpf_cnpj");

-- CreateIndex
CREATE INDEX "clients_nome_idx" ON "clients"("nome");

-- CreateIndex
CREATE INDEX "clients_telefone_idx" ON "clients"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "insurers_nome_key" ON "insurers"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "insurers_slug_key" ON "insurers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_credentials_insurer_id_key" ON "insurer_credentials"("insurer_id");

-- CreateIndex
CREATE UNIQUE INDEX "policies_document_id_key" ON "policies"("document_id");

-- CreateIndex
CREATE INDEX "policies_client_id_idx" ON "policies"("client_id");

-- CreateIndex
CREATE INDEX "policies_insurer_id_idx" ON "policies"("insurer_id");

-- CreateIndex
CREATE INDEX "policies_fim_vigencia_idx" ON "policies"("fim_vigencia");

-- CreateIndex
CREATE INDEX "policies_numero_idx" ON "policies"("numero");

-- CreateIndex
CREATE INDEX "installments_vencimento_status_idx" ON "installments"("vencimento", "status");

-- CreateIndex
CREATE UNIQUE INDEX "installments_policy_id_numero_key" ON "installments"("policy_id", "numero");

-- CreateIndex
CREATE INDEX "insured_items_placa_idx" ON "insured_items"("placa");

-- CreateIndex
CREATE INDEX "documents_hash_idx" ON "documents"("hash");

-- CreateIndex
CREATE INDEX "documents_client_id_idx" ON "documents"("client_id");

-- CreateIndex
CREATE INDEX "leads_etapa_idx" ON "leads"("etapa");

-- CreateIndex
CREATE INDEX "quotes_lead_id_idx" ON "quotes"("lead_id");

-- CreateIndex
CREATE INDEX "quotes_client_id_idx" ON "quotes"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_nome_key" ON "message_templates"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "messages_dedupe_key_key" ON "messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "messages_status_agendada_para_idx" ON "messages"("status", "agendada_para");

-- CreateIndex
CREATE INDEX "messages_client_id_idx" ON "messages"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_rule_id_installment_id_key" ON "messages"("rule_id", "installment_id");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidade_id_idx" ON "audit_logs"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_credentials" ADD CONSTRAINT "insurer_credentials_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_endosso_de_id_fkey" FOREIGN KEY ("endosso_de_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insured_items" ADD CONSTRAINT "insured_items_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_rules" ADD CONSTRAINT "message_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "message_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_anexo_document_id_fkey" FOREIGN KEY ("anexo_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
