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

test('Desafio renomeado para Carteira Desafio; Travado fora da UI', () => {
  assert.equal(WALLET_BUCKETS_VERSION, 'wallet-buckets-contract-v4');
  assert.equal(labelForBucket('desafio_balance_cents'), 'Carteira Desafio');
  assert.equal(shortLabelForBucket('desafio_balance_cents'), 'Desafio');
  assert.ok(BUCKETS.desafio_balance_cents.aliases.includes('Carteira Jornada'));
  assert.equal(BUCKETS.locked_balance_cents.uiVisible, false);
  assert.ok(!uiVisibleBucketKeys().includes('locked_balance_cents'));
  assert.ok(uiVisibleBucketKeys().includes('desafio_balance_cents'));
});

test('Carteira Automação existe, é bucket independente e visível na UI', () => {
  assert.equal(labelForBucket('automacao_balance_cents'), 'Carteira Automação');
  assert.equal(shortLabelForBucket('automacao_balance_cents'), 'Automação');
  assert.ok(uiVisibleBucketKeys().includes('automacao_balance_cents'));
});
