# Ambiente local — visualização e aprimoramento

## Subir

```bash
npm run local
```

Hub: http://localhost:3101/local/

## O que o workshop oferece

1. **Preview** de todas as páginas (cliente e admin) num iframe
2. **Persona** — troca o e-mail de sessão (`localStorage.fg_email`)
3. **Viewport** — Desktop / Mobile (390) / Tablet (768)
4. **Live reload** — salve HTML/CSS/JS e a página recarrega
5. **Reset seed** — recria `data/futgreen.json` com saldos demo

## Fluxo sugerido de aprimoramento

1. Abra o workshop e a tela alvo no preview
2. Edite `public/css/futgreen.css` ou o HTML correspondente
3. Veja o reload automático
4. Use Mobile no viewport para validar responsivo
5. Alterne Cliente ↔ Admin para testar fluxos

## Variáveis

| Var | Default | Efeito |
|---|---|---|
| `FG_LOCAL=1` | setado por `npm run local` | live reload + reseed + workshop |
| `PORT` | `3101` | porta HTTP |

## Arquivos

- `local/index.html` — hub
- `local/workshop.js` / `workshop.css` — UI do ambiente
- `scripts/local-dev.mjs` — orquestrador
- `scripts/lib/livereload.mjs` — SSE + watch
