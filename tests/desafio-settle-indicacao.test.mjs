import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleDesafioStep } from '../scripts/lib/desafio-ops.mjs';

function fakeStore(overrides = {}) {
  const users = new Map();
  const data = {
    desafio_steps: [
      {
        id: 'step1',
        market_flag: 'dnb',
        bet_team_side: 'home',
        odd_futgreen: 3,
        status: 'live',
      },
    ],
    desafio_participations: [
      { id: 'p1', user_id: 'u1', step_id: 'step1', stake_cents: 10000, odd: 3, status: 'pending' },
    ],
    ...overrides,
  };
  users.set('u1', { id: 'u1', wallet: { desafio_balance_cents: 0 } });
  return {
    data,
    getUser: (id) => users.get(id),
    addTx: () => {},
    save: () => {},
  };
}

test('desafio-indicacao-settle-v1: indicação VENCEU na BetBra → sem crédito interno (já pago fora)', () => {
  const store = fakeStore();
  const { step } = settleDesafioStep(store, {
    stepId: 'step1',
    winningSide: 'futgreen',
    homeScore: 2,
    awayScore: 0,
  });
  assert.equal(step.result, 'indicacao_venceu');
  const user = store.getUser('u1');
  assert.equal(user.wallet.desafio_balance_cents, 0);
  const part = store.data.desafio_participations[0];
  assert.equal(part.result, 'indicacao_venceu');
});

test('desafio-indicacao-settle-v1: indicação PERDEU na BetBra → protege (credita stake + lucro)', () => {
  const store = fakeStore();
  const { step } = settleDesafioStep(store, {
    stepId: 'step1',
    winningSide: 'casa',
    homeScore: 0,
    awayScore: 1,
  });
  assert.equal(step.result, 'indicacao_perdeu');
  const user = store.getUser('u1');
  // stake 10000 * odd 3 = 30000 (stake + lucro)
  assert.equal(user.wallet.desafio_balance_cents, 30000);
  const part = store.data.desafio_participations[0];
  assert.equal(part.result, 'protegido');
});

test('desafio-indicacao-settle-v1: empate anula devolve só o stake', () => {
  const store = fakeStore();
  const { step } = settleDesafioStep(store, {
    stepId: 'step1',
    winningSide: 'futgreen',
    homeScore: 1,
    awayScore: 1,
  });
  assert.equal(step.result, 'empate_anula');
  const user = store.getUser('u1');
  assert.equal(user.wallet.desafio_balance_cents, 10000);
  const part = store.data.desafio_participations[0];
  assert.equal(part.result, 'void');
});
