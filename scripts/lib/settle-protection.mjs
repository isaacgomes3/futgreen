import {
  PROTECTION_OUTCOMES,
  calcIndicationEconomics,
  resolveCanonicalOdd,
  LOCKS_STAKE_ON_CREATE,
  assertPreKickoff,
} from './protection-flow-contract.mjs';

/**
 * Liquidação admin: REEMBOLSO / GANHO / ANULA / CANCELAR
 * v12: entrada sem trava — GANHO/ANULA sem movimento; REEMBOLSO credita Saldo Reembolso.
 */
export function settleProtection(store, { protectionId, outcome, adminEmail, cancelledBy = null }) {
  const p = store.data.protections.find((x) => x.id === protectionId);
  if (!p) throw Object.assign(new Error('Proteção não encontrada'), { status: 404 });
  if (p.status !== 'active') {
    throw Object.assign(new Error('Proteção não está ativa'), { status: 400 });
  }

  const user = store.getUser(p.user_id);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  const oc = String(outcome || '').toLowerCase();
  const stake = p.amount_cents;
  const didLock = Boolean(p.locks_stake ?? LOCKS_STAKE_ON_CREATE);

  // Só destrava se esta proteção chegou a travar (legado v11-)
  if (didLock) {
    user.wallet.locked_balance_cents = Math.max(0, (user.wallet.locked_balance_cents || 0) - stake);
  }

  if (oc === PROTECTION_OUTCOMES.REEMBOLSO) {
    // Indicação falhou → credita stake integral no Saldo Reembolso
    user.wallet.deduction_balance_cents = (user.wallet.deduction_balance_cents || 0) + stake;
    p.status = 'settled_reembolso';
    p.result = 'reembolso';
    store.addTx({
      user_id: user.id,
      type: 'protection_settlement',
      amount_cents: stake,
      bucket: 'deduction_balance_cents',
      ref_id: p.id,
      meta: { outcome: 'reembolso', admin: adminEmail },
    });
  } else if (oc === PROTECTION_OUTCOMES.GANHO) {
    // Lucro já na BetBra — sem movimento de carteira (v12)
    if (didLock) {
      user.wallet.balance_cents = (user.wallet.balance_cents || 0) + stake;
    }
    const odd = resolveCanonicalOdd(p);
    const economics = calcIndicationEconomics({ side: p.side, amountCents: stake, odd });
    p.fee_cents = 0;
    p.economics = economics;
    store.addTx({
      user_id: user.id,
      type: 'protection_settlement',
      amount_cents: 0,
      bucket: 'balance_cents',
      ref_id: p.id,
      meta: {
        outcome: 'ganho',
        admin: adminEmail,
        economics,
        note: 'ganho_betbra_sem_movimento_carteira',
      },
    });
    p.status = 'settled_ganho';
    p.result = 'ganho';
  } else if (oc === PROTECTION_OUTCOMES.ANULA || oc === PROTECTION_OUTCOMES.CANCELAR) {
    // Empate anula / void / cancelamento: sem P&L
    if (didLock) {
      user.wallet.balance_cents = (user.wallet.balance_cents || 0) + stake;
    }
    p.status = oc === 'cancelar' ? 'cancelled' : 'settled_anula';
    p.result = oc;
    store.addTx({
      user_id: user.id,
      type: oc === 'cancelar' ? 'protection_refund' : 'protection_release',
      amount_cents: didLock ? stake : 0,
      bucket: 'balance_cents',
      ref_id: p.id,
      meta: {
        outcome: oc,
        admin: adminEmail,
        cancelled_by_client: cancelledBy || null,
        note: cancelledBy ? 'client_cancel_pre_kickoff' : 'sem_pl',
      },
    });
  } else {
    throw Object.assign(new Error('outcome inválido'), { status: 400 });
  }

  p.settled_at = new Date().toISOString();
  p.settled_by = adminEmail || (cancelledBy ? `client:${cancelledBy}` : null);
  store.save();
  return p;
}

/**
 * Cliente cancela a própria proteção ativa — só antes do kickoff.
 * Mesmo efeito de cancelar admin: sem P&L (entrada sem trava).
 */
export function cancelProtectionByClient(store, { protectionId, userId, now = new Date() }) {
  const p = store.data.protections.find((x) => x.id === protectionId);
  if (!p) throw Object.assign(new Error('Proteção não encontrada'), { status: 404 });
  if (p.user_id !== userId) {
    throw Object.assign(new Error('Proteção de outro usuário'), { status: 403, code: 'NOT_OWNER' });
  }
  if (p.status !== 'active') {
    throw Object.assign(new Error('Proteção não está ativa'), { status: 400 });
  }
  const match = store.data.matches.find((m) => m.id === p.match_id);
  if (!match) throw Object.assign(new Error('Evento não encontrado'), { status: 404 });
  try {
    assertPreKickoff(match.starts_at, now);
  } catch (e) {
    throw Object.assign(new Error('Cancelamento só antes do início da partida'), {
      status: 400,
      code: 'PRE_KICKOFF',
    });
  }
  return settleProtection(store, {
    protectionId,
    outcome: PROTECTION_OUTCOMES.CANCELAR,
    adminEmail: null,
    cancelledBy: userId,
  });
}

/**
 * protecao-evento-suspenso-v1: admin cancela o evento inteiro.
 * Por segurança, NUNCA cancela evento em andamento (protege quem já está
 * participando) — suspende novas entradas e avisa "Evento suspenso" em vez de
 * derrubar o card com estorno. Antes do kickoff, cancela normalmente (estorna
 * todas as proteções ativas via CANCELAR, sem P&L).
 */
export function cancelMatchByAdmin(store, { matchId, adminEmail, now = new Date() }) {
  const m = store.data.matches.find((x) => x.id === matchId);
  if (!m) throw Object.assign(new Error('Jogo não encontrado'), { status: 404 });
  if (m.settled_at) throw Object.assign(new Error('Jogo já liquidado'), { status: 400 });

  const kickoff = new Date(m.starts_at).getTime();
  const isLive = Number.isFinite(kickoff) && now.getTime() >= kickoff && !m.finished_at;
  if (isLive) {
    m.suspended = true;
    m.suspended_at = new Date().toISOString();
    store.save();
    throw Object.assign(
      new Error('Evento suspenso — partida em andamento. Proteção mantida para quem já está participando; novas entradas bloqueadas.'),
      { status: 403, code: 'EVENT_SUSPENDED' },
    );
  }

  const cancelled = [];
  for (const p of store.data.protections.filter((x) => x.match_id === matchId && x.status === 'active')) {
    cancelled.push(settleProtection(store, { protectionId: p.id, outcome: PROTECTION_OUTCOMES.CANCELAR, adminEmail }));
  }
  m.is_published = false;
  m.cancelled_at = new Date().toISOString();
  store.save();
  return { match: m, cancelled };
}

/** Encerrar sem estorno (protection-close) */
export function closeProtection(store, { protectionId, adminEmail }) {
  const p = store.data.protections.find((x) => x.id === protectionId);
  if (!p) throw Object.assign(new Error('Proteção não encontrada'), { status: 404 });
  if (p.status !== 'active') throw Object.assign(new Error('Proteção não está ativa'), { status: 400 });

  const user = store.getUser(p.user_id);
  const didLock = Boolean(p.locks_stake ?? LOCKS_STAKE_ON_CREATE);
  if (didLock) {
    user.wallet.locked_balance_cents = Math.max(0, (user.wallet.locked_balance_cents || 0) - p.amount_cents);
  }
  p.status = 'closed';
  p.result = 'closed';
  p.settled_at = new Date().toISOString();
  p.settled_by = adminEmail || null;
  store.addTx({
    user_id: user.id,
    type: 'protection_settlement',
    amount_cents: didLock ? p.amount_cents : 0,
    bucket: didLock ? 'locked_balance_cents' : 'balance_cents',
    ref_id: p.id,
    meta: { outcome: 'close_no_refund', admin: adminEmail },
  });
  store.save();
  return p;
}
