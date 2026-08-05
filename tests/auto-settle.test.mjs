import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSelectionOutcome,
  resolveProtectionOutcome,
  resolveDesafioWinningSideGuess,
  runAutoSettle,
} from '../scripts/lib/auto-settle.mjs';

function fakeStore(overrides = {}) {
  const users = new Map();
  users.set('u1', { id: 'u1', wallet: { balance_cents: 0, deduction_balance_cents: 0, desafio_balance_cents: 0 } });
  const data = {
    matches: [],
    protections: [],
    desafio_steps: [],
    desafio_participations: [],
    ...overrides,
  };
  return {
    data,
    getUser: (id) => users.get(id),
    addTx: () => {},
    save: () => {},
  };
}

test('evaluateSelectionOutcome: 1X2 — seleção no time da casa vence', () => {
  const match = { home_team: 'Flamengo', away_team: 'Palmeiras', selection_name: 'Flamengo', market_name: 'Match Odds' };
  assert.equal(evaluateSelectionOutcome(match, 2, 0), true);
  assert.equal(evaluateSelectionOutcome(match, 0, 2), false);
});

test('evaluateSelectionOutcome: DNB — empate vira push (anula)', () => {
  const match = { home_team: 'Flamengo', away_team: 'Palmeiras', selection_name: 'Palmeiras', market_name: 'Empate Anula' };
  assert.equal(evaluateSelectionOutcome(match, 1, 1), 'push');
});

test('evaluateSelectionOutcome: 1X2 comum — empate não é push, seleção perde', () => {
  const match = { home_team: 'Flamengo', away_team: 'Palmeiras', selection_name: 'Palmeiras', market_name: 'Match Odds' };
  assert.equal(evaluateSelectionOutcome(match, 1, 1), false);
});

test('evaluateSelectionOutcome: Total de gols Menos 2.5', () => {
  const match = { selection_name: 'Menos 2.5', market_name: 'Total de gols' };
  assert.equal(evaluateSelectionOutcome(match, 1, 0), true); // total 1 < 2.5
  assert.equal(evaluateSelectionOutcome(match, 2, 1), false); // total 3 > 2.5
});

test('evaluateSelectionOutcome: mercado não reconhecido retorna null', () => {
  const match = { selection_name: 'Handicap asiático -1', market_name: 'Handicap' };
  assert.equal(evaluateSelectionOutcome(match, 2, 1), null);
});

test('resolveProtectionOutcome: BACK ganha quando seleção acontece', () => {
  const match = { home_team: 'Flamengo', away_team: 'Palmeiras', selection_name: 'Flamengo', market_name: 'Match Odds', side: 'BACK' };
  assert.equal(resolveProtectionOutcome(match, 2, 0), 'ganho');
  assert.equal(resolveProtectionOutcome(match, 0, 2), 'reembolso');
});

test('resolveProtectionOutcome: LAY inverte o resultado', () => {
  const match = { home_team: 'Flamengo', away_team: 'Palmeiras', selection_name: 'Flamengo', market_name: 'Match Odds', side: 'LAY' };
  assert.equal(resolveProtectionOutcome(match, 2, 0), 'reembolso');
  assert.equal(resolveProtectionOutcome(match, 0, 2), 'ganho');
});

test('resolveDesafioWinningSideGuess: indicação no time visitante', () => {
  const step = { bet_team_side: 'away' };
  assert.equal(resolveDesafioWinningSideGuess(step, 0, 1), 'futgreen');
  assert.equal(resolveDesafioWinningSideGuess(step, 1, 0), 'casa');
});

test('runAutoSettle: liquida proteção automaticamente quando placar confirmado (finished + score_source)', () => {
  const store = fakeStore({
    matches: [
      {
        id: 'm1',
        home_team: 'Flamengo',
        away_team: 'Palmeiras',
        selection_name: 'Flamengo',
        market_name: 'Match Odds',
        side: 'BACK',
        home_score: 2,
        away_score: 0,
        finished_at: new Date().toISOString(),
        score_source: 'fotmob',
      },
    ],
    protections: [{ id: 'p1', user_id: 'u1', match_id: 'm1', status: 'active', amount_cents: 10000, side: 'BACK', odd: 2, approved_odd: 2 }],
  });
  const result = runAutoSettle(store);
  assert.equal(result.settledMatches.length, 1);
  assert.equal(result.settledMatches[0].outcome, 'ganho');
  assert.equal(store.data.protections[0].status, 'settled_ganho');
});

test('runAutoSettle: NÃO liquida sem score_source (placar não confirmado por fonte externa)', () => {
  const store = fakeStore({
    matches: [
      {
        id: 'm1',
        home_team: 'Flamengo',
        away_team: 'Palmeiras',
        selection_name: 'Flamengo',
        market_name: 'Match Odds',
        side: 'BACK',
        home_score: 2,
        away_score: 0,
        finished_at: new Date().toISOString(),
        // sem score_source — placar poderia ter sido digitado manualmente/estimado
      },
    ],
    protections: [{ id: 'p1', user_id: 'u1', match_id: 'm1', status: 'active', amount_cents: 10000, side: 'BACK', odd: 2, approved_odd: 2 }],
  });
  const result = runAutoSettle(store);
  assert.equal(result.settledMatches.length, 0);
  assert.equal(store.data.protections[0].status, 'active');
});

test('runAutoSettle: mercado não reconhecido fica para o admin (não liquida)', () => {
  const store = fakeStore({
    matches: [
      {
        id: 'm1',
        home_team: 'Flamengo',
        away_team: 'Palmeiras',
        selection_name: 'Handicap -1',
        market_name: 'Handicap',
        side: 'BACK',
        home_score: 2,
        away_score: 0,
        finished_at: new Date().toISOString(),
        score_source: 'fotmob',
      },
    ],
    protections: [{ id: 'p1', user_id: 'u1', match_id: 'm1', status: 'active', amount_cents: 10000, side: 'BACK', odd: 2, approved_odd: 2 }],
  });
  const result = runAutoSettle(store);
  assert.equal(result.settledMatches.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.equal(store.data.protections[0].status, 'active');
});

test('runAutoSettle: liquida Desafio automaticamente quando placar confirmado', () => {
  const store = fakeStore({
    desafio_steps: [
      {
        id: 's1',
        market_flag: 'dnb',
        bet_team_side: 'away',
        odd_futgreen: 3,
        status: 'live',
        home_score: 0,
        away_score: 1,
        finished_at: new Date().toISOString(),
        score_source: 'fotmob',
      },
    ],
    desafio_participations: [{ id: 'dp1', user_id: 'u1', step_id: 's1', stake_cents: 5000, odd: 3, status: 'pending' }],
  });
  const result = runAutoSettle(store);
  assert.equal(result.settledSteps.length, 1);
  assert.equal(store.data.desafio_steps[0].status, 'done');
  assert.equal(store.data.desafio_steps[0].result, 'indicacao_venceu');
});

test('runAutoSettle: não reprocessa step já liquidado (idempotente)', () => {
  const store = fakeStore({
    desafio_steps: [
      {
        id: 's1',
        market_flag: 'dnb',
        bet_team_side: 'away',
        odd_futgreen: 3,
        status: 'done',
        result: 'indicacao_venceu',
        home_score: 0,
        away_score: 1,
        finished_at: new Date().toISOString(),
        score_source: 'fotmob',
      },
    ],
    desafio_participations: [],
  });
  const result = runAutoSettle(store);
  assert.equal(result.settledSteps.length, 0);
});
