# System Non-Regression — v1

**Contrato:** `system-non-regression-v1`

## Superfícies que não podem regredir sem bump

- Modelo de criação: `createProtectionModel=stake_lock_v1`
- Health: `protectionRuntime=protection-runtime-stake-lock-v14`
- Cliente cancela proteção própria só pré-kickoff
- Buckets e labels (`Saldo Reembolso`, nunca “Saldo Dedução”)
- Transferência Banca → Desafio (`desafio_balance_cents`) bloqueada (403)
- Labels: Carteira Desafio (nome legado “Carteira Jornada” mantido como alias, rebrand ArbiShield 2026-08); Travado não é superfície de UI
- Desafio ao vivo: cancelar/excluir → 403
- `edit_only` em desafios preserva `is_active` / `published_at`
- Empate Anula/DNB: não liquidar pelo ramo 1X2 `isDraw`
- Desafio — liquidação (`desafio-indicacao-settle-v1`, pedido explícito do dono 2026-08-04): indicação venceu na BetBra → **sem crédito** na Carteira Desafio (cliente já foi pago fora); indicação perdeu na BetBra → **credita stake + lucro** (proteção, ciclo continua); vocabulário sempre "Indicação venceu"/"Indicação perdeu", nunca "Bateu"/"Casa" na UI
- Desafio — odd ARBISHIELD (`odd_futgreen-surebet-v1`, pedido explícito do dono 2026-08-04): `odd_futgreen` é calculada por padrão a partir da `odd_casa` real da BetBra via surebet clássico `1/oddArbi + 1/oddCasa = 1 - 5%`, garantindo ~5% de lucro em ambos os resultados (dutching); função `computeSurebetOddArbi` em `scripts/lib/desafio-ciclo-math.mjs` (espelho `public/js/desafio-ciclo-math.js`); admin pode sobrescrever manualmente
- Liquidação automática (`auto-settle-v1`, pedido explícito do dono 2026-08-04): Proteção e Desafio liquidam sozinhos quando o placar vem confirmado por fonte externa (`score_source` + `finished_at` + placar numérico); reaproveita 100% `settleProtection`/`settleDesafioStep` — nenhuma regra financeira nova, só decide o outcome a partir do placar. Mercado não reconhecido (`scripts/lib/auto-settle.mjs`: 1X2/vencedor, DNB, Total de gols Mais/Menos) **nunca é adivinhado** — fica para o admin liquidar manualmente. Edição/liquidação manual do admin continua 100% disponível e tem prioridade (corrida resolvida pelos guards de idempotência já existentes)
- Evento suspenso (`desafio-evento-suspenso-v1` / `protecao-evento-suspenso-v1`, pedido explícito do dono 2026-08-04): admin **nunca** cancela/exclui evento (Desafio ou Proteção) com etapa/partida em andamento — bloqueia e marca `is_suspended`/`suspended` (mensagem "Evento suspenso"), preservando quem já está participando e só impedindo novas entradas. Cancelamento normal (com estorno) só antes do kickoff. Cliente pode cancelar a própria entrada/proteção antes do kickoff (`cancelDesafioEntryByClient`, `cancelProtectionByClient` — UI em `app-desafio.html`/`app-protecoes.html`)
- Carteira Automação (`wallet-buckets-contract-v4`, pedido explícito do dono 2026-08-05): novo bucket independente `automacao_balance_cents`, visível na UI (chips do topo e cartões da carteira). Abastecido por depósito manual do admin, depósito PIX direto (`dest=automacao`) e transferência a partir de Saldo Apostador ou Saldo Reembolso (`/api/futgreen/transfer-automacao`, rotas em `ALLOWED_TRANSFERS`). Não tem transferência automática de saída nem regra de liquidação própria — é só saldo movimentável, igual aos demais buckets manuais

## Checklist pós-deploy

1. `GET /health` com runtime v14 + stake_lock_v1  
2. `npm test`  
3. `npm run audit:prod`  
4. Smoke: publicar jogo → proteger → liquidar; publicar desafio → registrar → settle
