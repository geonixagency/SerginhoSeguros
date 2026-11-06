# API Serginho Seguros: contrato para o frontend

Base: `http://127.0.0.1:3333/api` em dev; `https://<dominio-api>/api` em produção (Caddy expõe só `/api/*`).
Tipos de entrada (schemas Zod) e de saída (DTOs) estão em `packages/shared` (`@ss/shared`). O pacote
exporta TypeScript puro, então no Next.js use `transpilePackages: ['@ss/shared']`.

## Convenções

- **JSON** em pt-BR. Datas sem hora em `aaaa-mm-dd` (dia de America/Sao_Paulo); data e hora em ISO 8601 UTC.
  O frontend formata para `dd/mm/aaaa`.
- **Dinheiro** vem como string decimal (`"1234.56"`), e o frontend formata para `R$ 1.234,56`. Na entrada, envie um número.
- **CPF/CNPJ, telefone e CEP** podem chegar com ou sem máscara; a API guarda só os dígitos (telefone sem o 55).
- **Paginação:** use `?page=1&pageSize=20` (máximo de 200; leads aceitam até 500). A resposta tem o formato
  `{ data, page, pageSize, total, totalPages }`.
- **Erro:** `{ "error": { "code", "message", "details?" } }`. Códigos possíveis: `VALIDATION_ERROR` (400, com `details`
  por campo), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409) e `INTERNAL_ERROR` (500).
  O campo `message` já vem pronto para exibir.
- **Perfis:** `ADMIN` e `OPERADOR`. As rotas marcadas com **[ADMIN]** devolvem 403 para operador.
- **Rate limit:** 300 req/min por IP. O login aceita 10/min e o refresh, 30/min.

## Autenticação

| Método | Rota | Corpo / observações |
|---|---|---|
| POST | `/auth/login` | `{ email, senha }`. Devolve `{ accessToken, expiresIn, user }` e grava o cookie httpOnly `ss_rt` (path `/api/auth`). |
| POST | `/auth/refresh` | Sem corpo; usa o cookie. Rotaciona o refresh e devolve um novo `accessToken`. Se um refresh já usado for reapresentado, a sessão inteira é revogada. |
| POST | `/auth/logout` | Revoga o refresh e apaga o cookie. |
| GET | `/auth/me` | Devolve o `UserDTO` (inclui `avatar`, data URL ou `null`). |
| PATCH | `/auth/me` | `ProfileUpdateSchema`: `{ nome?, avatar? }`. Foto em data URL JPEG/PNG/WebP (até 300 mil caracteres; a tela recorta e reduz para 256 px). `avatar: null` remove. |
| POST | `/auth/forgot-password` | `{ email }`. Sempre `200 { ok: true }` (não revela se o e-mail existe). Envia por e-mail `WEB_URL/redefinir-senha?token=...`, uso único, 1 h; no banco só o hash. `503` se o SMTP não estiver configurado. Limite: 5 por 15 min. |
| POST | `/auth/reset-password` | `{ token, senha }` (senha com 10+ caracteres). Troca a senha, invalida o link e encerra todas as sessões. `400` para link inválido, usado ou expirado. Limite: 10 por 15 min. |

Envie `Authorization: Bearer <accessToken>`; o token vale 15 min. Chame o refresh com `credentials: 'include'`.
Em produção (front na Vercel e API na VPS) o cookie é `Secure; SameSite=None`, e `CORS_ORIGIN` lista os domínios do front.

## Usuários

| Método | Rota | Corpo / observações |
|---|---|---|
| GET | `/users` | Lista a equipe (ativos primeiro). E-mail e último acesso só para ADMIN. `ultimoLogin: null` = convite pendente. |
| POST | `/users/invite` **[ADMIN]** | `UserInviteSchema` `{ nome, email, perfil }`. Cria o usuário sem senha utilizável e envia por e-mail `WEB_URL/redefinir-senha?convite=1&token=...` (72 h, uso único; mesma tabela da redefinição). Reenvia para quem ainda não entrou; `409` se o e-mail já tem acesso. Devolve `{ user, emailEnviado, link? }`: o `link` só vem quando o SMTP não está configurado ou o envio falhou, para o ADMIN repassar. |
| POST | `/users` **[ADMIN]** | `UserCreateSchema` (com senha definida pelo ADMIN). |
| PATCH | `/users/:id` **[ADMIN]** | `{ nome?, perfil?, ativo?, senha? }`. Não deixa rebaixar/desativar a si mesmo nem o último ADMIN ativo. |
| DELETE | `/users/:id` **[ADMIN]** | Remove da equipe = desativa (soft delete), encerra sessões e links pendentes. Mesmas travas do PATCH. |

Tudo auditado (`CONVIDAR`, `REENVIAR_CONVITE`, `ATUALIZAR`, `REMOVER`).

## Importação da carteira **[ADMIN]**

| Método | Rota | Corpo / observações |
|---|---|---|
| GET | `/import/estado` | Contagens (clientes, apólices, documentos, PDFs no índice) e job em andamento. |
| POST | `/import/pdfs` | Multipart, campo `arquivos` (um ou mais `.zip`/`.pdf`, até 60 MB cada). Zips com `seguradora/<cliente>/...pdf` (ou `base/seguradora/...`) são gravados em `STORAGE_DIR` mantendo o caminho; PDF solto casa pelo nome com o último `policies.json`. Reenvio do mesmo arquivo não duplica. Devolve `{ recebidos, gravados, iguais, substituidos, semDestino, invalidos }`. |
| POST | `/import/carteira` | Multipart com `clients` e `policies` (JSON do extrator, até 40 MB cada) e `dryRun=true|false`. Responde `202 { jobId, total }` e processa em segundo plano (uma importação por vez; `409` se já houver uma). |
| GET | `/import/carteira/:jobId` | Progresso `{ status, feitos, total, resultado }`. |

Regras iguais às de `scripts/import`: cliente por CPF/CNPJ (só completa campos vazios), apólice por seguradora + número, PDF por caminho ou hash, parcelas vencidas como pagas e recálculo de ATIVO/INATIVO no fim. Tudo vai para a auditoria (`IMPORTAR_PDFS`, `IMPORTAR_CARTEIRA`, `SIMULAR_IMPORTACAO`).

## Dashboard

| Rota | Retorno |
|---|---|
| `GET /dashboard/summary` | `DashboardSummaryDTO`: clientes ativos e inativos, novos no mês, apólices vigentes, prêmio da carteira, parcelas atrasadas, `vencendo{d7,d15,d30,d60}` e `alertas[]`. |
| `GET /dashboard/expiring?days=7\|15\|30\|60` | `{ days, total, data: ExpiringPolicyDTO[] }` |
| `GET /dashboard/installments-due?range=today\|week` | `{ range, total, data: InstallmentWithContextDTO[] }` |
| `GET /dashboard/charts` | `DashboardChartsDTO`: `porSeguradora`, `porRamo` e `novosPorMes` (últimos 12 meses). |
| `GET /dashboard/birthdays?scope=today\|month` | `{ scope, data: BirthdayDTO[] }` |

"Novos no mês" conta os clientes cuja primeira apólice começou no mês corrente.

## Clientes

| Método | Rota | Observações |
|---|---|---|
| GET | `/clients?q=&status=&insurerId=&ramo=&sort=` | O parâmetro `q` busca por nome, CPF/CNPJ, telefone, placa, número de apólice ou proposta. Devolve `Paginated<ClientListItemDTO>`. |
| POST | `/clients` | `ClientCreateSchema`. Um CPF/CNPJ duplicado devolve 409. |
| GET | `/clients/:id` | `ClientDetailDTO` com apólices, parcelas, itens, documentos e mensagens. |
| PATCH | `/clients/:id` | `ClientUpdateSchema`, que inclui `optOut`. |
| GET | `/clients/:id/timeline` | `TimelineEventDTO[]` |
| GET | `/clients/:id/export` **[ADMIN]** | Exportação LGPD (JSON) com todos os dados do titular. |
| DELETE | `/clients/:id` **[ADMIN]** | Exclusão LGPD em cascata, que fica registrada na auditoria. Os PDFs originais não são apagados do disco. |

## Documentos e cadastro por PDF

| Método | Rota | Observações |
|---|---|---|
| POST | `/documents/parse` | Multipart com o campo `file` (PDF de até `MAX_UPLOAD_MB`). Devolve `ParsedPolicyDTO`: campos com `{ valor, confianca }`, `seguradora.insurerId` casado, `clienteExistente` (pelo CPF), `hash` e `documentoExistenteId`. Não grava nada. |
| POST | `/clients/from-pdf` | Multipart com `file` e `data`, onde `data` é um JSON em string no formato `ClientFromPdfSchema`. Cria ou atualiza o cliente pelo CPF (preenche só campos vazios) e cria apólice, parcelas, itens e documento. Devolve `FromPdfResponse`. |
| POST | `/clients/:id/documents` | Anexo manual, **sem** leitor de PDF. Multipart: `arquivos` (1 a 10; PDF, JPG, PNG ou WebP conferidos pelo conteúdo, até 25 MB cada), `tipo` (`APOLICE`, `ENDOSSO`, `PROPOSTA`, `BOLETO`, `OUTRO`) e `policyId` opcional (precisa ser do mesmo cliente). Grava em `STORAGE_DIR/_uploads` com hash e tamanho; auditoria `ANEXAR_DOCUMENTO`. Devolve `DocumentDTO[]` (com `mimeType`). |
| GET | `/documents/:id/file` | Faz o stream do PDF (`application/pdf`, inline); cada download fica na auditoria. Como exige Bearer, use `fetch` e depois `blob` para abrir no visualizador. |

Sugestão para o selo de confiança: verde a partir de 0,85, âmbar entre 0,6 e 0,85 e vermelho abaixo de 0,6.

## Apólices e parcelas

`GET /policies?q=&clientId=&insurerId=&ramo=&status=&formaPagamento=&fimDe=&fimAte=` devolve
`Paginated<PolicyListItemDTO>`. Também existem `GET /policies/:id` (`PolicyDetailDTO`), `POST /policies`
(`PolicyCreateSchema`, com `parcelas[]` e `itens[]`) e `PATCH /policies/:id` (aceita também `parcelas[]`, casadas
pelo número, com as que saírem da lista apagadas, e `itens[]`, que substituem os atuais).
`GET /installments?status=&clientId=&policyId=&insurerId=&formaPagamento=&de=&ate=` lista as parcelas, e
`PATCH /installments/:id` aceita `{ status, valor, vencimento }`.
O status ATIVO/INATIVO do cliente é recalculado a cada alteração e também em um job diário às 03:00.

## Seguradoras

| Método | Rota | Observações |
|---|---|---|
| GET | `/insurers` | `InsurerDTO[]` com `statusIntegracao`, `capacidades[]`, `canal` (`api\|import\|rpa\|manual`), `portalUrl` e a credencial mascarada. |
| GET | `/insurers/:id` | Detalhe de uma seguradora. |
| PATCH | `/insurers/:id` **[ADMIN]** | `InsurerUpdateSchema` (nome, ramos, portalUrl, temApi, ativo...). |
| PUT | `/insurers/:id/credentials` **[ADMIN]** | `{ tipo, valores: {campo: segredo}, ambiente }`. Os segredos são cifrados com AES-256-GCM e a API só devolve a máscara. |
| DELETE | `/insurers/:id/credentials` **[ADMIN]** | Remove a credencial. |
| POST | `/insurers/:id/test` | `{ ok, detalhe, duracaoMs }`; o resultado também atualiza `statusIntegracao`. |
| GET | `/insurers/:id/robot-session` | Só seguradoras de `canal: "rpa"` (Porto, Tokio, Azul, Itaú). Status da sessão do robô no portal: `{ insurer, status, detalhe?, headful?, vncUrl?, verificadoEm }`, com `status` ∈ `valid \| expired \| needs_human \| invalid_credentials \| error`. |
| POST | `/insurers/:id/robot-session/renew` **[ADMIN]** | Botão "Renovar sessão": dispara o login automático no robô com a credencial do cofre. Devolve o mesmo `SessionResult`. `needs_human` = o portal pediu captcha/2FA; conclua pelo acesso assistido (noVNC). A senha nunca é logada nem devolvida. |

### Canal `rpa` (robô de portais)

Porto Seguro (e Azul/Itaú, mesma plataforma) e Tokio Marine não têm API oficial: o backend fala
com o serviço interno `portal-robot` (Playwright), que reaproveita a sessão logada da corretora
(perfil de navegador persistente, um por seguradora, fora do git). A credencial do portal fica no
cofre (`PUT /insurers/:id/credentials`, `tipo: "USUARIO_SENHA_API"`, `valores: { usuario, senha, susep? }`)
e só é enviada ao robô no login. As consultas (parcelas, status, 2ª via) usam o CPF/CNPJ do cliente.
Os conectores expõem as capacidades `findPolicy`, `listInstallments`, `getPolicyStatus` (e `getBoletoPdf`
na Porto); a régua "problema no pagamento" (D+1) e as Ações por cliente passam a funcionar para elas.

## Ações por cliente

- `GET /clients/:id/actions` devolve `ClientActionDTO[]`: para cada apólice, as ações e se cada uma é feita por API ou é manual.
- `POST /clients/:id/actions/:acao` aceita `{ policyId, parcela? }`, onde `acao` é `segunda-via-boleto`,
  `enviar-boleto-whatsapp`, `status-apolice`, `sincronizar-parcelas` ou `sinistros`.
- A resposta é `ClientActionResultDTO`. Quando a seguradora não tem a capacidade, vem `modo: "MANUAL"` com `portalUrl` e a `task` criada.
- As tarefas manuais ficam em `GET /tasks?status=` e `PATCH /tasks/:id` (`{ status }`).

## Disparos (WhatsApp / Evolution)

| Método | Rota | Observações |
|---|---|---|
| GET | `/messaging/instance` | Estado da conexão. |
| POST | `/messaging/instance/connect` **[ADMIN]** | `{ state, qrcode (data URL), pairingCode }` |
| POST | `/messaging/instance/logout` **[ADMIN]** | Desconecta a instância. |
| PATCH | `/messaging/instance` **[ADMIN]** | Mesmo corpo de `PATCH /messaging/settings` (`pausado`, `limiteDiario`...). Devolve `MessagingInstanceStatusDTO`: o estado da instância com `settings`, numa resposta só. |
| POST | `/messaging/send` | Mensagem avulsa: `{ clientId, conteudo, anexoDocumentId? }` (`MessageSendSchema`). Passa pela fila (janela, limite diário, intervalo). Devolve 400 em caso de opt-out, cliente sem telefone ou anexo de outro cliente. Responde 201 com `{ messageId, agendadaPara }`. |
| GET/POST | `/messaging/templates` | Lista ou cria templates. `PATCH /messaging/templates/:id` edita um template. |
| POST | `/messaging/templates/preview` | `{ conteudo }` devolve `{ texto }` renderizado com dados de exemplo. Variáveis: `{{nome}} {{seguradora}} {{apolice}} {{valor}} {{vencimento}} {{placa}}`. |
| GET/POST | `/messaging/rules` | Lista ou cria réguas. `PATCH /messaging/rules/:id` edita uma régua. |
| POST | `/messaging/rules/run` **[ADMIN]** | Roda o ciclo das réguas agora (ele já roda sozinho de hora em hora). |
| GET | `/messaging/settings` | Configurações de envio. `PATCH /messaging/settings` **[ADMIN]** altera `pausado`, `limiteDiario`, `janelaInicio`, `janelaFim` e o intervalo. |
| POST | `/messaging/broadcast` **[ADMIN]** | `{ templateId \| conteudo, filtro, dryRun }`: informe um template salvo **ou** uma mensagem personalizada (`conteudo`, até 4000 caracteres), nunca os dois. As variáveis são preenchidas por cliente com a apólice vigente mais próxima do vencimento (seguradora, número, placa e próxima parcela em aberto). Com `dryRun: true` só conta os destinatários. |
| GET | `/messaging/history?status=&clientId=&ruleId=&de=&ate=` | `Paginated<MessageDTO>` |
| GET | `/messaging/queue` | Contadores da fila e das mensagens agendadas. |
| POST | `/messaging/messages/:id/cancel` | Cancela uma mensagem agendada. |

Regras do envio:
- Cada par (régua, parcela) gera no máximo uma mensagem.
- Os envios acontecem só entre 8h e 20h, com um intervalo aleatório de 20 a 60 s entre mensagens, dentro do limite diário e respeitando a pausa e o opt-out.
- Webhook (para a Evolution): `POST /api/webhooks/evolution?token=<EVOLUTION_WEBHOOK_TOKEN>`. Quando o cliente responde "SAIR", o opt-out é marcado.

## CRM e cotações

- `GET /leads?q=&etapa=&responsavelId=` lista os leads (kanban), `GET /leads/:id` devolve um lead, `POST /leads` cria e
  `PATCH /leads/:id` edita (`etapa`, `motivoPerda`...).
- Um lead não vai para FECHADO direto pelo PATCH; use `POST /leads/:id/convert` com `{ cpfCnpj, nascimento?, endereco? }`, que cria ou associa o cliente.
- `GET /quotes?leadId=&clientId=` lista as cotações e `GET /quotes/:id` devolve uma.
- `POST /quotes` aceita `{ leadId | clientId, ramo, dados }`, onde `ramo` é `auto`, `moto`, `residencial`, `empresarial`, `vida` ou `viagem`. A API cria a cotação no Aggilizador.
- `POST /quotes/:id/refresh` busca os resultados.
- `POST /quotes/:id/send` envia ao lead ou cliente, pelo WhatsApp (via fila), um comparativo com os 3 menores prêmios. Exige status `CONCLUIDA`
  e telefone, respeita o opt-out e move o lead de NOVO/EM_CONTATO para COTACAO_ENVIADA. Responde 201 com `QuoteSendResponse` (`{ messageId, telefone, texto }`).
- O `status` da cotação é `PROCESSANDO`, `CONCLUIDA` ou `ERRO`. Sem o InsuranceBrokerId configurado, ela vem com `ERRO` e uma mensagem clara.

## Site (público, sem login)

`POST /public/leads` recebe o formulário de cotação do site: `{ nome, telefone, email?, produto?, mensagem? }` (`PublicLeadSchema`). O lead entra no CRM na etapa NOVO com origem `site`.
O limite é de 5 req/min por IP. O campo honeypot `site` precisa vir vazio (senão a resposta é 400). A resposta é só `{ ok: true }`: a rota não devolve id nem dados.

## Saúde

`GET /api/health` responde `{ ok: true, ts }` e não exige autenticação.

## Como subir

```bash
pnpm install
# dev com Docker (Postgres 15432, Redis 16379, pdf-parser 8001, portal-robot 8020, API 3333)
STORAGE_HOST_DIR=<pasta dos PDFs> docker compose --env-file apps/api/.env.local \
  -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d --build
# ou só a API local (com Postgres e Redis do compose já de pé)
pnpm db:migrate && pnpm db:seed && pnpm dev:api
pnpm import:carteira          # importa ../_dados (clients.json, policies.json), idempotente
pnpm -r typecheck && pnpm -r test
```
