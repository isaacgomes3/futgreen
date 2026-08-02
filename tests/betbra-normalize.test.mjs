import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreliveEvent, parseEventTeams, extractMatchOdds } from '../scripts/lib/betbra-client.mjs';

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
