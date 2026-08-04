/**
 * Fase / relógio / placar de exibição do card de evento.
 * - Antes do kickoff: scheduled
 * - Após kickoff: live (1ºT / intervalo / 2ºT) com placar
 * - Encerrado: settled_at ou finished_at
 */

/** Dia civil em America/Sao_Paulo (YYYY-MM-DD) */
export function dayKeyBrazil(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || 0);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isSameDayBrazil(iso, ref = new Date()) {
  const a = dayKeyBrazil(iso);
  const b = dayKeyBrazil(ref);
  return Boolean(a && b && a === b);
}

const HALF_MS = 45 * 60e3;
const HT_MS = 15 * 60e3;
const FULL_MS = HALF_MS + HT_MS + HALF_MS; // ~105 min

export function deriveMatchPhase(match, now = Date.now()) {
  const starts = new Date(match?.starts_at || 0).getTime();
  const settledAt = match?.settled_at ? new Date(match.settled_at).getTime() : null;
  const finishedAt = match?.finished_at ? new Date(match.finished_at).getTime() : null;
  const endedAt = settledAt || finishedAt;

  let home = match?.home_score;
  let away = match?.away_score;
  if (home != null) home = Number(home);
  if (away != null) away = Number(away);

  if (endedAt && Number.isFinite(endedAt)) {
    return {
      phase: 'finished',
      clock: 'FT',
      badge: 'Encerrado',
      home_score: Number.isFinite(home) ? home : 0,
      away_score: Number.isFinite(away) ? away : 0,
      live: false,
      finished: true,
    };
  }

  if (!Number.isFinite(starts) || starts <= 0) {
    return {
      phase: 'unknown',
      clock: null,
      badge: '—',
      home_score: Number.isFinite(home) ? home : null,
      away_score: Number.isFinite(away) ? away : null,
      live: false,
      finished: false,
    };
  }

  if (now < starts) {
    return {
      phase: 'scheduled',
      clock: null,
      badge: null,
      home_score: null,
      away_score: null,
      live: false,
      finished: false,
    };
  }

  // Ao vivo (ou pós-kickoff aguardando liquidação)
  if (!Number.isFinite(home)) home = 0;
  if (!Number.isFinite(away)) away = 0;

  const adminMinute = match?.minute != null && match.minute !== '' ? Number(match.minute) : null;
  const elapsedMs = now - starts;
  let phase = 'live';
  let clock = "1'";
  let badge = 'Ao vivo';

  if (match?.period === 'ht' || match?.phase === 'ht') {
    phase = 'ht';
    clock = 'HT';
    badge = 'Intervalo';
  } else if (Number.isFinite(adminMinute)) {
    const m = Math.max(0, Math.floor(adminMinute));
    if (m <= 45) {
      phase = '1h';
      clock = `${m}'`;
      badge = '1º tempo';
    } else {
      phase = '2h';
      clock = m > 90 ? "90'+" : `${m}'`;
      badge = '2º tempo';
    }
  } else if (elapsedMs <= HALF_MS) {
    phase = '1h';
    clock = `${Math.max(1, Math.floor(elapsedMs / 60e3))}'`;
    badge = '1º tempo';
  } else if (elapsedMs <= HALF_MS + HT_MS) {
    phase = 'ht';
    clock = 'HT';
    badge = 'Intervalo';
  } else if (elapsedMs <= FULL_MS + 15 * 60e3) {
    // 2º tempo + acréscimos estimados
    const second = Math.floor((elapsedMs - HALF_MS - HT_MS) / 60e3);
    const display = 45 + Math.min(second, 45);
    phase = '2h';
    clock = display >= 90 ? "90'+" : `${display}'`;
    badge = '2º tempo';
  } else {
    // Tempo regulamentar + acréscimos estourados → encerra no site (não liquida proteção)
    return {
      phase: 'finished',
      clock: 'FT',
      badge: 'Encerrado',
      home_score: home,
      away_score: away,
      live: false,
      finished: true,
    };
  }

  return {
    phase,
    clock,
    badge,
    home_score: home,
    away_score: away,
    live: true,
    finished: false,
  };
}

/** Persiste flags leves quando o jogo já começou (sem liquidar). */
export function touchMatchLiveState(match, now = Date.now()) {
  let changed = false;
  const phase = deriveMatchPhase(match, now);

  // Encerra partida no site por tempo ou FT (score sync) — sem liquidar
  if (phase.finished && !match.finished_at) {
    match.finished_at = match.settled_at || new Date().toISOString();
    match.live = false;
    if (match.period !== 'ft') match.period = 'ft';
    if (match.home_score == null) match.home_score = Number.isFinite(phase.home_score) ? phase.home_score : 0;
    if (match.away_score == null) match.away_score = Number.isFinite(phase.away_score) ? phase.away_score : 0;
    changed = true;
  }

  if (phase.live && !match.live && !match.finished_at) {
    match.live = true;
    changed = true;
  }
  if (phase.live && !match.finished_at) {
    if (match.home_score == null) {
      match.home_score = 0;
      changed = true;
    }
    if (match.away_score == null) {
      match.away_score = 0;
      changed = true;
    }
  }
  // Recompute after possible finish flags
  const finalPhase = changed ? deriveMatchPhase(match, now) : phase;
  return { match, phase: finalPhase, changed };
}
