# Protection Flow Locked — stake_lock_v1

**Contrato:** `protection-flow-contract-v13`  
**Runtime:** `protection-runtime-stake-lock-v13`  
**Código:** `scripts/lib/protection-flow-contract.mjs`

## Regras travadas

1. Entrada **não trava** stake — Saldo Apostador e Travado **intactos** na ativação.
2. O valor informado é a stake (BACK) ou responsabilidade (LAY) usada na BetBra.
3. Teto **50%** do Saldo Apostador = cobertura máxima de reembolso.
4. **1** proteção ativa por `user` + `match` (indicação).
5. Somente **pré-kickoff**.
6. LAY = responsabilidade · BACK = stake.
7. Side da indicação admin é **travado** (cliente não edita).
8. Liquidação: **Reembolso** · **Ganho** · **Anula** · **Cancelar**.

## Economia da indicação (v13)

Lucro bruto na BetBra:

| Lado | Valor informado | Lucro bruto |
|---|---|---|
| BACK | stake | `stake × (odd − 1)` |
| LAY | responsabilidade | `liability / (odd − 1)` |

Se a indicação **vencer** (GANHO):

| Parcela | Base | Carteira FutGreen |
|---|---|---|
| Cliente | **1% da stake/responsabilidade** | — (fica no lucro BetBra) |
| Exchange (BetBra) | **2,5% do lucro bruto** | — |
| FutGreen | lucro bruto − cliente − exchange | **não** debita Saldo Apostador |

Ex.: responsabilidade R$ 1.000 · lucro bruto R$ 161,29 → cliente **R$ 10,00** · BetBra R$ 4,03 · FutGreen R$ 147,26.

| Resultado | Carteira |
|---|---|
| Reembolso (indicação falhou) | Credita stake integral → **Saldo Reembolso** |
| Ganho | **Sem movimento** (lucro já na BetBra; split só em meta) |
| Anula (empate anula / void) | **Sem movimento** / sem P&L |
| Cancelar | **Sem movimento** |

Alterar estas regras exige pedido explícito do dono + bump de versão + sync docs/testes.
