import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDesafioMarketResult,
  zebraPayoutCents,
  suggestedHouseStake,
  computeSurebetOddArbi,
} from '../scripts/lib/desafio-ciclo-math.mjs';

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

test('odd_futgreen-surebet-v1: odd_casa 1.72 → odd ARBISHIELD ~2.70 (5% lucro garantido)', () => {
  const oddArbi = computeSurebetOddArbi({ oddCasa: 1.72 });
  assert.ok(Math.abs(oddArbi - 2.7) < 0.02);
});

test('odd_futgreen-surebet-v1: lucro de 5% no retorno, em ambos os lados (dutching)', () => {
  const oddCasa = 1.72;
  const oddArbi = computeSurebetOddArbi({ oddCasa, targetProfit: 0.05 });
  const stake = 2000;
  const houseStake = suggestedHouseStake({ stakeArbiReais: stake, oddArbi, oddCasa });
  const retornoArbi = stake * oddArbi;
  const retornoCasa = houseStake * oddCasa;
  // Ambos os retornos devem ser (quase) iguais — dutching clássico
  assert.ok(Math.abs(retornoArbi - retornoCasa) < 1);
  const totalInvestido = stake + houseStake;
  const lucro = retornoArbi - totalInvestido;
  const margem = lucro / retornoArbi;
  assert.ok(margem > 0.045 && margem < 0.052, `margem esperada ~5%, obtida ${margem}`);
});
