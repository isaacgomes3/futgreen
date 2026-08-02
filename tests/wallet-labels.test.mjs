import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelForBucket, BUCKETS } from '../scripts/lib/wallet-buckets-contract.mjs';

test('nome oficial é Saldo Reembolso — nunca Saldo Dedução', () => {
  assert.equal(labelForBucket('deduction_balance_cents'), 'Saldo Reembolso');
  assert.equal(BUCKETS.deduction_balance_cents.label, 'Saldo Reembolso');
  assert.ok(!JSON.stringify(BUCKETS).includes('Saldo Dedução'));
});
