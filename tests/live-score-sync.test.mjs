import assert from 'node:assert/strict';
import { normalizeTeamKey } from '../scripts/lib/live-score-sync.mjs';

assert.equal(normalizeTeamKey('Palmeiras'), normalizeTeamKey('SE Palmeiras'));
assert.equal(normalizeTeamKey('São Paulo'), 'saopaulo');
assert.ok(normalizeTeamKey('Fortaleza EC').includes('fortaleza'));
console.log('live-score-sync.test OK');
