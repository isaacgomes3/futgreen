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
import { protectionHealthPayload } from './lib/protection-flow-contract.mjs';
import { assertTransferAllowed, labelForTxType, labelForBucket } from './lib/wallet-buckets-contract.mjs';
import { parseAllowedAdminEmails, isAdminEmail } from './lib/admin-ops-contract.mjs';
import { createProtection } from './lib/create-protection.mjs';
import { settleProtection, closeProtection } from './lib/settle-protection.mjs';
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
import { fetchPreliveEvents, getEvent, normalizePreliveEvent } from './lib/betbra-client.mjs';
import {
  searchFootballTeams,
  enrichEventLogos,
  enrichEventsLogos,
  resolveTeamLogo,
  loadDiskCache,
  saveDiskCache,
} from './lib/football-teams.mjs';

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
  const email = req.headers['x-user-email'] || req.headers['x-admin-email'] || 'cliente@futgreen.local';
  let user = store.getUserByEmail(email);
  if (!user) {
    user = store.upsertUser({
      email,
      name: String(email).split('@')[0],
      role: isAdminEmail(email, ALLOWED_ADMINS) ? 'admin' : 'client',
      wallet: {
        balance_cents: 500000,
        deduction_balance_cents: 0,
        locked_balance_cents: 0,
        desafio_balance_cents: 0,
        investor_balance_cents: 0,
        demo_balance_cents: 100000,
      },
    });
  }
  const impersonate = req.headers['x-impersonate'];
  if (impersonate && isAdminEmail(email, ALLOWED_ADMINS)) {
    const target = store.getUserByEmail(impersonate) || store.getUser(impersonate);
    if (target) return { user: target, adminEmail: email, impersonating: true };
  }
  return { user, adminEmail: isAdminEmail(email, ALLOWED_ADMINS) ? email : null, impersonating: false };
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

  // —— Matches / proteção ——
  if (p === '/api/futgreen/matches' && method === 'GET') {
    const all = url.searchParams.get('all') === '1';
    const rows = store.data.matches.filter((m) => (all ? true : m.is_published && !m.settled_at));
    let changed = false;
    for (const m of rows) {
      if (!m.home_logo || !m.away_logo) {
        try {
          if (!m.home_logo) {
            m.home_logo = await resolveTeamLogo(m.home_team);
            changed = true;
          }
          if (!m.away_logo) {
            m.away_logo = await resolveTeamLogo(m.away_team);
            changed = true;
          }
        } catch { /* opcional */ }
      }
    }
    if (changed) {
      saveDiskCache(DATA_DIR);
      store.save();
    }
    return send(res, 200, { matches: rows });
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

  if (p === '/api/futgreen/prelive-import' && method === 'POST') {
    requireAdmin(ctx);
    try {
      let ev = body.event || null;
      if (!ev && body.external_id) {
        const full = await getEvent(body.external_id);
        ev = normalizePreliveEvent(full);
      }
      if (!ev) return send(res, 400, { error: 'event ou external_id obrigatório' });
      ev = await enrichEventLogos(ev);
      saveDiskCache(DATA_DIR);

      const dest = body.dest || 'proteger'; // proteger | desafio
      if (dest === 'desafio') {
        const hint = ev.desafio_hint || {};
        const bundle = await createDesafio(store, {
          title: body.title || `${ev.home_team} × ${ev.away_team}`,
          publish: Boolean(body.publish ?? true),
          steps: [
            {
              home_team: ev.home_team,
              away_team: ev.away_team,
              home_logo: ev.home_logo,
              away_logo: ev.away_logo,
              bet_team_side: body.bet_team_side || hint.bet_team_side || 'away',
              odd_futgreen: Number(body.odd_futgreen || hint.odd_futgreen || 3.5),
              odd_casa: Number(body.odd_casa || hint.odd_casa || 1.5),
              liquidity: Number(body.liquidity || hint.liquidity || 0),
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

      const match = {
        id: store.nextId('match'),
        home_team: ev.home_team,
        away_team: ev.away_team,
        home_logo: ev.home_logo,
        away_logo: ev.away_logo,
        league: ev.league,
        starts_at: ev.starts_at,
        is_published: Boolean(body.publish),
        published_at: body.publish ? new Date().toISOString() : null,
        home_score: null,
        away_score: null,
        source: 'betbra',
        external_id: ev.external_id,
        exchange_url: ev.exchange_url,
        odds_snapshot: ev.odds,
        created_at: new Date().toISOString(),
        settled_at: null,
      };
      store.data.matches.push(match);
      store.save();
      return send(res, 201, { kind: 'proteger', match, event: ev });
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

  if (p === '/api/futgreen/match-settle' && method === 'POST') {
    requireAdmin(ctx);
    return settleMatch(res, ctx, body);
  }

  if (p === '/api/futgreen/match-live-sync' && method === 'POST') {
    requireAdmin(ctx);
    const m = store.data.matches.find((x) => x.id === body.match_id);
    if (!m) return send(res, 404, { error: 'Jogo não encontrado' });
    m.home_score = Number(body.home_score);
    m.away_score = Number(body.away_score);
    m.live = true;
    store.save();
    return send(res, 200, { match: m });
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
    return send(res, 200, { desafios: unlocked ? published : [], unlocked, wallet: ctx.user.wallet });
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
    const amount = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
    const u = store.getUser(ctx.user.id);
    if ((u.wallet.deduction_balance_cents || 0) < amount || !(amount > 0)) {
      return send(res, 400, { error: 'Saldo Reembolso insuficiente' });
    }
    u.wallet.deduction_balance_cents -= amount;
    store.addTx({
      user_id: u.id,
      type: 'deduction_withdraw',
      amount_cents: amount,
      bucket: 'deduction_balance_cents',
      meta: { pix_key: body.pix_key || null },
    });
    store.save();
    return send(res, 200, { wallet: u.wallet, status: 'requested' });
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

  if (p === '/api/futgreen/deposit-proof' && method === 'POST') {
    const dep = {
      id: store.nextId('dep'),
      user_id: ctx.user.id,
      amount_cents: Math.round(Number(body.amount_cents ?? Number(body.amount) * 100)),
      dest: body.dest || 'apostador', // apostador | desafio | provedor
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    store.data.manual_deposits.push(dep);
    store.save();
    return send(res, 201, { deposit: dep });
  }

  if (p === '/api/futgreen/approveManualDeposit' && method === 'POST') {
    requireAdmin(ctx);
    const dep = store.data.manual_deposits.find((d) => d.id === body.deposit_id);
    if (!dep) return send(res, 404, { error: 'Depósito não encontrado' });
    if (body.mark_only) {
      dep.status = 'already_credited';
      store.save();
      return send(res, 200, { deposit: dep });
    }
    const u = store.getUser(dep.user_id);
    const bucket =
      dep.dest === 'desafio'
        ? 'desafio_balance_cents'
        : dep.dest === 'provedor'
          ? 'investor_balance_cents'
          : 'balance_cents';
    u.wallet[bucket] = (u.wallet[bucket] || 0) + dep.amount_cents;
    dep.status = 'credited';
    dep.approved_by = ctx.adminEmail;
    dep.approved_at = new Date().toISOString();
    const type =
      dep.dest === 'desafio' ? 'desafio_deposit' : dep.dest === 'provedor' ? 'provider_deposit' : 'manual_deposit';
    store.addTx({ user_id: u.id, type, amount_cents: dep.amount_cents, bucket, ref_id: dep.id });
    store.save();
    return send(res, 200, { deposit: dep, wallet: u.wallet });
  }

  if (p === '/api/futgreen/users' && method === 'GET') {
    requireAdmin(ctx);
    return send(res, 200, {
      users: store.data.users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        wallet: u.wallet,
      })),
    });
  }

  if (p === '/api/futgreen/me' && method === 'GET') {
    return send(res, 200, {
      user: { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, role: ctx.user.role },
      wallet: ctx.user.wallet,
      admin: Boolean(ctx.adminEmail),
      impersonating: ctx.impersonating,
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
  m.is_published = false;

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
  if (ext === '.html' && IS_LOCAL) {
    data = Buffer.from(injectLivereload(data.toString('utf8')), 'utf8');
  }
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    ...(IS_LOCAL ? { 'Cache-Control': 'no-store' } : {}),
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

    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.message || 'Erro interno' });
  }
});

if (IS_LOCAL) {
  watchForReload(ROOT);
}

server.listen(PORT, () => {
  console.log(`FutGreen listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  if (IS_LOCAL) {
    console.log(`Workshop: http://localhost:${PORT}/local/`);
    console.log('Live reload: ON');
  }
  console.log(`Admin allowlist: ${ALLOWED_ADMINS.join(', ')}`);
});
