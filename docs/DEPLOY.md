# Deploy

## Frontend (Vercel)

1. Vercel → Add New Project → importe este repositório.
2. **Root Directory:** `apps/web` (marque "Include source files outside of the Root Directory", necessário para `packages/shared`).
3. Framework: Next.js. Install/Build já vêm de `apps/web/vercel.json`.
4. Variáveis de ambiente:

| Nome | Produção | Preview (demo) |
|---|---|---|
| `NEXT_PUBLIC_DEMO` | `0` | `1` |
| `NEXT_PUBLIC_API_URL` | `https://api.<dominio>` (HTTPS obrigatório) | — |
| `NEXT_PUBLIC_WHATSAPP` | número da corretora com DDI | idem |

Enquanto o backend não estiver na VPS com HTTPS, publique com `NEXT_PUBLIC_DEMO=1` (dados fictícios).

## Backend (VPS)

- `infra/docker-compose.yml` + `infra/Caddyfile` (TLS automático). Precisa de um domínio/subdomínio apontando para a VPS (ex.: `api.serginhoseguros.com.br`).
- `.env` a partir de `apps/api/.env.example` — nunca commitar.
- Depois do deploy: `CORS_ORIGIN` = domínio da Vercel; refresh cookie exige mesmo site ou `SameSite=None; Secure`.
