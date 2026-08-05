# Releases ArbiShield

## arbishield-1.3.0 (2026-08)

- Fix: cards de Desafio agora exibem relógio (1º/2º tempo, intervalo, minuto) e placar ao vivo, igual ao Proteger
  - `/api/futgreen/desafios` passa a computar `match_phase`/`match_clock`/`match_badge`/placar por step via `touchMatchLiveState` (mesma função usada em `/api/futgreen/matches`)
  - `live-score-sync.mjs` (TheSportsDB) passa a varrer também `desafio_steps`, não só `matches` — settle continua manual/admin
- Fix: escudos de time sem logo/URL quebrada não aparecem mais como "bolinha" (imagem quebrada) — fallback para `/public/assets/casa-default.svg` via `onerror` em Desafio e Proteger

## arbishield-1.2.0 (2026-08)

- Wallet-buckets-contract v3: label oficial da carteira do Desafio passa de "Carteira Jornada" para "Carteira Desafio" (`Jornada` mantido como alias legado)
- Copy do Desafio revista: remove framing de "aposta na zebra" (o Desafio não é uma aposta direta do usuário, é uma indicação ArbiShield para vencer na BetBra, em até 5 etapas)
- Pedido explícito do dono — ver `docs/SYSTEM_NON_REGRESSION.md`

## arbishield-1.1.0 (2026-08)

- Rebrand visual completo: FutGreen → ArbiShield (nome, wordmark, logo/favicon/avatar em `public/brand/`, títulos e textos de todas as telas)
- Nova identidade visual sem tagline abaixo do logo (`BRAND.tagline` vazio)
- Domínio público atualizado para `arbishield.app` (`.env`, `.env.example`, docs de deploy e nginx)
- Nomes técnicos internos mantidos por decisão explícita: arquivos `.mjs`, rotas `/api/futgreen/*` (alias `/api/arbishield/*` já existente), `package.json.name`, processo PM2 e diretório `/var/www/futgreen`

## futgreen-1.0.0 (2026-08)

- Bootstrap do sistema: Jogos Protegidos (`stake_lock_v1`) + Desafio
- API `/api/futgreen/*` com alias `/api/arbishield/*`
- UIs cliente e admin (HTML + JS)
- Contratos: protection-flow-contract-v13 · wallet-buckets · admin-ops
- Persistência local JSON (`data/futgreen.json`)
