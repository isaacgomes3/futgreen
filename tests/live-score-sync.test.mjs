import assert from 'node:assert/strict';
import {
  normalizeTeamKey,
  stepsNeedingScoreSync,
  matchesNeedingScoreSync,
  scoreFromInplayEntry,
  scoreFromFotmobMatch,
  fotmobLogoUrl,
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

// FotMob (API pública não-oficial) — cobertura ampla para competições fora do
// TheSportsDB (ex.: Leagues Cup)
{
  const ht = scoreFromFotmobMatch({
    id: 5844825,
    home: { name: 'Minnesota', score: 1 },
    away: { name: 'Juárez', score: 2 },
    status: { started: true, finished: false, liveTime: { short: 'HT', long: 'Half-Time' } },
  });
  assert.equal(ht.home_score, 1);
  assert.equal(ht.away_score, 2);
  assert.equal(ht.period, 'ht');
  assert.equal(ht.minute, 45);
  assert.equal(ht.source, 'fotmob');
  assert.equal(ht.home_team_id, null);
  assert.equal(fotmobLogoUrl(207242), 'https://images.fotmob.com/image_resources/logo/teamlogo/207242_small.png');
  assert.equal(fotmobLogoUrl(''), null);
  assert.equal(fotmobLogoUrl('abc'), null);

  const live = scoreFromFotmobMatch({
    home: { name: 'A', score: 0, id: 207242 },
    away: { name: 'B', score: 0, id: 649424 },
    status: { started: true, finished: false, liveTime: { short: "62'" } },
  });
  assert.equal(live.minute, 62);
  assert.equal(live.period, null);
  assert.equal(live.home_team_id, 207242);
  assert.equal(live.away_team_id, 649424);

  const notStarted = scoreFromFotmobMatch({
    home: { name: 'A', score: 0 },
    away: { name: 'B', score: 0 },
    status: { started: false },
  });
  assert.equal(notStarted, null);

  const finished = scoreFromFotmobMatch({
    home: { name: 'A', score: 2 },
    away: { name: 'B', score: 1 },
    status: { started: true, finished: true, liveTime: { short: 'FT' } },
  });
  assert.equal(finished.finished, true);
  assert.equal(finished.period, 'ft');
  assert.equal(finished.minute, null);
}

console.log('live-score-sync.test OK');
