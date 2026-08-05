# Releases ArbiShield

## arbishield-1.3.3 (2026-08)

- Feat: sync de placar ganha uma terceira fonte — FotMob (API pública não-oficial usada pelo próprio site/app, `fotmob.com/api/data/matches?date=YYYYMMDD`), com cobertura de 500+ competições
  - Ordem de preferência: 1) feed in-play BetBra (external_id exato) → 2) FotMob (nome dos times, cobertura ampla) → 3) TheSportsDB (último fallback)
  - Resolveu o caso Minnesota United × Juárez (Leagues Cup) que não estava em nenhuma das outras duas fontes — FotMob tinha o placar certo (1-2, intervalo)
  - `scoreFromFotmobMatch` exportado e testado em `tests/live-score-sync.test.mjs`

## arbishield-1.3.2 (2026-08)

- Feat: sync de placar passa a usar também o feed in-play da própria BetBra/Bolsa de Aposta (`client/api/jumper/feedSports/inplay-info`, mesma infra "jumper" nos dois domínios) — casamento exato por `external_id`, sem depender de heurística de nome de time
  - Preferencial sobre o TheSportsDB quando o evento está no feed; TheSportsDB continua como fallback
  - Feed traz placar ao vivo, minuto (`timeElapsed`) e fase (`inPlayMatchStatus`: KickOff/FirstHalfEnd/SecondHalfKickOff etc.) já no formato usado pela BetBra, cobrindo melhor ligas latino-americanas que não estão no TheSportsDB
  - `scoreFromInplayEntry` exportado e testado em `tests/live-score-sync.test.mjs`
- Nota: o feed in-play só lista os eventos que a própria BetBra está tracking com scoreboard ativo no momento — jogos fora dessa lista continuam caindo no fallback TheSportsDB (e podem ficar sem placar em tempo real se nenhuma das duas fontes cobrir a competição)

## arbishield-1.3.1 (2026-08)

- Fix: card do Desafio mostrava o nome dos times de novo na faixa onde o Proteger mostra o campeonato — passa a persistir `league` no step (vindo do evento BetBra) e exibir com o mesmo `shortLeagueName` do Proteger
- Nota: placar ao vivo depende da cobertura do TheSportsDB por competição; torneios menos comuns (ex.: Leagues Cup) podem não estar indexados lá, mantendo 0-0/estimado mesmo com o sync rodando — isso é limite da fonte externa, não um bug de sincronização

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
