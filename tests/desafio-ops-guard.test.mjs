import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCanCancelOrDeleteDesafio,
  editDesafioPreservesPublication,
  canCancelPublishedDesafio,
} from '../scripts/lib/admin-ops-contract.mjs';
import { assertTransferAllowed } from '../scripts/lib/wallet-buckets-contract.mjs';

test('bloqueia cancelar/excluir em andamento', () => {
  assert.throws(
    () => assertCanCancelOrDeleteDesafio({ stepStatus: 'live', email: 'isaac@futgreen.local' }),
    (e) => e.status === 403,
  );
});

test('Isaac/Carlos podem cancelar publicado', () => {
  assert.equal(canCancelPublishedDesafio('isaac@futgreen.local'), true);
  assert.equal(canCancelPublishedDesafio('carlos@x.com'), true);
  assert.doesNotThrow(() =>
    assertCanCancelOrDeleteDesafio({ stepStatus: 'published', email: 'isaac@futgreen.local' }),
  );
});

test('edit_only preserva publicação', () => {
  const existing = { title: 'A', is_active: true, is_published: true, published_at: '2026-01-01' };
  const merged = editDesafioPreservesPublication(existing, { title: 'B', is_active: false }, 'edit_only');
  assert.equal(merged.title, 'B');
  assert.equal(merged.is_active, true);
  assert.equal(merged.published_at, '2026-01-01');
});

test('Banca → Jornada bloqueada; Reembolso → Jornada ok', () => {
  assert.throws(() => assertTransferAllowed('balance_cents', 'desafio_balance_cents'), (e) => e.status === 403);
  assert.doesNotThrow(() => assertTransferAllowed('deduction_balance_cents', 'desafio_balance_cents'));
});
