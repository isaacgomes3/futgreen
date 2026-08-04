import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../scripts/lib/store.mjs';
import { createProtection } from '../scripts/lib/create-protection.mjs';
import { cancelProtectionByClient } from '../scripts/lib/settle-protection.mjs';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-pc-'));
  return { dir, store: createStore(dir) };
}

test('cliente cancela proteção ativa antes do kickoff', () => {
  const { dir, store } = tmpStore();
  const u = store.upsertUser({
    email: 'c@t.local',
    name: 'C',
    role: 'client',
    wallet: {
      balance_cents: 100000,
      deduction_balance_cents: 0,
      locked_balance_cents: 0,
      desafio_balance_cents: 0,
      investor_balance_cents: 0,
      demo_balance_cents: 0,
    },
  });
  const starts = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const match = {
    id: 'match_cancel_ok',
    home_team: 'A',
    away_team: 'B',
    starts_at: starts,
    is_published: true,
    published_at: new Date().toISOString(),
    side: 'LAY',
    odd: 2.5,
  };
  store.data.matches.push(match);
  store.save();
  const protection = createProtection(store, {
    userId: u.id,
    matchId: match.id,
    side: 'LAY',
    odd: 2.5,
    amountCents: 10000,
  });
  const balBefore = store.getUser(u.id).wallet.balance_cents;
  const cancelled = cancelProtectionByClient(store, { protectionId: protection.id, userId: u.id });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(store.getUser(u.id).wallet.balance_cents, balBefore);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cliente não cancela após kickoff', () => {
  const { dir, store } = tmpStore();
  const u = store.upsertUser({
    email: 'c2@t.local',
    name: 'C2',
    role: 'client',
    wallet: {
      balance_cents: 100000,
      deduction_balance_cents: 0,
      locked_balance_cents: 0,
      desafio_balance_cents: 0,
      investor_balance_cents: 0,
      demo_balance_cents: 0,
    },
  });
  const starts = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const match = {
    id: 'match_cancel_late',
    home_team: 'A',
    away_team: 'B',
    starts_at: starts,
    is_published: true,
    published_at: new Date().toISOString(),
    side: 'BACK',
    odd: 2.1,
  };
  store.data.matches.push(match);
  store.save();
  const protection = createProtection(store, {
    userId: u.id,
    matchId: match.id,
    side: 'BACK',
    odd: 2.1,
    amountCents: 5000,
  });
  // Simula kickoff já passado
  match.starts_at = new Date(Date.now() - 60_000).toISOString();
  store.save();
  assert.throws(
    () => cancelProtectionByClient(store, { protectionId: protection.id, userId: u.id }),
    (e) => e.code === 'PRE_KICKOFF' || /antes do início/i.test(e.message),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
