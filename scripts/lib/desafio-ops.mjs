import { MAX_ENTRIES_PER_CYCLE, zebraPayoutCents, resolveDesafioMarketResult } from './desafio-ciclo-math.mjs';
import { assertCanCancelOrDeleteDesafio, editDesafioPreservesPublication } from './admin-ops-contract.mjs';
import { resolveTeamLogo } from './football-teams.mjs';

export function listPublishedDesafios(store) {
  return store.data.desafios.filter((d) => d.is_published && d.is_active && !d.deleted_at);
}

export function getDesafioBundle(store, desafioId) {
  const desafio = store.data.desafios.find((d) => d.id === desafioId);
  if (!desafio) return null;
  const steps = store.data.desafio_steps
    .filter((s) => s.desafio_id === desafioId && !s.deleted_at)
    .sort((a, b) => (a.step_index || 0) - (b.step_index || 0));
  return { desafio, steps };
}

export async function createDesafio(store, payload) {
  const id = store.nextId('des');
  const now = new Date().toISOString();
  const publish = Boolean(payload.publish || payload.publish_on_save);
  const desafio = {
    id,
    title: payload.title || 'Desafio FUTGRN',
    is_published: publish,
    is_active: publish,
    published_at: publish ? now : null,
    created_at: now,
    deleted_at: null,
    target_profit: payload.target_profit ?? 0.05,
  };
  store.data.desafios.push(desafio);

  const stepsIn = Array.isArray(payload.steps) ? payload.steps : [];
  for (let i = 0; i < stepsIn.length; i++) {
    const s = stepsIn[i];
    let home_logo = s.home_logo || null;
    let away_logo = s.away_logo || null;
    if (!home_logo || !away_logo) {
      try {
        const [hl, al] = await Promise.all([
          home_logo ? Promise.resolve(home_logo) : resolveTeamLogo(s.home_team),
          away_logo ? Promise.resolve(away_logo) : resolveTeamLogo(s.away_team),
        ]);
        home_logo = home_logo || hl;
        away_logo = away_logo || al;
      } catch { /* logos opcionais */ }
    }
    store.data.desafio_steps.push({
      id: store.nextId('step'),
      desafio_id: id,
      step_index: s.step_index ?? i + 1,
      home_team: s.home_team,
      away_team: s.away_team,
      home_logo,
      away_logo,
      bet_team_side: s.bet_team_side || 'home',
      odd_futgreen: Number(s.odd_futgreen || s.odd_arbishield || s.oddArbi),
      odd_casa: Number(s.odd_casa || s.oddCasa),
      casa_name: s.casa_name || 'Casa',
      casa_logo: s.casa_logo || '/public/assets/casa-default.svg',
      casa_link: s.casa_link || null,
      liquidity: Number(s.liquidity || s.liquidez || 0),
      starts_at: s.starts_at,
      status: publish ? 'published' : 'draft',
      result: null,
      winning_side: null,
      market_flag: s.market_flag || 'dnb',
      house_commission: s.house_commission ?? 0.045,
      external_id: s.external_id || null,
      exchange_url: s.exchange_url || null,
      deleted_at: null,
    });
  }

  store.save();
  return getDesafioBundle(store, id);
}

export function editDesafio(store, desafioId, patch, mode = 'edit_only') {
  const existing = store.data.desafios.find((d) => d.id === desafioId);
  if (!existing) throw Object.assign(new Error('Desafio não encontrado'), { status: 404 });
  const merged = editDesafioPreservesPublication(existing, patch, mode);
  Object.assign(existing, merged);
  if (Array.isArray(patch.steps)) {
    for (const s of patch.steps) {
      const row = store.data.desafio_steps.find((x) => x.id === s.id && x.desafio_id === desafioId);
      if (row) Object.assign(row, s, { is_active: undefined });
    }
  }
  store.save();
  return getDesafioBundle(store, desafioId);
}

export function registerDesafioEntry(store, { userId, desafioId, stepId, stakeCents, now = new Date() }) {
  const user = store.getUser(userId);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  const bundle = getDesafioBundle(store, desafioId);
  if (!bundle || !bundle.desafio.is_published) {
    throw Object.assign(new Error('Desafio não disponível'), { status: 400 });
  }

  const step = bundle.steps.find((s) => s.id === stepId);
  if (!step) throw Object.assign(new Error('Etapa não encontrada'), { status: 404 });
  if (step.status === 'live' || step.status === 'done') {
    throw Object.assign(new Error('Entrada bloqueada nesta etapa'), { status: 400 });
  }
  if (now.getTime() >= new Date(step.starts_at).getTime()) {
    throw Object.assign(new Error('Entrada só antes do kickoff'), { status: 400 });
  }

  const pending = store.data.desafio_participations.find(
    (p) => p.user_id === userId && p.status === 'pending',
  );
  if (pending) {
    throw Object.assign(new Error('Já existe participação pendente'), { status: 409 });
  }

  const dup = store.data.desafio_participations.find(
    (p) => p.user_id === userId && p.step_id === stepId && p.side === 'futgreen' && p.status !== 'cancelled',
  );
  if (dup) {
    throw Object.assign(new Error('Já registrado neste step+side'), { status: 409 });
  }

  const cycleCount = store.data.desafio_participations.filter(
    (p) => p.user_id === userId && p.desafio_id === desafioId && p.status !== 'cancelled',
  ).length;
  if (cycleCount >= MAX_ENTRIES_PER_CYCLE) {
    throw Object.assign(new Error('Máximo 5 entradas no ciclo'), { status: 400 });
  }

  const stake = Math.round(Number(stakeCents));
  if (!(stake > 0)) throw Object.assign(new Error('stake inválido'), { status: 400 });
  if ((user.wallet.desafio_balance_cents || 0) < stake) {
    throw Object.assign(new Error('Carteira Desafio insuficiente'), { status: 400 });
  }
  if ((user.wallet.desafio_balance_cents || 0) <= 0) {
    throw Object.assign(new Error('Grade só libera com Carteira Desafio > 0'), { status: 400 });
  }

  // Debita stake (PATCH direto — sem linha desafio_entry no ledger)
  user.wallet.desafio_balance_cents -= stake;

  const part = {
    id: store.nextId('part'),
    user_id: userId,
    desafio_id: desafioId,
    step_id: stepId,
    side: 'futgreen',
    stake_cents: stake,
    odd: step.odd_futgreen,
    status: 'pending',
    result: null,
    created_at: new Date().toISOString(),
  };
  store.data.desafio_participations.push(part);
  store.save();
  return part;
}

export function settleDesafioStep(store, { stepId, winningSide, adminEmail, homeScore, awayScore }) {
  const step = store.data.desafio_steps.find((s) => s.id === stepId);
  if (!step) throw Object.assign(new Error('Etapa não encontrada'), { status: 404 });

  let side = String(winningSide || '').toLowerCase();
  // Aliases UI
  if (side === 'arbishield' || side === 'futgreen' || side === 'zebra') side = 'futgreen';
  if (side === 'casa' || side === 'house') side = 'casa';
  if (side === 'void' || side === 'empate_anula' || side === 'anula') side = 'void';

  const resolved = resolveDesafioMarketResult({
    marketFlag: step.market_flag,
    winningSide: side,
    homeScore,
    awayScore,
    betTeamSide: step.bet_team_side,
  });

  const finalSide = resolved.reason === 'empate_anula' ? 'void' : side;

  step.winning_side = finalSide;
  step.result =
    finalSide === 'futgreen' ? 'zebra_protected' : finalSide === 'casa' ? 'win' : 'empate_anula';
  step.status = 'done';
  step.settled_at = new Date().toISOString();
  step.settled_by = adminEmail || null;
  if (homeScore != null) step.home_score = Number(homeScore);
  if (awayScore != null) step.away_score = Number(awayScore);

  const parts = store.data.desafio_participations.filter(
    (p) => p.step_id === stepId && p.status === 'pending',
  );

  for (const part of parts) {
    const user = store.getUser(part.user_id);
    if (!user) continue;

    if (finalSide === 'futgreen') {
      const credit = zebraPayoutCents(part.stake_cents, part.odd || step.odd_futgreen);
      user.wallet.desafio_balance_cents = (user.wallet.desafio_balance_cents || 0) + credit;
      part.status = 'settled';
      part.result = 'won';
      // settle costuma creditar via PATCH — label opcional
    } else if (finalSide === 'casa') {
      part.status = 'settled';
      part.result = 'lost';
      // Sem crédito — stake fica com a plataforma
    } else {
      // void — devolve stake
      user.wallet.desafio_balance_cents = (user.wallet.desafio_balance_cents || 0) + part.stake_cents;
      part.status = 'settled';
      part.result = 'void';
      store.addTx({
        user_id: user.id,
        type: 'desafio_void_refund',
        amount_cents: part.stake_cents,
        bucket: 'desafio_balance_cents',
        ref_id: part.id,
        meta: { step_id: stepId, admin: adminEmail },
      });
    }
  }

  store.save();
  return { step, settled: parts.length };
}

export function cancelDesafio(store, { desafioId, email, participationId }) {
  if (participationId) {
    const part = store.data.desafio_participations.find((p) => p.id === participationId);
    if (!part || part.status !== 'pending') {
      throw Object.assign(new Error('Participação não cancelável'), { status: 400 });
    }
    const user = store.getUser(part.user_id);
    user.wallet.desafio_balance_cents = (user.wallet.desafio_balance_cents || 0) + part.stake_cents;
    part.status = 'cancelled';
    store.addTx({
      user_id: user.id,
      type: 'desafio_cancel_refund',
      amount_cents: part.stake_cents,
      bucket: 'desafio_balance_cents',
      ref_id: part.id,
    });
    store.save();
    return { cancelled: part };
  }

  const bundle = getDesafioBundle(store, desafioId);
  if (!bundle) throw Object.assign(new Error('Desafio não encontrado'), { status: 404 });

  const liveStep = bundle.steps.find((s) => s.status === 'live');
  assertCanCancelOrDeleteDesafio({ stepStatus: liveStep ? 'live' : 'published', email });

  for (const part of store.data.desafio_participations.filter(
    (p) => p.desafio_id === desafioId && p.status === 'pending',
  )) {
    const user = store.getUser(part.user_id);
    user.wallet.desafio_balance_cents = (user.wallet.desafio_balance_cents || 0) + part.stake_cents;
    part.status = 'cancelled';
    store.addTx({
      user_id: user.id,
      type: 'desafio_cancel_refund',
      amount_cents: part.stake_cents,
      bucket: 'desafio_balance_cents',
      ref_id: part.id,
    });
  }
  bundle.desafio.is_active = false;
  bundle.desafio.is_published = false;
  bundle.desafio.cancelled_at = new Date().toISOString();
  store.save();
  return { cancelled: bundle.desafio };
}

export function softDeleteDesafio(store, { desafioId, email, force = false, confirm = false }) {
  if (!confirm) throw Object.assign(new Error('confirm obrigatório'), { status: 400 });
  const d = store.data.desafios.find((x) => x.id === desafioId);
  if (!d) throw Object.assign(new Error('Desafio não encontrado'), { status: 404 });
  if ((d.is_active || d.is_published) && !force) {
    throw Object.assign(new Error('Não apaga ativo/publicado sem force'), { status: 400 });
  }
  const steps = store.data.desafio_steps.filter((s) => s.desafio_id === desafioId);
  const live = steps.find((s) => s.status === 'live');
  assertCanCancelOrDeleteDesafio({ stepStatus: live ? 'live' : 'draft', email, force });
  d.deleted_at = new Date().toISOString();
  store.save();
  return d;
}
