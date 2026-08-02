/**
 * protection-flow-contract-v13
 * Modelo: stake_lock_v1 (indicação Proteger — sem trava de carteira)
 * Runtime: protection-runtime-stake-lock-v13
 *
 * Entrada: NÃO move Saldo Apostador / NÃO credita Travado.
 * O valor informado é a stake/responsabilidade usada na BetBra.
 *
 * Economia da indicação (GANHO na BetBra):
 * - Lucro bruto LAY = responsabilidade / (odd−1)
 * - Lucro bruto BACK = stake × (odd−1)
 * - Cliente: 1% da stake/responsabilidade (não do lucro bruto)
 * - Exchange: 2,5% do lucro bruto
 * - FutGreen: lucro bruto − cliente − exchange — NÃO debitado do Apostador
 *
 * REEMBOLSO (indicação falhou): credita stake integral no Saldo Reembolso
 * ANULA / GANHO: sem movimento de carteira
 *
 * Alterar regras exige pedido explícito do dono + bump de versão.
 */

export const PROTECTION_CONTRACT_VERSION = 'protection-flow-contract-v13';
export const PROTECTION_RUNTIME = 'protection-runtime-stake-lock-v13';
export const CREATE_PROTECTION_MODEL = 'stake_lock_v1';
/** Comissão BetBra / exchange sobre o lucro bruto */
export const EXCHANGE_COMMISSION = 0.025;
/** Parcela do cliente sobre a stake/responsabilidade */
export const CLIENT_PROFIT_SHARE = 0.01;
export const MAX_STAKE_RATIO = 0.5;
/** v12: ativação não trava carteira */
export const LOCKS_STAKE_ON_CREATE = false;

export const PROTECTION_OUTCOMES = Object.freeze({
  REEMBOLSO: 'reembolso',
  GANHO: 'ganho',
  ANULA: 'anula',
  CANCELAR: 'cancelar',
});

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Lucro bruto na exchange (antes de taxas), em R$.
 * LAY: amount = responsabilidade · BACK: amount = stake
 */
export function calcGrossProfitReais({ side, amountReais, odd }) {
  const o = Number(odd);
  const a = Number(amountReais);
  if (!(o > 1) || !(a > 0)) throw new Error('amount/odd inválidos para lucro bruto');
  const sideU = String(side || 'LAY').toUpperCase();
  if (sideU === 'LAY') {
    return round2(a / (o - 1));
  }
  return round2(a * (o - 1));
}

/**
 * Split da indicação vitoriosa (preview + meta de liquidação).
 * walletDeductionCents = 0 — ganho na BetBra não debita Apostador.
 */
export function calcIndicationEconomics({ side, amountCents, odd }) {
  const amountReais = Number(amountCents) / 100;
  const gross = calcGrossProfitReais({ side, amountReais, odd });
  // 1% sobre stake/responsabilidade (não sobre o lucro bruto)
  const client = round2(amountReais * CLIENT_PROFIT_SHARE);
  const exchange = round2(gross * EXCHANGE_COMMISSION);
  const futgreen = round2(Math.max(0, gross - client - exchange));
  return {
    side: String(side || 'LAY').toUpperCase(),
    odd: Number(odd),
    amount_reais: round2(amountReais),
    amount_kind: String(side || '').toUpperCase() === 'BACK' ? 'stake' : 'liability',
    gross_profit_reais: gross,
    client_share_reais: client,
    exchange_fee_reais: exchange,
    futgreen_share_reais: futgreen,
    client_share_pct: CLIENT_PROFIT_SHARE,
    client_share_base: 'stake_or_liability',
    exchange_fee_pct: EXCHANGE_COMMISSION,
    wallet_deduction_cents: 0,
  };
}

/** @deprecated — alias informativo do share FutGreen em LAY */
export function lockedLayDeductionReais(liabilityReais, odd) {
  const eco = calcIndicationEconomics({
    side: 'LAY',
    amountCents: Math.round(Number(liabilityReais) * 100),
    odd,
  });
  return eco.futgreen_share_reais;
}

/** Dedução em carteira no GANHO (v12 = sempre 0). */
export function calcProtectionDeductionCents({ side, amountCents, odd }) {
  calcIndicationEconomics({ side, amountCents, odd });
  return 0;
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
    clientProfitShare: CLIENT_PROFIT_SHARE,
    maxStakeRatio: MAX_STAKE_RATIO,
    ganhoWalletDeduction: false,
    locksStakeOnCreate: LOCKS_STAKE_ON_CREATE,
  };
}
