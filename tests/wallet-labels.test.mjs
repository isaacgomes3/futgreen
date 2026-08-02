import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  labelForBucket,
  shortLabelForBucket,
  uiVisibleBucketKeys,
  BUCKETS,
  WALLET_BUCKETS_VERSION,
} from '../scripts/lib/wallet-buckets-contract.mjs';

test('nome oficial é Saldo Reembolso — nunca Saldo Dedução', () => {
  assert.equal(labelForBucket('deduction_balance_cents'), 'Saldo Reembolso');
  assert.equal(BUCKETS.deduction_balance_cents.label, 'Saldo Reembolso');
  assert.ok(!JSON.stringify(BUCKETS).includes('Saldo Dedução'));
});

test('Desafio renomeado para Jornada; Travado fora da UI', () => {
  assert.equal(WALLET_BUCKETS_VERSION, 'wallet-buckets-contract-v2');
  assert.equal(labelForBucket('desafio_balance_cents'), 'Carteira Jornada');
  assert.equal(shortLabelForBucket('desafio_balance_cents'), 'Jornada');
  assert.equal(BUCKETS.locked_balance_cents.uiVisible, false);
  assert.ok(!uiVisibleBucketKeys().includes('locked_balance_cents'));
  assert.ok(uiVisibleBucketKeys().includes('desafio_balance_cents'));
});
