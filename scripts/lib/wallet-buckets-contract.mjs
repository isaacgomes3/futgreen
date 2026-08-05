/**
 * wallet-buckets-contract-v4
 * Labels oficiais da UI ↔ colunas de profiles
 * Nunca exibir "Saldo Dedução" — nome oficial é Saldo Reembolso.
 * Carteira do produto Desafio = Carteira Desafio (coluna desafio_balance_cents).
 * "Jornada" é o nome legado (rebrand ArbiShield), mantido como alias.
 * Saldo Travado existe no modelo, mas não é superfície de UI (entrada sem trava).
 * Carteira Automação (automacao_balance_cents) — pedido explícito do dono (2026-08-05):
 * saldo independente, abastecido por depósito manual do admin, transferência de outras
 * carteiras (Apostador/Reembolso) e depósito PIX direto.
 */

export const WALLET_BUCKETS_VERSION = 'wallet-buckets-contract-v4';

export const BUCKETS = Object.freeze({
  balance_cents: {
    column: 'balance_cents',
    label: 'Saldo Apostador',
    shortLabel: 'Apostador',
    aliases: ['Saldo Real', 'Banca'],
    uiVisible: true,
  },
  deduction_balance_cents: {
    column: 'deduction_balance_cents',
    label: 'Saldo Reembolso',
    shortLabel: 'Reembolso',
    aliases: [], // nunca "Saldo Dedução"
    uiVisible: true,
  },
  locked_balance_cents: {
    column: 'locked_balance_cents',
    label: 'Saldo Travado',
    shortLabel: 'Travado',
    aliases: [],
    uiVisible: false,
  },
  desafio_balance_cents: {
    column: 'desafio_balance_cents',
    label: 'Carteira Desafio',
    shortLabel: 'Desafio',
    aliases: ['Carteira Jornada', 'Jornada'],
    uiVisible: true,
  },
  investor_balance_cents: {
    column: 'investor_balance_cents',
    label: 'Saldo Provedor',
    shortLabel: 'Provedor',
    aliases: [],
    uiVisible: true,
  },
  automacao_balance_cents: {
    column: 'automacao_balance_cents',
    label: 'Carteira Automação',
    shortLabel: 'Automação',
    aliases: [],
    uiVisible: true,
  },
  demo_balance_cents: {
    column: 'demo_balance_cents',
    label: 'Demo',
    shortLabel: 'Demo',
    aliases: [],
    uiVisible: true,
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
  automacao_deposit: 'Depósito Automação',
  transfer_reembolso_to_desafio: 'Reembolso → Desafio',
  transfer_apostador_to_automacao: 'Apostador → Automação',
  transfer_reembolso_to_automacao: 'Reembolso → Automação',
  deduction_withdraw: 'Saque Saldo Reembolso',
  deduction_withdraw_hold: 'Saque Reembolso (reserva)',
  deduction_withdraw_paid: 'Saque Reembolso (pago)',
  deduction_withdraw_rejected: 'Saque Reembolso (rejeitado)',
});

/** Transferências permitidas entre buckets */
export const ALLOWED_TRANSFERS = Object.freeze([
  { from: 'deduction_balance_cents', to: 'desafio_balance_cents', route: 'transfer-desafio' },
  { from: 'balance_cents', to: 'automacao_balance_cents', route: 'transfer-automacao' },
  { from: 'deduction_balance_cents', to: 'automacao_balance_cents', route: 'transfer-automacao' },
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

export function shortLabelForBucket(column) {
  return BUCKETS[column]?.shortLabel || labelForBucket(column);
}

/** Buckets exibidos em chips/cards do cliente (exclui Travado). */
export function uiVisibleBucketKeys() {
  return Object.keys(BUCKETS).filter((k) => BUCKETS[k].uiVisible !== false);
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
    automacao_balance_cents: 0,
  };
}
