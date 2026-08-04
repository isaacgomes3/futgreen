import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDepositExternalId, applyLucWebhook, creditDeposit } from '../scripts/lib/deposits-pix.mjs';
import { isPaidGatewayStatus } from '../scripts/lib/luc-paguei-client.mjs';
import { createStore } from '../scripts/lib/store.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('external_id DEP prefixado', () => {
  const id = makeDepositExternalId('user_abc12345');
  assert.match(id, /^DEP-[a-zA-Z0-9]+-\d{14}-[a-f0-9]{6}$/);
});

test('mínimo padrão R$ 100 e editável', async () => {
  const { getMinDepositCents, setMinDepositReais } = await import('../scripts/lib/app-settings.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-set-'));
  const store = createStore(dir);
  assert.equal(getMinDepositCents(store), 10000);
  setMinDepositReais(store, 250);
  assert.equal(getMinDepositCents(store), 25000);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('status pagos do gateway', () => {
  assert.equal(isPaidGatewayStatus('PAID'), true);
  assert.equal(isPaidGatewayStatus('completed'), true);
  assert.equal(isPaidGatewayStatus('pending'), false);
});

test('webhook marca gateway_paid (manual) e credit é idempotente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-dep-'));
  const store = createStore(dir);
  const u = store.upsertUser({
    email: 'pix@test.local',
    name: 'Pix',
    role: 'client',
    wallet: {
      balance_cents: 0,
      deduction_balance_cents: 0,
      locked_balance_cents: 0,
      desafio_balance_cents: 0,
      investor_balance_cents: 0,
      demo_balance_cents: 0,
    },
  });
  const external_id = makeDepositExternalId(u.id);
  store.data.manual_deposits.push({
    id: 'dep_test1',
    user_id: u.id,
    amount_cents: 5000,
    dest: 'apostador',
    status: 'pending',
    channel: 'luc_paguei',
    external_id,
    created_at: new Date().toISOString(),
  });
  store.save();

  const prev = process.env.PIX_AUTO_GATEWAY_CONFIRM;
  process.env.PIX_AUTO_GATEWAY_CONFIRM = '0';
  const wh = applyLucWebhook(store, { status: 'PAID', external_id });
  assert.equal(wh.paid, true);
  assert.equal(wh.auto, false);
  assert.equal(wh.deposit.status, 'gateway_paid');

  const c1 = creditDeposit(store, { depositId: 'dep_test1', adminEmail: 'admin@x', source: 'admin' });
  assert.equal(c1.already, false);
  assert.equal(c1.deposit.status, 'credited');
  assert.equal(store.getUser(u.id).wallet.balance_cents, 5000);

  const c2 = creditDeposit(store, { depositId: 'dep_test1', adminEmail: 'admin@x', source: 'admin' });
  assert.equal(c2.already, true);
  assert.equal(store.getUser(u.id).wallet.balance_cents, 5000);

  if (prev == null) delete process.env.PIX_AUTO_GATEWAY_CONFIRM;
  else process.env.PIX_AUTO_GATEWAY_CONFIRM = prev;
  fs.rmSync(dir, { recursive: true, force: true });
});
