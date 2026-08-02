import { setEmail, getEmail, brl, api } from '/public/js/api.js';

const frame = document.getElementById('preview');
const screenName = document.getElementById('screen-name');
const screenPath = document.getElementById('screen-path');
const persona = document.getElementById('persona');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const walletChips = document.getElementById('wallet-chips');

const LABELS = {
  '/': 'Início',
  '/app-proteger.html': 'Proteger',
  '/app-protecoes.html': 'Minhas Proteções',
  '/app-desafio.html': 'Jornada',
  '/app-desafio-jornada.html': 'Jornada',
  '/app-carteira.html': 'Carteira',
  '/admin-jogos.html': 'Jogos',
  '/admin-desafios.html': 'Desafios',
  '/admin-monitoring-desafios.html': 'Monitor Desafios',
  '/admin-monitoring-protections.html': 'Monitor Proteções',
  '/admin-financeiro.html': 'Financeiro',
  '/admin-manual-deposits.html': 'Depósitos',
  '/admin-users.html': 'Usuários',
  '/admin-transactions.html': 'Extrato',
};

persona.value = getEmail();
persona.onchange = () => {
  setEmail(persona.value);
  refreshFrame();
  refreshWallet();
};

document.querySelectorAll('.ws-nav button').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.ws-nav button').forEach((b) => b.classList.remove('is-on'));
    btn.classList.add('is-on');
    navigate(btn.dataset.src);
  };
});

document.getElementById('viewport').onclick = (e) => {
  const btn = e.target.closest('button[data-w]');
  if (!btn) return;
  document.querySelectorAll('#viewport button').forEach((b) => b.classList.remove('is-on'));
  btn.classList.add('is-on');
  document.documentElement.style.setProperty('--ws-width', btn.dataset.w);
};

document.getElementById('btn-reload').onclick = () => refreshFrame();
document.getElementById('btn-open').onclick = () => window.open(screenPath.textContent, '_blank');
document.getElementById('btn-reseed').onclick = async () => {
  if (!confirm('Resetar dados locais (seed)?')) return;
  statusText.textContent = 'reseed…';
  try {
    await fetch('/api/futgreen/dev/reseed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Email': 'admin@futgreen.local',
        'X-User-Email': 'admin@futgreen.local',
      },
      body: '{}',
    }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'falha');
      return data;
    });
    setEmail('cliente@futgreen.local');
    persona.value = 'cliente@futgreen.local';
    await refreshWallet();
    refreshFrame();
    statusText.textContent = 'seed ok';
  } catch (e) {
    statusText.textContent = e.message;
    statusEl.classList.add('bad');
  }
};

function navigate(src) {
  screenPath.textContent = src;
  screenName.textContent = LABELS[src] || src;
  frame.src = src;
}

function refreshFrame() {
  frame.src = screenPath.textContent;
}

async function refreshHealth() {
  try {
    const h = await fetch('/health').then((r) => r.json());
    statusEl.classList.add('ok');
    statusEl.classList.remove('bad');
    statusText.textContent = `${h.createProtectionModel} · local`;
  } catch {
    statusEl.classList.add('bad');
    statusEl.classList.remove('ok');
    statusText.textContent = 'offline';
  }
}

async function refreshWallet() {
  try {
    const { wallet } = await api('/api/futgreen/wallet');
    walletChips.innerHTML = `
      <span class="fg-chip">Apostador <strong>${brl(wallet.balance_cents)}</strong></span>
      <span class="fg-chip">Reembolso <strong>${brl(wallet.deduction_balance_cents)}</strong></span>
      <span class="fg-chip">Jornada <strong>${brl(wallet.desafio_balance_cents)}</strong></span>
    `;
  } catch {
    walletChips.innerHTML = '';
  }
}

// sync persona into iframe storage via same-origin localStorage (shared)
frame.addEventListener('load', () => refreshWallet());

refreshHealth();
refreshWallet();
setInterval(refreshHealth, 8000);
