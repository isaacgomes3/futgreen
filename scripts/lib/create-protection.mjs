import {
  assertPreKickoff,
  maxLockableCents,
  CREATE_PROTECTION_MODEL,
} from './protection-flow-contract.mjs';

/**
 * Cria proteção stake_lock_v1:
 * - Credita locked_balance_cents
 * - NÃO cobra dedução na entrada
 * - Teto 50% do Saldo Apostador restante
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

  const sideU = String(side || 'LAY').toUpperCase();
  if (sideU !== 'LAY' && sideU !== 'BACK') {
    throw Object.assign(new Error('side deve ser LAY ou BACK'), { status: 400 });
  }

  const amount = Math.round(Number(amountCents));
  if (!(amount > 0)) throw Object.assign(new Error('valor inválido'), { status: 400 });

  const active = store.data.protections.find(
    (p) => p.user_id === userId && p.match_id === matchId && p.status === 'active',
  );
  if (active) {
    throw Object.assign(new Error('Já existe proteção ativa neste evento'), { status: 409, code: 'ONE_OP_PER_EVENT' });
  }

  const bal = user.wallet.balance_cents || 0;
  const maxLock = maxLockableCents(bal);
  if (amount > maxLock) {
    throw Object.assign(
      new Error(`Teto 50%: máximo ${maxLock} cents do Saldo Apostador restante`),
      { status: 400, code: 'STAKE_CAP' },
    );
  }
  if (amount > bal) {
    throw Object.assign(new Error('Saldo Apostador insuficiente'), { status: 400 });
  }

  // Trava: move Apostador → Travado (sem dedução)
  user.wallet.balance_cents = bal - amount;
  user.wallet.locked_balance_cents = (user.wallet.locked_balance_cents || 0) + amount;

  const protection = {
    id: store.nextId('prot'),
    user_id: userId,
    match_id: matchId,
    side: sideU,
    odd: Number(odd),
    approved_odd: Number(odd),
    amount_cents: amount,
    status: 'active',
    model: CREATE_PROTECTION_MODEL,
    calculations: { marketOdd: Number(odd) },
    metadata: { market_odd: Number(odd) },
    created_at: new Date().toISOString(),
  };

  store.data.protections.push(protection);
  store.addTx({
    user_id: userId,
    type: 'protection_lock',
    amount_cents: amount,
    bucket: 'locked_balance_cents',
    ref_id: protection.id,
    meta: { match_id: matchId, side: sideU, odd: Number(odd) },
  });
  store.save();
  return protection;
}
