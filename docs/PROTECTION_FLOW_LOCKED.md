# Protection Flow Locked — stake_lock_v1

**Contrato:** `protection-flow-contract-v10`  
**Runtime:** `protection-runtime-stake-lock-v10`  
**Código:** `scripts/lib/protection-flow-contract.mjs`

## Regras travadas

1. Entrada **trava** stake em `locked_balance_cents` — não cobra dedução na ativação.
2. Teto **50%** do Saldo Apostador restante (sucessivo por evento).
3. **1** proteção ativa por `user` + `match`.
4. Somente **pré-kickoff**.
5. LAY = responsabilidade · BACK = stake.
6. Liquidação: **Reembolso** · **Ganho** · **Anula** · **Cancelar**.

| Resultado | Locked | Dinheiro |
|---|---|---|
| Reembolso | Destrava | Stake → Saldo Reembolso |
| Ganho | Destrava + devolve origem | Cobra só dedução (odd canônica) |
| Anula | Destrava + devolve | Sem crédito Reembolso |
| Cancelar | Destrava + devolve | Sem dedução |

Alterar estas regras exige pedido explícito do dono + bump de versão + sync docs/testes.
