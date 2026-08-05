/**
 * Depósito PIX automático (Luc Paguei) sobre manual_deposits.
 * Estados: pending → gateway_paid → credited | rejected | expired
 * Manual proof (sem gateway) permanece pending → credited.
 */
import { lucCreateDeposit, isLucReady, isPaidGatewayStatus } from './luc-paguei-client.mjs';
import { isAutoConfirmGateway } from './pix-confirmation-policy.mjs';
import { activateUserAfterDeposit } from './auth.mjs';
import { getMinDepositCents } from './app-settings.mjs';

const PAID_STATUSES = new Set(['credited', 'already_credited']);

export function makeDepositExternalId(userId) {
  const uid = String(userId || 'user').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'user';
  const now = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const rnd = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `DEP-${uid}-${stamp}-${rnd}`;
}

export function publicBaseUrl() {
  return String(process.env.FUTGREEN_PUBLIC_URL || process.env.PUBLIC_BASE_URL || 'https://futgreen.com.br').replace(
    /\/$/,
    '',
  );
}

export function depositDestBucket(dest) {
  if (dest === 'desafio') return 'desafio_balance_cents';
  if (dest === 'provedor') return 'investor_balance_cents';
  if (dest === 'automacao') return 'automacao_balance_cents';
  return 'balance_cents';
}

export function depositTxType(dest) {
  if (dest === 'desafio') return 'desafio_deposit';
  if (dest === 'provedor') return 'provider_deposit';
  if (dest === 'automacao') return 'automacao_deposit';
  return 'manual_deposit';
}

/** Credita wallet uma vez (idempotente). Aceita pending ou gateway_paid. */
export function creditDeposit(store, { depositId, adminEmail = null, source = 'admin' }) {
  const dep = store.data.manual_deposits.find((d) => d.id === depositId);
  if (!dep) throw Object.assign(new Error('Depósito não encontrado'), { status: 404 });
  if (PAID_STATUSES.has(dep.status)) {
    return { deposit: dep, already: true };
  }
  if (dep.status !== 'pending' && dep.status !== 'gateway_paid') {
    throw Object.assign(new Error(`Depósito não creditável (${dep.status})`), { status: 400 });
  }
  const u = store.getUser(dep.user_id);
  if (!u) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  const bucket = depositDestBucket(dep.dest);
  u.wallet[bucket] = (u.wallet[bucket] || 0) + dep.amount_cents;
  dep.status = 'credited';
  dep.approved_by = adminEmail || source || 'gateway';
  dep.approved_at = new Date().toISOString();
  dep.credited_source = source;
  store.addTx({
    user_id: u.id,
    type: depositTxType(dep.dest),
    amount_cents: dep.amount_cents,
    bucket,
    ref_id: dep.id,
  });
  const activated = activateUserAfterDeposit(u, {
    source: source === 'admin' || adminEmail ? 'deposit_admin' : String(source || 'first_deposit'),
  });
  if (activated) dep.activated_user = true;
  store.save();
  return { deposit: dep, wallet: u.wallet, already: false, activated };
}

export async function createPixDeposit(
  store,
  { userId, amountCents, dest = 'apostador', payer, note = null },
) {
  const amount = Math.round(Number(amountCents));
  const minCents = getMinDepositCents(store);
  if (!(amount >= minCents)) {
    const minReais = (minCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    throw Object.assign(new Error(`Depósito mínimo ${minReais}`), {
      status: 400,
      code: 'MIN_DEPOSIT',
      min_deposit_cents: minCents,
    });
  }
  const destN = ['apostador', 'desafio', 'provedor', 'automacao'].includes(dest) ? dest : 'apostador';
  const user = store.getUser(userId);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  if (!isLucReady()) {
    throw Object.assign(new Error('PIX automático indisponível — Luc Paguei não configurado'), {
      status: 503,
      code: 'LUC_NOT_CONFIGURED',
    });
  }

  const externalId = makeDepositExternalId(userId);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const dep = {
    id: store.nextId('dep'),
    user_id: userId,
    amount_cents: amount,
    dest: destN,
    status: 'pending',
    channel: 'luc_paguei',
    external_id: externalId,
    gateway_transaction_id: null,
    pix_copy_paste: null,
    payer_document: String(payer?.document || '').replace(/\D/g, '') || null,
    payer_name: payer?.name || user.name || null,
    note: note || null,
    proof_ref: null,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    gateway_paid_at: null,
  };
  store.data.manual_deposits.push(dep);
  store.save();

  const callbackUrl = `${publicBaseUrl()}/api/futgreen/webhooks/luc-paguei`;
  try {
    const created = await lucCreateDeposit({
      amountReais: amount / 100,
      externalId,
      callbackUrl,
      payer: {
        name: payer?.name || user.name || 'Cliente ArbiShield',
        email: payer?.email || user.email,
        document: payer?.document || user.cpf || user.document,
      },
    });
    dep.pix_copy_paste = created.emv;
    dep.gateway_transaction_id = created.gatewayTransactionId
      ? String(created.gatewayTransactionId)
      : null;
    dep.gateway_raw_keys = Object.keys(created.raw || {});
    store.save();
  } catch (e) {
    dep.status = 'rejected';
    dep.note = `Falha ao gerar PIX: ${e.message}`;
    dep.rejected_at = new Date().toISOString();
    store.save();
    throw e;
  }

  return {
    deposit: publicDepositView(dep),
    pixCopyPaste: dep.pix_copy_paste,
    status: dep.status,
    id: dep.id,
    expires_at: dep.expires_at,
  };
}

export function publicDepositView(dep) {
  return {
    id: dep.id,
    amount_cents: dep.amount_cents,
    dest: dep.dest,
    status: dep.status,
    channel: dep.channel || 'manual',
    external_id: dep.external_id || null,
    pix_copy_paste: dep.pix_copy_paste || null,
    expires_at: dep.expires_at || null,
    created_at: dep.created_at,
    gateway_paid_at: dep.gateway_paid_at || null,
    approved_at: dep.approved_at || null,
  };
}

export function getUserDeposit(store, { depositId, userId }) {
  const dep = store.data.manual_deposits.find((d) => d.id === depositId);
  if (!dep || dep.user_id !== userId) {
    throw Object.assign(new Error('Depósito não encontrado'), { status: 404 });
  }
  maybeExpire(dep);
  if (dep.status === 'expired') store.save();
  return publicDepositView(dep);
}

function maybeExpire(dep) {
  if (dep.status !== 'pending') return dep;
  if (dep.expires_at && Date.now() > new Date(dep.expires_at).getTime()) {
    dep.status = 'expired';
  }
  return dep;
}

/**
 * Webhook Luc — sempre retorna ok para o caller responder 200.
 * Idempotente.
 */
export function applyLucWebhook(store, payload) {
  const row = payload || {};
  const status =
    row.status || row.payment_status || row.state || row.data?.status || row.payment?.status;
  const externalId =
    row.external_id ||
    row.externalId ||
    row.external_ref ||
    row.data?.external_id ||
    row.metadata?.external_id ||
    null;
  const txid =
    row.transaction_id ||
    row.transactionId ||
    row.txid ||
    row.id ||
    row.data?.transaction_id ||
    null;

  let dep = null;
  if (externalId) {
    dep = store.data.manual_deposits.find((d) => d.external_id === externalId);
  }
  if (!dep && txid) {
    dep = store.data.manual_deposits.find(
      (d) => d.gateway_transaction_id && String(d.gateway_transaction_id) === String(txid),
    );
  }
  if (!dep) {
    return { ok: true, matched: false, reason: 'deposit_not_found' };
  }

  if (PAID_STATUSES.has(dep.status)) {
    return { ok: true, matched: true, deposit: publicDepositView(dep), already: true };
  }

  if (!isPaidGatewayStatus(status)) {
    dep.gateway_last_status = status || null;
    dep.gateway_webhook_at = new Date().toISOString();
    store.save();
    return { ok: true, matched: true, deposit: publicDepositView(dep), paid: false };
  }

  if (txid && !dep.gateway_transaction_id) {
    dep.gateway_transaction_id = String(txid);
  }
  dep.gateway_last_status = status;
  dep.gateway_webhook_at = new Date().toISOString();
  dep.gateway_paid_at = dep.gateway_paid_at || new Date().toISOString();

  if (isAutoConfirmGateway()) {
    const credited = creditDeposit(store, {
      depositId: dep.id,
      adminEmail: null,
      source: 'luc_webhook_auto',
    });
    return {
      ok: true,
      matched: true,
      paid: true,
      auto: true,
      deposit: publicDepositView(credited.deposit),
      already: credited.already,
    };
  }

  // Manual: só marca pago no gateway — admin credita
  if (dep.status === 'pending') {
    dep.status = 'gateway_paid';
  }
  store.save();
  return {
    ok: true,
    matched: true,
    paid: true,
    auto: false,
    deposit: publicDepositView(dep),
  };
}
