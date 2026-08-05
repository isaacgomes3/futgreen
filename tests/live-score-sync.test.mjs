import assert from 'node:assert/strict';
import { normalizeTeamKey, stepsNeedingScoreSync, matchesNeedingScoreSync } from '../scripts/lib/live-score-sync.mjs';

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

console.log('live-score-sync.test OK');
