# Deploy — ARBISHIELD

| Item | Valor |
|---|---|
| VPS | `tips3x3` · `92.113.33.148` |
| Domínio | `arbishield.app` (+ `www`) |
| App dir | `/var/www/futgreen` |
| Porta interna | `3101` |
| Processo | PM2 `futgreen` |

> Nota: `App dir` e `Processo` mantêm o identificador técnico legado `futgreen` (fora do escopo do rebrand visual). O domínio de produção passou a ser `arbishield.app` — antes de fazer o cutover, aponte o DNS para o novo domínio e emita o certificado SSL (passo manual no VPS, ver abaixo).

## DNS (obrigatório)

No registrador do domínio `arbishield.app`, crie:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | `92.113.33.148` |
| A | `www` | `92.113.33.148` |

## Deploy

```bash
# Git Bash / WSL (com rsync)
bash deploy/deploy-remote.sh
```

Ou sync manual + setup na VPS:

```bash
ssh tips3x3 'bash /var/www/futgreen/deploy/setup-vps.sh'
```

## SSL (depois do DNS propagar)

```bash
ssh tips3x3 'certbot --nginx -d arbishield.app -d www.arbishield.app --non-interactive --agree-tos -m admin@arbishield.app --redirect'
```

## Smoke

```bash
curl -sf https://arbishield.app/health
# expect: stake_lock_v1 + protection-runtime-stake-lock-v14
```

Produção **não** usa `FG_LOCAL=1` (sem workshop/reseed).
