import { api, toast, fmtWhen, brl } from './api.js';

/** Ícone B BetBra — b amarelo com haste para cima (não “p”) */
const BETBRA_ICON = `<svg class="fg-betbra-mark" viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
  <g transform="translate(32 32) skewX(-10) translate(-32 -32)">
    <path fill="#00A651" d="M13 7h21c9.5 0 16 5.4 16 13.6 0 5-2.6 9-7 10.9 5.4 1.6 9 6.2 9 12.4C52 55.2 44.6 61 33.8 61H13V7z"/>
    <path fill="#0a0e0c" d="M25 17h9.2c4.2 0 6.6 2 6.6 5.4s-2.4 5.4-6.6 5.4H25V17z"/>
    <path fill="#0a0e0c" d="M25 37h10.4c4.8 0 7.6 2.6 7.6 6.8S40.2 51 35.4 51H25V37z"/>
    <rect x="9" y="6" width="13" height="52" rx="1.5" fill="#FFCC29"/>
    <circle cx="35" cy="38" r="17" fill="#FFCC29"/>
    <circle cx="35" cy="38" r="7.5" fill="#3E5FBF"/>
  </g>
</svg>`;

function betbraOpenBtn(url) {
  if (!url) return '';
  return `<a class="fg-btn ghost fg-betbra-btn" href="${url}" target="_blank" rel="noopener" title="Abrir na BetBra">
    ${BETBRA_ICON}
    <span>Abrir BetBra</span>
  </a>`;
}

function teamCell(name, logo) {
  const initial = (name || '?').slice(0, 2).toUpperCase();
  const img = logo
    ? `<img src="${logo}" alt="" width="28" height="28" style="border-radius:50%;object-fit:cover;background:#111" />`
    : `<span class="fg-logo-fallback" style="width:28px;height:28px;font-size:0.65rem">${initial}</span>`;
  return `<div style="display:flex;align-items:center;gap:0.45rem;min-width:0"><span style="flex-shrink:0">${img}</span><strong style="font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name || '—'}</strong></div>`;
}

function fmtOdd(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(2);
}

function cartKey(marketId, runnerName, side) {
  return `${marketId}|${runnerName}|${side}`;
}

function oddBtn(side, odd, marketId, runnerName, runnerId) {
  const v = fmtOdd(odd);
  if (v === '—') {
    return `<span class="fg-odd-cell is-empty fg-odd-${side}">—</span>`;
  }
  const key = cartKey(marketId, runnerName, side.toUpperCase());
  return `<button type="button" class="fg-odd-cell fg-odd-${side}" data-act="odd"
    data-key="${key}" data-market-id="${marketId}" data-runner="${runnerName}"
    data-runner-id="${runnerId ?? ''}" data-side="${side.toUpperCase()}" data-odd="${odd}"
    title="Adicionar ${side.toUpperCase()} ${v} ao carrinho">${v}</button>`;
}

function renderMarketsHtml(markets, { pickOdds = false } = {}) {
  if (!markets?.length) {
    return `<p class="fg-empty" style="padding:0.75rem 0">Nenhum mercado disponível neste evento.</p>`;
  }
  return markets
    .map((m, i) => {
      const mid = m.id != null ? String(m.id) : `idx-${i}`;
      const rows = (m.runners || [])
        .map((r) => {
          const name = r.name || '—';
          const back = pickOdds ? oddBtn('back', r.back_odd, mid, name, r.id) : `<span class="fg-odd-back">${fmtOdd(r.back_odd)}</span>`;
          const lay = pickOdds ? oddBtn('lay', r.lay_odd, mid, name, r.id) : `<span class="fg-odd-lay">${fmtOdd(r.lay_odd)}</span>`;
          return `
          <div class="fg-mkt-row">
            <span class="fg-mkt-runner">${name}</span>
            ${back}
            ${lay}
          </div>`;
        })
        .join('');
      return `
        <section class="fg-mkt" data-mkt-id="${mid}" data-mkt-idx="${i}">
          <div class="fg-mkt-head">
            <div class="fg-mkt-title">
              <strong>${m.name || 'Mercado'}</strong>
              ${m.market_type ? `<span class="fg-meta" style="margin:0 0 0 0.4rem">${m.market_type}</span>` : ''}
            </div>
            <div class="fg-mkt-head-right">
              <span class="fg-meta" style="margin:0">Vol ${brl((m.volume || 0) * 100)}</span>
              ${m.exchange_url ? `<a class="fg-mkt-link" href="${m.exchange_url}" target="_blank" rel="noopener" data-act="ext">BetBra</a>` : ''}
            </div>
          </div>
          <div class="fg-mkt-cols">
            <span>Selection</span>
            <span class="fg-odd-back">Back</span>
            <span class="fg-odd-lay">Lay</span>
          </div>
          ${rows || `<p class="fg-meta" style="margin:0.35rem 0 0">Sem selections</p>`}
        </section>`;
    })
    .join('');
}

/**
 * Radar BetBra embutido no admin.
 * @param {HTMLElement} container
 * @param {{ dest: 'proteger'|'desafio', onImported?: Function }} opts
 */
export async function mountBetbraRadar(container, { dest = 'proteger', onImported } = {}) {
  container.innerHTML = `
    <div class="fg-card" style="margin-bottom:1.2rem">
      <div style="display:flex;flex-wrap:wrap;gap:0.6rem;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
        <div style="display:flex;align-items:center;gap:0.75rem">
          <div class="fg-betbra-logo-plate">${BETBRA_ICON.replace('width="22" height="22"', 'width="36" height="36"')}</div>
          <div>
            <h3 style="margin:0;font-family:var(--font-display);font-style:italic;text-transform:uppercase">Radar BetBra</h3>
            <p class="fg-meta" style="margin:0.2rem 0 0">Prelive Mexchange · clique no evento para ver mercados</p>
          </div>
        </div>
        <div style="display:flex;gap:0.45rem;flex-wrap:wrap;align-items:center">
          <label class="fg-meta" style="display:flex;align-items:center;gap:0.35rem;margin:0">
            Janela
            <select id="bb-hours" style="font:inherit;padding:0.35rem 0.5rem;border-radius:8px;border:1px solid var(--fg-line-soft);background:var(--fg-void);color:var(--fg-ink)">
              <option value="12">12h</option>
              <option value="24">24h</option>
              <option value="36" selected>36h</option>
              <option value="72">72h</option>
            </select>
          </label>
          <button type="button" class="fg-btn ghost" id="bb-refresh">Atualizar radar</button>
        </div>
      </div>
      <div id="bb-status" class="fg-meta">Carregando BetBra…</div>
      <div id="bb-list" style="display:grid;gap:0.55rem;margin-top:0.75rem"></div>
    </div>
  `;

  const status = container.querySelector('#bb-status');
  const list = container.querySelector('#bb-list');
  const hoursEl = container.querySelector('#bb-hours');
  let listEvents = [];

  async function importEvent(event, publish, btn, { marketIds = null, selections = null } = {}) {
    if (btn) btn.disabled = true;
    try {
      const body = { dest, event, publish };
      if (selections?.length) body.selections = selections;
      else if (marketIds?.length) body.market_ids = marketIds;
      const res = await api('/api/futgreen/prelive-import', {
        method: 'POST',
        admin: true,
        body,
      });
      const n = res.count || res.matches?.length || 1;
      if (dest === 'desafio') toast('Desafio importado da BetBra');
      else if (selections?.length) toast(n > 1 ? `${n} odds lançadas` : 'Odd lançada');
      else if (n > 1) toast(`${n} mercados lançados`);
      else toast(marketIds?.length ? 'Mercado lançado' : 'Jogo importado da BetBra');
      onImported?.(res);
      return res;
    } catch (e) {
      toast(e.message);
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindImportButtons(root, event) {
    root.querySelectorAll('[data-act="draft"], [data-act="publish"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        importEvent(event, btn.dataset.act === 'publish', btn);
      };
    });
  }

  async function openEventMarkets(listEv) {
    const id = listEv.external_id;
    if (!id) {
      toast('Evento sem id BetBra');
      return;
    }
    status.textContent = `Carregando mercados · ${listEv.home_team} × ${listEv.away_team}…`;
    list.innerHTML = `<p class="fg-empty">Buscando todos os mercados (back / lay)…</p>`;
    try {
      const data = await api(`/api/futgreen/prelive-event/${encodeURIComponent(id)}?logos=1`, { admin: true });
      const ev = { ...listEv, ...(data.event || {}) };
      const markets = data.markets || ev.markets || [];
      /** @type {Map<string, {key:string, market_id:string, market_name:string, runner_name:string, runner_id:string|null, side:string, odd:number}>} */
      const cart = new Map();

      const canPickOdds = dest === 'proteger';
      status.textContent = canPickOdds
        ? `${markets.length} mercados · ${ev.home_team} × ${ev.away_team} · clique na odd (back/lay)`
        : `${markets.length} mercados · ${ev.home_team} × ${ev.away_team}`;
      list.innerHTML = `
        <article class="mdz-card fg-event-detail" style="padding:0.85rem 0.2rem">
          <div class="mdz-card-top">
            <span>${ev.league || 'Futebol'}${ev.in_running ? ' · LIVE' : ''}</span>
            <span>${fmtWhen(ev.starts_at)}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;align-items:center;margin:0.45rem 0">
            ${teamCell(ev.home_team, ev.home_logo || listEv.home_logo)}
            <span class="fg-vs">×</span>
            ${teamCell(ev.away_team, ev.away_logo || listEv.away_logo)}
          </div>
          <div class="fg-meta" style="margin-bottom:0.55rem">
            Vol evento ${brl((ev.volume || 0) * 100)}
            ${canPickOdds ? ' · cada odd back/lay é independente · carrinho abaixo' : ''}
          </div>
          <div id="bb-cart" class="fg-cart" hidden>
            <div class="fg-cart-head">
              <strong>Carrinho</strong>
              <span id="bb-cart-count" class="fg-meta" style="margin:0"></span>
            </div>
            <div id="bb-cart-items" class="fg-cart-items"></div>
            <div class="mdz-card-foot fg-mkt-actions" style="margin-top:0.65rem">
              <button type="button" class="fg-btn ghost" data-act="clear">Limpar</button>
              <button type="button" class="fg-btn" data-act="draft-sel" disabled>Lançar rascunho</button>
              <button type="button" class="fg-btn secondary" data-act="publish-sel" disabled>Lançar e publicar</button>
            </div>
          </div>
          <div class="mdz-card-foot fg-mkt-actions" style="margin-bottom:0.85rem">
            <button type="button" class="fg-btn ghost" data-act="back">← Voltar</button>
            ${
              canPickOdds
                ? ''
                : `
            <button type="button" class="fg-btn" data-act="draft">Importar rascunho</button>
            <button type="button" class="fg-btn secondary" data-act="publish">Importar e publicar</button>`
            }
            ${betbraOpenBtn(ev.exchange_url || listEv.exchange_url)}
          </div>
          <div class="fg-mkt-list">
            ${renderMarketsHtml(markets, { pickOdds: canPickOdds })}
          </div>
        </article>`;

      const detail = list.querySelector('.fg-event-detail');
      detail.querySelector('[data-act="back"]').onclick = () => load();

      if (!canPickOdds) {
        bindImportButtons(detail, listEv);
      } else {
        const cartEl = detail.querySelector('#bb-cart');
        const cartItems = detail.querySelector('#bb-cart-items');
        const cartCount = detail.querySelector('#bb-cart-count');
        const btnDraft = detail.querySelector('[data-act="draft-sel"]');
        const btnPub = detail.querySelector('[data-act="publish-sel"]');
        const btnClear = detail.querySelector('[data-act="clear"]');
        const marketNameById = Object.fromEntries(
          markets.map((m, i) => [m.id != null ? String(m.id) : `idx-${i}`, m.name || 'Mercado']),
        );

        function cartSelections() {
          return [...cart.values()].map((x) => ({
            market_id: x.market_id,
            runner_name: x.runner_name,
            runner_id: x.runner_id,
            side: x.side,
            odd: x.odd,
          }));
        }

        function syncCartUi() {
          const items = [...cart.values()];
          const n = items.length;
          detail.querySelectorAll('[data-act="odd"]').forEach((btn) => {
            btn.classList.toggle('is-in-cart', cart.has(btn.dataset.key));
          });
          btnDraft.disabled = n === 0;
          btnPub.disabled = n === 0;
          cartEl.hidden = n === 0;
          cartCount.textContent = n ? `${n} odd${n > 1 ? 's' : ''}` : '';
          btnDraft.textContent = n <= 1 ? 'Lançar rascunho' : `Lançar ${n} rascunhos`;
          btnPub.textContent = n <= 1 ? 'Lançar e publicar' : `Publicar ${n} odds`;
          cartItems.innerHTML = items
            .map(
              (x) => `
              <div class="fg-cart-item" data-key="${x.key}">
                <span class="fg-cart-item-main">
                  <span class="fg-cart-side ${x.side === 'LAY' ? 'is-lay' : 'is-back'}">${x.side}</span>
                  <strong>${x.odd.toFixed(2)}</strong>
                  <span class="fg-meta" style="margin:0">${x.runner_name} · ${x.market_name}</span>
                </span>
                <button type="button" class="fg-cart-remove" data-act="remove" data-key="${x.key}" title="Retirar">×</button>
              </div>`,
            )
            .join('');
          cartItems.querySelectorAll('[data-act="remove"]').forEach((btn) => {
            btn.onclick = () => {
              cart.delete(btn.dataset.key);
              syncCartUi();
            };
          });
          status.textContent = n
            ? `Carrinho: ${n} odd${n > 1 ? 's' : ''} · ${ev.home_team} × ${ev.away_team}`
            : `${markets.length} mercados · ${ev.home_team} × ${ev.away_team} · clique na odd (back/lay)`;
        }

        function toggleOdd(btn) {
          const mid = btn.dataset.marketId;
          if (!mid || mid.startsWith('idx-')) {
            toast('Mercado sem id — não dá para importar');
            return;
          }
          const key = btn.dataset.key;
          if (cart.has(key)) {
            cart.delete(key);
          } else {
            cart.set(key, {
              key,
              market_id: mid,
              market_name: marketNameById[mid] || 'Mercado',
              runner_name: btn.dataset.runner,
              runner_id: btn.dataset.runnerId || null,
              side: btn.dataset.side,
              odd: Number(btn.dataset.odd),
            });
          }
          syncCartUi();
          cartEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        btnClear.onclick = () => {
          cart.clear();
          syncCartUi();
        };
        btnDraft.onclick = async () => {
          const sels = cartSelections();
          if (!sels.length) return toast('Selecione ao menos uma odd');
          const res = await importEvent(listEv, false, btnDraft, { selections: sels });
          if (res) {
            cart.clear();
            syncCartUi();
          }
        };
        btnPub.onclick = async () => {
          const sels = cartSelections();
          if (!sels.length) return toast('Selecione ao menos uma odd');
          const res = await importEvent(listEv, true, btnPub, { selections: sels });
          if (res) {
            cart.clear();
            syncCartUi();
          }
        };

        detail.querySelectorAll('[data-act="odd"]').forEach((btn) => {
          btn.onclick = (e) => {
            e.stopPropagation();
            toggleOdd(btn);
          };
        });
      }
    } catch (e) {
      status.textContent = `Falha ao carregar mercados: ${e.message}`;
      list.innerHTML = `
        <p class="fg-empty">${e.message}</p>
        <button type="button" class="fg-btn ghost" id="bb-back-fail">← Voltar ao radar</button>`;
      list.querySelector('#bb-back-fail').onclick = () => load();
    }
  }

  async function load() {
    status.textContent = 'Consultando BetBra…';
    list.innerHTML = '';
    try {
      const hours = hoursEl.value;
      const data = await api(`/api/futgreen/prelive-events?hours=${hours}&logos=1`, { admin: true });
      listEvents = data.events || [];
      status.textContent = `${listEvents.length} eventos · fonte ${data.source}${data.fetched_at ? ` · ${fmtWhen(data.fetched_at)}` : ''} · clique para mercados`;
      if (!listEvents.length) {
        list.innerHTML = `<p class="fg-empty">${data.error || 'Nenhum prelive no período.'}</p>`;
        return;
      }

      list.innerHTML = listEvents
        .map((ev, i) => {
          const o = ev.odds || {};
          const hint = ev.desafio_hint || {};
          return `
          <article class="mdz-card fg-radar-event" data-idx="${i}" style="padding:0.85rem 0.2rem;cursor:pointer" title="Ver todos os mercados">
            <div class="mdz-card-top">
              <span>${ev.league || 'Futebol'}${ev.in_running ? ' · LIVE' : ''}</span>
              <span>${fmtWhen(ev.starts_at)}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;align-items:center;margin:0.45rem 0">
              ${teamCell(ev.home_team, ev.home_logo)}
              <span class="fg-vs">×</span>
              ${teamCell(ev.away_team, ev.away_logo)}
            </div>
            <div class="fg-meta">
              Vol ${brl((ev.volume || 0) * 100)} ·
              H ${o.home_back ?? '—'} / ${o.home_lay ?? '—'} ·
              A ${o.away_back ?? '—'} / ${o.away_lay ?? '—'}
              ${dest === 'desafio' && hint.odd_futgreen ? ` · zebra ${hint.bet_team_side} @ ${hint.odd_futgreen}` : ''}
              <span class="fg-radar-hint"> · ver mercados</span>
            </div>
            <div class="mdz-card-foot">
              <button type="button" class="fg-btn ghost" data-act="markets">Ver mercados</button>
              <button type="button" class="fg-btn" data-act="draft">Importar rascunho</button>
              <button type="button" class="fg-btn secondary" data-act="publish">Importar e publicar</button>
              ${betbraOpenBtn(ev.exchange_url)}
            </div>
          </article>`;
        })
        .join('');

      list.querySelectorAll('.fg-radar-event').forEach((card) => {
        const idx = Number(card.dataset.idx);
        const event = listEvents[idx];
        card.onclick = (e) => {
          if (e.target.closest('[data-act], a')) return;
          openEventMarkets(event);
        };
        card.querySelector('[data-act="markets"]').onclick = (e) => {
          e.stopPropagation();
          openEventMarkets(event);
        };
        bindImportButtons(card, event);
      });
    } catch (e) {
      status.textContent = `Falha BetBra: ${e.message}`;
      list.innerHTML = `<p class="fg-empty">Verifique BETBRA_SESSION_TOKEN no .env se o token guest expirou.</p>`;
    }
  }

  container.querySelector('#bb-refresh').onclick = load;
  hoursEl.onchange = load;
  await load();
}

/** Autocomplete de times com logo (TheSportsDB via API) */
export function bindTeamSearch(input, { onPick, datalistId } = {}) {
  let timer = null;
  const box = document.createElement('div');
  box.className = 'fg-team-suggest';
  box.hidden = true;
  box.style.cssText =
    'position:absolute;z-index:40;left:0;right:0;top:100%;margin-top:0.25rem;background:var(--fg-panel);border:1px solid var(--fg-line-soft);border-radius:12px;max-height:220px;overflow:auto;box-shadow:var(--glow-soft)';
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  wrap.appendChild(box);

  async function search(q) {
    if (q.trim().length < 2) {
      box.hidden = true;
      return;
    }
    try {
      const { teams } = await api(`/api/futgreen/football-teams?q=${encodeURIComponent(q)}`);
      if (datalistId) {
        const dl = document.getElementById(datalistId);
        if (dl) dl.innerHTML = teams.map((t) => `<option value="${t.name}">`).join('');
      }
      box.innerHTML = teams
        .map(
          (t) => `
        <button type="button" data-name="${t.name}" data-logo="${t.logo || ''}" style="display:flex;align-items:center;gap:0.55rem;width:100%;padding:0.55rem 0.7rem;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left">
          ${t.logo ? `<img src="${t.logo}" width="24" height="24" style="border-radius:50%;object-fit:cover" alt="" />` : '<span class="fg-logo-fallback" style="width:24px;height:24px;font-size:0.6rem">?</span>'}
          <span><strong>${t.name}</strong><br/><span class="fg-meta" style="margin:0">${t.country || ''} ${t.league || ''}</span></span>
        </button>`,
        )
        .join('') || '<div class="fg-meta" style="padding:0.6rem">Nenhum time</div>';
      box.hidden = false;
      box.querySelectorAll('button').forEach((b) => {
        b.onmouseenter = () => {
          b.style.background = 'rgba(200,255,0,0.08)';
        };
        b.onmouseleave = () => {
          b.style.background = 'transparent';
        };
        b.onclick = () => {
          input.value = b.dataset.name;
          box.hidden = true;
          onPick?.({ name: b.dataset.name, logo: b.dataset.logo || null });
        };
      });
    } catch {
      box.hidden = true;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => search(input.value), 280);
  });
  input.addEventListener('blur', () => setTimeout(() => {
    box.hidden = true;
  }, 180));
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) search(input.value);
  });
}
