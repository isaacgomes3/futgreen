import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePreliveEvent,
  normalizeEventDetail,
  parseEventTeams,
  extractMatchOdds,
  extractAllMarkets,
  marketToMatchFields,
  pickMarketsByIds,
  selectionToMatchFields,
  resolveCartSelections,
} from '../scripts/lib/betbra-client.mjs';

const sample = {
  id: 'ev1',
  name: 'Flamengo vs Palmeiras',
  start: '2026-08-02T20:00:00Z',
  volume: 10000,
  'event-participants': [
    { number: 1, 'participant-name': 'Flamengo' },
    { number: 2, 'participant-name': 'Palmeiras' },
  ],
  'meta-tags': [{ name: 'Soccer' }, { name: 'Brazil' }, { name: 'Brasileirão' }],
  markets: [
    {
      id: 'm1',
      name: 'Match Odds',
      'market-type': 'one_x_two',
      volume: 5000,
      runners: [
        {
          name: 'Flamengo',
          volume: 2000,
          prices: [
            { side: 'back', odds: 2.1, 'available-amount': 100 },
            { side: 'lay', odds: 2.2, 'available-amount': 80 },
          ],
        },
        {
          name: 'Palmeiras',
          volume: 2500,
          prices: [
            { side: 'back', odds: 3.4, 'available-amount': 90 },
            { side: 'lay', odds: 3.6, 'available-amount': 70 },
          ],
        },
        {
          name: 'Draw',
          volume: 500,
          prices: [
            { side: 'back', odds: 3.2 },
            { side: 'lay', odds: 3.3 },
          ],
        },
      ],
    },
    {
      id: 'm2',
      name: 'Total',
      'name-original': 'Total',
      'market-type': 'total',
      handicap: 2.5,
      volume: 1200,
      runners: [
        {
          name: 'Over 2.5',
          prices: [
            { side: 'back', odds: 1.85 },
            { side: 'lay', odds: 1.9 },
          ],
        },
        {
          name: 'Under 2.5',
          prices: [
            { side: 'back', odds: 2.05 },
            { side: 'lay', odds: 2.12 },
          ],
        },
      ],
    },
  ],
};

test('parseEventTeams', () => {
  const t = parseEventTeams(sample);
  assert.equal(t.home_team, 'Flamengo');
  assert.equal(t.away_team, 'Palmeiras');
});

test('extractMatchOdds', () => {
  const o = extractMatchOdds(sample);
  assert.equal(o.runners.length, 3);
  assert.equal(o.runners[0].back_odd, 2.1);
});

test('normalizePreliveEvent sugere zebra no underdog', () => {
  const ev = normalizePreliveEvent(sample);
  assert.equal(ev.external_id, 'ev1');
  assert.equal(ev.desafio_hint.bet_team_side, 'away');
  assert.equal(ev.desafio_hint.odd_futgreen, 3.6);
  assert.equal(ev.desafio_hint.odd_casa, 2.1);
});

test('extractAllMarkets lista back e lay de todos os mercados', () => {
  const markets = extractAllMarkets(sample);
  assert.equal(markets.length, 2);
  assert.equal(markets[1].name, 'Total 2.5');
  assert.equal(markets[1].runners[0].back_odd, 1.85);
  assert.equal(markets[1].runners[0].lay_odd, 1.9);
  assert.equal(markets[1].runners[1].back_odd, 2.05);
});

test('normalizeEventDetail inclui markets_count', () => {
  const ev = normalizeEventDetail(sample);
  assert.equal(ev.markets_count, 2);
  assert.equal(ev.markets[0].runners.length, 3);
});

test('pickMarketsByIds e marketToMatchFields', () => {
  const detail = normalizeEventDetail(sample);
  const picked = pickMarketsByIds(detail, ['m2']);
  assert.equal(picked.length, 1);
  const fields = marketToMatchFields(detail, picked[0]);
  assert.equal(fields.market_id, 'm2');
  assert.equal(fields.market_name, 'Total 2.5');
  assert.equal(fields.odds_snapshot.runners[0].back, 1.85);
  assert.match(fields.exchange_url, /market\/m2/);
});

test('carrinho resolve odds back/lay independentes', () => {
  const detail = normalizeEventDetail(sample);
  const resolved = resolveCartSelections(detail, [
    { market_id: 'm1', runner_name: 'Flamengo', side: 'BACK', odd: 2.1 },
    { market_id: 'm1', runner_name: 'Draw', side: 'LAY' },
  ]);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[1].selection.odd, 3.3);
  const fields = selectionToMatchFields(detail, resolved[0].market, resolved[0].selection);
  assert.equal(fields.side, 'BACK');
  assert.equal(fields.selection_name, 'Flamengo');
  assert.match(fields.label, /Match Odds · Flamengo BACK/);
});

test('carrinho liquidez individual por seleção', () => {
  const detail = normalizeEventDetail(sample);
  const resolved = resolveCartSelections(detail, [
    { market_id: 'm1', runner_name: 'Flamengo', side: 'BACK', odd: 2.1, liquidity: 1500 },
    { market_id: 'm2', runner_name: 'Over 2.5', side: 'LAY', odd: 2.0 },
  ]);
  assert.equal(resolved[0].selection.liquidity, 1500);
  assert.equal(resolved[1].selection.liquidity, undefined); // vazio = sem liquidez
  const f0 = selectionToMatchFields(detail, resolved[0].market, resolved[0].selection);
  const f1 = selectionToMatchFields(detail, resolved[1].market, resolved[1].selection);
  assert.equal(f0.liquidity, 1500);
  assert.equal(f0.volume, 1500);
  assert.equal(f1.liquidity, 0);
  assert.equal(f1.volume, 1200); // volume do mercado intacto
});
