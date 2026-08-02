/**
 * Operações do Financeiro Admin: saques, despesas, áreas, tesouraria, monitor.
 */
import { dayKeyBrazil } from './match-phase.mjs';

export const FINANCE_AREAS = Object.freeze([
  { id: 'protection', label: 'Proteção' },
  { id: 'desafio', label: 'Jornada' },
  { id: 'automation', label: 'Automação' },
  { id: 'products', label: 'Venda de produtos' },
]);

function ensureCollections(store) {
  if (!Array.isArray(store.data.withdrawals)) store.data.withdrawals = [];
  if (!Array.isArray(store.data.expenses)) store.data.expenses = [];
  if (!Array.isArray(store.data.area_entries)) store.data.area_entries = [];
  if (!Array.isArray(store.data.treasury_moves)) store.data.treasury_moves = [];
}

/** Cliente solicita saque do Saldo Reembolso — reserva saldo (pending). */
export function requestDeductionWithdraw(store, { userId, amountCents, pixKey }) {
  ensureCollections(store);
  const amount = Math.round(Number(amountCents));
  const u = store.getUser(userId);
  if (!u) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  if (!(amount > 0)) throw Object.assign(new Error('Valor inválido'), { status: 400 });
  if ((u.wallet.deduction_balance_cents || 0) < amount) {
    throw Object.assign(new Error('Saldo Reembolso insuficiente'), { status: 400 });
  }
  u.wallet.deduction_balance_cents -= amount;
  const withdrawal = {
    id: store.nextId('wd'),
    user_id: userId,
    amount_cents: amount,
    pix_key: pixKey || null,
    status: 'pending',
    created_at: new Date().toISOString(),
    decided_at: null,
    decided_by: null,
    note: null,
  };
  store.data.withdrawals.unshift(withdrawal);
  store.addTx({
    user_id: userId,
    type: 'deduction_withdraw_hold',
    amount_cents: amount,
    bucket: 'deduction_balance_cents',
    ref_id: withdrawal.id,
    meta: { pix_key: pixKey || null, withdrawal_id: withdrawal.id },
  });
  store.save();
  return { wallet: u.wallet, withdrawal, status: 'pending' };
}

/** Admin decide saque: paid | reject (approve = paid). */
export function decideWithdrawal(store, { withdrawalId, action, adminEmail, note }) {
  ensureCollections(store);
  const w = store.data.withdrawals.find((x) => x.id === withdrawalId);
  if (!w) throw Object.assign(new Error('Saque não encontrado'), { status: 404 });
  if (w.status !== 'pending' && w.status !== 'approved') {
    throw Object.assign(new Error('Saque já decidido'), { status: 400 });
  }
  const act = String(action || '').toLowerCase();
  const u = store.getUser(w.user_id);
  if (!u) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  if (act === 'reject' || act === 'rejected') {
    u.wallet.deduction_balance_cents = (u.wallet.deduction_balance_cents || 0) + w.amount_cents;
    w.status = 'rejected';
    w.decided_at = new Date().toISOString();
    w.decided_by = adminEmail || null;
    w.note = note || w.note;
    store.addTx({
      user_id: w.user_id,
      type: 'deduction_withdraw_rejected',
      amount_cents: w.amount_cents,
      bucket: 'deduction_balance_cents',
      ref_id: w.id,
      meta: { admin: adminEmail, note },
    });
    store.save();
    return { withdrawal: w, wallet: u.wallet };
  }

  if (act === 'approve' || act === 'paid' || act === 'approved') {
    w.status = 'paid';
    w.decided_at = new Date().toISOString();
    w.decided_by = adminEmail || null;
    w.note = note || w.note;
    store.addTx({
      user_id: w.user_id,
      type: 'deduction_withdraw_paid',
      amount_cents: w.amount_cents,
      bucket: 'deduction_balance_cents',
      ref_id: w.id,
      meta: { admin: adminEmail, note, pix_key: w.pix_key },
    });
    store.save();
    return { withdrawal: w, wallet: u.wallet };
  }

  throw Object.assign(new Error('Ação inválida (approve|paid|reject)'), { status: 400 });
}

export function createExpense(store, body, adminEmail) {
  ensureCollections(store);
  const kind = body.kind === 'fixed' ? 'fixed' : 'variable';
  const amount = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
  if (!(amount > 0)) throw Object.assign(new Error('Valor inválido'), { status: 400 });
  const title = String(body.title || '').trim();
  if (!title) throw Object.assign(new Error('Título obrigatório'), { status: 400 });
  const row = {
    id: store.nextId('exp'),
    kind,
    title,
    amount_cents: amount,
    category: body.category || 'geral',
    due_day: body.due_day != null && body.due_day !== '' ? Number(body.due_day) : null,
    due_at: body.due_at || null,
    alert_days: body.alert_days != null && body.alert_days !== '' ? Number(body.alert_days) : 3,
    recurrence: body.recurrence || (kind === 'fixed' ? 'monthly' : null),
    active: body.active !== false,
    created_at: new Date().toISOString(),
    created_by: adminEmail || null,
    paid_at: body.mark_paid ? new Date().toISOString() : null,
  };
  store.data.expenses.unshift(row);
  store.save();
  return row;
}

export function updateExpense(store, { id, patch, adminEmail }) {
  ensureCollections(store);
  const row = store.data.expenses.find((e) => e.id === id);
  if (!row) throw Object.assign(new Error('Despesa não encontrada'), { status: 404 });
  if (patch.title != null) row.title = String(patch.title).trim();
  if (patch.amount != null || patch.amount_cents != null) {
    row.amount_cents = Math.round(Number(patch.amount_cents ?? Number(patch.amount) * 100));
  }
  if (patch.category != null) row.category = patch.category;
  if (patch.due_day !== undefined) {
    row.due_day = patch.due_day === '' || patch.due_day == null ? null : Number(patch.due_day);
  }
  if (patch.due_at !== undefined) row.due_at = patch.due_at || null;
  if (patch.alert_days !== undefined) row.alert_days = Number(patch.alert_days);
  if (patch.active != null) row.active = Boolean(patch.active);
  if (patch.mark_paid) row.paid_at = new Date().toISOString();
  if (patch.clear_paid) row.paid_at = null;
  row.updated_at = new Date().toISOString();
  row.updated_by = adminEmail || null;
  store.save();
  return row;
}

export function expenseAlert(exp, now = new Date()) {
  if (!exp?.active || exp.paid_at) return null;
  const alertDays = Number.isFinite(Number(exp.alert_days)) ? Number(exp.alert_days) : 3;
  let due = null;
  if (exp.due_at) due = new Date(exp.due_at);
  else if (exp.due_day != null && exp.kind === 'fixed') {
    const y = now.getFullYear();
    const m = now.getMonth();
    const day = Math.min(Math.max(1, Number(exp.due_day)), 28);
    due = new Date(y, m, day, 23, 59, 59);
    if (due < now) due = new Date(y, m + 1, day, 23, 59, 59);
  }
  if (!due || !Number.isFinite(due.getTime())) return null;
  const ms = due.getTime() - now.getTime();
  const daysLeft = Math.ceil(ms / 86400e3);
  if (daysLeft > alertDays) return null;
  return { due_at: due.toISOString(), days_left: daysLeft, overdue: daysLeft < 0 };
}

export function createAreaEntry(store, body, adminEmail) {
  ensureCollections(store);
  const area = String(body.area || '');
  if (!FINANCE_AREAS.some((a) => a.id === area)) {
    throw Object.assign(new Error('Área inválida'), { status: 400 });
  }
  const direction = body.direction === 'out' ? 'out' : 'in';
  const amount = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
  if (!(amount > 0)) throw Object.assign(new Error('Valor inválido'), { status: 400 });
  const row = {
    id: store.nextId('ae'),
    area,
    direction,
    amount_cents: amount,
    label: String(body.label || '').trim() || (direction === 'in' ? 'Entrada' : 'Saída'),
    created_at: new Date().toISOString(),
    created_by: adminEmail || null,
    ref_type: body.ref_type || null,
    ref_id: body.ref_id || null,
  };
  store.data.area_entries.unshift(row);
  store.save();
  return row;
}

export function createTreasuryMove(store, body, adminEmail) {
  ensureCollections(store);
  const kind = String(body.kind || '');
  if (!['withdrawal', 'external_payment', 'adjustment'].includes(kind)) {
    throw Object.assign(new Error('Tipo inválido'), { status: 400 });
  }
  const amount = Math.round(Number(body.amount_cents ?? Number(body.amount) * 100));
  if (!(amount > 0)) throw Object.assign(new Error('Valor inválido'), { status: 400 });
  const row = {
    id: store.nextId('tm'),
    kind,
    amount_cents: amount,
    counterparty: body.counterparty || null,
    note: body.note || null,
    created_at: new Date().toISOString(),
    created_by: adminEmail || null,
  };
  store.data.treasury_moves.unshift(row);
  store.save();
  return row;
}

function sumByDay(items, getAmount, getDate, dayKey) {
  let total = 0;
  let day = 0;
  for (const it of items) {
    const cents = Math.round(Number(getAmount(it)) || 0);
    if (!(cents > 0)) continue;
    total += cents;
    if (dayKey && dayKeyBrazil(getDate(it)) === dayKey) day += cents;
  }
  return { total, day };
}

function areaHealth(store, areaId, dayKey) {
  const rows = (store.data.area_entries || []).filter((e) => e.area === areaId);
  let inTotal = 0;
  let outTotal = 0;
  let inDay = 0;
  let outDay = 0;
  for (const e of rows) {
    const c = e.amount_cents || 0;
    const isDay = dayKeyBrazil(e.created_at) === dayKey;
    if (e.direction === 'in') {
      inTotal += c;
      if (isDay) inDay += c;
    } else {
      outTotal += c;
      if (isDay) outDay += c;
    }
  }
  // Heurística txs → proteção / desafio
  if (areaId === 'protection' || areaId === 'desafio') {
    for (const t of store.data.wallet_transactions || []) {
      const c = t.amount_cents || 0;
      const isDay = dayKeyBrazil(t.created_at) === dayKey;
      const type = String(t.type || '');
      if (areaId === 'protection' && /^protection_/.test(type)) {
        if (/settlement|fee|commission|lock/.test(type) && !/refund|unlock|release/.test(type)) {
          // lock = saída cliente; settlement reembolso = saída casa; ganho fee = entrada casa — simplificado:
          if (type === 'protection_settlement' || type === 'protection_fee' || type === 'exchange_commission') {
            inTotal += c;
            if (isDay) inDay += c;
          } else if (type === 'protection_lock') {
            outTotal += c;
            if (isDay) outDay += c;
          }
        }
        if (/refund|unlock|release/.test(type)) {
          outTotal += c;
          if (isDay) outDay += c;
        }
      }
      if (areaId === 'desafio') {
        if (t.bucket === 'desafio_balance_cents' || /desafio_/.test(type)) {
          if (/deposit|payout|zebra/.test(type) || type === 'transfer_reembolso_to_desafio') {
            inTotal += c;
            if (isDay) inDay += c;
          } else if (/forfeit|cancel|void|reregister/.test(type)) {
            outTotal += c;
            if (isDay) outDay += c;
          }
        }
      }
    }
  }
  return {
    area: areaId,
    label: FINANCE_AREAS.find((a) => a.id === areaId)?.label || areaId,
    in_total_cents: inTotal,
    out_total_cents: outTotal,
    net_total_cents: inTotal - outTotal,
    in_day_cents: inDay,
    out_day_cents: outDay,
    net_day_cents: inDay - outDay,
  };
}

export function buildFinanceMonitor(store, { day } = {}) {
  ensureCollections(store);
  const dayKey = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dayKeyBrazil(new Date());

  const creditedDeps = (store.data.manual_deposits || []).filter(
    (d) => d.status === 'credited' || d.status === 'already_credited',
  );
  const depIn = sumByDay(
    creditedDeps,
    (d) => d.amount_cents,
    (d) => d.approved_at || d.created_at,
    dayKey,
  );

  const paidWd = (store.data.withdrawals || []).filter((w) => w.status === 'paid');
  const wdOut = sumByDay(
    paidWd,
    (w) => w.amount_cents,
    (w) => w.decided_at || w.created_at,
    dayKey,
  );

  const paidExp = (store.data.expenses || []).filter((e) => e.paid_at);
  const expOut = sumByDay(paidExp, (e) => e.amount_cents, (e) => e.paid_at, dayKey);

  const treasOutRows = (store.data.treasury_moves || []).filter(
    (m) => m.kind === 'withdrawal' || m.kind === 'external_payment',
  );
  const treasOut = sumByDay(treasOutRows, (m) => m.amount_cents, (m) => m.created_at, dayKey);

  const areaInRows = (store.data.area_entries || []).filter((e) => e.direction === 'in');
  const areaOutRows = (store.data.area_entries || []).filter((e) => e.direction === 'out');
  const areaIn = sumByDay(areaInRows, (e) => e.amount_cents, (e) => e.created_at, dayKey);
  const areaOut = sumByDay(areaOutRows, (e) => e.amount_cents, (e) => e.created_at, dayKey);

  const entradas_total = depIn.total + areaIn.total;
  const saidas_total = wdOut.total + expOut.total + treasOut.total + areaOut.total;
  const entradas_dia = depIn.day + areaIn.day;
  const saidas_dia = wdOut.day + expOut.day + treasOut.day + areaOut.day;

  const passivo = (store.data.users || []).reduce((s, u) => {
    const w = u.wallet || {};
    return (
      s +
      (w.balance_cents || 0) +
      (w.deduction_balance_cents || 0) +
      (w.desafio_balance_cents || 0) +
      (w.locked_balance_cents || 0)
    );
  }, 0);

  const caixa_bruto = depIn.total - wdOut.total - expOut.total - treasOut.total;
  const disponivel_retirada = Math.max(0, caixa_bruto - passivo);

  const dayLines = [];
  for (const d of creditedDeps) {
    const when = d.approved_at || d.created_at;
    if (dayKeyBrazil(when) !== dayKey) continue;
    dayLines.push({
      kind: 'in',
      source: 'deposit',
      label: `Depósito ${d.dest || 'apostador'}`,
      amount_cents: d.amount_cents,
      at: when,
      ref_id: d.id,
      user_id: d.user_id,
    });
  }
  for (const w of paidWd) {
    const when = w.decided_at || w.created_at;
    if (dayKeyBrazil(when) !== dayKey) continue;
    dayLines.push({
      kind: 'out',
      source: 'withdrawal',
      label: 'Saque Reembolso',
      amount_cents: w.amount_cents,
      at: when,
      ref_id: w.id,
      user_id: w.user_id,
    });
  }
  for (const e of paidExp) {
    if (dayKeyBrazil(e.paid_at) !== dayKey) continue;
    dayLines.push({
      kind: 'out',
      source: 'expense',
      label: e.title,
      amount_cents: e.amount_cents,
      at: e.paid_at,
      ref_id: e.id,
    });
  }
  for (const m of store.data.treasury_moves || []) {
    if (dayKeyBrazil(m.created_at) !== dayKey) continue;
    dayLines.push({
      kind: m.kind === 'adjustment' ? 'adj' : 'out',
      source: 'treasury',
      label: m.kind === 'withdrawal' ? 'Retirada tesouraria' : m.kind === 'external_payment' ? 'Pagamento externo' : 'Ajuste',
      amount_cents: m.amount_cents,
      at: m.created_at,
      ref_id: m.id,
      counterparty: m.counterparty,
    });
  }
  for (const e of store.data.area_entries || []) {
    if (dayKeyBrazil(e.created_at) !== dayKey) continue;
    dayLines.push({
      kind: e.direction === 'in' ? 'in' : 'out',
      source: 'area',
      label: `${e.area}: ${e.label}`,
      amount_cents: e.amount_cents,
      at: e.created_at,
      ref_id: e.id,
    });
  }
  dayLines.sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    day: dayKey,
    today: dayKeyBrazil(new Date()),
    totals: {
      entradas_cents: entradas_total,
      saidas_cents: saidas_total,
      saldo_cents: entradas_total - saidas_total,
    },
    daily: {
      entradas_cents: entradas_dia,
      saidas_cents: saidas_dia,
      saldo_cents: entradas_dia - saidas_dia,
    },
    breakdown: {
      deposits_in: depIn,
      withdrawals_out: wdOut,
      expenses_out: expOut,
      treasury_out: treasOut,
      area_in: areaIn,
      area_out: areaOut,
    },
    treasury: {
      caixa_bruto_cents: caixa_bruto,
      passivo_clientes_cents: passivo,
      disponivel_retirada_cents: disponivel_retirada,
      note: 'Estimativa operacional — não é contabilidade formal',
    },
    areas: FINANCE_AREAS.map((a) => areaHealth(store, a.id, dayKey)),
    day_lines: dayLines,
    alerts: (store.data.expenses || [])
      .map((e) => ({ expense: e, alert: expenseAlert(e) }))
      .filter((x) => x.alert),
  };
}

export function rejectManualDeposit(store, { depositId, adminEmail, note }) {
  const dep = store.data.manual_deposits.find((d) => d.id === depositId);
  if (!dep) throw Object.assign(new Error('Depósito não encontrado'), { status: 404 });
  if (dep.status !== 'pending') {
    throw Object.assign(new Error('Depósito não está pendente'), { status: 400 });
  }
  dep.status = 'rejected';
  dep.rejected_by = adminEmail || null;
  dep.rejected_at = new Date().toISOString();
  dep.note = note || dep.note || null;
  store.save();
  return dep;
}

export { ensureCollections };
