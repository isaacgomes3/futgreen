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

## Checklist pós-deploy

1. `GET /health` com runtime v14 + stake_lock_v1  
2. `npm test`  
3. `npm run audit:prod`  
4. Smoke: publicar jogo → proteger → liquidar; publicar desafio → registrar → settle
