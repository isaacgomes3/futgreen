# Deploy — FUTGRN

| Item | Valor |
|---|---|
| VPS | `tips3x3` · `92.113.33.148` |
| Domínio | `futgreen.com.br` (+ `www`) |
| App dir | `/var/www/futgreen` |
| Porta interna | `3101` |
| Processo | PM2 `futgreen` |

## DNS (obrigatório)

No registrador do domínio, crie:

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
ssh tips3x3 'certbot --nginx -d futgreen.com.br -d www.futgreen.com.br --non-interactive --agree-tos -m admin@futgreen.com.br --redirect'
```

## Smoke

```bash
curl -sf https://futgreen.com.br/health
# expect: stake_lock_v1 + protection-runtime-stake-lock-v13
```

Produção **não** usa `FG_LOCAL=1` (sem workshop/reseed).
