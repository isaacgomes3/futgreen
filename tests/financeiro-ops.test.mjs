import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../scripts/lib/store.mjs';
import {
  requestDeductionWithdraw,
  decideWithdrawal,
  buildFinanceMonitor,
  createExpense,
  expenseAlert,
} from '../scripts/lib/financeiro-ops.mjs';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-fin-'));
  const store = createStore(dir);
  store.upsertUser({
    email: 'cli@test.local',
    name: 'Cli',
    role: 'client',
    wallet: {
      balance_cents: 0,
      deduction_balance_cents: 50000,
      locked_balance_cents: 0,
      desafio_balance_cents: 0,
      investor_balance_cents: 0,
      demo_balance_cents: 0,
    },
  });
  return store;
}

test('saque hold reserva saldo e reject devolve', () => {
  const store = tmpStore();
  const u = store.getUserByEmail('cli@test.local');
  const { withdrawal } = requestDeductionWithdraw(store, {
    userId: u.id,
    amountCents: 10000,
    pixKey: 'a@b.com',
  });
  assert.equal(withdrawal.status, 'pending');
  assert.equal(store.getUser(u.id).wallet.deduction_balance_cents, 40000);

  decideWithdrawal(store, {
    withdrawalId: withdrawal.id,
    action: 'reject',
    adminEmail: 'admin@test',
  });
  assert.equal(store.data.withdrawals[0].status, 'rejected');
  assert.equal(store.getUser(u.id).wallet.deduction_balance_cents, 50000);
});

test('saque paid mantém débito', () => {
  const store = tmpStore();
  const u = store.getUserByEmail('cli@test.local');
  const { withdrawal } = requestDeductionWithdraw(store, {
    userId: u.id,
    amountCents: 15000,
    pixKey: 'pix',
  });
  decideWithdrawal(store, {
    withdrawalId: withdrawal.id,
    action: 'paid',
    adminEmail: 'admin@test',
  });
  assert.equal(store.data.withdrawals[0].status, 'paid');
  assert.equal(store.getUser(u.id).wallet.deduction_balance_cents, 35000);
});

test('monitor retorna totais e day', () => {
  const store = tmpStore();
  const mon = buildFinanceMonitor(store, {});
  assert.ok(mon.day);
  assert.ok(mon.totals);
  assert.ok(Array.isArray(mon.areas));
  assert.equal(mon.areas.length, 4);
  assert.ok(mon.treasury);
});

test('despesa fixa gera alerta perto do vencimento', () => {
  const store = tmpStore();
  const now = new Date();
  const dueDay = now.getDate();
  const exp = createExpense(
    store,
    {
      kind: 'fixed',
      title: 'Aluguel',
      amount: 100,
      due_day: dueDay,
      alert_days: 5,
    },
    'admin@test',
  );
  const alert = expenseAlert(exp, now);
  assert.ok(alert);
  assert.ok(alert.days_left <= 5);
});
