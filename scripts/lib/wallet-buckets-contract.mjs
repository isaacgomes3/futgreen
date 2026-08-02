/**
 * wallet-buckets-contract-v1
 * Labels oficiais da UI ↔ colunas de profiles
 * Nunca exibir "Saldo Dedução" — nome oficial é Saldo Reembolso.
 */

export const WALLET_BUCKETS_VERSION = 'wallet-buckets-contract-v1';

export const BUCKETS = Object.freeze({
  balance_cents: {
    column: 'balance_cents',
    label: 'Saldo Apostador',
    shortLabel: 'Apostador',
    aliases: ['Saldo Real', 'Banca'],
  },
  deduction_balance_cents: {
    column: 'deduction_balance_cents',
    label: 'Saldo Reembolso',
    shortLabel: 'Reembolso',
    aliases: [], // nunca "Saldo Dedução"
  },
  locked_balance_cents: {
    column: 'locked_balance_cents',
    label: 'Saldo Travado',
    shortLabel: 'Travado',
    aliases: [],
  },
  desafio_balance_cents: {
    column: 'desafio_balance_cents',
    label: 'Carteira Desafio',
    shortLabel: 'Desafio',
    aliases: [],
  },
  investor_balance_cents: {
    column: 'investor_balance_cents',
    label: 'Saldo Provedor',
    shortLabel: 'Provedor',
    aliases: [],
  },
  demo_balance_cents: {
    column: 'demo_balance_cents',
    label: 'Demo',
    shortLabel: 'Demo',
    aliases: [],
  },
});

export const TX_TYPES = Object.freeze({
  protection_lock: 'Entrada (trava stake)',
  protection_settlement: 'Saída do evento',
  protection_fee: 'Dedução',
  exchange_commission: 'Dedução',
  protection_refund: 'Estorno',
  protection_unlock: 'Liberação',
  protection_release: 'Liberação',
  desafio_deposit: 'Depósito Desafio',
  desafio_cancel_refund: 'Estorno (cancelado)',
  desafio_void_refund: 'Estorno Empate Anula',
  desafio_forfeit_to_provider: 'Forfeit → Provedor',
  desafio_zebra_payout: 'Lucro zebra',
  desafio_reregister: 'Reentrada',
  admin_adjustment_credit: 'Ajuste manual',
  admin_adjustment_debit: 'Ajuste manual (débito)',
  provider_deposit: 'Crédito Provedor',
  manual_deposit: 'Depósito manual',
  transfer_reembolso_to_desafio: 'Reembolso → Desafio',
  deduction_withdraw: 'Saque Saldo Reembolso',
});

/** Transferências permitidas entre buckets */
export const ALLOWED_TRANSFERS = Object.freeze([
  { from: 'deduction_balance_cents', to: 'desafio_balance_cents', route: 'transfer-desafio' },
]);

export function isTransferAllowed(from, to) {
  return ALLOWED_TRANSFERS.some((t) => t.from === from && t.to === to);
}

/** Banca (Apostador) → Desafio é bloqueada */
export function assertTransferAllowed(from, to) {
  if (from === 'balance_cents' && to === 'desafio_balance_cents') {
    const err = new Error('Transferência Banca → Desafio bloqueada');
    err.status = 403;
    err.code = 'TRANSFER_BLOCKED';
    throw err;
  }
  if (!isTransferAllowed(from, to)) {
    const err = new Error(`Transferência ${from} → ${to} não permitida`);
    err.status = 403;
    err.code = 'TRANSFER_BLOCKED';
    throw err;
  }
}

export function labelForBucket(column) {
  return BUCKETS[column]?.label || column;
}

export function labelForTxType(type) {
  return TX_TYPES[type] || type;
}

export function emptyWallet() {
  return {
    balance_cents: 0,
    deduction_balance_cents: 0,
    locked_balance_cents: 0,
    desafio_balance_cents: 0,
    investor_balance_cents: 0,
    demo_balance_cents: 0,
  };
}
