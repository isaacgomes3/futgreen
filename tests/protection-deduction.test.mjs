import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lockedLayDeductionReais,
  calcProtectionDeductionCents,
  maxLockableCents,
  CREATE_PROTECTION_MODEL,
  protectionHealthPayload,
} from '../scripts/lib/protection-flow-contract.mjs';

test('modelo e health stake_lock_v1', () => {
  assert.equal(CREATE_PROTECTION_MODEL, 'stake_lock_v1');
  const h = protectionHealthPayload();
  assert.equal(h.protectionRuntime, 'protection-runtime-stake-lock-v10');
  assert.equal(h.createProtectionModel, 'stake_lock_v1');
});

test('dedução LAY 1000@10 ≈ R$ 91,20', () => {
  const fee = lockedLayDeductionReais(1000, 10);
  assert.equal(fee, 91.2);
  assert.equal(calcProtectionDeductionCents({ side: 'LAY', amountCents: 100000, odd: 10 }), 9120);
});

test('teto 50% do Saldo Apostador', () => {
  assert.equal(maxLockableCents(100000), 50000);
  assert.equal(maxLockableCents(0), 0);
});
