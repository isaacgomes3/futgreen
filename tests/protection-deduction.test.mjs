import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcGrossProfitReais,
  calcIndicationEconomics,
  calcProtectionDeductionCents,
  maxLockableCents,
  CREATE_PROTECTION_MODEL,
  EXCHANGE_COMMISSION,
  CLIENT_PROFIT_SHARE,
  LOCKS_STAKE_ON_CREATE,
  protectionHealthPayload,
} from '../scripts/lib/protection-flow-contract.mjs';

test('modelo e health stake_lock_v1 / v13 sem trava', () => {
  assert.equal(CREATE_PROTECTION_MODEL, 'stake_lock_v1');
  assert.equal(LOCKS_STAKE_ON_CREATE, false);
  const h = protectionHealthPayload();
  assert.equal(h.protectionRuntime, 'protection-runtime-stake-lock-v13');
  assert.equal(h.createProtectionModel, 'stake_lock_v1');
  assert.equal(h.contractVersion, 'protection-flow-contract-v13');
  assert.equal(h.exchangeCommission, 0.025);
  assert.equal(h.clientProfitShare, 0.01);
  assert.equal(h.ganhoWalletDeduction, false);
  assert.equal(h.locksStakeOnCreate, false);
});

test('lucro bruto BACK = stake × (odd−1)', () => {
  assert.equal(calcGrossProfitReais({ side: 'BACK', amountReais: 100, odd: 2.5 }), 150);
});

test('lucro bruto LAY = responsabilidade / (odd−1)', () => {
  assert.equal(calcGrossProfitReais({ side: 'LAY', amountReais: 1000, odd: 10 }), 111.11);
});

test('split: 1% do cliente sobre stake/responsabilidade', () => {
  assert.equal(EXCHANGE_COMMISSION, 0.025);
  assert.equal(CLIENT_PROFIT_SHARE, 0.01);
  // BACK 100 @ 2.5 → bruto 150; cliente 1% de 100 = 1; taxa 3.75; FG 145.25
  const eco = calcIndicationEconomics({ side: 'BACK', amountCents: 10000, odd: 2.5 });
  assert.equal(eco.gross_profit_reais, 150);
  assert.equal(eco.client_share_reais, 1);
  assert.equal(eco.exchange_fee_reais, 3.75);
  assert.equal(eco.futgreen_share_reais, 145.25);
  assert.equal(eco.wallet_deduction_cents, 0);
  // LAY 1000 @ ~7.2 → bruto ≈ 161.29; cliente 1% de 1000 = 10
  const lay = calcIndicationEconomics({ side: 'LAY', amountCents: 100000, odd: 7.2 });
  assert.equal(lay.client_share_reais, 10);
  assert.equal(calcProtectionDeductionCents({ side: 'BACK', amountCents: 10000, odd: 2.5 }), 0);
});

test('teto 50% do Saldo Apostador (cobertura)', () => {
  assert.equal(maxLockableCents(100000), 50000);
  assert.equal(maxLockableCents(0), 0);
});
