import {
  PROTECTION_OUTCOMES,
  calcProtectionDeductionCents,
  resolveCanonicalOdd,
} from './protection-flow-contract.mjs';

/**
 * Liquidação admin: REEMBOLSO / GANHO / ANULA / CANCELAR
 */
export function settleProtection(store, { protectionId, outcome, adminEmail }) {
  const p = store.data.protections.find((x) => x.id === protectionId);
  if (!p) throw Object.assign(new Error('Proteção não encontrada'), { status: 404 });
  if (p.status !== 'active') {
    throw Object.assign(new Error('Proteção não está ativa'), { status: 400 });
  }

  const user = store.getUser(p.user_id);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  const oc = String(outcome || '').toLowerCase();
  const stake = p.amount_cents;

  // Sempre destrava
  user.wallet.locked_balance_cents = Math.max(0, (user.wallet.locked_balance_cents || 0) - stake);

  if (oc === PROTECTION_OUTCOMES.REEMBOLSO) {
    // Stake → Saldo Reembolso
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
    // Devolve stake à origem (Apostador) + cobra só a dedução
    user.wallet.balance_cents = (user.wallet.balance_cents || 0) + stake;
    const odd = resolveCanonicalOdd(p);
    const fee = calcProtectionDeductionCents({ side: p.side, amountCents: stake, odd });
    if (fee > 0) {
      // Dedução sai do Saldo Apostador (após devolução)
      if ((user.wallet.balance_cents || 0) < fee) {
        // cobrir do que houver
        user.wallet.balance_cents = 0;
      } else {
        user.wallet.balance_cents -= fee;
      }
      store.addTx({
        user_id: user.id,
        type: 'protection_fee',
        amount_cents: fee,
        bucket: 'balance_cents',
        ref_id: p.id,
        meta: { outcome: 'ganho', odd, side: p.side, admin: adminEmail },
      });
    }
    store.addTx({
      user_id: user.id,
      type: 'protection_unlock',
      amount_cents: stake,
      bucket: 'balance_cents',
      ref_id: p.id,
      meta: { outcome: 'ganho', admin: adminEmail },
    });
    p.status = 'settled_ganho';
    p.result = 'ganho';
    p.fee_cents = fee;
  } else if (oc === PROTECTION_OUTCOMES.ANULA || oc === PROTECTION_OUTCOMES.CANCELAR) {
    user.wallet.balance_cents = (user.wallet.balance_cents || 0) + stake;
    p.status = oc === 'cancelar' ? 'cancelled' : 'settled_anula';
    p.result = oc;
    store.addTx({
      user_id: user.id,
      type: oc === 'cancelar' ? 'protection_refund' : 'protection_release',
      amount_cents: stake,
      bucket: 'balance_cents',
      ref_id: p.id,
      meta: { outcome: oc, admin: adminEmail },
    });
  } else {
    throw Object.assign(new Error('outcome inválido'), { status: 400 });
  }

  p.settled_at = new Date().toISOString();
  p.settled_by = adminEmail || null;
  store.save();
  return p;
}

/** Encerrar sem estorno (protection-close) */
export function closeProtection(store, { protectionId, adminEmail }) {
  const p = store.data.protections.find((x) => x.id === protectionId);
  if (!p) throw Object.assign(new Error('Proteção não encontrada'), { status: 404 });
  if (p.status !== 'active') throw Object.assign(new Error('Proteção não está ativa'), { status: 400 });

  const user = store.getUser(p.user_id);
  user.wallet.locked_balance_cents = Math.max(0, (user.wallet.locked_balance_cents || 0) - p.amount_cents);
  // Sem devolver stake — fica com a plataforma
  p.status = 'closed';
  p.result = 'closed';
  p.settled_at = new Date().toISOString();
  p.settled_by = adminEmail || null;
  store.addTx({
    user_id: user.id,
    type: 'protection_settlement',
    amount_cents: p.amount_cents,
    bucket: 'locked_balance_cents',
    ref_id: p.id,
    meta: { outcome: 'close_no_refund', admin: adminEmail },
  });
  store.save();
  return p;
}
