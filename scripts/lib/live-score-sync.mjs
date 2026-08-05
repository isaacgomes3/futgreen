/**
 * Sync automático de placar. Três fontes, nesta ordem de preferência:
 * 1) Feed in-play da própria BetBra/Bolsa de Aposta (mesma infra "jumper") — casa por
 *    external_id exato (sem heurística de nome).
 * 2) FotMob (API pública não-oficial, mesma usada pelo site/app) — cobertura ampla
 *    (500+ competições), casa por nome dos times no dia do jogo.
 * 3) TheSportsDB — último fallback por nome dos times.
 * Atualiza home/away/minute/finished nos matches (Proteger) e nos steps de Desafio
 * ao vivo — nunca liquida proteção nem step (settle continua manual/admin).
 */

const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json';
const API_KEY = () => process.env.SPORTSDB_API_KEY?.trim() || '3';

const BETBRA_INPLAY_URL = 'https://betbra.bet.br/client/api/jumper/feedSports/inplay-info';
const INPLAY_CACHE_TTL_MS = 20_000;
let inplayCache = { at: 0, map: new Map() };

const FOTMOB_MATCHES_URL = 'https://www.fotmob.com/api/data/matches';
const FOTMOB_CACHE_TTL_MS = 30_000;
const fotmobCache = new Map(); // dateKey(YYYYMMDD) → { at, matches: [] }

const eventCache = new Map(); // key → { at, score }
const CACHE_TTL_MS = 40_000;
const GLOBAL_COOLDOWN_MS = 35_000;
let lastGlobalSync = 0;
let syncInFlight = null;

function dayKeyUtc(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || 0);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function dayKeyBrazil(isoOrDate = new Date()) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate || 0);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function normalizeTeamKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(se|fc|sc|ac|ec|cr|cf|afc|ssc|clube|sport|club|sporting|associacao|associação)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function teamsMatch(a, b) {
  const x = normalizeTeamKey(a);
  const y = normalizeTeamKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function isFinishedStatus(status, progress) {
  const s = `${status || ''} ${progress || ''}`.toLowerCase();
  return /\b(ft|aet|pen|finished|match finished|after extra|full.?time|encerrado)\b/.test(s);
}

function parseMinute(status, progress) {
  const raw = String(progress || status || '');
  const m = raw.match(/(\d{1,3})\s*'?/);
  if (!m) {
    if (/ht|half/i.test(raw)) return 45;
    return null;
  }
  return Math.min(130, Math.max(0, Number(m[1])));
}

async function sportsDbJson(pathname) {
  const url = `${SPORTSDB}/${API_KEY()}${pathname}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FUTGRN/1.0 (live-score)',
    },
  });
  if (!res.ok) throw new Error(`SportsDB ${res.status}`);
  return res.json();
}

function scoreFromEvent(ev) {
  if (!ev) return null;
  const hs = ev.intHomeScore != null && ev.intHomeScore !== '' ? Number(ev.intHomeScore) : null;
  const as = ev.intAwayScore != null && ev.intAwayScore !== '' ? Number(ev.intAwayScore) : null;
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const finished = isFinishedStatus(ev.strStatus, ev.strProgress);
  const minute = finished ? null : parseMinute(ev.strStatus, ev.strProgress);
  const period = /ht|half/i.test(String(ev.strStatus || ev.strProgress || ''))
    ? 'ht'
    : finished
      ? 'ft'
      : null;
  return {
    home_score: hs,
    away_score: as,
    finished,
    minute,
    period,
    status: ev.strStatus || null,
    progress: ev.strProgress || null,
    event_id: ev.idEvent || null,
    source: 'thesportsdb',
  };
}

export function scoreFromInplayEntry(entry) {
  if (!entry?.score?.home || !entry?.score?.away) return null;
  const hs = Number(entry.score.home.score);
  const as = Number(entry.score.away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const phase = String(entry.inPlayMatchStatus || entry.status || '').toLowerCase();
  const finished = /full.?time|finished|ended|encerrado/.test(phase);
  const halftime = /half.?time|firsthalfend|intervalo/.test(phase);
  const minuteRaw = entry.timeElapsed ?? entry.elapsedRegularTime;
  const minute = finished ? null : Number.isFinite(Number(minuteRaw)) ? Math.min(130, Math.max(0, Number(minuteRaw))) : null;
  const period = halftime ? 'ht' : finished ? 'ft' : null;
  return {
    home_score: hs,
    away_score: as,
    finished,
    minute,
    period,
    status: entry.inPlayMatchStatus || entry.status || null,
    progress: null,
    event_id: entry.eventId || null,
    source: 'betbra',
  };
}

async function fetchBetbraInplayMap() {
  if (Date.now() - inplayCache.at < INPLAY_CACHE_TTL_MS) return inplayCache.map;
  const map = new Map();
  try {
    const res = await fetch(BETBRA_INPLAY_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'ArbiShield/1.0 (live-score)' },
    });
    if (res.ok) {
      const list = await res.json();
      for (const entry of Array.isArray(list) ? list : []) {
        if (entry?.eventId) map.set(String(entry.eventId), entry);
      }
    }
  } catch {
    /* mantém map vazio; syncLiveScores cai no fallback TheSportsDB */
  }
  inplayCache = { at: Date.now(), map };
  return map;
}

export async function lookupScoreByExternalId(externalId) {
  if (!externalId) return null;
  const map = await fetchBetbraInplayMap();
  const entry = map.get(String(externalId));
  if (!entry) return null;
  return scoreFromInplayEntry(entry);
}

export function scoreFromFotmobMatch(m) {
  if (!m?.home || !m?.away) return null;
  const hs = Number(m.home.score);
  const as = Number(m.away.score);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const status = m.status || {};
  if (!status.started) return null;
  const finished = Boolean(status.finished);
  const liveShort = String(status.liveTime?.short || '').toUpperCase();
  const halftime = liveShort === 'HT';
  const period = halftime ? 'ht' : finished ? 'ft' : null;
  const minuteMatch = liveShort.match(/(\d{1,3})/);
  const minute = finished ? null : halftime ? 45 : minuteMatch ? Math.min(130, Number(minuteMatch[1])) : null;
  return {
    home_score: hs,
    away_score: as,
    finished,
    minute,
    period,
    status: status.liveTime?.long || (finished ? 'FT' : null),
    progress: liveShort || null,
    event_id: m.id || null,
    source: 'fotmob',
  };
}

async function fetchFotmobMatchesByDate(dateKey) {
  const hit = fotmobCache.get(dateKey);
  if (hit && Date.now() - hit.at < FOTMOB_CACHE_TTL_MS) return hit.matches;
  let matches = [];
  try {
    const ymd = dateKey.replace(/-/g, '');
    const res = await fetch(`${FOTMOB_MATCHES_URL}?date=${ymd}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });
    if (res.ok) {
      const data = await res.json();
      for (const lg of data.leagues || []) {
        for (const m of lg.matches || []) matches.push(m);
      }
    }
  } catch {
    /* mantém lista vazia; segue fallback seguinte */
  }
  fotmobCache.set(dateKey, { at: Date.now(), matches });
  return matches;
}

async function lookupScoreFotmob(homeTeam, awayTeam, startsAt) {
  const home = String(homeTeam || '').trim();
  const away = String(awayTeam || '').trim();
  if (!home || !away) return null;

  const base = startsAt ? new Date(startsAt) : new Date();
  if (!Number.isFinite(base.getTime())) return null;
  const dayKeys = new Set(
    [-1, 0, 1].map((offset) => dayKeyUtc(new Date(base.getTime() + offset * 86_400_000))).filter(Boolean),
  );

  for (const dayKey of dayKeys) {
    const matches = await fetchFotmobMatchesByDate(dayKey);
    for (const m of matches) {
      const mHome = m.home?.longName || m.home?.name;
      const mAway = m.away?.longName || m.away?.name;
      if (!teamsMatch(mHome, home) || !teamsMatch(mAway, away)) continue;
      const scored = scoreFromFotmobMatch(m);
      if (scored) return scored;
    }
  }
  return null;
}

async function lookupScore(homeTeam, awayTeam, startsAt) {
  const cacheKey = `${normalizeTeamKey(homeTeam)}|${normalizeTeamKey(awayTeam)}|${dayKeyBrazil(startsAt) || ''}`;
  const hit = eventCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.score;

  const home = String(homeTeam || '').trim();
  const away = String(awayTeam || '').trim();
  if (!home || !away) return null;

  const queries = [
    `${home.replace(/\s+/g, '_')}_vs_${away.replace(/\s+/g, '_')}`,
    `${home.split(/\s+/).pop()}_vs_${away.split(/\s+/).pop()}`,
  ];

  let best = null;
  const targetDay = dayKeyBrazil(startsAt) || dayKeyUtc(startsAt);

  for (const q of queries) {
    try {
      const data = await sportsDbJson(`/searchevents.php?e=${encodeURIComponent(q)}`);
      const list = data.event || data.events || [];
      for (const ev of list) {
        if (!teamsMatch(ev.strHomeTeam, home) || !teamsMatch(ev.strAwayTeam, away)) continue;
        const day = ev.dateEvent || '';
        if (targetDay && day && day !== targetDay) {
          // permite D-1/D+1 por fuso
          const t = new Date(`${targetDay}T12:00:00Z`).getTime();
          const e = new Date(`${day}T12:00:00Z`).getTime();
          if (Number.isFinite(t) && Number.isFinite(e) && Math.abs(t - e) > 36 * 3600e3) continue;
        }
        const scored = scoreFromEvent(ev);
        if (!scored) continue;
        // Preferir evento do dia e com placar
        if (!best || (day === targetDay && best._day !== targetDay) || scored.finished) {
          best = { ...scored, _day: day };
          if (scored.finished && day === targetDay) break;
        }
      }
      if (best?.finished) break;
    } catch {
      /* tenta próxima query */
    }
  }

  const score = best ? { ...best, _day: undefined } : null;
  eventCache.set(cacheKey, { at: Date.now(), score });
  return score;
}

function eventGroupKey(m) {
  if (m.external_id) return `ext:${m.external_id}`;
  return `t:${m.home_team}|${m.away_team}|${m.starts_at}`;
}

function applyScoreToMatch(m, score) {
  if (!score) return false;
  let changed = false;
  if (Number(m.home_score) !== score.home_score) {
    m.home_score = score.home_score;
    changed = true;
  }
  if (Number(m.away_score) !== score.away_score) {
    m.away_score = score.away_score;
    changed = true;
  }
  if (score.minute != null && Number(m.minute) !== Number(score.minute)) {
    m.minute = score.minute;
    changed = true;
  }
  if (score.period && m.period !== score.period) {
    m.period = score.period;
    changed = true;
  }
  if (score.finished) {
    if (!m.finished_at) {
      m.finished_at = new Date().toISOString();
      changed = true;
    }
    if (m.live) {
      m.live = false;
      changed = true;
    }
    if (m.period !== 'ft') {
      m.period = 'ft';
      changed = true;
    }
  } else if (!m.finished_at) {
    // Não reabre partida já encerrada por tempo/FT
    if (!m.live) {
      m.live = true;
      changed = true;
    }
  }
  m.score_source = score.source;
  m.score_synced_at = new Date().toISOString();
  if (score.event_id) m.sportsdb_event_id = score.event_id;
  return changed;
}

/** Todos os registros sincronizáveis (matches de Proteger + steps de Desafio). */
function allSyncableRecords(store) {
  return [...store.data.matches, ...(store.data.desafio_steps || [])];
}

function mirrorScore(store, sourceMatch) {
  for (const s of allSyncableRecords(store)) {
    if (s === sourceMatch) continue;
    const same =
      (sourceMatch.external_id && s.external_id === sourceMatch.external_id) ||
      (s.home_team === sourceMatch.home_team &&
        s.away_team === sourceMatch.away_team &&
        s.starts_at === sourceMatch.starts_at);
    if (!same) continue;
    s.home_score = sourceMatch.home_score;
    s.away_score = sourceMatch.away_score;
    s.minute = sourceMatch.minute;
    s.period = sourceMatch.period;
    s.live = sourceMatch.live;
    s.finished_at = sourceMatch.finished_at || null;
    s.score_source = sourceMatch.score_source;
    s.score_synced_at = sourceMatch.score_synced_at;
    if (sourceMatch.sportsdb_event_id) s.sportsdb_event_id = sourceMatch.sportsdb_event_id;
  }
}

/** Matches elegíveis: publicados, já iniciados, ainda não liquidados. */
export function matchesNeedingScoreSync(store, now = Date.now()) {
  return store.data.matches.filter((m) => {
    if (m.settled_at) return false;
    if (!m.is_published && !m.published_at) return false;
    const starts = new Date(m.starts_at || 0).getTime();
    if (!Number.isFinite(starts) || starts > now + 5 * 60e3) return false;
    // até 6h após kickoff ainda tenta sync (pós-jogo / atraso)
    if (now - starts > 6 * 3600e3 && m.finished_at) return false;
    if (now - starts > 8 * 3600e3) return false;
    return true;
  });
}

/** Steps de Desafio elegíveis: publicados, já iniciados, ainda não liquidados (settle manual). */
export function stepsNeedingScoreSync(store, now = Date.now()) {
  return (store.data.desafio_steps || []).filter((s) => {
    if (s.deleted_at) return false;
    if (s.status === 'done') return false;
    if (s.status !== 'published' && s.status !== 'live') return false;
    const starts = new Date(s.starts_at || 0).getTime();
    if (!Number.isFinite(starts) || starts > now + 5 * 60e3) return false;
    if (now - starts > 8 * 3600e3) return false;
    return true;
  });
}

/**
 * Sincroniza placares. Throttle global (exceto force).
 * @returns {{ updated: number, checked: number, skipped: boolean }}
 */
export async function syncLiveScores(store, { force = false } = {}) {
  if (!force && Date.now() - lastGlobalSync < GLOBAL_COOLDOWN_MS) {
    return { updated: 0, checked: 0, skipped: true };
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    lastGlobalSync = Date.now();
    const now = Date.now();
    const candidates = [...matchesNeedingScoreSync(store, now), ...stepsNeedingScoreSync(store, now)];
    if (!candidates.length) return { updated: 0, checked: 0, skipped: false };

    // Um fetch por grupo de evento
    const groups = new Map();
    for (const m of candidates) {
      const key = eventGroupKey(m);
      if (!groups.has(key)) groups.set(key, m);
    }

    let updated = 0;
    for (const m of groups.values()) {
      try {
        const score =
          (await lookupScoreByExternalId(m.external_id)) ||
          (await lookupScoreFotmob(m.home_team, m.away_team, m.starts_at)) ||
          (await lookupScore(m.home_team, m.away_team, m.starts_at));
        if (!score) continue;
        const changed = applyScoreToMatch(m, score);
        if (changed) {
          mirrorScore(store, m);
          updated += 1;
        }
      } catch {
        /* ignore per-match */
      }
    }

    if (updated > 0) store.save();
    return { updated, checked: groups.size, skipped: false };
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}

export function startLiveScoreScheduler(store, { intervalMs = 45_000 } = {}) {
  const tick = () => {
    syncLiveScores(store).catch(() => {});
  };
  tick();
  return setInterval(tick, intervalMs);
}
