# AGENTS.md — FutGreen

## protection-flow-lock

Ao descrever ou alterar **proteção**, citar somente `stake_lock_v1` / contrato v10.  
Detalhe: `docs/PROTECTION_FLOW_LOCKED.md` · código: `scripts/lib/protection-flow-contract.mjs`.

## system-non-regression

Não regredir buckets, labels (Saldo Reembolso), bloqueio Banca→Desafio, guard de desafio ao vivo, nem health runtime sem pedido explícito + bump.  
Detalhe: `docs/SYSTEM_NON_REGRESSION.md`.

## Escopo de mudança

Alterar regras de proteção, buckets, layout admin crítico ou fluxo Desafio andamento exige **pedido explícito** do dono + bump de versão + sync docs/testes.
