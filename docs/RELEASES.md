# Releases ArbiShield

## arbishield-1.6.0 (2026-08)

- **Pedido explícito do dono** — liquidação automática de Proteção e Desafio + cancelamento/suspensão de evento, ver `docs/SYSTEM_NON_REGRESSION.md` e `docs/FUNCIONAMENTO_DESAFIO_E_PROTECAO.md` §2.3a/§2.3b/§3.3b/§3.4:
  - **Liquidação automática (`auto-settle-v1`)**: quando o placar vem confirmado por fonte externa (`score_source` + `finished_at` + placar numérico), Proteção e Desafio liquidam sozinhos, reaproveitando 100% `settleProtection`/`settleDesafioStep` (nenhuma regra financeira nova). Mercado não reconhecido (novo `scripts/lib/auto-settle.mjs`: 1X2/vencedor, DNB/Empate Anula, Total de gols Mais/Menos) **nunca é adivinhado** — fica para o admin liquidar manualmente. Roda no scheduler de placar (45s), no sync manual/força e no `GET /api/futgreen/matches`
  - **Edição/liquidação manual do admin preservada 100%** — corre em paralelo com segurança (guards de idempotência já existentes: `p.status !== 'active'` / `step.status === 'done'`)
  - **Evento suspenso (`desafio-evento-suspenso-v1` / `protecao-evento-suspenso-v1`)**: admin **nunca** cancela/exclui evento (Desafio ou Proteção) com etapa/partida em andamento, mesmo Isaac/Carlos — bloqueia e marca `is_suspended`/`suspended` ("Evento suspenso"), impedindo só novas entradas e preservando quem já está participando. Cancelamento com estorno continua permitido antes do kickoff
  - Novo endpoint `POST /api/futgreen/match-cancel` (Proteção) + botão "Cancelar evento" em `admin-jogos.html`
  - **Cancelamento de entrada pelo cliente no Desafio** (novidade — só existia para Proteção): botão "Cancelar entrada" no card antes do kickoff (`app-desafio.html` → novo endpoint `POST /api/futgreen/desafio-entry-cancel`, função `cancelDesafioEntryByClient`)
  - Novos testes: `tests/auto-settle.test.mjs`, `tests/event-suspend-cancel.test.mjs`

## arbishield-1.5.0 (2026-08)

- **Pedido explícito do dono** — corrige o cálculo da odd ARBISHIELD no Desafio (`odd_futgreen-surebet-v1`), ver `docs/SYSTEM_NON_REGRESSION.md` e `docs/FUNCIONAMENTO_DESAFIO_E_PROTECAO.md` §3.3a:
  - `odd_futgreen` agora é **calculada por padrão** a partir da `odd_casa` real (BetBra) via surebet clássico `1/oddArbi + 1/oddCasa = 1 - 5%`, garantindo ~5% de lucro em ambos os resultados (antes: copiava a odd bruta da zebra da BetBra, sem margem garantida)
  - Nova função `computeSurebetOddArbi` em `scripts/lib/desafio-ciclo-math.mjs` (espelho `public/js/desafio-ciclo-math.js`)
  - Aplicada no carrinho da BetBra (`desafioFieldsFromSelections`, `normalizePreliveEvent`) e no formulário manual (`admin-desafios.html`, campo auto-calculado a partir da Odd Casa, editável)
  - Corrigido bug no formulário manual do admin que ignorava os valores digitados pelo admin (sempre criava com odd fixa 3.40/1.55)
  - `suggestedHouseStake` corrigida (antes tinha um buffer de margem sempre zerado `* (1 + targetProfit * 0)`) — agora calcula o stake equivalente na BetBra via dutching (mesmo retorno bruto nos dois lados)
  - Card do cliente (`app-desafio.html`): ao digitar a stake, o preview mostra também o valor equivalente a apostar na BetBra, igual ao exemplo visual (entrada ARBISHIELD × odd = retorno; stake BetBra × odd_casa = mesmo retorno)
  - Novos testes: `computeSurebetOddArbi` (odd_casa 1.72 → ~2.70) e verificação de margem de lucro ~5% no dutching (`tests/desafio-market-flag.test.mjs`); testes de `betbra-normalize.test.mjs` atualizados para a nova regra

## arbishield-1.4.0 (2026-08)

- **Pedido explícito do dono** — inverte a regra de crédito da liquidação do Desafio (`desafio-indicacao-settle-v1`), ver `docs/SYSTEM_NON_REGRESSION.md`:
  - **Indicação venceu** na BetBra → cliente já foi pago **fora** (na BetBra); **sem crédito** na Carteira Desafio (era o contrário antes)
  - **Indicação perdeu** na BetBra → ArbiShield **protege**: credita **stake + lucro** na Carteira Desafio, ciclo continua até vencer (até 5 etapas)
  - Terminologia sempre **"Indicação venceu"/"Indicação perdeu"** — removido "Bateu ARBISHIELD"/"Bateu Casa" dos botões admin (`admin-desafios.html`, `admin-monitoring-desafios.html`) e do label do cliente (`app-desafio.html`)
  - `step.result`: `indicacao_venceu` / `indicacao_perdeu` / `empate_anula` (antes: `zebra_protected` / `win`); `part.result`: `indicacao_venceu` / `protegido` / `void` (antes: `won` / `lost`)
  - Etapas já liquidadas antes desta versão **não são reprocessadas** — só afeta liquidações novas
  - Novo teste dedicado: `tests/desafio-settle-indicacao.test.mjs`
  - Docs sincronizadas: `docs/FUNCIONAMENTO_DESAFIO_E_PROTECAO.md`, `docs/SYSTEM_NON_REGRESSION.md`

## arbishield-1.3.4 (2026-08)

- Feat: sync de placar agora também preenche o escudo do time (home_logo/away_logo) com a imagem do FotMob (`images.fotmob.com/image_resources/logo/teamlogo/{id}_small.png`) quando o card não tem logo — usa o `id` do time que já vem no mesmo payload do FotMob usado pra achar o placar, sem precisar de outra chamada
  - Só preenche quando o campo está vazio (nunca sobrescreve um logo já resolvido por outra fonte)
  - Propaga entre match (Proteger) e step (Desafio) do mesmo evento, igual ao placar

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
