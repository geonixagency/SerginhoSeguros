# PROMPT PAI — SaaS Serginho Seguros

> Prompt mestre de desenvolvimento. Todo agente (humano ou IA) que trabalhar neste repositório lê este arquivo primeiro.
> PRD completo: https://claude.ai/artifact/GgCHRLAogoCpBigkueHeAL

## 1. Papel e missão

Você é o time de engenharia sênior da Geonix Agency construindo o SaaS operacional da **Serginho Seguros**
(corretora de Sergio e Vivian Rosalim: seguros de vida, auto, empresarial, residencial, imóveis e consórcio).
O sistema substitui pastas de PDFs e portais de seguradoras por uma única plataforma: carteira de clientes e
apólices, cobrança, avisos por WhatsApp, CRM de leads e cotações via Aggilizador.

Pense passo a passo (cadeia de raciocínio) antes de cada entrega: 1) entenda o requisito no PRD, 2) liste
arquivos e contratos afetados, 3) implemente o mínimo correto, 4) teste, 5) revise segurança, 6) documente.

## 2. Regras inegociáveis

1. **Nada sensível no git.** Nunca commitar PDFs de clientes, a pasta `../base`, `../_dados`, `../AcessosSeguradoras`,
   `.env`, chaves de API ou dumps de banco. O `.gitignore` já bloqueia; não contorne.
2. **Segredos só no backend.** Chaves de seguradoras, Aggilizador e Evolution ficam criptografadas (AES-256-GCM,
   chave mestra `APP_ENCRYPTION_KEY`) na tabela `insurer_credentials`. O frontend nunca as recebe.
3. **Portais de seguradora: robô com login automático (decisão do cliente, 06/11/2026).** Ordem de canais:
   API oficial > robô (`services/portal-robot`, Playwright) > importação > tarefa manual. O robô faz login com a
   credencial decifrada do cofre só em memória, roda poucas vezes por dia com ritmo humano, e se houver captcha/2FA
   devolve `needs_human` e o SaaS pede login assistido. Nunca logar senhas, cookies ou tokens; perfis de navegador fora do git.
4. **LGPD:** auditoria de alterações e downloads de PDF, opt-out de mensagens ("SAIR"), exportação/exclusão por titular.
5. **Português do Brasil** em toda a interface, mensagens e documentação. Datas `dd/mm/aaaa`, moeda `R$ 1.234,56`, fuso `America/Sao_Paulo`.
6. Tipagem estrita ponta a ponta (TypeScript `strict`, Zod nos contratos). Sem `any` sem justificativa.

## 3. Stack

| Camada | Tecnologia | Onde roda |
|---|---|---|
| Frontend (SaaS + site) | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui, **React Bits** e **Origin Kit** (MCPs), Framer Motion, TanStack Query, Recharts | Vercel |
| Backend API | Node 22, Fastify, Prisma, Zod, JWT (access + refresh httpOnly) | VPS (Docker) |
| Leitor de PDF | Python 3.12, FastAPI, PyMuPDF, parsers por seguradora (base: `../_dados/extrator`), LLM de apoio opcional | VPS (Docker, rede interna) |
| Banco | PostgreSQL 16 | VPS |
| Filas / agendador | BullMQ + Redis | VPS |
| WhatsApp | Evolution API (já instalada na VPS; URL em `EVOLUTION_URL`) — acessada só pelo backend | VPS |
| Automação de atendimento | n8n | VPS |
| Proxy / TLS | Caddy | VPS |

## 4. Estrutura do monorepo

```
app/
  apps/web/            # Next.js — SaaS (/app/*) e site institucional (/)
  apps/api/            # Fastify + Prisma
    src/modules/       # auth, clients, policies, installments, documents, insurers,
                       # connectors, messaging, rules, leads, quotes, dashboard, audit
    src/connectors/    # um adapter por seguradora + aggilizador
    prisma/schema.prisma
  services/pdf-parser/ # FastAPI: POST /parse (PDF -> JSON com confiança por campo)
  scripts/import/      # migração da carteira a partir de ../_dados/clients.json
  infra/               # docker-compose.yml, Caddyfile, backup.sh
  packages/shared/     # tipos e schemas Zod compartilhados
```

## 5. Modelo de dados (Prisma, resumo)

- `User(id, nome, email, senhaHash, perfil: ADMIN|OPERADOR)`
- `Client(id, nome, cpfCnpj @unique, nascimento, cnh, telefone, email, endereco, status: ATIVO|INATIVO, origem, optOut)`
- `Insurer(id, nome, slug, ramos[], portalUrl, temApi, statusIntegracao, capacidades Json)`
- `InsurerCredential(id, insurerId, tipo, segredoCriptografado, ultimoTeste, ultimoErro)`
- `Policy(id, clientId, insurerId, ramo, numero, proposta, emissao, inicioVigencia, fimVigencia, premioTotal Decimal, formaPagamento: BOLETO|CARTAO|DEBITO|CARNE|PIX|OUTRO, status, documentId, endossoDe?)`
- `Installment(id, policyId, numero, valor, vencimento, status: PENDENTE|PAGO|ATRASADO|FALHOU, boletoDocumentId?, verificadoEm)`
- `InsuredItem(id, policyId, tipo, placa, modelo, ano, chassi, endereco)`
- `Document(id, clientId, policyId?, tipo, caminho, hash, extraido Json, confianca Json)`
- `Lead(id, nome, telefone, email, produto, origem, etapa, responsavelId, proximoContato, notas)`
- `Quote(id, leadId|clientId, aggilizadorId, status, resultados Json)`
- `MessageTemplate`, `MessageRule(gatilho, antecedenciaDias, horario, formasPagamento[], seguradoras[], ativo)`, `Message(status, erro, ruleId, installmentId, unique(ruleId, installmentId))`
- `AuditLog(userId, acao, entidade, entidadeId, antes, depois, ip)`

Status do cliente: **ATIVO** se existe ao menos uma `Policy` não vencida com `fimVigencia >= hoje`; senão **INATIVO**. Recalcular em job diário.

## 6. Módulos e critérios de aceite (detalhes no PRD)

1. **Dashboard** — cards (ativos, inativos, novos do mês, apólices vigentes, prêmio da carteira); apólices a vencer 7/15/30/60 dias; parcelas vencendo hoje/semana; alertas; gráficos por seguradora/ramo; aniversariantes do dia.
2. **Clientes** — busca por nome/CPF/placa/apólice; ficha completa; visualizador de PDF; **cadastro por upload**: PDF → `pdf-parser` → formulário pré-preenchido com selo de confiança por campo → revisão → salvar (anexa a cliente existente pelo CPF).
3. **Seguradoras** — catálogo, status da integração, credenciais (mascaradas), "Testar conexão", matriz de capacidades.
4. **Ações por API** — por cliente, só as ações que o conector da seguradora implementa (2ª via de boleto, status da apólice/parcelas, sinistro); envio do boleto por WhatsApp.
5. **Disparos** — conectar WhatsApp por QR (Evolution); réguas configuráveis; variáveis `{{nome}} {{seguradora}} {{apolice}} {{valor}} {{vencimento}} {{placa}}`; disparo em massa por filtro; histórico e fila.
6. **CRM** — kanban Novo → Em contato → Cotação enviada → Negociação → Fechado/Perdido; lead fechado vira cliente.
7. **Cotações (Aggilizador)** — criar cotação via API, listar resultados no lead, enviar comparativo.

## 7. Contrato de conector de seguradora

```ts
export interface InsurerConnector {
  slug: string;
  capabilities: Array<'testConnection'|'findPolicy'|'listInstallments'|'getBoletoPdf'|'getPolicyStatus'|'getClaims'|'quote'>;
  testConnection(cred: Credential): Promise<{ ok: boolean; detalhe?: string }>;
  findPolicy?(cred: Credential, q: { cpfCnpj?: string; numero?: string; placa?: string }): Promise<PolicyDTO[]>;
  listInstallments?(cred: Credential, policyNumero: string): Promise<InstallmentDTO[]>;
  getBoletoPdf?(cred: Credential, policyNumero: string, parcela: number): Promise<Buffer>;
  getPolicyStatus?(cred: Credential, policyNumero: string): Promise<PolicyStatusDTO>;
}
```
Cada conector tem testes com respostas gravadas (fixtures sem dados reais). Rate limit e retry exponencial no client HTTP.

## 8. Réguas de disparo (textos aprovados — padrão editável)

| Régua | Gatilho | Aplica a |
|---|---|---|
| 1ª parcela | 2 dias antes do vencimento da parcela 1 | boleto |
| Problema s/ boleto | D+1 do vencimento, conector diz "em aberto", sem boleto | seguradoras com API |
| Problema c/ boleto | idem, conector devolveu boleto → anexar PDF | seguradoras com API |
| Aniversário | dia do aniversário, 8h | clientes ativos |

- 1ª parcela: "Oi tudo bem? Passando para lembrar que a primeira parcela de seu seguro vence em 2 dias, é importante se atentar para que não haja problemas na vigência e cobertura de seu seguro, caso ainda não tenha recebido o boleto para pagamento favor nos contatar!"
- Sem boleto: "Olá tudo bem? Informação importante sobre seu seguro! Houve um problema com o pagamento e sua cobertura pode ser afetada, favor entre em contato para normalizar sua cobertura. Caso já tenha regularizado favor desconsiderar mensagem."
- Com boleto: "Olá tudo bem? Informação importante sobre seu seguro! Houve um problema com o pagamento e sua cobertura pode ser afetada, se ainda não regularizou você pode realizar o pagamento pelo boleto abaixo:" + PDF anexo.
- Aniversário: "Bom dia tudo bem! Hoje é seu dia e a Serginho Seguros está passando para lhe desejar Feliz Aniversário, muitas felicidades!"

Regras: idempotência por (régua, parcela); janela 8h–20h; intervalo aleatório 20–60 s entre mensagens; limite diário configurável; pausa geral; opt-out.

## 9. Design e UX

- Identidade a partir de `../SSegurosLogo.png` (extrair paleta da logo; gerar tokens em `apps/web/src/styles/tokens.css`, modo claro e escuro).
- **Animação da logo** na tela de login e no site (Framer Motion / SVG traçado + revelação), curta (< 2 s) e com `prefers-reduced-motion`.
- Componentes de texto, números animados, cards e fundos vindos dos MCPs **React Bits** e **Origin Kit**; tabelas e formulários com shadcn/ui.
- Layout: sidebar fixa (Dashboard, Clientes, Seguradoras, Ações, Disparos, CRM, Cotações, Configurações), topo com busca global (Ctrl+K).
- Responsivo; tudo acessível (contraste AA, foco visível, labels).

## 10. Fluxo de trabalho multiagente

| Agente / skill | Responsabilidade |
|---|---|
| `backend-developer` | API, Prisma, conectores, filas, importação |
| `frontend-designer` + `ui-ux-pro-max` | telas, design system, animação da logo, React Bits / Origin Kit |
| `qa-tester` | fluxos ponta a ponta (Playwright) e casos extremos; só relata |
| `security-auditor` | revisa auth, segredos, uploads, webhooks antes de cada deploy; só relata |
| `devops-deploy` | Docker Compose na VPS, Caddy, backups, Vercel |

Ordem por fase: backend e frontend em paralelo sobre o contrato de `packages/shared` → QA → auditoria → deploy.

## 11. Definição de pronto

- Lint, typecheck e testes passando (`pnpm -r lint typecheck test`).
- Migração Prisma criada e reversível.
- Sem segredo ou dado de cliente no diff.
- Tela revisada em 375 px e 1440 px, claro e escuro.
- Critério de aceite do módulo no PRD verificado e anotado no PR.

## 12. Variáveis de ambiente (nomes, nunca valores)

`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `APP_ENCRYPTION_KEY`, `EVOLUTION_URL`, `EVOLUTION_API_KEY`,
`PDF_PARSER_URL`, `AGGILIZADOR_BASE_URL`, `STORAGE_DIR`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGIN`.
