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
            <p class="fg-meta" style="margin:0.2rem 0 0">Prelive Mexchange · logos TheSportsDB</p>
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

  async function load() {
    status.textContent = 'Consultando BetBra…';
    list.innerHTML = '';
    try {
      const hours = hoursEl.value;
      const data = await api(`/api/futgreen/prelive-events?hours=${hours}&logos=1`, { admin: true });
      const events = data.events || [];
      status.textContent = `${events.length} eventos · fonte ${data.source}${data.fetched_at ? ` · ${fmtWhen(data.fetched_at)}` : ''}`;
      if (!events.length) {
        list.innerHTML = `<p class="fg-empty">${data.error || 'Nenhum prelive no período.'}</p>`;
        return;
      }

      list.innerHTML = events
        .map((ev, i) => {
          const o = ev.odds || {};
          const hint = ev.desafio_hint || {};
          return `
          <article class="mdz-card" data-idx="${i}" style="padding:0.85rem 0.2rem">
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
            </div>
            <div class="mdz-card-foot">
              <button type="button" class="fg-btn" data-act="draft">Importar rascunho</button>
              <button type="button" class="fg-btn secondary" data-act="publish">Importar e publicar</button>
              ${betbraOpenBtn(ev.exchange_url)}
            </div>
          </article>`;
        })
        .join('');

      list.querySelectorAll('[data-act]').forEach((btn) => {
        btn.onclick = async () => {
          const idx = Number(btn.closest('[data-idx]').dataset.idx);
          const event = events[idx];
          btn.disabled = true;
          try {
            const res = await api('/api/futgreen/prelive-import', {
              method: 'POST',
              admin: true,
              body: {
                dest,
                event,
                publish: btn.dataset.act === 'publish',
              },
            });
            toast(dest === 'desafio' ? 'Desafio importado da BetBra' : 'Jogo importado da BetBra');
            onImported?.(res);
          } catch (e) {
            toast(e.message);
          } finally {
            btn.disabled = false;
          }
        };
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
