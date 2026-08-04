/**
 * Cliente Luc Paguei — login + criar depósito PIX.
 * Base: https://api.lucpaguei.online
 */

const DEFAULT_BASE = 'https://api.lucpaguei.online';

let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

export function lucConfig() {
  return {
    apiBaseUrl: String(process.env.LUC_PAGUEI_API_BASE || DEFAULT_BASE).replace(/\/$/, ''),
    clientId: process.env.LUC_PAGUEI_CLIENT_ID || '',
    clientSecret: process.env.LUC_PAGUEI_CLIENT_SECRET || '',
  };
}

export function isLucReady() {
  const c = lucConfig();
  return Boolean(c.apiBaseUrl && c.clientId && c.clientSecret);
}

async function lucFetch(path, { method = 'GET', body, token } = {}) {
  const { apiBaseUrl } = lucConfig();
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data.error || data.message || data.msg || `Luc HTTP ${res.status}`;
    throw Object.assign(new Error(String(msg)), { status: res.status, data });
  }
  return data;
}

export async function lucLogin({ force = false } = {}) {
  if (!force && cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) {
    return cachedToken;
  }
  const { clientId, clientSecret } = lucConfig();
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Luc Paguei não configurado (LUC_PAGUEI_CLIENT_ID/SECRET)'), {
      status: 503,
      code: 'LUC_NOT_CONFIGURED',
    });
  }
  const data = await lucFetch('/api/auth/login', {
    method: 'POST',
    body: { client_id: clientId, client_secret: clientSecret },
  });
  const token = data.token || data.access_token || data.data?.token;
  if (!token) throw Object.assign(new Error('Luc login sem token'), { status: 502 });
  cachedToken = token;
  cachedTokenAt = Date.now();
  return token;
}

/** Extrai EMV (copia-e-cola) de respostas heterogêneas do gateway. */
export function extractEmv(payload) {
  const row = payload || {};
  const candidates = [
    row.qrCodeResponse?.emv,
    row.qrCodeResponse?.qrcode,
    row.qrCodeResponse?.pixCopiaECola,
    row.pixCopyPaste,
    row.pix_copy_paste,
    row.pixCode,
    row.pix_code,
    row.brCode,
    row.brcode,
    row.emv,
    row.qr_code,
    row.qrCode,
    row.copyPaste,
    row.copia_e_cola,
    row.data?.qrCodeResponse?.emv,
    row.data?.pixCopyPaste,
    row.data?.emv,
    row.data?.pixCode,
    row.payment?.emv,
    row.charge?.emv,
  ];
  for (const v of candidates) {
    const s = String(v || '').trim();
    if (s.length > 40 && /^000201/.test(s)) return s;
  }
  for (const v of candidates) {
    const s = String(v || '').trim();
    if (s.length > 40) return s;
  }
  return null;
}

export function extractGatewayTxId(payload) {
  const row = payload || {};
  return (
    row.transaction_id ||
    row.transactionId ||
    row.txid ||
    row.tx_id ||
    row.id ||
    row.data?.transaction_id ||
    row.data?.id ||
    row.payment?.id ||
    null
  );
}

/**
 * Cria cobrança PIX dinâmica.
 * @param {{ amountReais: number, externalId: string, callbackUrl: string, payer: { name, email, document } }} opts
 */
export async function lucCreateDeposit(opts) {
  const token = await lucLogin();
  const amount = Math.round(Number(opts.amountReais) * 100) / 100;
  const document = String(opts.payer?.document || '').replace(/\D/g, '');
  if (document.length !== 11) {
    throw Object.assign(new Error('CPF do pagador obrigatório (11 dígitos)'), {
      status: 400,
      code: 'CPF_REQUIRED',
    });
  }
  const body = {
    amount,
    external_id: opts.externalId,
    clientCallbackUrl: opts.callbackUrl,
    payer: {
      name: String(opts.payer?.name || 'Cliente').slice(0, 120),
      email: String(opts.payer?.email || 'cliente@futgreen.com.br').slice(0, 120),
      document,
    },
  };
  let data;
  try {
    data = await lucFetch('/api/payments/deposit', { method: 'POST', body, token });
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      const token2 = await lucLogin({ force: true });
      data = await lucFetch('/api/payments/deposit', { method: 'POST', body, token: token2 });
    } else {
      throw e;
    }
  }
  const emv = extractEmv(data);
  if (!emv) {
    throw Object.assign(new Error('Luc não retornou EMV/PIX copia-e-cola'), {
      status: 502,
      code: 'LUC_NO_EMV',
      data,
    });
  }
  return {
    emv,
    gatewayTransactionId: extractGatewayTxId(data),
    raw: data,
  };
}

/** Status pagos comuns no webhook Luc. */
export function isPaidGatewayStatus(status) {
  const s = String(status || '')
    .trim()
    .toUpperCase();
  return [
    'COMPLETED',
    'PAID',
    'CONFIRMED',
    'APPROVED',
    'SUCCESS',
    'SUCCESSFUL',
    'DONE',
    'LIQUIDATED',
    'RECEIVED',
  ].includes(s);
}
