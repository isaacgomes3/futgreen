import { api, brl, getEmail, setEmail, getImpersonate, setImpersonate, logout, isLoggedIn } from './api.js';
import { BRAND, brandLink, injectFavicons } from './brand.js';

const CLIENT_LINKS = [
  { href: '/app.html', label: 'Visão Geral', ico: '◈', group: 'OPERAÇÕES' },
  { href: '/app-proteger.html', label: 'Proteger', ico: '🛡', group: 'OPERAÇÕES' },
  { href: '/app-protecoes.html', label: 'Minhas Proteções', ico: '◎', group: 'OPERAÇÕES' },
  { href: '/app-desafio.html', label: 'Desafio', ico: '⚡', group: 'OPERAÇÕES' },
  { href: '/app-carteira.html', label: 'Carteira', ico: '₿', group: 'OPERAÇÕES' },
  { href: '/app-indicacao.html', label: 'Indicação', ico: '↗', group: 'OPERAÇÕES' },
];

/** Menu enquanto a conta aguarda o 1º depósito PIX creditado */
const DEPOSIT_ONLY_LINKS = [
  { href: '/app-carteira.html', label: 'Depósito', ico: '₿', group: 'COMECE AQUI' },
];

const DEPOSIT_ONLY_PATHS = ['/app-carteira.html', '/app-perfil.html'];

const ADMIN_LINKS = [
  { href: '/admin-jogos.html', label: 'Jogos', ico: '▣', group: 'ADMIN' },
  { href: '/admin-desafios.html', label: 'Desafios', ico: '⚡', group: 'ADMIN' },
  { href: '/admin-monitoring-desafios.html', label: 'Monitor Desafios', ico: '◉', group: 'ADMIN' },
  { href: '/admin-monitoring-protections.html', label: 'Monitor Proteções', ico: '◎', group: 'ADMIN' },
  { href: '/admin-financeiro.html', label: 'Financeiro', ico: '₿', group: 'ADMIN' },
  { href: '/admin-users.html', label: 'Usuários', ico: '👤', group: 'ADMIN' },
  { href: '/admin-transactions.html', label: 'Extrato', ico: '☰', group: 'ADMIN' },
];

function pathActive(href) {
  const here = location.pathname.replace(/\/$/, '') || '/';
  const target = href.replace(/\/$/, '') || '/';
  if (here === target || (target !== '/' && here.endsWith(target))) return true;
  // Jornada unificada: URL antiga também marca a aba
  if (target.endsWith('/app-desafio.html') && here.endsWith('/app-desafio-jornada.html')) return true;
  return false;
}

function renderGroups(links) {
  const groups = [];
  for (const l of links) {
    const g = l.group || 'MENU';
    if (!groups.includes(g)) groups.push(g);
  }
  return groups
    .map((g) => {
      const items = links
        .filter((l) => (l.group || 'MENU') === g)
        .map((l) => {
          const active = pathActive(l.href) ? ' is-active' : '';
          const badge = l.novo ? '<span class="fg-badge-novo">EM BREVE</span>' : '';
          return `<a class="fg-side-link${active}" href="${l.href}"><span class="ico">${l.ico || '•'}</span>${l.label}${badge}</a>`;
        })
        .join('');
      return `<div class="fg-nav-group">${g}</div>${items}`;
    })
    .join('');
}

export async function mountShell({ admin = false } = {}) {
  document.body.classList.add('fg-app');
  injectFavicons();
  if (!document.title.includes(BRAND.name)) {
    document.title = document.title.replace(/FutGreen|FutGrn|FUTGRN/gi, BRAND.name);
    if (!document.title.includes(BRAND.name)) {
      document.title = `${document.title} · ${BRAND.name}`;
    }
  }

  if (!isLoggedIn()) {
    location.replace(`/entrar.html?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error('auth_required');
  }

  const root = document.getElementById('fg-shell-root') || document.body;

  let me = null;
  try {
    me = await api('/api/futgreen/me');
  } catch (err) {
    if (err?.status === 401 || err?.data?.code === 'auth_required') {
      logout({ redirect: '/entrar.html' });
      throw new Error('auth_required');
    }
    me = { wallet: {}, user: { email: getEmail(), name: 'Cliente' }, admin: false };
  }

  // Área admin: só allowlist — sem auto-login
  if (admin && !me.admin) {
    location.replace('/app.html');
    throw new Error('admin_required');
  }

  const imp = getImpersonate();
  if (imp) {
    const ban = document.createElement('div');
    ban.className = 'fg-banner';
    ban.innerHTML = `Espelho: <strong>${imp}</strong> · <a href="#" id="fg-exit-mirror">Sair do espelho</a>`;
    root.prepend(ban);
    ban.querySelector('#fg-exit-mirror').onclick = (e) => {
      e.preventDefault();
      setImpersonate('');
      location.reload();
    };
  }

  const w = me.wallet || {};
  const name = me.user?.name || me.user?.email?.split('@')[0] || 'User';
  const depositOnly = !admin && Boolean(me.deposit_only || me.user?.deposit_only);
  const links = admin ? ADMIN_LINKS : depositOnly ? DEPOSIT_ONLY_LINKS : CLIENT_LINKS;
  const home = admin ? '/admin-jogos.html' : depositOnly ? '/app-carteira.html' : '/app.html';

  if (depositOnly) {
    const here = location.pathname.replace(/\/$/, '') || '/';
    const allowed = DEPOSIT_ONLY_PATHS.some((p) => here === p || here.endsWith(p));
    if (!allowed) {
      location.replace('/app-carteira.html');
      throw new Error('deposit_required');
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'fg-nav-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.prepend(overlay);

  const sidebar = document.createElement('aside');
  sidebar.className = 'fg-sidebar';
  sidebar.id = 'fg-sidebar';
  sidebar.innerHTML = `
    <div class="fg-sidebar-head">
      ${brandLink({ href: home })}
      <button type="button" class="fg-icon-btn fg-sidebar-close" aria-label="Fechar menu">✕</button>
    </div>
    <nav class="fg-side-nav">
      ${renderGroups(links)}
      <div class="fg-nav-group">SISTEMA</div>
      ${
        depositOnly
          ? ''
          : admin
            ? '<a class="fg-side-link" href="/app.html"><span class="ico">↩</span>Modo usuário</a>'
            : '<a class="fg-side-link" href="/admin-jogos.html"><span class="ico">⌘</span>Modo ADM</a>'
      }
      <a class="fg-side-link" href="/"><span class="ico">⌂</span>Site</a>
      <button type="button" class="fg-side-link fg-logout-btn" id="fg-logout">
        <span class="ico">⎋</span>Sair
      </button>
    </nav>
    <div class="fg-side-foot">
      <a class="fg-user-card${pathActive('/app-perfil.html') ? ' is-active' : ''}" href="/app-perfil.html" title="Abrir meu perfil" aria-label="Abrir perfil de ${name}">
        <img class="fg-avatar-brand" src="${BRAND.avatar}" width="38" height="38" alt="" />
        <div>
          <strong>${name}</strong>
          <span>${depositOnly ? 'Aguardando depósito' : `${brl(w.balance_cents)} · Apostador`}</span>
        </div>
      </a>
    </div>
  `;
  document.body.prepend(sidebar);

  if (depositOnly) {
    const ban = document.createElement('div');
    ban.className = 'fg-banner fg-banner-deposit';
    ban.innerHTML =
      'Conta criada. <strong>Faça o depósito PIX</strong> para liberar Proteger, Desafio e as demais funções.';
    root.prepend(ban);
  }

  const topbar = document.createElement('header');
  topbar.className = 'fg-topbar';
  topbar.innerHTML = `
    <div class="fg-topbar-lead">
      <button type="button" class="fg-icon-btn fg-menu-toggle" aria-label="Abrir menu" aria-controls="fg-sidebar" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      ${brandLink({ href: home, compact: true })}
    </div>
    <div class="fg-bal-strip" id="fg-balance-chips">
      <div class="fg-bal"><small>Apostador</small><strong>${brl(w.balance_cents)}</strong></div>
      ${
        depositOnly
          ? ''
          : `<div class="fg-bal"><small>Reembolso</small><strong>${brl(w.deduction_balance_cents)}</strong></div>
      <div class="fg-bal"><small>Desafio</small><strong>${brl(w.desafio_balance_cents)}</strong></div>
      <div class="fg-bal"><small>Automação</small><strong>${brl(w.automacao_balance_cents)}</strong></div>`
      }
    </div>
    <div class="fg-top-actions">
      ${
        depositOnly
          ? ''
          : admin
            ? '<a class="fg-btn ghost fg-hide-xs" href="/app.html">Modo usuário</a>'
            : '<a class="fg-btn ghost fg-hide-xs" href="/admin-jogos.html">Modo ADM</a>'
      }
      <a class="fg-btn fg-btn-deposit" href="/app-carteira.html"><span class="fg-btn-label-full">+ Depósito</span><span class="fg-btn-label-short" aria-hidden="true">+</span></a>
      <button type="button" class="fg-btn ghost fg-hide-xs" id="fg-logout-top" title="Sair">Sair</button>
    </div>
  `;
  root.prepend(topbar);

  // Barra de trocar e-mail só no ambiente local (não em produção)
  let isLocal = false;
  try {
    const health = await fetch('/health').then((r) => r.json());
    isLocal = Boolean(health.local);
  } catch { /* ignore */ }
  if (isLocal) {
    const emailBar = document.createElement('div');
    emailBar.className = 'fg-devbar';
    emailBar.innerHTML = `
    <label>Sessão local
      <input id="fg-email-input" value="${getEmail()}" />
    </label>
    <button type="button" class="fg-btn ghost" id="fg-email-save" style="padding:0.3rem 0.65rem;font-size:0.75rem">Trocar</button>
  `;
    topbar.after(emailBar);
    emailBar.querySelector('#fg-email-save').onclick = () => {
      setEmail(emailBar.querySelector('#fg-email-input').value.trim());
      location.reload();
    };
  }

  const menuBtn = topbar.querySelector('.fg-menu-toggle');
  const closeBtn = sidebar.querySelector('.fg-sidebar-close');

  function setNavOpen(open) {
    document.body.classList.toggle('fg-nav-open', open);
    menuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  menuBtn?.addEventListener('click', () => setNavOpen(!document.body.classList.contains('fg-nav-open')));
  closeBtn?.addEventListener('click', () => setNavOpen(false));
  overlay.addEventListener('click', () => setNavOpen(false));
  sidebar.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setNavOpen(false)));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setNavOpen(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) setNavOpen(false);
  });

  function doLogout() {
    logout({ redirect: '/entrar.html' });
  }
  sidebar.querySelector('#fg-logout')?.addEventListener('click', doLogout);
  topbar.querySelector('#fg-logout-top')?.addEventListener('click', doLogout);

  queueMicrotask(() => {
    document.querySelectorAll('.fg-table').forEach((table) => {
      if (table.parentElement?.classList.contains('fg-table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'fg-table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  });

  return me;
}
