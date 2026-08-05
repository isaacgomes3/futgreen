import { api, brl, fmtWhen } from './api.js';

/** Labels e extrato detalhado — nunca "Saldo Dedução"; Travado fora da UI */
export const BUCKET_LABELS = {
  balance_cents: 'Saldo Apostador',
  deduction_balance_cents: 'Saldo Reembolso',
  desafio_balance_cents: 'Carteira Desafio',
  investor_balance_cents: 'Saldo Provedor',
  demo_balance_cents: 'Demo',
  automacao_balance_cents: 'Carteira Automação',
};

export async function renderExtrato(container, { userId, limit = 100 } = {}) {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}&limit=${limit}` : `?limit=${limit}`;
  const { transactions } = await api(`/api/futgreen/transactions${q}`);
  if (!transactions.length) {
    container.innerHTML = '<p class="fg-empty">Nenhum lançamento no período.</p>';
    return;
  }
  container.innerHTML = `
    <table class="fg-table">
      <thead>
        <tr><th>Quando</th><th>Tipo</th><th>Bucket</th><th>Valor</th></tr>
      </thead>
      <tbody>
        ${transactions
          .map(
            (t) => `
          <tr>
            <td>${fmtWhen(t.created_at)}</td>
            <td>${t.label || t.type}</td>
            <td>${BUCKET_LABELS[t.bucket] || t.bucket || '—'}</td>
            <td>${brl(t.amount_cents)}</td>
          </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

export async function renderWalletCards(container) {
  const { wallet, labels } = await api('/api/futgreen/wallet');
  const order = [
    'balance_cents',
    'deduction_balance_cents',
    'desafio_balance_cents',
    'investor_balance_cents',
    'automacao_balance_cents',
    // Demo não aparece para cliente (só workshop local)
  ];
  container.innerHTML = `
    <div class="fg-grid">
      ${order
        .map(
          (k) => `
        <div class="fg-match">
          <div class="fg-meta">${labels[k] || BUCKET_LABELS[k]}</div>
          <div style="font-family:var(--font-display);font-size:1.8rem;color:var(--fg-pitch)">${brl(wallet[k])}</div>
        </div>`,
        )
        .join('')}
    </div>
  `;
  return wallet;
}
