import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelDesafio, cancelDesafioEntryByClient, registerDesafioEntry } from '../scripts/lib/desafio-ops.mjs';
import { cancelMatchByAdmin } from '../scripts/lib/settle-protection.mjs';
import { createProtection } from '../scripts/lib/create-protection.mjs';

function fakeStore(data) {
  const users = new Map();
  users.set('u1', {
    id: 'u1',
    wallet: { balance_cents: 100000, desafio_balance_cents: 100000, deduction_balance_cents: 0 },
  });
  let idSeq = 0;
  return {
    data,
    getUser: (id) => users.get(id),
    nextId: (prefix) => `${prefix}${++idSeq}`,
    addTx: () => {},
    save: () => {},
  };
}

test('desafio-evento-suspenso-v1: admin NÃO cancela desafio com etapa ao vivo — suspende em vez de derrubar', () => {
  const store = fakeStore({
    desafios: [{ id: 'd1', is_active: true, is_published: true }],
    desafio_steps: [{ id: 's1', desafio_id: 'd1', status: 'live', starts_at: new Date(Date.now() - 3600e3).toISOString() }],
    desafio_participations: [],
  });
  assert.throws(
    () => cancelDesafio(store, { desafioId: 'd1', email: 'isaac@futgreen.local' }),
    (e) => e.code === 'EVENT_SUSPENDED',
  );
  const d = store.data.desafios[0];
  assert.equal(d.is_suspended, true);
  // desafio continua ativo/publicado — só bloqueia NOVAS entradas, não derruba quem já está
  assert.equal(d.is_active, true);
});

test('desafio-evento-suspenso-v1: entrada bloqueada em desafio suspenso', () => {
  const store = fakeStore({
    desafios: [{ id: 'd1', is_active: true, is_published: true, is_suspended: true }],
    desafio_steps: [{ id: 's1', desafio_id: 'd1', status: 'published', starts_at: new Date(Date.now() + 3600e3).toISOString(), odd_futgreen: 2.5 }],
    desafio_participations: [],
  });
  assert.throws(
    () => registerDesafioEntry(store, { userId: 'u1', desafioId: 'd1', stepId: 's1', stakeCents: 5000 }),
    (e) => e.code === 'EVENT_SUSPENDED',
  );
});

test('desafio-cliente-cancela-entrada-v1: cliente cancela a própria entrada antes do kickoff', () => {
  const store = fakeStore({
    desafios: [{ id: 'd1', is_active: true, is_published: true }],
    desafio_steps: [{ id: 's1', desafio_id: 'd1', status: 'published', starts_at: new Date(Date.now() + 3600e3).toISOString() }],
    desafio_participations: [{ id: 'p1', user_id: 'u1', step_id: 's1', stake_cents: 5000, status: 'pending' }],
  });
  const { cancelled } = cancelDesafioEntryByClient(store, { participationId: 'p1', userId: 'u1' });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(store.getUser('u1').wallet.desafio_balance_cents, 105000);
});

test('desafio-cliente-cancela-entrada-v1: bloqueia cancelamento após o kickoff', () => {
  const store = fakeStore({
    desafios: [{ id: 'd1', is_active: true, is_published: true }],
    desafio_steps: [{ id: 's1', desafio_id: 'd1', status: 'live', starts_at: new Date(Date.now() - 3600e3).toISOString() }],
    desafio_participations: [{ id: 'p1', user_id: 'u1', step_id: 's1', stake_cents: 5000, status: 'pending' }],
  });
  assert.throws(
    () => cancelDesafioEntryByClient(store, { participationId: 'p1', userId: 'u1' }),
    (e) => e.code === 'PRE_KICKOFF',
  );
});

test('desafio-cliente-cancela-entrada-v1: bloqueia cancelar entrada de outro usuário', () => {
  const store = fakeStore({
    desafios: [{ id: 'd1', is_active: true, is_published: true }],
    desafio_steps: [{ id: 's1', desafio_id: 'd1', status: 'published', starts_at: new Date(Date.now() + 3600e3).toISOString() }],
    desafio_participations: [{ id: 'p1', user_id: 'outro', step_id: 's1', stake_cents: 5000, status: 'pending' }],
  });
  assert.throws(
    () => cancelDesafioEntryByClient(store, { participationId: 'p1', userId: 'u1' }),
    (e) => e.code === 'NOT_OWNER',
  );
});

test('protecao-evento-suspenso-v1: admin NÃO cancela evento em andamento — suspende', () => {
  const store = fakeStore({
    matches: [{ id: 'm1', is_published: true, starts_at: new Date(Date.now() - 3600e3).toISOString() }],
    protections: [{ id: 'pr1', user_id: 'u1', match_id: 'm1', status: 'active', amount_cents: 10000, side: 'BACK', odd: 2, approved_odd: 2, locks_stake: false }],
  });
  assert.throws(
    () => cancelMatchByAdmin(store, { matchId: 'm1', adminEmail: 'admin@x.com' }),
    (e) => e.code === 'EVENT_SUSPENDED',
  );
  assert.equal(store.data.matches[0].suspended, true);
  assert.equal(store.data.protections[0].status, 'active'); // preservada
});

test('protecao-evento-suspenso-v1: admin cancela normalmente antes do kickoff (estorna proteções ativas)', () => {
  const store = fakeStore({
    matches: [{ id: 'm1', is_published: true, starts_at: new Date(Date.now() + 3600e3).toISOString() }],
    protections: [{ id: 'pr1', user_id: 'u1', match_id: 'm1', status: 'active', amount_cents: 10000, side: 'BACK', odd: 2, approved_odd: 2, locks_stake: false }],
  });
  const { cancelled } = cancelMatchByAdmin(store, { matchId: 'm1', adminEmail: 'admin@x.com' });
  assert.equal(cancelled.length, 1);
  assert.equal(store.data.protections[0].status, 'cancelled');
  assert.equal(store.data.matches[0].is_published, false);
});

test('protecao-evento-suspenso-v1: bloqueia nova proteção em evento suspenso', () => {
  const store = fakeStore({
    matches: [{ id: 'm1', is_published: true, suspended: true, starts_at: new Date(Date.now() + 3600e3).toISOString(), side: 'BACK', odd: 2 }],
    protections: [],
  });
  assert.throws(
    () => createProtection(store, { userId: 'u1', matchId: 'm1', side: 'BACK', odd: 2, amountCents: 5000 }),
    (e) => e.code === 'EVENT_SUSPENDED',
  );
});
