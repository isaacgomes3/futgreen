# ARBISHIELD

Marca **ARBISHIELD** (repo `futgreen`) — Jogos Protegidos (`stake_lock_v1`) e Desafio.

Identidade visual: `public/brand/` · kit em `/brand.html`

## Ambiente local (visualização e aprimoramento)

```bash
npm run local
```

Abre o **workshop** em [http://localhost:3101/local/](http://localhost:3101/local/) com:

- preview das telas cliente/admin em iframe
- troca de persona (Cliente / Admin / Isaac / Carlos)
- viewport Desktop · Mobile · Tablet
- live reload de HTML/CSS/JS
- **Reset seed** para voltar aos dados demo

| Comando | Uso |
|---|---|
| `npm run local` | sobe + abre o workshop |
| `npm run local:quiet` | sobe sem abrir o browser |
| `npm run local:reseed` | apaga `data/` , seed de novo e abre |

App direto: [http://localhost:3101](http://localhost:3101).

| Sessão (campo no topo) | Uso |
|---|---|
| `cliente@futgreen.local` | Cliente (seed com saldos) |
| `admin@futgreen.local` | Admin allowlist |
| `isaac@futgreen.local` / `carlos@futgreen.local` | Ops (cancelar desafio publicado) |

## Produtos

- **Proteger** — `app-proteger.html` · trava stake · teto 50% · 1 op/evento · pré-kickoff  
- **Desafio** — `app-desafio.html` · debita Carteira Desafio · até 5 entradas  
- **Carteira** — Apostador · **Saldo Reembolso** · Travado · Desafio  

## API

- Base: `/api/futgreen/*` (alias `/api/arbishield/*`)
- Health: `GET /health` → `createProtectionModel=stake_lock_v1` · runtime v13
- Porta default: `3101`

### Integrações admin

| Endpoint | Fonte |
|---|---|
| `GET /api/futgreen/prelive-events` | BetBra Mexchange (radar) |
| `POST /api/futgreen/prelive-import` | Importa para Proteger ou Desafio |
| `GET /api/futgreen/football-teams?q=` | TheSportsDB (nome + logo) |

Opcional no `.env`: `BETBRA_SESSION_TOKEN`, `SPORTSDB_API_KEY`

## Scripts

```bash
npm test           # contratos e guards
npm run audit:prod # superfície de arquivos
npm run dev        # server com --watch
```

## Contratos

- `docs/PROTECTION_FLOW_LOCKED.md`
- `docs/SYSTEM_NON_REGRESSION.md`
- `AGENTS.md`
