/**
 * Cliente BetBra Mexchange (prelive / Match Odds)
 * Base: tips3x3/src/lib/betbra
 */

export const BETBRA = {
  origin: 'https://betbra.bet.br',
  mexchangeWeb: 'https://mexchange.betbra.bet.br',
  openExchangeWeb: 'https://betbra.bet.br/b',
  clientApi: 'https://betbra.bet.br/client/api',
  mexchangeApi: 'https://mexchange-api.betbra.bet.br/api',
  sportIds: { soccer: 15 },
  guestSessionToken: '577717_e8a11c8e70edcbd95c5e9db17d0f6f4',
};

export function getSessionToken() {
  return process.env.BETBRA_SESSION_TOKEN?.trim() || BETBRA.guestSessionToken;
}

function mexHeaders() {
  return {
    Accept: 'application/json',
    Origin: BETBRA.mexchangeWeb,
    Referer: `${BETBRA.mexchangeWeb}/`,
    Cookie: `session-token=${getSessionToken()}`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: mexHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`BetBra ${res.status}: ${body.slice(0, 160)}`), {
      status: res.status === 403 ? 502 : 502,
    });
  }
  return res.json();
}

export function dayWindowUnix(now = new Date(), hoursAhead = 36) {
  const after = Math.floor(now.getTime() / 1000) - 30 * 60;
  const before = after + hoursAhead * 3600;
  return { after, before };
}

export async function listSoccerEvents(opts = {}) {
  const { after, before } =
    opts.after != null && opts.before != null
      ? { after: opts.after, before: opts.before }
      : dayWindowUnix(new Date(), opts.hoursAhead ?? 36);

  const params = new URLSearchParams({
    offset: String(opts.offset ?? 0),
    'per-page': String(opts.perPage ?? 40),
    after: String(after),
    before: String(before),
    'sport-ids': String(BETBRA.sportIds.soccer),
    'sort-by': 'volume',
    'sort-direction': 'desc',
    'en-market-names': 'Match Odds',
    'market-types': 'one_x_two',
  });

  return getJson(`${BETBRA.mexchangeApi}/events?${params}`);
}

export async function getEvent(eventId, priceDepth = 3) {
  const params = new URLSearchParams({
    'odds-type': 'DECIMAL',
    'price-depth': String(priceDepth),
  });
  return getJson(`${BETBRA.mexchangeApi}/events/${eventId}?${params}`);
}

function bestPrice(runner, side) {
  const prices = (runner?.prices || []).filter((p) => p.side === side && Number(p.odds) > 1);
  if (!prices.length) return null;
  // back: maior odd disponível no top; lay: menor odd (melhor para o layer)
  if (side === 'back') {
    return prices.reduce((a, b) => (Number(a.odds) >= Number(b.odds) ? a : b));
  }
  return prices.reduce((a, b) => (Number(a.odds) <= Number(b.odds) ? a : b));
}

export function parseEventTeams(ev) {
  const parts = ev['event-participants'] || [];
  const homeP = parts.find((p) => Number(p.number) === 1) || parts[0];
  const awayP = parts.find((p) => Number(p.number) === 2) || parts[1];
  let home = homeP?.['participant-name'] || homeP?.name || null;
  let away = awayP?.['participant-name'] || awayP?.name || null;
  if (!home || !away) {
    const split = String(ev.name || '').split(/\s+vs\.?\s+/i);
    home = home || split[0]?.trim() || 'Casa';
    away = away || split[1]?.trim() || 'Visitante';
  }
  const meta = ev['meta-tags'] || [];
  const league =
    meta.find((t) => /league|liga|serie|championship|copa|cup|premier|brasileir/i.test(t.name || ''))?.name ||
    meta.find((t) => t.type === 'COMPETITION' || t.type === 'competition')?.name ||
    meta[2]?.name ||
    'Futebol';
  return { home_team: home, away_team: away, league };
}

export function extractMatchOdds(ev) {
  const markets = ev.markets || [];
  const mo =
    markets.find((m) => /match odds/i.test(m['name-original'] || m.name || '')) ||
    markets.find((m) => m['market-type'] === 'one_x_two') ||
    markets[0];
  if (!mo) return { runners: [], market_id: null, volume: 0 };

  const runners = (mo.runners || []).map((r) => {
    const back = bestPrice(r, 'back');
    const lay = bestPrice(r, 'lay');
    return {
      id: r.id,
      name: r.name,
      back_odd: back ? Number(back.odds) : null,
      lay_odd: lay ? Number(lay.odds) : null,
      back_liq: back ? Number(back['available-amount'] || 0) : 0,
      lay_liq: lay ? Number(lay['available-amount'] || 0) : 0,
      volume: Number(r.volume || 0),
    };
  });

  return {
    market_id: mo.id || null,
    volume: Number(mo.volume || ev.volume || 0),
    runners,
  };
}

/** Normaliza evento BetBra → payload admin (proteger / desafio) */
export function normalizePreliveEvent(ev) {
  const teams = parseEventTeams(ev);
  const odds = extractMatchOdds(ev);
  const homeRunner = odds.runners.find((r) => r.name === teams.home_team) || odds.runners[0];
  const awayRunner = odds.runners.find((r) => r.name === teams.away_team) || odds.runners[1];
  const drawRunner = odds.runners.find((r) => /draw|empate/i.test(r.name || ''));

  // zebra = maior odd back entre home/away
  const homeBack = homeRunner?.back_odd || 0;
  const awayBack = awayRunner?.back_odd || 0;
  const zebraSide = awayBack > homeBack ? 'away' : 'home';
  const zebra = zebraSide === 'away' ? awayRunner : homeRunner;
  const favorito = zebraSide === 'away' ? homeRunner : awayRunner;

  return {
    external_id: ev.id,
    source: 'betbra',
    name: ev.name,
    home_team: teams.home_team,
    away_team: teams.away_team,
    league: teams.league,
    starts_at: ev.start,
    volume: Number(ev.volume || odds.volume || 0),
    market_id: odds.market_id,
    in_running: Boolean(ev['in-running-flag']),
    status: ev.status || null,
    odds: {
      home_back: homeRunner?.back_odd ?? null,
      home_lay: homeRunner?.lay_odd ?? null,
      away_back: awayRunner?.back_odd ?? null,
      away_lay: awayRunner?.lay_odd ?? null,
      draw_back: drawRunner?.back_odd ?? null,
      draw_lay: drawRunner?.lay_odd ?? null,
    },
    desafio_hint: {
      bet_team_side: zebraSide,
      odd_futgreen: zebra?.lay_odd || zebra?.back_odd || null,
      odd_casa: favorito?.back_odd || null,
      liquidity: Math.round(zebra?.lay_liq || zebra?.volume || odds.volume || 0),
    },
    exchange_url: odds.market_id
      ? `${BETBRA.openExchangeWeb}/exchange/sport/soccer/event/${ev.id}/market/${odds.market_id}`
      : `${BETBRA.openExchangeWeb}/exchange/sport/soccer/event/${ev.id}`,
  };
}

export async function fetchPreliveEvents(opts = {}) {
  const res = await listSoccerEvents(opts);
  const events = (res.events || [])
    .filter((e) => !e['in-running-flag'] || opts.includeLive)
    .map(normalizePreliveEvent)
    .filter((e) => new Date(e.starts_at).getTime() > Date.now() - 5 * 60e3);
  return {
    events,
    total: res.total ?? events.length,
    source: 'betbra',
    fetched_at: new Date().toISOString(),
  };
}
