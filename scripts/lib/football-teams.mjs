/**
 * API de logos / cenas de times — TheSportsDB (público) + cache local.
 * Fundo de card: fanart (jogadores) → banner (torcida) → estádio. Nunca escudo.
 * Logo/badge só para ícone ao lado do nome.
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

/** Escudo/badge — nunca usar como fundo de card */
export function isBadgeImageUrl(url) {
  const u = String(url || '');
  return /\/badge\//i.test(u) || /team\/badge/i.test(u) || /strbadge/i.test(u);
}

/**
 * Candidatos de fundo: jogadores/fanart → torcida/banner → estádio.
 * Nunca inclui escudo.
 */
function sceneArtCandidates(t) {
  const fanarts = [t.strFanart1, t.strFanart2, t.strFanart3, t.strFanart4].filter(Boolean);
  const banner = t.strBanner || null;
  const stadium = t.strStadiumThumb || null;
  // Ordem de preferência por tipo; dentro de fanarts o pickEventCardArt escolhe por seed
  return [...fanarts, banner, stadium].filter((u) => u && !isBadgeImageUrl(u));
}

function mapTeam(t) {
  if (!t) return null;
  const logo = t.strBadge || t.strLogo || t.strTeamBadge || null;
  const scenes = sceneArtCandidates(t);
  const fanarts = [t.strFanart1, t.strFanart2, t.strFanart3, t.strFanart4].filter(Boolean);
  const banner = t.strBanner || null;
  const stadium = t.strStadiumThumb || null;
  return {
    id: String(t.idTeam || t.idAPIfootball || t.strTeam),
    name: t.strTeam,
    short_name: t.strTeamShort || null,
    alternate: t.strTeamAlternate || null,
    country: t.strCountry || null,
    league: t.strLeague || null,
    sport: t.strSport || null,
    logo,
    banner,
    stadium,
    fanarts,
    scenes,
    // art de card = cena (nunca escudo)
    art: scenes[0] || null,
    source: 'thesportsdb',
  };
}

function hashPick(seed, mod) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return mod > 0 ? h % mod : 0;
}

/** Escolhe arte de fundo do card (cena de um dos times — sem escudo) */
export function pickEventCardArt({
  home_team,
  away_team,
  home_scenes,
  away_scenes,
  home_art,
  away_art,
  seed,
} = {}) {
  const pool = [];
  const homeList = (home_scenes?.length ? home_scenes : home_art ? [home_art] : []).filter(
    (u) => u && !isBadgeImageUrl(u),
  );
  const awayList = (away_scenes?.length ? away_scenes : away_art ? [away_art] : []).filter(
    (u) => u && !isBadgeImageUrl(u),
  );
  for (const url of homeList) pool.push({ team: home_team, url });
  for (const url of awayList) pool.push({ team: away_team, url });
  if (!pool.length) {
    return { card_bg: null, card_bg_team: null };
  }
  const idx = hashPick(seed || `${home_team}|${away_team}`, pool.length);
  return { card_bg: pool[idx].url, card_bg_team: pool[idx].team || null };
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

function pickTeamMatch(teams, name) {
  const n = name.toLowerCase();
  return (
    teams.find((t) => t.name.toLowerCase() === n) ||
    teams.find((t) => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase())) ||
    teams[0] ||
    null
  );
}

/** Resolve logo de um nome de time (melhor esforço) */
export async function resolveTeamLogo(teamName) {
  const media = await resolveTeamMedia(teamName);
  return media?.logo || null;
}

/**
 * Logo (escudo, só para ícone) + cenas para fundo de card
 * (jogadores / torcida / arquibancada — nunca badge).
 */
export async function resolveTeamMedia(teamName) {
  const name = String(teamName || '').trim();
  if (!name) return { logo: null, art: null, scenes: [] };
  const key = `media:v3:${name.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const { teams } = await searchFootballTeams(name, { limit: 5 });
  const exact = pickTeamMatch(teams, name);
  const scenes = (exact?.scenes || []).filter((u) => u && !isBadgeImageUrl(u));
  const media = {
    logo: exact?.logo || null,
    scenes,
    art: scenes[0] || null,
  };
  cacheSet(key, media);
  cacheSet(`logo:${name.toLowerCase()}`, media.logo);
  return media;
}

export async function enrichEventLogos(event) {
  const [homeMedia, awayMedia] = await Promise.all([
    resolveTeamMedia(event.home_team),
    resolveTeamMedia(event.away_team),
  ]);
  const home_logo = event.home_logo || homeMedia.logo;
  const away_logo = event.away_logo || awayMedia.logo;
  const home_scenes = homeMedia.scenes || [];
  const away_scenes = awayMedia.scenes || [];
  const home_art = home_scenes[0] || null;
  const away_art = away_scenes[0] || null;
  const picked = pickEventCardArt({
    home_team: event.home_team,
    away_team: event.away_team,
    home_scenes,
    away_scenes,
    home_art,
    away_art,
    seed: event.external_id || event.id || `${event.home_team}|${event.away_team}|${event.starts_at}`,
  });
  const prevBgBad = !event.card_bg || isBadgeImageUrl(event.card_bg);
  return {
    ...event,
    home_logo,
    away_logo,
    home_art,
    away_art,
    card_bg: prevBgBad ? picked.card_bg : event.card_bg,
    card_bg_team: prevBgBad ? picked.card_bg_team : event.card_bg_team,
  };
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
