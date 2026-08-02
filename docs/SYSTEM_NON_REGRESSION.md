# System Non-Regression — v1

**Contrato:** `system-non-regression-v1`

## Superfícies que não podem regredir sem bump

- Modelo de criação: `createProtectionModel=stake_lock_v1`
- Health: `protectionRuntime=protection-runtime-stake-lock-v13`
- Buckets e labels (`Saldo Reembolso`, nunca “Saldo Dedução”)
- Transferência Banca → Jornada (`desafio_balance_cents`) bloqueada (403)
- Labels: Carteira Jornada (não “Desafio” na UI); Travado não é superfície de UI
- Desafio ao vivo: cancelar/excluir → 403
- `edit_only` em desafios preserva `is_active` / `published_at`
- Empate Anula/DNB: não liquidar pelo ramo 1X2 `isDraw`

## Checklist pós-deploy

1. `GET /health` com runtime v13 + stake_lock_v1  
2. `npm test`  
3. `npm run audit:prod`  
4. Smoke: publicar jogo → proteger → liquidar; publicar desafio → registrar → settle
