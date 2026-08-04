import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveMatchPhase,
  touchMatchLiveState,
  isSameDayBrazil,
  dayKeyBrazil,
} from '../scripts/lib/match-phase.mjs';

const kick = Date.parse('2026-08-02T15:00:00.000Z');

test('antes do kickoff: scheduled sem placar', () => {
  const p = deriveMatchPhase({ starts_at: new Date(kick).toISOString() }, kick - 60e3);
  assert.equal(p.phase, 'scheduled');
  assert.equal(p.home_score, null);
  assert.equal(p.live, false);
});

test('após kickoff: ao vivo com 0-0 e minuto', () => {
  const p = deriveMatchPhase(
    { starts_at: new Date(kick).toISOString(), home_score: null, away_score: null },
    kick + 23 * 60e3,
  );
  assert.equal(p.phase, '1h');
  assert.equal(p.home_score, 0);
  assert.equal(p.away_score, 0);
  assert.equal(p.clock, "23'");
  assert.equal(p.live, true);
});

test('intervalo estimado', () => {
  const p = deriveMatchPhase(
    { starts_at: new Date(kick).toISOString(), home_score: 1, away_score: 0 },
    kick + 50 * 60e3,
  );
  assert.equal(p.phase, 'ht');
  assert.equal(p.clock, 'HT');
  assert.equal(p.badge, 'Intervalo');
});

test('encerrado após settle', () => {
  const p = deriveMatchPhase(
    {
      starts_at: new Date(kick).toISOString(),
      home_score: 2,
      away_score: 1,
      settled_at: new Date(kick + 2 * 3600e3).toISOString(),
    },
    kick + 3 * 3600e3,
  );
  assert.equal(p.phase, 'finished');
  assert.equal(p.clock, 'FT');
  assert.equal(p.badge, 'Encerrado');
  assert.equal(p.home_score, 2);
});

test('tempo esgotado encerra no site sem settle', () => {
  const p = deriveMatchPhase(
    {
      starts_at: new Date(kick).toISOString(),
      home_score: 3,
      away_score: 0,
    },
    kick + 130 * 60e3,
  );
  assert.equal(p.phase, 'finished');
  assert.equal(p.finished, true);
  assert.equal(p.live, false);
  assert.equal(p.clock, 'FT');
  assert.equal(p.home_score, 3);
});

test('touchMatchLiveState persiste finished_at por tempo', () => {
  const m = {
    starts_at: new Date(kick).toISOString(),
    home_score: 1,
    away_score: 0,
  };
  const { changed, phase } = touchMatchLiveState(m, kick + 130 * 60e3);
  assert.equal(changed, true);
  assert.ok(m.finished_at);
  assert.equal(m.live, false);
  assert.equal(phase.finished, true);
});

test('touchMatchLiveState inicializa placar', () => {
  const m = { starts_at: new Date(kick).toISOString(), home_score: null, away_score: null };
  const { changed, phase } = touchMatchLiveState(m, kick + 5 * 60e3);
  assert.equal(changed, true);
  assert.equal(m.live, true);
  assert.equal(m.home_score, 0);
  assert.equal(phase.live, true);
});

test('dayKeyBrazil / isSameDayBrazil', () => {
  assert.equal(dayKeyBrazil('2026-08-02T11:00:00Z'), '2026-08-02');
  assert.equal(isSameDayBrazil('2026-08-02T22:00:00Z', new Date('2026-08-02T15:00:00Z')), true);
});
