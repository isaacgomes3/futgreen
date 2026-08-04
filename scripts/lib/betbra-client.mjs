/**
 * Cliente BetBra Mexchange (prelive — todos os mercados)
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

/**
 * Detalhe do evento. Sem market-ids a BetBra só preenche preços do Match Odds;
 * com market-ids (csv) hidrata back/lay de todos os mercados pedidos.
 */
export async function getEvent(eventId, priceDepth = 3, opts = {}) {
  const params = new URLSearchParams({
    'odds-type': 'DECIMAL',
    'price-depth': String(priceDepth),
  });
  if (opts.marketIds?.length) {
    params.set('market-ids', opts.marketIds.map(String).join(','));
  }
  return getJson(`${BETBRA.mexchangeApi}/events/${eventId}?${params}`);
}

/** Evento completo com odds back/lay de TODOS os mercados (não só Match Odds) */
export async function getEventWithAllMarkets(eventId, priceDepth = 3) {
  const bare = await getEvent(eventId, priceDepth);
  const ids = (bare.markets || []).map((m) => m.id).filter((id) => id != null);
  if (!ids.length) return bare;
  // Re-fetch hidratando preços de cada mercado
  return getEvent(eventId, priceDepth, { marketIds: ids });
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

function mapRunnerPrices(r) {
  const back = bestPrice(r, 'back');
  const lay = bestPrice(r, 'lay');
  return {
    id: r.id ?? null,
    name: r.name || r['name-original'] || '—',
    back_odd: back ? Number(back.odds) : null,
    lay_odd: lay ? Number(lay.odds) : null,
    back_liq: back ? Number(back['available-amount'] || 0) : 0,
    lay_liq: lay ? Number(lay['available-amount'] || 0) : 0,
    volume: Number(r.volume || 0),
  };
}

function marketDisplayName(m) {
  const base = m['name-original'] || m.name || 'Mercado';
  const h = m.handicap;
  if (h == null || h === '') return base;
  const hs = String(h);
  if (String(base).includes(hs)) return base;
  return `${base} ${hs}`;
}

/** Todos os mercados do evento com melhor back/lay por selection */
export function extractAllMarkets(ev) {
  return (ev.markets || []).map((m) => {
    const runners = (m.runners || []).map(mapRunnerPrices);
    const marketId = m.id || null;
    return {
      id: marketId,
      name: marketDisplayName(m),
      market_type: m['market-type'] || m.type || null,
      handicap: m.handicap ?? null,
      status: m.status || null,
      volume: Number(m.volume || 0),
      in_running: Boolean(m['in-running-flag'] || m['in-play'] || false),
      runners,
      exchange_url: marketId
        ? `${BETBRA.openExchangeWeb}/exchange/sport/soccer/event/${ev.id}/market/${marketId}`
        : `${BETBRA.openExchangeWeb}/exchange/sport/soccer/event/${ev.id}`,
    };
  });
}

export function extractMatchOdds(ev) {
  const markets = extractAllMarkets(ev);
  const mo =
    markets.find((m) => /match odds/i.test(m.name || '')) ||
    markets.find((m) => m.market_type === 'one_x_two') ||
    markets[0];
  if (!mo) return { runners: [], market_id: null, volume: 0 };

  return {
    market_id: mo.id || null,
    volume: Number(mo.volume || ev.volume || 0),
    runners: mo.runners,
  };
}

/** Detalhe admin: evento + todos os mercados back/lay */
export function normalizeEventDetail(ev) {
  const base = normalizePreliveEvent(ev);
  const markets = extractAllMarkets(ev);
  return {
    ...base,
    markets,
    markets_count: markets.length,
  };
}

function oddsSnapshotFromMarket(market, teams = {}) {
  const runners = market.runners || [];
  const isMatchOdds =
    /match odds/i.test(market.name || '') || market.market_type === 'one_x_two';
  if (isMatchOdds) {
    const home =
      runners.find((r) => r.name === teams.home_team) || runners[0] || null;
    const away =
      runners.find((r) => r.name === teams.away_team) || runners[1] || null;
    const draw = runners.find((r) => /draw|empate/i.test(r.name || '')) || null;
    return {
      home_back: home?.back_odd ?? null,
      home_lay: home?.lay_odd ?? null,
      away_back: away?.back_odd ?? null,
      away_lay: away?.lay_odd ?? null,
      draw_back: draw?.back_odd ?? null,
      draw_lay: draw?.lay_odd ?? null,
      runners: runners.map((r) => ({
        name: r.name,
        back: r.back_odd,
        lay: r.lay_odd,
      })),
    };
  }
  return {
    market_name: market.name,
    runners: runners.map((r) => ({
      name: r.name,
      back: r.back_odd,
      lay: r.lay_odd,
    })),
  };
}

/** Campos de match a partir de um mercado selecionado do evento */
export function marketToMatchFields(eventBase, market) {
  const teams = {
    home_team: eventBase.home_team,
    away_team: eventBase.away_team,
  };
  return {
    market_id: market.id || null,
    market_name: market.name || 'Mercado',
    market_type: market.market_type || null,
    exchange_url: market.exchange_url || eventBase.exchange_url || null,
    odds_snapshot: oddsSnapshotFromMarket(market, teams),
    volume: Number(market.volume || 0),
  };
}

/** Resolve mercados por id a partir do detalhe do evento */
export function pickMarketsByIds(eventDetail, marketIds) {
  const wanted = new Set((marketIds || []).map(String).filter(Boolean));
  if (!wanted.size) return [];
  return (eventDetail.markets || []).filter((m) => m.id != null && wanted.has(String(m.id)));
}

/**
 * Selection de odd (carrinho): { market_id, runner_name, side: BACK|LAY, odd, liquidity? }
 * → campos de match para lançar ao cliente
 */
export function selectionToMatchFields(eventBase, market, selection) {
  const side = String(selection.side || '').toUpperCase() === 'LAY' ? 'LAY' : 'BACK';
  const odd = Number(selection.odd);
  const runnerName = selection.runner_name || selection.selection_name || '—';
  const base = marketToMatchFields(eventBase, market);
  const hasLiq =
    selection.liquidity != null && selection.liquidity !== '' ||
    selection.liquidez != null && selection.liquidez !== '';
  const liqRaw = Number(selection.liquidity ?? selection.liquidez);
  const liquidity = hasLiq && Number.isFinite(liqRaw) && liqRaw >= 0 ? liqRaw : 0;
  return {
    ...base,
    selection_name: runnerName,
    side,
    odd: Number.isFinite(odd) && odd > 1 ? odd : null,
    liquidity,
    // volume do match segue a liquidez só quando o admin informou
    volume: hasLiq && liquidity > 0 ? liquidity : base.volume,
    label: `${base.market_name} · ${runnerName} ${side}${Number.isFinite(odd) ? ` @ ${odd}` : ''}`,
  };
}

/** Resolve selections do carrinho contra o detalhe do evento */
export function resolveCartSelections(eventDetail, selections) {
  const byMarket = new Map((eventDetail.markets || []).map((m) => [String(m.id), m]));
  const out = [];
  for (const sel of selections || []) {
    const market = byMarket.get(String(sel.market_id));
    if (!market) continue;
    const side = String(sel.side || '').toUpperCase() === 'LAY' ? 'LAY' : 'BACK';
    let odd = Number(sel.odd);
    const runner = (market.runners || []).find(
      (r) =>
        String(r.name) === String(sel.runner_name || sel.selection_name) ||
        (sel.runner_id != null && String(r.id) === String(sel.runner_id)),
    );
    if (runner && !(Number.isFinite(odd) && odd > 1)) {
      odd = side === 'LAY' ? runner.lay_odd : runner.back_odd;
    }
    if (!(Number.isFinite(odd) && odd > 1)) continue;
    const hasLiq =
      (sel.liquidity != null && sel.liquidity !== '') ||
      (sel.liquidez != null && sel.liquidez !== '');
    const liqRaw = Number(sel.liquidity ?? sel.liquidez);
    const selection = {
      market_id: market.id,
      runner_name: runner?.name || sel.runner_name || sel.selection_name,
      runner_id: runner?.id ?? sel.runner_id ?? null,
      side,
      odd,
    };
    if (hasLiq && Number.isFinite(liqRaw) && liqRaw >= 0) {
      selection.liquidity = liqRaw;
    }
    out.push({ market, selection });
  }
  return out;
}

/**
 * Converte selections do carrinho (já resolvidas) em campos do card de Desafio.
 * Regra: entre as 2 seleções (home/away), a de maior odd é a zebra (odd_futgreen);
 * a outra vira odd_casa. Se só uma seleção bater com home/away, usa só ela como zebra.
 */
export function desafioFieldsFromSelections(eventBase, resolved) {
  if (!resolved?.length) return null;
  const homeSel = resolved.find(({ selection }) => selection.runner_name === eventBase.home_team);
  const awaySel = resolved.find(({ selection }) => selection.runner_name === eventBase.away_team);
  if (!homeSel && !awaySel) return null;

  if (homeSel && awaySel) {
    const homeOdd = Number(homeSel.selection.odd);
    const awayOdd = Number(awaySel.selection.odd);
    const zebraIsAway = awayOdd > homeOdd;
    const zebraSel = zebraIsAway ? awaySel : homeSel;
    const favSel = zebraIsAway ? homeSel : awaySel;
    const liq = zebraSel.selection.liquidity ?? favSel.selection.liquidity;
    return {
      bet_team_side: zebraIsAway ? 'away' : 'home',
      odd_futgreen: zebraSel.selection.odd,
      odd_casa: favSel.selection.odd,
      ...(liq != null ? { liquidity: liq } : {}),
    };
  }

  const only = homeSel || awaySel;
  return {
    bet_team_side: homeSel ? 'home' : 'away',
    odd_futgreen: only.selection.odd,
    ...(only.selection.liquidity != null ? { liquidity: only.selection.liquidity } : {}),
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
