# Design — Serginho Seguros (apps/web)

**Direção:** "ouro sobre nanquim". Editorial, sóbrio, com cara de banco privado de família. O ouro é acento (botão principal, números-chave, selos) e nunca fundo de página. O tema claro usa papel marfim; o escuro usa nanquim.

## Cores (`src/styles/tokens.css`)
- Primitivos: `gold-50…900` (logo = `gold-400 #EEBD25`; texto dourado sobre marfim = `gold-700`, contraste AA), `ink-950…600`, `ivory-50…300`.
- Semânticos (claro/escuro): `--background`, `--surface`, `--surface-2`, `--sunken`, `--border`, `--border-strong`, `--foreground`, `--muted`, `--subtle`, `--accent-text`, `--accent-soft`, `success / warning / danger / info`, `chart-1…6`, `sidebar-*`.
- Componentes usam só os semânticos (classes Tailwind `bg-surface`, `text-muted`…). Hex direto só em marcas de terceiros (WhatsApp, cores das seguradoras).

## Tipografia
- Display: **Cormorant Garamond** 600/700 (títulos, números grandes, itálico para ênfase).
- Texto/UI: **Manrope** 400–800. Números em `tabular` (tabular-nums).
- Escala: 12 / 13 / 14 (base da UI) / 16 (site) / 20 / 28 / 36–44 / 56–80 (hero).

## Espaço, raio, sombra
- Grade de 4 px; gutters 16 (mobile) / 24 / 32 px; cards com padding 20 px.
- Raios: `--radius` 10 px, `--radius-lg` 16 px, `--radius-xl` 24 px.
- Sombras: `--shadow-soft` (cards) e `--shadow-lift` (arraste, overlays).

## Movimento
- Logo animada (`components/brand/animated-logo.tsx`): traço → preenchimento → brilho, < 2 s.
- Micro-interações de 150–300 ms; entrada em cascata nas listas; números contam ao entrar na tela.
- `prefers-reduced-motion`: `MotionConfig reducedMotion="user"` e override global em CSS.

## Componentes de terceiros adaptados (Origin Kit)
Foil Drift (fundo WebGL do hero e do login), Focus Reveal (título do hero), Text Carousel (palavra rotativa). Restilizados com os tokens acima.

## Responsivo
Testado em 375 px e 1440 px, claro e escuro. Sidebar vira gaveta abaixo de `lg`; o kanban do CRM rola na horizontal até 1700 px.
