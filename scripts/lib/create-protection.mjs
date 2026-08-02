import {
  assertPreKickoff,
  maxLockableCents,
  CREATE_PROTECTION_MODEL,
  LOCKS_STAKE_ON_CREATE,
} from './protection-flow-contract.mjs';

/**
 * Cria proteção (indicação Proteger) — v12:
 * - NÃO trava stake / NÃO move Saldo Apostador
 * - Registra valor da entrada BetBra (stake ou responsabilidade)
 * - Teto 50% do Apostador como cobertura máxima de reembolso
 * - 1 op ativa por user+match
 */
export function createProtection(store, { userId, matchId, side, odd, amountCents, now = new Date() }) {
  const user = store.getUser(userId);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  const match = store.data.matches.find((m) => m.id === matchId);
  if (!match || !match.is_published) {
    throw Object.assign(new Error('Jogo não publicado'), { status: 400 });
  }

  assertPreKickoff(match.starts_at, now);

  const sideU = String(match.side || side || 'LAY').toUpperCase();
  if (sideU !== 'LAY' && sideU !== 'BACK') {
    throw Object.assign(new Error('side deve ser LAY ou BACK'), { status: 400 });
  }
  if (match.side && side != null && String(side).trim() !== '' && String(side).toUpperCase() !== sideU) {
    throw Object.assign(new Error('Lado fixado pela indicação FutGreen'), { status: 400, code: 'SIDE_LOCKED' });
  }

  const amount = Math.round(Number(amountCents));
  if (!(amount > 0)) throw Object.assign(new Error('valor inválido'), { status: 400 });

  let oddN = Number(odd);
  if (!(oddN > 1) && match.odd != null) oddN = Number(match.odd);
  if (!(oddN > 1)) {
    throw Object.assign(new Error('odd inválida'), { status: 400 });
  }

  const active = store.data.protections.find(
    (p) => p.user_id === userId && p.match_id === matchId && p.status === 'active',
  );
  if (active) {
    throw Object.assign(new Error('Já existe proteção ativa neste evento'), { status: 409, code: 'ONE_OP_PER_EVENT' });
  }

  const bal = user.wallet.balance_cents || 0;
  const maxCover = maxLockableCents(bal);
  if (amount > maxCover) {
    throw Object.assign(
      new Error(`Teto 50%: cobertura máxima ${maxCover} cents sobre o Saldo Apostador`),
      { status: 400, code: 'STAKE_CAP' },
    );
  }

  // v12: sem trava — carteira intacta
  if (LOCKS_STAKE_ON_CREATE) {
    user.wallet.balance_cents = bal - amount;
    user.wallet.locked_balance_cents = (user.wallet.locked_balance_cents || 0) + amount;
  }

  const protection = {
    id: store.nextId('prot'),
    user_id: userId,
    match_id: matchId,
    side: sideU,
    odd: oddN,
    approved_odd: oddN,
    amount_cents: amount,
    status: 'active',
    model: CREATE_PROTECTION_MODEL,
    locks_stake: LOCKS_STAKE_ON_CREATE,
    calculations: { marketOdd: oddN },
    metadata: {
      market_odd: oddN,
      market_name: match.market_name || null,
      selection_name: match.selection_name || null,
      label: match.label || null,
      amount_kind: sideU === 'BACK' ? 'stake' : 'liability',
      locks_stake: LOCKS_STAKE_ON_CREATE,
    },
    created_at: new Date().toISOString(),
  };

  store.data.protections.push(protection);
  store.addTx({
    user_id: userId,
    type: 'protection_register',
    amount_cents: amount,
    bucket: LOCKS_STAKE_ON_CREATE ? 'locked_balance_cents' : 'balance_cents',
    ref_id: protection.id,
    meta: {
      match_id: matchId,
      side: sideU,
      odd: oddN,
      locks_stake: LOCKS_STAKE_ON_CREATE,
      note: 'indicacao_sem_trava',
    },
  });
  store.save();
  return protection;
}
