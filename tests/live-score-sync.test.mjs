import assert from 'node:assert/strict';
import {
  normalizeTeamKey,
  stepsNeedingScoreSync,
  matchesNeedingScoreSync,
  scoreFromInplayEntry,
} from '../scripts/lib/live-score-sync.mjs';

assert.equal(normalizeTeamKey('Palmeiras'), normalizeTeamKey('SE Palmeiras'));
assert.equal(normalizeTeamKey('São Paulo'), 'saopaulo');
assert.ok(normalizeTeamKey('Fortaleza EC').includes('fortaleza'));

// Steps de Desafio ao vivo devem entrar no sync (mesma cobertura dos matches de Proteger)
{
  const now = Date.now();
  const store = {
    data: {
      matches: [],
      desafio_steps: [
        { id: 's1', status: 'published', starts_at: new Date(now - 10 * 60e3).toISOString() },
        { id: 's2', status: 'draft', starts_at: new Date(now - 10 * 60e3).toISOString() },
        { id: 's3', status: 'done', starts_at: new Date(now - 10 * 60e3).toISOString() },
        { id: 's4', status: 'published', starts_at: new Date(now + 60 * 60e3).toISOString() },
      ],
    },
  };
  const eligible = stepsNeedingScoreSync(store, now).map((s) => s.id);
  assert.deepEqual(eligible, ['s1']);
  assert.deepEqual(matchesNeedingScoreSync(store, now), []);
}

// Feed in-play da BetBra/Bolsa de Aposta (mesma infra "jumper") — casa exato por eventId
{
  const live = scoreFromInplayEntry({
    eventId: '33972172194800023',
    score: { home: { score: '1' }, away: { score: '2' } },
    inPlayMatchStatus: 'SecondHalfKickOff',
    timeElapsed: '52',
  });
  assert.deepEqual(live.home_score, 1);
  assert.deepEqual(live.away_score, 2);
  assert.equal(live.minute, 52);
  assert.equal(live.finished, false);
  assert.equal(live.period, null);
  assert.equal(live.source, 'betbra');

  const ht = scoreFromInplayEntry({
    eventId: 'x',
    score: { home: { score: '0' }, away: { score: '0' } },
    inPlayMatchStatus: 'FirstHalfEnd',
    timeElapsed: '45',
  });
  assert.equal(ht.period, 'ht');

  assert.equal(scoreFromInplayEntry(null), null);
  assert.equal(scoreFromInplayEntry({ eventId: 'y' }), null);
}

console.log('live-score-sync.test OK');
