# Releases ArbiShield

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
