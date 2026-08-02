/**
 * protection-flow-contract-v10
 * Modelo travado: stake_lock_v1
 * Runtime: protection-runtime-stake-lock-v10
 *
 * Alterar regras exige pedido explícito do dono + bump de versão.
 */

export const PROTECTION_CONTRACT_VERSION = 'protection-flow-contract-v10';
export const PROTECTION_RUNTIME = 'protection-runtime-stake-lock-v10';
export const CREATE_PROTECTION_MODEL = 'stake_lock_v1';
export const EXCHANGE_COMMISSION = 0.045;
export const MAX_STAKE_RATIO = 0.5;

export const PROTECTION_OUTCOMES = Object.freeze({
  REEMBOLSO: 'reembolso',
  GANHO: 'ganho',
  ANULA: 'anula',
  CANCELAR: 'cancelar',
});

/**
 * Dedução LAY (responsabilidade) com comissão exchange 4,5% embutida.
 * Fórmula v10: fee = R × (1−c)² / odd
 * Vetor de referência: 1000@10 → R$ 91,20 (doc ilustra ~91,11)
 */
export function lockedLayDeductionReais(liabilityReais, odd, commission = EXCHANGE_COMMISSION) {
  const R = Number(liabilityReais);
  const o = Number(odd);
  const c = Number(commission);
  if (!(R > 0) || !(o > 1)) throw new Error('liability/odd inválidos');
  return Math.round(((R * (1 - c) * (1 - c)) / o) * 100) / 100;
}

/**
 * Dedução quando resultado = GANHO (cliente ganhou na exchange).
 * Comissão 4,5% já embutida — não debitar de novo.
 * LAY = responsabilidade · BACK = stake
 */
export function calcProtectionDeductionCents({ side, amountCents, odd, commission = EXCHANGE_COMMISSION }) {
  const o = Number(odd);
  const amount = Number(amountCents);
  if (!Number.isFinite(o) || o <= 1 || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('odd/amount inválidos para dedução');
  }

  const sideU = String(side || 'LAY').toUpperCase();
  let feeReais;

  if (sideU === 'LAY') {
    feeReais = lockedLayDeductionReais(amount / 100, o, commission);
  } else {
    const stake = amount / 100;
    const c = commission;
    feeReais = Math.round(stake * ((o - 1) / o) * (c / (1 - c)) * 100) / 100;
  }

  return Math.round(feeReais * 100);
}

export function resolveCanonicalOdd(protection) {
  const row = protection || {};
  const calc = row.calculations || {};
  const meta = row.metadata || {};
  const candidates = [row.approved_odd, calc.marketOdd, meta.market_odd, row.odd];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 1) return n;
  }
  throw new Error('odd canônica ausente');
}

export function assertPreKickoff(startsAt, now = new Date()) {
  const t = new Date(startsAt).getTime();
  if (!Number.isFinite(t)) throw new Error('starts_at inválido');
  if (now.getTime() >= t) {
    const err = new Error('Proteção só antes do kickoff');
    err.code = 'PRE_KICKOFF';
    err.status = 400;
    throw err;
  }
}

export function maxLockableCents(balanceCents) {
  const bal = Math.max(0, Number(balanceCents) || 0);
  return Math.floor(bal * MAX_STAKE_RATIO);
}

export function protectionHealthPayload() {
  return {
    protectionRuntime: PROTECTION_RUNTIME,
    createProtectionModel: CREATE_PROTECTION_MODEL,
    contractVersion: PROTECTION_CONTRACT_VERSION,
    exchangeCommission: EXCHANGE_COMMISSION,
    maxStakeRatio: MAX_STAKE_RATIO,
  };
}
