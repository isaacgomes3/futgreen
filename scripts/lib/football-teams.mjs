/**
 * API de logos / busca de times — TheSportsDB (público) + cache local.
 * Logo URL: strBadge (preferido) ou strLogo.
 */

import fs from 'node:fs';
import path from 'node:path';

const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json';
const API_KEY = () => process.env.SPORTSDB_API_KEY?.trim() || '3';

const memCache = new Map();
const CACHE_TTL_MS = 6 * 3600e3;

function cacheGet(key) {
  const hit = memCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  memCache.set(key, { at: Date.now(), value });
}

async function sportsDbJson(pathname) {
  const url = `${SPORTSDB}/${API_KEY()}${pathname}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'FUTGRN/1.0 (local admin)',
    },
  });
  if (!res.ok) throw new Error(`SportsDB ${res.status}`);
  return res.json();
}

function mapTeam(t) {
  if (!t) return null;
  return {
    id: String(t.idTeam || t.idAPIfootball || t.strTeam),
    name: t.strTeam,
    short_name: t.strTeamShort || null,
    alternate: t.strTeamAlternate || null,
    country: t.strCountry || null,
    league: t.strLeague || null,
    sport: t.strSport || null,
    logo: t.strBadge || t.strLogo || t.strTeamBadge || null,
    banner: t.strBanner || null,
    source: 'thesportsdb',
  };
}

/** Busca times por nome (q) */
export async function searchFootballTeams(q, { limit = 12 } = {}) {
  const term = String(q || '').trim();
  if (term.length < 2) {
    return { teams: defaultTeams(), source: 'local_seed' };
  }

  const key = `search:${term.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return { teams: cached.slice(0, limit), source: 'cache' };

  try {
    const data = await sportsDbJson(`/searchteams.php?t=${encodeURIComponent(term)}`);
    const teams = (data.teams || [])
      .filter((t) => /soccer|football/i.test(t.strSport || 'Soccer'))
      .map(mapTeam)
      .filter(Boolean);
    cacheSet(key, teams);
    return { teams: teams.slice(0, limit), source: 'thesportsdb' };
  } catch (e) {
    // fallback local
    const local = defaultTeams().filter((t) => t.name.toLowerCase().includes(term.toLowerCase()));
    return { teams: local.slice(0, limit), source: 'local_fallback', error: e.message };
  }
}

/** Resolve logo de um nome de time (melhor esforço) */
export async function resolveTeamLogo(teamName) {
  const name = String(teamName || '').trim();
  if (!name) return null;
  const key = `logo:${name.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached !== undefined && cached !== null) return cached;
  if (memCache.has(key)) return memCache.get(key).value;

  const { teams } = await searchFootballTeams(name, { limit: 5 });
  const exact =
    teams.find((t) => t.name.toLowerCase() === name.toLowerCase()) ||
    teams.find((t) => t.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(t.name.toLowerCase())) ||
    teams[0];
  const logo = exact?.logo || null;
  cacheSet(key, logo);
  return logo;
}

export async function enrichEventLogos(event) {
  const [home_logo, away_logo] = await Promise.all([
    resolveTeamLogo(event.home_team),
    resolveTeamLogo(event.away_team),
  ]);
  return { ...event, home_logo, away_logo };
}

export async function enrichEventsLogos(events, { concurrency = 4 } = {}) {
  const out = [];
  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency);
    const enriched = await Promise.all(chunk.map((e) => enrichEventLogos(e)));
    out.push(...enriched);
  }
  return out;
}

export function defaultTeams() {
  return [
    { id: 'flamengo', name: 'Flamengo', logo: null, source: 'local_seed' },
    { id: 'palmeiras', name: 'Palmeiras', logo: null, source: 'local_seed' },
    { id: 'corinthians', name: 'Corinthians', logo: null, source: 'local_seed' },
    { id: 'sao-paulo', name: 'São Paulo', logo: null, source: 'local_seed' },
    { id: 'fluminense', name: 'Fluminense', logo: null, source: 'local_seed' },
    { id: 'gremio', name: 'Grêmio', logo: null, source: 'local_seed' },
    { id: 'internacional', name: 'Internacional', logo: null, source: 'local_seed' },
    { id: 'atletico-mg', name: 'Atlético-MG', logo: null, source: 'local_seed' },
  ];
}

/** Persistência opcional de cache em disco */
export function loadDiskCache(dataDir) {
  try {
    const file = path.join(dataDir, 'teams-cache.json');
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(raw)) {
      memCache.set(k, { at: Date.now(), value: v });
    }
  } catch { /* ignore */ }
}

export function saveDiskCache(dataDir) {
  try {
    const file = path.join(dataDir, 'teams-cache.json');
    const obj = {};
    for (const [k, v] of memCache.entries()) obj[k] = v.value;
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch { /* ignore */ }
}
