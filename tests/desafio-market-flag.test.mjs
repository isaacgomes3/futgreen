import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDesafioMarketResult, zebraPayoutCents, suggestedHouseStake } from '../scripts/lib/desafio-ciclo-math.mjs';

test('DNB / Empate Anula não usa isDraw 1X2 cego — empate → void', () => {
  const r = resolveDesafioMarketResult({
    marketFlag: 'dnb',
    winningSide: 'futgreen',
    homeScore: 1,
    awayScore: 1,
    betTeamSide: 'home',
  });
  assert.equal(r.result, 'void');
  assert.equal(r.reason, 'empate_anula');
});

test('DNB com vencedor no time apostado → won', () => {
  const r = resolveDesafioMarketResult({
    marketFlag: 'empate_anula',
    winningSide: 'casa',
    homeScore: 2,
    awayScore: 0,
    betTeamSide: 'home',
  });
  assert.equal(r.result, 'won');
});

test('zebra payout credita stake + lucro', () => {
  assert.equal(zebraPayoutCents(10000, 2.5), 25000);
});

test('suggested house stake positivo', () => {
  const s = suggestedHouseStake({ stakeArbiReais: 50, oddArbi: 3.4, oddCasa: 1.55 });
  assert.ok(s > 0);
});
