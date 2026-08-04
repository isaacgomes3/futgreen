#!/usr/bin/env node
/**
 * FutGreen API — shim :3101
 * Rotas /api/futgreen/* (alias /api/arbishield/*)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.mjs';
import {
  protectionHealthPayload,
  calcIndicationEconomics,
} from './lib/protection-flow-contract.mjs';
import { assertTransferAllowed, labelForTxType, labelForBucket } from './lib/wallet-buckets-contract.mjs';
import { parseAllowedAdminEmails, isAdminEmail } from './lib/admin-ops-contract.mjs';
import { createProtection, matchLiquidityStats } from './lib/create-protection.mjs';
import { settleProtection, closeProtection, cancelProtectionByClient } from './lib/settle-protection.mjs';
import {
  createDesafio,
  editDesafio,
  listPublishedDesafios,
  getDesafioBundle,
  registerDesafioEntry,
  settleDesafioStep,
  cancelDesafio,
  softDeleteDesafio,
} from './lib/desafio-ops.mjs';
import { previewSinal } from './lib/desafio-ciclo-math.mjs';
import {
  livereloadEnabled,
  attachLivereload,
  injectLivereload,
  watchForReload,
} from './lib/livereload.mjs';
import {
  fetchPreliveEvents,
  getEvent,
  getEventWithAllMarkets,
  normalizePreliveEvent,
  normalizeEventDetail,
  marketToMatchFields,
  pickMarketsByIds,
  selectionToMatchFields,
  resolveCartSelections,
  desafioFieldsFromSelections,
} from './lib/betbra-client.mjs';
import {
  searchFootballTeams,
  enrichEventLogos,
  enrichEventsLogos,
  resolveTeamLogo,
  isBadgeImageUrl,
  loadDiskCache,
  saveDiskCache,
} from './lib/football-teams.mjs';
import {
  deriveMatchPhase,
  touchMatchLiveState,
  isSameDayBrazil,
  dayKeyBrazil,
} from './lib/match-phase.mjs';
import { syncLiveScores, startLiveScoreScheduler } from './lib/live-score-sync.mjs';
import {
  hashPassword,
  verifyPassword,
  assertAuthPayload,
  normalizeEmail,
  isUserActive,
  isUserBlocked,
  isDepositOnly,
} from './lib/auth.mjs';
import { emptyWallet } from './lib/wallet-buckets-contract.mjs';
import {
  requestDeductionWithdraw,
  decideWithdrawal,
  createExpense,
  updateExpense,
  expenseAlert,
  createAreaEntry,
  createTreasuryMove,
  buildFinanceMonitor,
  rejectManualDeposit,
  FINANCE_AREAS,
  ensureCollections,
} from './lib/financeiro-ops.mjs';
import { ensureLocalSeedPasswords, LOCAL_DEV_PASSWORD } from './lib/local-auth.mjs';
import { isLucReady } from './lib/luc-paguei-client.mjs';
import { isAutoConfirmGateway } from './lib/pix-confirmation-policy.mjs';
import {
  createPixDeposit,
  creditDeposit,
  applyLucWebhook,
  getUserDeposit,
  publicDepositView,
} from './lib/deposits-pix.mjs';
import {
  getMinDepositCents,
  setMinDepositReais,
  publicDepositSettings,
} from './lib/app-settings.mjs';
import {
  ensureReferralCode,
  findUserByReferralCode,
  buildReferralUrl,
  referralStats,
  attachReferrer,
} from './lib/referral.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// .env local
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] == null || process.env[m[1]] === '') {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
} catch { /* ignore */ }

const PORT = Number(process.env.PORT || 3101);
/** Em produção, só localhost (nginx faz SSL). Evita http://domínio:3101 “Não seguro”. */
const LISTEN_HOST = process.env.LISTEN_HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : undefined);
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const IS_LOCAL = livereloadEnabled();
const ALLOWED_ADMINS = parseAllowedAdminEmails(
  process.env.ALLOWED_ADMIN_EMAILS || 'admin@futgreen.local,isaac@futgreen.local,carlos@futgreen.local',
);

const store = createStore(DATA_DIR);
loadDiskCache(DATA_DIR);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Email, X-Admin-Email, X-Impersonate',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function actor(req) {
  const email = normalizeEmail(req.headers['x-user-email'] || req.headers['x-admin-email'] || '');
  if (!email) {
    return { user: null, adminEmail: null, impersonating: false, anonymous: true };
  }
  let user = store.getUserByEmail(email);
  if (!user) {
    // Local: cria usuário vazio sob demanda. Produção: exige cadastro/login.
    if (IS_LOCAL) {
      user = store.upsertUser({
        email,
        name: String(email).split('@')[0],
        role: isAdminEmail(email, ALLOWED_ADMINS) ? 'admin' : 'client',
        wallet: emptyWallet(),
        is_active: isAdminEmail(email, ALLOWED_ADMINS),
      });
    } else {
      return { user: null, adminEmail: null, impersonating: false, anonymous: true };
    }
  }
  const impersonate = req.headers['x-impersonate'];
  if (impersonate && isAdminEmail(email, ALLOWED_ADMINS)) {
    const target = store.getUserByEmail(impersonate) || store.getUser(impersonate);
    if (target) return { user: target, adminEmail: email, impersonating: true };
  }
  return {
    user,
    adminEmail: isAdminEmail(email, ALLOWED_ADMINS) ? email : null,
    impersonating: false,
    anonymous: false,
  };
}

function requireAdmin(ctx) {
  if (!ctx.adminEmail) {
    throw Object.assign(new Error('Admin required (allowlist)'), { status: 403 });
  }
}

/** Garante logos TheSportsDB em steps de desafio (persiste no store) */
async function ensureStepsLogos(steps) {
  let changed = false;
  for (const s of steps || []) {
    if (!s) continue;
    try {
      if (!s.home_logo && s.home_team) {
        s.home_logo = await resolveTeamLogo(s.home_team);
        changed = true;
      }
      if (!s.away_logo && s.away_team) {
        s.away_logo = await resolveTeamLogo(s.away_team);
        changed = true;
      }
    } catch { /* ignore */ }
  }
  if (changed) {
    saveDiskCache(DATA_DIR);
    store.save();
  }
  return changed;
}

function normalizeApiPath(urlPath) {
  return urlPath
    .replace(/^\/api\/arbishield\//, '/api/futgreen/')
    .replace(/^\/api\/futgreen\//, '/api/futgreen/');
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  let p = normalizeApiPath(url.pathname);
  // aliases
  if (p === '/api/futgreen/available-matches' || p === '/api/futgreen/matches/available') {
    p = '/api/futgreen/matches';
  }
  if (p === '/api/futgreen/create-protection') p = '/api/futgreen/protections';
  if (p === '/api/futgreen/desafio-journey') p = '/api/futgreen/desafio-jornada';
  if (p === '/api/futgreen/admin-adjust-balance') p = '/api/futgreen/adjust-balance';

  const ctx = actor(req);
  const body = method === 'POST' || method === 'PUT' || method === 'PATCH' ? await readBody(req) : {};

  // Conta bloqueada: só auth/públicas e ações admin
  const publicApi =
    p.startsWith('/api/futgreen/auth/') ||
    p === '/api/futgreen/referral/lookup' ||
    p.startsWith('/api/futgreen/webhooks/');
  if (!publicApi && !ctx.user) {
    return send(res, 401, { error: 'Faça login para continuar', code: 'auth_required' });
  }
  if (!publicApi && !ctx.adminEmail && isUserBlocked(ctx.user)) {
    return send(res, 403, { error: 'Conta bloqueada pelo administrador', code: 'account_blocked' });
  }

  // Conta aguardando 1º depósito: só perfil + carteira/PIX
  if (!publicApi && !ctx.adminEmail && isDepositOnly(ctx.user)) {
    const depositOnlyOk =
      p === '/api/futgreen/me' ||
      p === '/api/futgreen/wallet' ||
      p === '/api/futgreen/transactions' ||
      p.startsWith('/api/futgreen/deposits');
    if (!depositOnlyOk) {
      return send(res, 403, {
        error: 'Faça o primeiro depósito PIX para liberar a conta',
        code: 'deposit_required',
      });
    }
  }

  // —— Matches / proteção ——
  if (p === '/api/futgreen/matches' && method === 'GET') {
    // Placar automático (TheSportsDB) — throttle interno
    try {
      await syncLiveScores(store);
    } catch { /* não bloqueia a fila */ }
    const all = url.searchParams.get('all') === '1';
    const now = Date.now();
    /** Indicação lançada pelo admin (publicada com mercado/lado/odd). */
    const isAdminLaunch = (m) => {
      if (!m?.is_published && !m?.published_at) return false;
      const side = String(m.side || '').toUpperCase();
      const odd = Number(m.odd);
      return (side === 'BACK' || side === 'LAY') && Number.isFinite(odd) && odd > 1;
    };

    const rows = store.data.matches.filter((m) => {
      if (all) return true;
      if (!isAdminLaunch(m)) return false;
      // Fila ativa (ainda não encerrada)
      if (!m.settled_at && !m.finished_at) return true;
      // Finalizados do dia (estiveram na fila do cliente)
      return (
        isSameDayBrazil(m.starts_at, now) ||
        isSameDayBrazil(m.settled_at || m.finished_at, now)
      );
    });
    let changed = false;
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const m = rows[i];
      const needsArt = !m.card_bg || isBadgeImageUrl(m.card_bg);
      if (!m.home_logo || !m.away_logo || needsArt) {
        try {
          const enriched = await enrichEventLogos(m);
          if (enriched.home_logo && enriched.home_logo !== m.home_logo) {
            m.home_logo = enriched.home_logo;
            changed = true;
          }
          if (enriched.away_logo && enriched.away_logo !== m.away_logo) {
            m.away_logo = enriched.away_logo;
            changed = true;
          }
          if (enriched.home_art && enriched.home_art !== m.home_art) {
            m.home_art = enriched.home_art;
            changed = true;
          }
          if (enriched.away_art && enriched.away_art !== m.away_art) {
            m.away_art = enriched.away_art;
            changed = true;
          }
          if (enriched.card_bg && enriched.card_bg !== m.card_bg) {
            m.card_bg = enriched.card_bg;
            m.card_bg_team = enriched.card_bg_team;
            changed = true;
          }
          // Nunca persistir escudo como fundo
          if (m.card_bg && isBadgeImageUrl(m.card_bg)) {
            m.card_bg = null;
            m.card_bg_team = null;
            changed = true;
          }
          rows[i] = m;
        } catch { /* opcional */ }
      }
      const touched = touchMatchLiveState(m, now);
      if (touched.changed) changed = true;
      const liq = matchLiquidityStats(store, m);
      out.push({
        ...m,
        ...liq,
        match_phase: touched.phase.phase,
        match_clock: touched.phase.clock,
        match_badge: touched.phase.badge,
        match_live: touched.phase.live,
        match_finished: touched.phase.finished,
        display_home_score: touched.phase.home_score,
        display_away_score: touched.phase.away_score,
      });
    }
    if (changed) {
      saveDiskCache(DATA_DIR);
      store.save();
    }
    if (all) {
      return send(res, 200, { matches: out });
    }
    const available = out.filter((m) => !m.settled_at && !m.finished_at && !m.match_finished);
    const finished = out.filter((m) => m.settled_at || m.finished_at || m.match_finished);
    return send(res, 200, { matches: available, finished });
  }

  if (p === '/api/futgreen/matches' && method === 'POST') {
    requireAdmin(ctx);
    if (body.mode === 'settle') {
      return settleMatch(res, ctx, body);
    }
    let home_logo = body.home_logo || null;
    let away_logo = body.away_logo || null;
    if (!home_logo || !away_logo) {
      try {
        const [hl, al] = await Promise.all([
          home_logo ? Promise.resolve(home_logo) : resolveTeamLogo(body.home_team),
          away_logo ? Promise.resolve(away_logo) : resolveTeamLogo(body.away_team),
        ]);
        home_logo = home_logo || hl;
        away_logo = away_logo || al;
        saveDiskCache(DATA_DIR);
      } catch { /* logos opcionais */ }
    }
    const match = {
      id: store.nextId('match'),
      home_team: body.home_team,
      away_team: body.away_team,
      home_logo,
      away_logo,
      league: body.league || 'Brasil',
      starts_at: body.starts_at,
      is_published: Boolean(body.publish),
      published_at: body.publish ? new Date().toISOString() : null,
      home_score: null,
      away_score: null,
      source: body.source || 'manual',
      external_id: body.external_id || null,
      exchange_url: body.exchange_url || null,
      odds_snapshot: body.odds || null,
      created_at: new Date().toISOString(),
      settled_at: null,
    };
    store.data.matches.push(match);
    store.save();
    return send(res, 201, { match });
  }

  if (p === '/api/futgreen/matches/publish' && method === 'POST') {
    requireAdmin(ctx);
    const m = store.data.matches.find((x) => x.id === body.match_id || x.id === body.id);
    if (!m) return send(res, 404, { error: 'Jogo não encontrado' });
    m.is_published = true;
    m.published_at = new Date().toISOString();
    store.save();
    return send(res, 200, { match: m });
  }

  if (p === '/api/futgreen/match-live-odd' && method === 'GET') {
    const matchId = url.searchParams.get('match_id') || url.searchParams.get('id');
    const m = store.data.matches.find((x) => x.id === matchId);
    if (!m) return send(res, 404, { error: 'Jogo não encontrado' });
    if (!m.is_published || m.settled_at) {
      return send(res, 400, { error: 'Indicação indisponível' });
    }
    const side = String(m.side || 'LAY').toUpperCase();
    let odd = m.odd != null ? Number(m.odd) : null;
    let source = 'snapshot';
    try {
      if (m.external_id && m.market_id) {
        const full = await getEventWithAllMarkets(m.external_id, 3);
        const detail = normalizeEventDetail(full);
        const market = (detail.markets || []).find((x) => String(x.id) === String(m.market_id));
        const runner = (market?.runners || []).find(
          (r) => String(r.name) === String(m.selection_name),
        );
        const live = side === 'LAY' ? runner?.lay_odd : runner?.back_odd;
        if (live != null && Number(live) > 1) {
          odd = Number(live);
          source = 'betbra_live';
          m.odd = odd;
          m.label = `${m.market_name || 'Mercado'} · ${m.selection_name || ''} ${side} @ ${odd}`.replace(
            /\s+/g,
            ' ',
          ).trim();
          store.save();
        }
      }
    } catch {
      /* mantém snapshot */
    }
    return send(res, 200, {
      match_id: m.id,
      side,
      odd,
      selection_name: m.selection_name || null,
      market_name: m.market_name || null,
      label: m.label || null,
      source,
      fetched_at: new Date().toISOString(),
    });
  }

  if (p === '/api/futgreen/protection-preview' && method === 'GET') {
    try {
      const side = String(url.searchParams.get('side') || 'LAY').toUpperCase();
      const odd = Number(url.searchParams.get('odd'));
      const amount = Math.round(Number(url.searchParams.get('amount_cents') || Number(url.searchParams.get('amount')) * 100));
      const economics = calcIndicationEconomics({ side, amountCents: amount, odd });
      return send(res, 200, { economics });
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/football-teams' && method === 'GET') {
    try {
      const q = url.searchParams.get('q') || '';
      const result = await searchFootballTeams(q, { limit: Number(url.searchParams.get('limit') || 12) });
      saveDiskCache(DATA_DIR);
      return send(res, 200, result);
    } catch (e) {
      return send(res, 502, { error: e.message, teams: [] });
    }
  }

  if (p === '/api/futgreen/prelive-events' && method === 'GET') {
    requireAdmin(ctx);
    try {
      const hoursAhead = Number(url.searchParams.get('hours') || 36);
      const withLogos = url.searchParams.get('logos') !== '0';
      const raw = await fetchPreliveEvents({ hoursAhead, perPage: Number(url.searchParams.get('limit') || 40) });
      const events = withLogos ? await enrichEventsLogos(raw.events) : raw.events;
      saveDiskCache(DATA_DIR);
      return send(res, 200, { ...raw, events, logos: withLogos });
    } catch (e) {
      return send(res, 502, { error: e.message, source: 'betbra', events: [] });
    }
  }

  {
    const detailMatch = p.match(/^\/api\/futgreen\/prelive-event\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      requireAdmin(ctx);
      try {
        const eventId = decodeURIComponent(detailMatch[1]);
        const full = await getEventWithAllMarkets(eventId, Number(url.searchParams.get('depth') || 3));
        let event = normalizeEventDetail(full);
        if (url.searchParams.get('logos') !== '0') {
          event = await enrichEventLogos(event);
          saveDiskCache(DATA_DIR);
        }
        const markets = event.markets || [];
        const withOdds = markets.filter((m) =>
          (m.runners || []).some((r) => r.back_odd != null || r.lay_odd != null),
        ).length;
        return send(res, 200, {
          event,
          markets,
          markets_count: markets.length,
          markets_with_odds: withOdds,
          source: 'betbra',
          fetched_at: new Date().toISOString(),
        });
      } catch (e) {
        return send(res, e.status || 502, { error: e.message, source: 'betbra', markets: [] });
      }
    }
  }

  if (p === '/api/futgreen/prelive-import' && method === 'POST') {
    requireAdmin(ctx);
    try {
      let ev = body.event || null;
      const selections = Array.isArray(body.selections) ? body.selections : [];
      const marketIds = Array.isArray(body.market_ids)
        ? body.market_ids.map(String).filter(Boolean)
        : body.market_id
          ? [String(body.market_id)]
          : [];

      let detail = null;
      const eventId = ev?.external_id || body.external_id;
      if (eventId && (selections.length || marketIds.length || !ev)) {
        const full = await getEventWithAllMarkets(eventId);
        detail = normalizeEventDetail(full);
        ev = ev ? { ...detail, ...ev, odds: ev.odds || detail.odds } : detail;
      }
      if (!ev && body.external_id) {
        const full = await getEventWithAllMarkets(body.external_id);
        ev = normalizePreliveEvent(full);
      }
      if (!ev) return send(res, 400, { error: 'event ou external_id obrigatório' });
      ev = await enrichEventLogos(ev);
      saveDiskCache(DATA_DIR);

      const dest = body.dest || 'proteger'; // proteger | desafio
      if (dest === 'desafio') {
        const hint = ev.desafio_hint || {};
        let stepFromCart = null;
        if (selections.length) {
          const source = detail || normalizeEventDetail(await getEventWithAllMarkets(ev.external_id));
          const resolved = resolveCartSelections(source, selections);
          if (!resolved.length) {
            return send(res, 400, { error: 'Nenhuma odd válida no carrinho' });
          }
          stepFromCart = desafioFieldsFromSelections(ev, resolved);
        }
        const bundle = await createDesafio(store, {
          title: body.title || `${ev.home_team} × ${ev.away_team}`,
          publish: Boolean(body.publish ?? true),
          steps: [
            {
              home_team: ev.home_team,
              away_team: ev.away_team,
              home_logo: ev.home_logo,
              away_logo: ev.away_logo,
              bet_team_side: stepFromCart?.bet_team_side || body.bet_team_side || hint.bet_team_side || 'away',
              odd_futgreen: Number(stepFromCart?.odd_futgreen ?? body.odd_futgreen ?? hint.odd_futgreen ?? 3.5),
              odd_casa: Number(stepFromCart?.odd_casa ?? body.odd_casa ?? hint.odd_casa ?? 1.5),
              liquidity: Number(stepFromCart?.liquidity ?? body.liquidity ?? hint.liquidity ?? 0),
              starts_at: ev.starts_at,
              market_flag: body.market_flag || 'dnb',
              casa_name: body.casa_name || 'Casa',
              casa_logo: '/public/assets/casa-default.svg',
              external_id: ev.external_id,
              exchange_url: ev.exchange_url,
            },
          ],
        });
        return send(res, 201, { kind: 'desafio', ...bundle, event: ev });
      }

      const publish = Boolean(body.publish);
      const now = new Date().toISOString();
      const baseMatch = {
        home_team: ev.home_team,
        away_team: ev.away_team,
        home_logo: ev.home_logo,
        away_logo: ev.away_logo,
        league: ev.league,
        starts_at: ev.starts_at,
        is_published: publish,
        published_at: publish ? now : null,
        home_score: null,
        away_score: null,
        source: 'betbra',
        external_id: ev.external_id,
        created_at: now,
        settled_at: null,
      };

      if (selections.length) {
        const source = detail || normalizeEventDetail(await getEventWithAllMarkets(ev.external_id));
        const resolved = resolveCartSelections(source, selections);
        if (!resolved.length) {
          return send(res, 400, { error: 'Nenhuma odd válida no carrinho' });
        }
        const matches = resolved.map(({ market, selection }) => {
          const fields = selectionToMatchFields(ev, market, selection);
          const match = {
            id: store.nextId('match'),
            ...baseMatch,
            ...fields,
          };
          store.data.matches.push(match);
          return match;
        });
        store.save();
        return send(res, 201, {
          kind: 'proteger',
          matches,
          match: matches[0],
          count: matches.length,
          event: ev,
        });
      }

      if (marketIds.length) {
        const source = detail || normalizeEventDetail(await getEventWithAllMarkets(ev.external_id));
        const picked = pickMarketsByIds(source, marketIds);
        if (!picked.length) {
          return send(res, 400, { error: 'Nenhum mercado válido nos market_ids' });
        }
        const matches = picked.map((mkt) => {
          const fields = marketToMatchFields(ev, mkt);
          const match = {
            id: store.nextId('match'),
            ...baseMatch,
            ...fields,
          };
          store.data.matches.push(match);
          return match;
        });
        store.save();
        return send(res, 201, {
          kind: 'proteger',
          matches,
          match: matches[0],
          count: matches.length,
          event: ev,
        });
      }

      const match = {
        id: store.nextId('match'),
        ...baseMatch,
        market_id: ev.market_id || null,
        market_name: 'Match Odds',
        exchange_url: ev.exchange_url,
        odds_snapshot: ev.odds,
      };
      store.data.matches.push(match);
      store.save();
      return send(res, 201, { kind: 'proteger', match, matches: [match], count: 1, event: ev });
    } catch (e) {
      return send(res, e.status || 502, { error: e.message });
    }
  }

  if (p === '/api/futgreen/protections' && method === 'GET') {
    const rows = store.data.protections.filter((x) => x.user_id === ctx.user.id);
    return send(res, 200, { protections: rows, readonly: ctx.impersonating });
  }

  if (p === '/api/futgreen/protections' && method === 'POST') {
    if (ctx.impersonating) return send(res, 403, { error: 'Proteger fica readonly no espelho' });
    if (body.action === 'contest_cancel_auto') {
      return send(res, 200, { ok: true, action: 'contest_cancel_auto' });
    }
    if (body.action === 'cancel' || body.mode === 'cancel') {
      try {
        const protection = cancelProtectionByClient(store, {
          protectionId: body.protection_id || body.id,
          userId: ctx.user.id,
        });
        return send(res, 200, { protection, wallet: store.getUser(ctx.user.id).wallet });
      } catch (e) {
        return send(res, e.status || 400, { error: e.message, code: e.code });
      }
    }
    try {
      const protection = createProtection(store, {
        userId: ctx.user.id,
        matchId: body.match_id || body.matchId,
        side: body.side,
        odd: body.odd,
        amountCents: body.amount_cents ?? Math.round(Number(body.amount) * 100),
      });
      return send(res, 201, { protection, wallet: store.getUser(ctx.user.id).wallet });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  if (p === '/api/futgreen/protections/cancel' && method === 'POST') {
    if (ctx.impersonating) return send(res, 403, { error: 'Espelho: cancelamento readonly' });
    try {
      const protection = cancelProtectionByClient(store, {
        protectionId: body.protection_id || body.id,
        userId: ctx.user.id,
      });
      return send(res, 200, { protection, wallet: store.getUser(ctx.user.id).wallet });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  if (p === '/api/futgreen/match-settle' && method === 'POST') {
    requireAdmin(ctx);
    return settleMatch(res, ctx, body);
  }

  if (p === '/api/futgreen/match-score-sync' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const result = await syncLiveScores(store, { force: true });
      return send(res, 200, { ok: true, ...result });
    } catch (e) {
      return send(res, e.status || 500, { error: e.message || 'Falha no sync de placar' });
    }
  }

  if (p === '/api/futgreen/match-live-sync' && method === 'POST') {
    requireAdmin(ctx);
    const m = store.data.matches.find((x) => x.id === body.match_id);
    if (!m) return send(res, 404, { error: 'Jogo não encontrado' });
    if (body.home_score != null) m.home_score = Number(body.home_score);
    if (body.away_score != null) m.away_score = Number(body.away_score);
    if (body.minute != null && body.minute !== '') m.minute = Number(body.minute);
    if (body.period != null) m.period = String(body.period);
    if (body.finished) {
      m.finished_at = new Date().toISOString();
      m.live = false;
    } else {
      m.live = true;
      if (m.finished_at) m.finished_at = null;
    }
    // Espelha placar em indicações do mesmo evento
    const siblings = store.data.matches.filter(
      (x) =>
        x.id !== m.id &&
        ((m.external_id && x.external_id === m.external_id) ||
          (x.home_team === m.home_team &&
            x.away_team === m.away_team &&
            x.starts_at === m.starts_at)),
    );
    for (const s of siblings) {
      s.home_score = m.home_score;
      s.away_score = m.away_score;
      s.minute = m.minute;
      s.period = m.period;
      s.live = m.live;
      s.finished_at = m.finished_at || null;
    }
    store.save();
    const phase = deriveMatchPhase(m);
    return send(res, 200, {
      match: {
        ...m,
        match_phase: phase.phase,
        match_clock: phase.clock,
        match_badge: phase.badge,
        match_live: phase.live,
        match_finished: phase.finished,
        display_home_score: phase.home_score,
        display_away_score: phase.away_score,
      },
    });
  }

  if (p === '/api/futgreen/protection-close' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const protection = closeProtection(store, { protectionId: body.protection_id, adminEmail: ctx.adminEmail });
      return send(res, 200, { protection });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/protection-cancel' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const protection = settleProtection(store, {
        protectionId: body.protection_id,
        outcome: 'cancelar',
        adminEmail: ctx.adminEmail,
      });
      return send(res, 200, { protection });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  // —— Desafio ——
  if (p === '/api/futgreen/desafios' && method === 'GET') {
    const admin = url.searchParams.get('admin') === '1';
    if (admin) {
      requireAdmin(ctx);
      const list = store.data.desafios.filter((d) => !d.deleted_at).map((d) => getDesafioBundle(store, d.id));
      for (const b of list) await ensureStepsLogos(b?.steps);
      return send(res, 200, { desafios: list });
    }
    const published = listPublishedDesafios(store).map((d) => getDesafioBundle(store, d.id));
    for (const b of published) await ensureStepsLogos(b?.steps);
    const unlocked = (ctx.user.wallet.desafio_balance_cents || 0) > 0;
    // preview=1: Visão Geral / discovery — lista publicados mesmo com carteira travada
    const preview = url.searchParams.get('preview') === '1';
    return send(res, 200, {
      desafios: unlocked || preview ? published : [],
      unlocked,
      wallet: ctx.user.wallet,
    });
  }

  if (p === '/api/futgreen/desafios' && method === 'POST') {
    requireAdmin(ctx);
    if (body.mode === 'edit_only' || body.edit_only) {
      const bundle = editDesafio(store, body.id || body.desafio_id, body, 'edit_only');
      return send(res, 200, bundle);
    }
    if (body.mode === 'publish') {
      const d = store.data.desafios.find((x) => x.id === body.id);
      if (!d) return send(res, 404, { error: 'Desafio não encontrado' });
      d.is_published = true;
      d.is_active = true;
      d.published_at = d.published_at || new Date().toISOString();
      for (const s of store.data.desafio_steps.filter((x) => x.desafio_id === d.id)) {
        if (s.status === 'draft') s.status = 'published';
      }
      store.save();
      return send(res, 200, getDesafioBundle(store, d.id));
    }
    const bundle = await createDesafio(store, body);
    return send(res, 201, bundle);
  }

  if (p === '/api/futgreen/desafio-register' && method === 'POST') {
    try {
      const part = registerDesafioEntry(store, {
        userId: ctx.user.id,
        desafioId: body.desafio_id,
        stepId: body.step_id,
        stakeCents: body.stake_cents ?? Math.round(Number(body.stake) * 100),
      });
      return send(res, 201, { participation: part, wallet: store.getUser(ctx.user.id).wallet });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  if (p === '/api/futgreen/desafio-settle' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const result = settleDesafioStep(store, {
        stepId: body.step_id,
        winningSide: body.winningSide || body.winning_side,
        adminEmail: ctx.adminEmail,
        homeScore: body.home_score,
        awayScore: body.away_score,
      });
      return send(res, 200, result);
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/desafio-cancel' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const result = cancelDesafio(store, {
        desafioId: body.desafio_id,
        participationId: body.participation_id,
        email: ctx.adminEmail,
      });
      return send(res, 200, result);
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  if (p === '/api/futgreen/desafio-delete' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const d = softDeleteDesafio(store, {
        desafioId: body.desafio_id,
        email: ctx.adminEmail,
        force: Boolean(body.force),
        confirm: Boolean(body.confirm),
      });
      return send(res, 200, { desafio: d });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  if (p === '/api/futgreen/desafio-restore' && method === 'POST') {
    requireAdmin(ctx);
    const d = store.data.desafios.find((x) => x.id === body.desafio_id);
    if (!d) return send(res, 404, { error: 'Não encontrado' });
    d.deleted_at = null;
    store.save();
    return send(res, 200, { desafio: d });
  }

  if (p === '/api/futgreen/desafio-participations' && method === 'POST') {
    requireAdmin(ctx);
    const rows = store.data.desafio_participations.filter((x) => x.step_id === body.step_id);
    return send(res, 200, { participations: rows });
  }

  if (p === '/api/futgreen/desafio-pending-counts' && method === 'POST') {
    requireAdmin(ctx);
    const counts = {};
    for (const p2 of store.data.desafio_participations.filter((x) => x.status === 'pending')) {
      counts[p2.step_id] = (counts[p2.step_id] || 0) + 1;
    }
    return send(res, 200, { counts });
  }

  if ((p === '/api/futgreen/desafio-history' && (method === 'GET' || method === 'POST')) ||
      (p === '/api/futgreen/desafio-jornada' && method === 'POST')) {
    const parts = store.data.desafio_participations.filter((x) => x.user_id === ctx.user.id);
    const enriched = [];
    for (const part of parts) {
      const step = store.data.desafio_steps.find((s) => s.id === part.step_id);
      if (step) await ensureStepsLogos([step]);
      enriched.push({
        ...part,
        step: step
          ? {
              id: step.id,
              home_team: step.home_team,
              away_team: step.away_team,
              home_logo: step.home_logo,
              away_logo: step.away_logo,
              bet_team_side: step.bet_team_side,
              odd_futgreen: step.odd_futgreen,
              starts_at: step.starts_at,
            }
          : null,
      });
    }
    return send(res, 200, { participations: enriched, wallet: ctx.user.wallet });
  }

  if ((p === '/api/futgreen/desafio-sinal' || p === '/api/futgreen/desafio-sinal-preview') && method === 'POST') {
    const step = store.data.desafio_steps.find((s) => s.id === body.step_id);
    if (!step) return send(res, 404, { error: 'Etapa não encontrada' });
    const stake = Number(body.stake ?? body.stake_reais ?? 10);
    return send(res, 200, { preview: previewSinal(step, stake) });
  }

  if (p === '/api/futgreen/transfer-desafio' && method === 'POST') {
    try {
      assertTransferAllowed('deduction_balance_cents', 'desafio_balance_cents');
      const amount = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
      if (!(amount > 0)) return send(res, 400, { error: 'valor inválido' });
      const u = store.getUser(ctx.user.id);
      if ((u.wallet.deduction_balance_cents || 0) < amount) {
        return send(res, 400, { error: 'Saldo Reembolso insuficiente' });
      }
      u.wallet.deduction_balance_cents -= amount;
      u.wallet.desafio_balance_cents = (u.wallet.desafio_balance_cents || 0) + amount;
      store.addTx({
        user_id: u.id,
        type: 'transfer_reembolso_to_desafio',
        amount_cents: amount,
        bucket: 'desafio_balance_cents',
      });
      store.save();
      return send(res, 200, { wallet: u.wallet });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  // —— Financeiro / admin ——
  if (p === '/api/futgreen/wallet' && method === 'GET') {
    const u = store.getUser(ctx.user.id);
    return send(res, 200, {
      wallet: u.wallet,
      labels: {
        balance_cents: labelForBucket('balance_cents'),
        deduction_balance_cents: labelForBucket('deduction_balance_cents'),
        locked_balance_cents: labelForBucket('locked_balance_cents'),
        desafio_balance_cents: labelForBucket('desafio_balance_cents'),
        investor_balance_cents: labelForBucket('investor_balance_cents'),
        demo_balance_cents: labelForBucket('demo_balance_cents'),
      },
    });
  }

  if (p === '/api/futgreen/transactions' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') || 200);
    const userId = url.searchParams.get('user_id') || (ctx.adminEmail ? null : ctx.user.id);
    if (userId === null) requireAdmin(ctx);
    const rows = store.listTx({ userId: userId || undefined, limit }).map((t) => ({
      ...t,
      label: labelForTxType(t.type),
    }));
    return send(res, 200, { transactions: rows });
  }

  if (p === '/api/futgreen/adjust-balance' && method === 'POST') {
    requireAdmin(ctx);
    const u = store.getUser(body.user_id) || store.getUserByEmail(body.email);
    if (!u) return send(res, 404, { error: 'Usuário não encontrado' });
    const bucket = body.bucket || 'balance_cents';
    const delta = Math.round(Number(body.delta_cents ?? Number(body.delta) * 100));
    u.wallet[bucket] = Math.max(0, (u.wallet[bucket] || 0) + delta);
    store.addTx({
      user_id: u.id,
      type: delta >= 0 ? 'admin_adjustment_credit' : 'admin_adjustment_debit',
      amount_cents: Math.abs(delta),
      bucket,
      meta: { admin: ctx.adminEmail, note: body.note },
    });
    store.save();
    return send(res, 200, { wallet: u.wallet, user: { id: u.id, email: u.email } });
  }

  if (p === '/api/futgreen/deduction-withdraw' && method === 'POST') {
    try {
      const result = requestDeductionWithdraw(store, {
        userId: ctx.user.id,
        amountCents: body.amount_cents ?? Number(body.amount) * 100,
        pixKey: body.pix_key || null,
      });
      return send(res, 200, {
        wallet: result.wallet,
        withdrawal: result.withdrawal,
        status: 'pending',
      });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/dev/status' && method === 'GET') {
    return send(res, 200, {
      local: IS_LOCAL,
      port: PORT,
      users: store.data.users.length,
      matches: store.data.matches.length,
      protections: store.data.protections.length,
      desafios: store.data.desafios.length,
      workshop: '/local/',
    });
  }

  if (p === '/api/futgreen/dev/reseed' && method === 'POST') {
    if (!IS_LOCAL) return send(res, 403, { error: 'reseed só no ambiente local (FG_LOCAL=1)' });
    requireAdmin(ctx);
    const dbFile = path.join(DATA_DIR, 'futgreen.json');
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    const { spawnSync } = await import('node:child_process');
    const seeded = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'seed.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (seeded.status !== 0) {
      return send(res, 500, { error: 'seed falhou', detail: seeded.stderr || seeded.stdout });
    }
    store.load();
    return send(res, 200, {
      ok: true,
      users: store.data.users.length,
      matches: store.data.matches.length,
      desafios: store.data.desafios.length,
    });
  }

  if (p === '/api/futgreen/manual-deposits' && method === 'GET') {
    requireAdmin(ctx);
    return send(res, 200, { deposits: store.data.manual_deposits });
  }

  if (p === '/api/futgreen/protections/all' && method === 'GET') {
    requireAdmin(ctx);
    return send(res, 200, { protections: store.data.protections });
  }

  /** Monitor admin: eventos abertos / finalizados do dia / histórico por dia */
  if (p === '/api/futgreen/protections/monitor' && method === 'GET') {
    requireAdmin(ctx);
    const dayParam = String(url.searchParams.get('day') || '').trim();
    const todayKey = dayKeyBrazil(new Date());
    const historyDay = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayKey;
    const usersById = Object.fromEntries(store.data.users.map((u) => [u.id, u]));

    const eventKeyOf = (m) =>
      m.external_id || `${m.home_team}|${m.away_team}|${m.starts_at}`;

    const matchById = Object.fromEntries(store.data.matches.map((m) => [m.id, m]));

    const buildClient = (prot) => {
      const u = usersById[prot.user_id];
      const m = matchById[prot.match_id];
      return {
        protection_id: prot.id,
        user_id: prot.user_id,
        user_email: u?.email || prot.user_id,
        user_name: u?.name || null,
        created_at: prot.created_at,
        settled_at: prot.settled_at || null,
        side: prot.side,
        odd: prot.odd,
        amount_cents: prot.amount_cents,
        status: prot.status,
        result: prot.result || null,
        market_name: prot.metadata?.market_name || m?.market_name || null,
        selection_name: prot.metadata?.selection_name || m?.selection_name || null,
        match_id: prot.match_id,
        exchange_url: m?.exchange_url || null,
      };
    };

    const groupEvents = (matchList, { includeProtections = 'all' } = {}) => {
      const byKey = new Map();
      for (const m of matchList) {
        const key = eventKeyOf(m);
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            home_team: m.home_team,
            away_team: m.away_team,
            home_logo: m.home_logo,
            away_logo: m.away_logo,
            league: m.league,
            starts_at: m.starts_at,
            home_score: m.home_score,
            away_score: m.away_score,
            settled_at: m.settled_at || null,
            finished_at: m.finished_at || null,
            exchange_url: m.exchange_url || null,
            external_id: m.external_id || null,
            match_ids: [],
            clients: [],
          });
        }
        const g = byKey.get(key);
        g.match_ids.push(m.id);
        if (m.home_score != null) g.home_score = m.home_score;
        if (m.away_score != null) g.away_score = m.away_score;
        if (m.settled_at) g.settled_at = m.settled_at;
        if (m.finished_at) g.finished_at = m.finished_at;
        if (!g.exchange_url && m.exchange_url) g.exchange_url = m.exchange_url;
      }
      const matchIdSet = new Set([...byKey.values()].flatMap((e) => e.match_ids));
      for (const prot of store.data.protections) {
        if (!matchIdSet.has(prot.match_id)) continue;
        if (includeProtections === 'active' && prot.status !== 'active') continue;
        const m = matchById[prot.match_id];
        if (!m) continue;
        const g = byKey.get(eventKeyOf(m));
        if (!g) continue;
        g.clients.push(buildClient(prot));
      }
      for (const g of byKey.values()) {
        g.clients.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        g.clients_count = g.clients.length;
        g.volume_cents = g.clients.reduce((s, c) => s + (c.amount_cents || 0), 0);
        const phase = deriveMatchPhase({
          starts_at: g.starts_at,
          home_score: g.home_score,
          away_score: g.away_score,
          settled_at: g.settled_at,
          finished_at: g.finished_at,
        });
        g.match_phase = phase.phase;
        g.match_finished = phase.finished;
        g.display_home_score = phase.home_score;
        g.display_away_score = phase.away_score;
      }
      return [...byKey.values()].sort(
        (a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0),
      );
    };

    const openMatches = store.data.matches.filter(
      (m) => m.is_published && !m.settled_at && !m.finished_at,
    );
    const finishedTodayMatches = store.data.matches.filter((m) => {
      if (!(m.settled_at || m.finished_at)) return false;
      if (!(m.is_published || m.published_at || m.settled_at)) return false;
      return (
        isSameDayBrazil(m.starts_at) ||
        isSameDayBrazil(m.settled_at || m.finished_at)
      );
    });
    const historyMatches = store.data.matches.filter((m) => {
      if (!(m.is_published || m.published_at || m.settled_at || m.finished_at)) return false;
      const startDay = dayKeyBrazil(m.starts_at);
      const endDay = dayKeyBrazil(m.settled_at || m.finished_at || m.starts_at);
      if (startDay !== historyDay && endDay !== historyDay) return false;
      // Hoje: só finalizados no histórico (abertos ficam em "Em andamento")
      if (historyDay === todayKey) return Boolean(m.settled_at || m.finished_at);
      return true;
    });

    return send(res, 200, {
      day: historyDay,
      today: todayKey,
      open: groupEvents(openMatches, { includeProtections: 'active' }),
      finished_today: groupEvents(finishedTodayMatches, { includeProtections: 'all' }),
      history: groupEvents(historyMatches, { includeProtections: 'all' }),
    });
  }

  // Webhook Luc Paguei (sem auth de sessão — sempre 200)
  if (
    (p === '/api/futgreen/webhooks/luc-paguei' || p === '/api/webhooks/luc-paguei') &&
    method === 'POST'
  ) {
    try {
      const result = applyLucWebhook(store, body);
      return send(res, 200, result);
    } catch (e) {
      console.error('luc webhook', e);
      return send(res, 200, { ok: true, error: e.message });
    }
  }

  if (p === '/api/futgreen/deposits/pix' && method === 'POST') {
    try {
      const amountCents = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
      const result = await createPixDeposit(store, {
        userId: ctx.user.id,
        amountCents,
        dest: body.dest || 'apostador',
        payer: {
          name: body.payer_name || body.name || ctx.user.name,
          email: body.payer_email || body.email || ctx.user.email,
          document: body.cpf || body.document || body.payer_document || ctx.user.cpf,
        },
        note: body.note || null,
      });
      return send(res, 201, result);
    } catch (e) {
      return send(res, e.status || 400, { error: e.message, code: e.code });
    }
  }

  if (p === '/api/futgreen/deposits/pix' && method === 'GET') {
    try {
      const id = url.searchParams.get('id');
      if (!id) return send(res, 400, { error: 'id obrigatório' });
      const deposit = getUserDeposit(store, { depositId: id, userId: ctx.user.id });
      return send(res, 200, { deposit, auto_confirm: isAutoConfirmGateway() });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/deposits/pix-config' && method === 'GET') {
    return send(res, 200, {
      luc_ready: isLucReady(),
      auto_confirm: isAutoConfirmGateway(),
      ...publicDepositSettings(store),
    });
  }

  if (p === '/api/futgreen/settings/deposit' && method === 'GET') {
    requireAdmin(ctx);
    return send(res, 200, {
      ...publicDepositSettings(store),
      luc_ready: isLucReady(),
      auto_confirm: isAutoConfirmGateway(),
    });
  }

  if (p === '/api/futgreen/settings/deposit' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const settings = setMinDepositReais(store, body.min_deposit_reais ?? body.amount ?? body.min);
      return send(res, 200, {
        ok: true,
        ...publicDepositSettings(store),
        settings,
      });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/deposit-proof' && method === 'POST') {
    // Preferir PIX automático quando Luc estiver configurado e CPF enviado
    const wantsPix = body.pix !== false && body.manual !== true;
    const cpf = String(body.cpf || body.document || body.payer_document || '').replace(/\D/g, '');
    const amountCentsProof = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
    const minCents = getMinDepositCents(store);
    if (!(amountCentsProof >= minCents)) {
      const minReais = (minCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      return send(res, 400, { error: `Depósito mínimo ${minReais}`, code: 'MIN_DEPOSIT', min_deposit_cents: minCents });
    }
    if (wantsPix && isLucReady() && cpf.length === 11) {
      try {
        const result = await createPixDeposit(store, {
          userId: ctx.user.id,
          amountCents: amountCentsProof,
          dest: body.dest || 'apostador',
          payer: {
            name: body.payer_name || body.name || ctx.user.name,
            email: body.payer_email || ctx.user.email,
            document: cpf,
          },
          note: body.note || null,
        });
        return send(res, 201, result);
      } catch (e) {
        return send(res, e.status || 400, { error: e.message, code: e.code });
      }
    }
    const dep = {
      id: store.nextId('dep'),
      user_id: ctx.user.id,
      amount_cents: amountCentsProof,
      dest: body.dest || 'apostador', // apostador | desafio | provedor
      status: 'pending',
      channel: 'manual',
      note: body.note || null,
      proof_ref: body.proof_ref || null,
      created_at: new Date().toISOString(),
    };
    store.data.manual_deposits.push(dep);
    store.save();
    return send(res, 201, { deposit: publicDepositView(dep) });
  }

  if (p === '/api/futgreen/approveManualDeposit' && method === 'POST') {
    requireAdmin(ctx);
    const dep = store.data.manual_deposits.find((d) => d.id === body.deposit_id);
    if (!dep) return send(res, 404, { error: 'Depósito não encontrado' });
    if (dep.status !== 'pending' && dep.status !== 'gateway_paid') {
      return send(res, 400, { error: 'Depósito não está pendente' });
    }
    if (body.mark_only) {
      dep.status = 'already_credited';
      dep.approved_by = ctx.adminEmail;
      dep.approved_at = new Date().toISOString();
      store.save();
      return send(res, 200, { deposit: dep });
    }
    try {
      const result = creditDeposit(store, {
        depositId: dep.id,
        adminEmail: ctx.adminEmail,
        source: 'admin',
      });
      return send(res, 200, { deposit: result.deposit, wallet: result.wallet });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/manual-deposits/reject' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const deposit = rejectManualDeposit(store, {
        depositId: body.deposit_id || body.id,
        adminEmail: ctx.adminEmail,
        note: body.note,
      });
      return send(res, 200, { deposit });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  // —— Financeiro Admin ——
  if (p === '/api/futgreen/financeiro/monitor' && method === 'GET') {
    requireAdmin(ctx);
    ensureCollections(store);
    const day = url.searchParams.get('day') || undefined;
    return send(res, 200, buildFinanceMonitor(store, { day }));
  }

  if (p === '/api/futgreen/withdrawals' && method === 'GET') {
    requireAdmin(ctx);
    ensureCollections(store);
    const usersById = Object.fromEntries(store.data.users.map((u) => [u.id, u]));
    const rows = store.data.withdrawals.map((w) => ({
      ...w,
      user_email: usersById[w.user_id]?.email || w.user_id,
      user_name: usersById[w.user_id]?.name || null,
    }));
    return send(res, 200, {
      withdrawals: rows,
      pending: rows.filter((w) => w.status === 'pending' || w.status === 'approved'),
    });
  }

  if (p === '/api/futgreen/withdrawals/decide' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const result = decideWithdrawal(store, {
        withdrawalId: body.withdrawal_id || body.id,
        action: body.action,
        adminEmail: ctx.adminEmail,
        note: body.note,
      });
      return send(res, 200, result);
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/expenses' && method === 'GET') {
    requireAdmin(ctx);
    ensureCollections(store);
    const rows = store.data.expenses.map((e) => ({
      ...e,
      alert: expenseAlert(e),
    }));
    return send(res, 200, { expenses: rows });
  }

  if (p === '/api/futgreen/expenses' && method === 'POST') {
    requireAdmin(ctx);
    try {
      if (body.mode === 'update' || body.id) {
        const expense = updateExpense(store, {
          id: body.id || body.expense_id,
          patch: body,
          adminEmail: ctx.adminEmail,
        });
        return send(res, 200, { expense: { ...expense, alert: expenseAlert(expense) } });
      }
      const expense = createExpense(store, body, ctx.adminEmail);
      return send(res, 201, { expense: { ...expense, alert: expenseAlert(expense) } });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/area-entries' && method === 'GET') {
    requireAdmin(ctx);
    ensureCollections(store);
    return send(res, 200, {
      areas: FINANCE_AREAS,
      entries: store.data.area_entries,
    });
  }

  if (p === '/api/futgreen/area-entries' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const entry = createAreaEntry(store, body, ctx.adminEmail);
      return send(res, 201, { entry });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/treasury' && method === 'GET') {
    requireAdmin(ctx);
    ensureCollections(store);
    const mon = buildFinanceMonitor(store, {});
    return send(res, 200, {
      ...mon.treasury,
      moves: store.data.treasury_moves,
    });
  }

  if (p === '/api/futgreen/treasury/moves' && method === 'POST') {
    requireAdmin(ctx);
    try {
      const move = createTreasuryMove(store, body, ctx.adminEmail);
      const mon = buildFinanceMonitor(store, {});
      return send(res, 201, { move, treasury: mon.treasury });
    } catch (e) {
      return send(res, e.status || 400, { error: e.message });
    }
  }

  if (p === '/api/futgreen/users' && method === 'GET') {
    requireAdmin(ctx);
    return send(res, 200, {
      users: store.data.users.map((u) => {
        const code = ensureReferralCode(store, u);
        const referrer = u.referred_by ? store.getUser(u.referred_by) : null;
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          is_active: isUserActive(u),
          is_blocked: isUserBlocked(u),
          deposit_only: isDepositOnly(u),
          created_at: u.created_at || null,
          wallet: u.wallet,
          referral_code: code,
          referral_url: buildReferralUrl(code),
          referred_by: u.referred_by || null,
          referred_by_name: referrer?.name || null,
          referrals_count: referralStats(store, u.id).count,
        };
      }),
    });
  }

  if (p === '/api/futgreen/users/set-active' && method === 'POST') {
    requireAdmin(ctx);
    const userId = body.user_id || body.id;
    const user = store.getUser(userId) || store.getUserByEmail(body.email);
    if (!user) return send(res, 404, { error: 'Usuário não encontrado' });
    const next = body.is_active === false || body.active === false ? false : true;
    user.is_active = next;
    user.activated_at = next ? new Date().toISOString() : null;
    user.activated_by = next ? ctx.adminEmail || ctx.user.email : null;
    store.save();
    return send(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: isUserActive(user),
        is_blocked: isUserBlocked(user),
      },
    });
  }

  if (p === '/api/futgreen/users/set-blocked' && method === 'POST') {
    requireAdmin(ctx);
    const userId = body.user_id || body.id;
    const user = store.getUser(userId) || store.getUserByEmail(body.email);
    if (!user) return send(res, 404, { error: 'Usuário não encontrado' });
    if (user.id === ctx.user.id && !ctx.impersonating) {
      return send(res, 400, { error: 'Você não pode bloquear a própria conta' });
    }
    if (isAdminEmail(user.email, ALLOWED_ADMINS)) {
      return send(res, 400, { error: 'Não é permitido bloquear um administrador da allowlist' });
    }
    const next = body.is_blocked === true || body.blocked === true || body.block === true;
    user.is_blocked = next;
    user.blocked_at = next ? new Date().toISOString() : null;
    user.blocked_by = next ? ctx.adminEmail || ctx.user.email : null;
    if (body.reason != null) user.blocked_reason = next ? String(body.reason).slice(0, 200) : null;
    store.save();
    return send(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: isUserActive(user),
        is_blocked: isUserBlocked(user),
      },
    });
  }

  if (p === '/api/futgreen/users/delete' && method === 'POST') {
    requireAdmin(ctx);
    const userId = body.user_id || body.id;
    const user = store.getUser(userId) || store.getUserByEmail(body.email);
    if (!user) return send(res, 404, { error: 'Usuário não encontrado' });
    if (user.id === ctx.user.id && !ctx.impersonating) {
      return send(res, 400, { error: 'Você não pode excluir a própria conta' });
    }
    if (isAdminEmail(user.email, ALLOWED_ADMINS)) {
      return send(res, 400, { error: 'Não é permitido excluir um administrador da allowlist' });
    }
    const removed = store.deleteUser(user.id);
    return send(res, 200, {
      ok: true,
      deleted: { id: removed.id, email: removed.email, name: removed.name },
    });
  }

  if (p === '/api/futgreen/me' && method === 'GET') {
    const code = ensureReferralCode(store, ctx.user);
    const depositOnly = isDepositOnly(ctx.user);
    return send(res, 200, {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        role: ctx.user.role,
        is_active: isUserActive(ctx.user),
        is_blocked: isUserBlocked(ctx.user),
        deposit_only: depositOnly,
        cpf: ctx.user.cpf || ctx.user.document || null,
        phone: ctx.user.phone || null,
        pix_key: ctx.user.pix_key || null,
        created_at: ctx.user.created_at || null,
        referral_code: code,
        referral_url: buildReferralUrl(code),
      },
      wallet: ctx.user.wallet,
      deposit_only: depositOnly,
      admin: Boolean(ctx.adminEmail),
      impersonating: ctx.impersonating,
    });
  }

  if (p === '/api/futgreen/me' && method === 'POST') {
    if (isUserBlocked(ctx.user) && !ctx.adminEmail) {
      return send(res, 403, { error: 'Conta bloqueada pelo administrador', code: 'account_blocked' });
    }
    const user = store.getUser(ctx.user.id);
    if (!user) return send(res, 404, { error: 'Usuário não encontrado' });

    const name = body.name != null ? String(body.name).trim().slice(0, 80) : null;
    if (name !== null) {
      if (!name) return send(res, 400, { error: 'Informe um nome válido' });
      user.name = name;
    }

    if (body.phone != null) {
      const phone = String(body.phone).replace(/[^\d+()\s-]/g, '').trim().slice(0, 32);
      user.phone = phone || null;
    }

    if (body.cpf != null || body.document != null) {
      const cpf = String(body.cpf ?? body.document ?? '').replace(/\D/g, '');
      if (cpf && cpf.length !== 11) {
        return send(res, 400, { error: 'CPF deve ter 11 dígitos' });
      }
      user.cpf = cpf || null;
      user.document = user.cpf;
    }

    if (body.pix_key != null) {
      const pix = String(body.pix_key).trim().slice(0, 120);
      user.pix_key = pix || null;
    }

    user.updated_at = new Date().toISOString();
    store.save();
    const code = ensureReferralCode(store, user);
    return send(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: isUserActive(user),
        is_blocked: isUserBlocked(user),
        cpf: user.cpf || null,
        phone: user.phone || null,
        pix_key: user.pix_key || null,
        created_at: user.created_at || null,
        referral_code: code,
        referral_url: buildReferralUrl(code),
      },
      wallet: user.wallet,
    });
  }

  if (p === '/api/futgreen/referral' && method === 'GET') {
    const code = ensureReferralCode(store, ctx.user);
    const stats = referralStats(store, ctx.user.id);
    return send(res, 200, {
      code,
      url: buildReferralUrl(code),
      count: stats.count,
      users: stats.users,
    });
  }

  if (p === '/api/futgreen/referral/lookup' && method === 'GET') {
    const code = url.searchParams.get('code') || url.searchParams.get('ref') || '';
    const referrer = findUserByReferralCode(store, code);
    if (!referrer) return send(res, 404, { error: 'Código de indicação inválido' });
    ensureReferralCode(store, referrer);
    return send(res, 200, {
      code: referrer.referral_code,
      name: referrer.name || referrer.email.split('@')[0],
    });
  }

  if (p === '/api/futgreen/auth/register' && method === 'POST') {
    const { email, password, name } = assertAuthPayload(body, { requireName: true });
    if (store.getUserByEmail(email)) {
      return send(res, 409, { error: 'Este e-mail já possui conta' });
    }
    const asAdmin = isAdminEmail(email, ALLOWED_ADMINS);
    const user = store.upsertUser({
      email,
      name,
      role: asAdmin ? 'admin' : 'client',
      password_hash: await hashPassword(password),
      wallet: emptyWallet(),
      // Novos clientes: acesso só depósito até o 1º PIX creditado
      is_active: asAdmin,
    });
    ensureReferralCode(store, user);
    const refCode = body.ref || body.referral_code || body.referred_by_code || '';
    if (refCode) attachReferrer(store, user, refCode);
    const depositOnly = isDepositOnly(user);
    return send(res, 201, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: isUserActive(user),
        deposit_only: depositOnly,
        referral_code: user.referral_code,
      },
      deposit_only: depositOnly,
      pending_activation: depositOnly,
    });
  }

  if (p === '/api/futgreen/auth/login' && method === 'POST') {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    if (!email || !password) {
      return send(res, 400, { error: 'Informe e-mail e senha' });
    }
    const user = store.getUserByEmail(email);
    if (!user?.password_hash) {
      return send(res, 401, { error: 'Credenciais inválidas' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return send(res, 401, { error: 'Credenciais inválidas' });
    if (isUserBlocked(user)) {
      return send(res, 403, {
        error: 'Conta bloqueada pelo administrador',
        code: 'account_blocked',
      });
    }
    const depositOnly = isDepositOnly(user);
    return send(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: isUserActive(user),
        is_blocked: false,
        deposit_only: depositOnly,
      },
      deposit_only: depositOnly,
    });
  }

  return send(res, 404, { error: `Rota não encontrada: ${p}` });
}

function settleMatch(res, ctx, body) {
  const m = store.data.matches.find((x) => x.id === (body.match_id || body.id));
  if (!m) return send(res, 404, { error: 'Jogo não encontrado' });
  m.home_score = body.home_score != null ? Number(body.home_score) : m.home_score;
  m.away_score = body.away_score != null ? Number(body.away_score) : m.away_score;
  m.settled_at = new Date().toISOString();
  m.finished_at = m.settled_at;
  m.live = false;
  m.is_published = false;
  // Espelha placar final no mesmo evento
  for (const s of store.data.matches) {
    if (s.id === m.id) continue;
    const same =
      (m.external_id && s.external_id === m.external_id) ||
      (s.home_team === m.home_team && s.away_team === m.away_team && s.starts_at === m.starts_at);
    if (!same) continue;
    s.home_score = m.home_score;
    s.away_score = m.away_score;
    s.finished_at = m.finished_at;
    s.live = false;
  }

  const outcome = String(body.outcome || body.result || '').toLowerCase();
  const settled = [];
  for (const p of store.data.protections.filter((x) => x.match_id === m.id && x.status === 'active')) {
    const row = settleProtection(store, {
      protectionId: p.id,
      outcome,
      adminEmail: ctx.adminEmail,
    });
    settled.push(row);
  }
  store.save();
  return send(res, 200, { match: m, protections: settled });
}

function resolveStatic(urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  if (rel === '/local' || rel === '/local/') rel = '/local/index.html';
  rel = decodeURIComponent(rel.split('?')[0]);
  const filePath = path.join(ROOT, rel.replace(/^\//, ''));
  if (filePath.startsWith(ROOT) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return filePath;
  }
  const alt = path.join(ROOT, 'public', rel.replace(/^\//, ''));
  if (fs.existsSync(alt) && fs.statSync(alt).isFile()) return alt;
  return null;
}

function serveStatic(req, res, urlPath) {
  const filePath = resolveStatic(urlPath);
  if (!filePath) return send(res, 404, 'Not found');
  return streamFile(res, filePath);
}

function streamFile(res, filePath) {
  const ext = path.extname(filePath);
  let data = fs.readFileSync(filePath);
  if (ext === '.html') {
    let html = data.toString('utf8');
    if (IS_LOCAL) {
      html = injectLivereload(html);
    } else if (!html.includes('data-fg-force-https')) {
      // Produção: se a página abrir em HTTP (cache/bookmark), sobe para HTTPS
      html = html.replace(
        /<head([^>]*)>/i,
        '<head$1><script data-fg-force-https>if(location.protocol==="http:"&&/(^|\\.)futgreen\\.com\\.br$/i.test(location.hostname))location.replace("https://futgreen.com.br"+location.pathname+location.search+location.hash)</script>',
      );
    }
    data = Buffer.from(html, 'utf8');
  }
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    ...(IS_LOCAL ? { 'Cache-Control': 'no-store' } : { 'Cache-Control': 'no-cache' }),
  });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/__livereload' && IS_LOCAL) {
      return attachLivereload(req, res);
    }

    if (url.pathname === '/health') {
      return send(res, 200, {
        ok: true,
        service: 'futgreen',
        local: IS_LOCAL,
        workshop: IS_LOCAL ? '/local/' : null,
        ...protectionHealthPayload(),
        release: 'futgreen-1.0.0',
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    // Atalho curto: /r/{codigo} → cadastro com ref
    const shortRef = url.pathname.match(/^\/r\/([a-zA-Z0-9_-]{4,32})\/?$/);
    if (shortRef) {
      res.writeHead(302, { Location: `/cadastro.html?ref=${encodeURIComponent(shortRef[1].toLowerCase())}` });
      res.end();
      return;
    }

    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.message || 'Erro interno' });
  }
});

if (IS_LOCAL) {
  watchForReload(ROOT);
}

async function boot() {
  if (IS_LOCAL) {
    const fixed = await ensureLocalSeedPasswords(store);
    if (fixed.changed) {
      console.log(`Local auth: senhas seed aplicadas (${LOCAL_DEV_PASSWORD})`);
    }
  }
  startLiveScoreScheduler(store, { intervalMs: 45_000 });
  console.log('Live score sync: ON (TheSportsDB · 45s)');
  const onListen = () => {
    const where = LISTEN_HOST ? `${LISTEN_HOST}:${PORT}` : `0.0.0.0:${PORT}`;
    console.log(`FutGreen listening on http://${where}`);
    console.log(`Health: http://127.0.0.1:${PORT}/health`);
    if (IS_LOCAL) {
      console.log(`Workshop: http://localhost:${PORT}/local/`);
      console.log(`Local login: admin@futgreen.local / ${LOCAL_DEV_PASSWORD}`);
      console.log('Live reload: ON');
    }
    console.log(`Admin allowlist: ${ALLOWED_ADMINS.join(', ')}`);
  };
  if (LISTEN_HOST) server.listen(PORT, LISTEN_HOST, onListen);
  else server.listen(PORT, onListen);
}

boot().catch((e) => {
  console.error(e);
  process.exit(1);
});
