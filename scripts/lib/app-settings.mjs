/** Configurações editáveis pelo admin (persistidas em store.data.settings). */

export const DEFAULT_MIN_DEPOSIT_CENTS = 10000; // R$ 100

export function ensureSettings(store) {
  if (!store.data.settings || typeof store.data.settings !== 'object') {
    store.data.settings = { min_deposit_cents: DEFAULT_MIN_DEPOSIT_CENTS };
  }
  const min = Number(store.data.settings.min_deposit_cents);
  if (!Number.isFinite(min) || min < 100) {
    store.data.settings.min_deposit_cents = DEFAULT_MIN_DEPOSIT_CENTS;
  }
  return store.data.settings;
}

export function getMinDepositCents(store) {
  const s = ensureSettings(store);
  return Math.max(100, Math.round(Number(s.min_deposit_cents) || DEFAULT_MIN_DEPOSIT_CENTS));
}

export function setMinDepositReais(store, amountReais) {
  const reais = Number(amountReais);
  if (!(reais >= 1)) {
    throw Object.assign(new Error('Depósito mínimo inválido (mín. R$ 1,00)'), { status: 400 });
  }
  const cents = Math.round(reais * 100);
  const s = ensureSettings(store);
  s.min_deposit_cents = cents;
  s.updated_at = new Date().toISOString();
  store.save();
  return s;
}

export function publicDepositSettings(store) {
  const min = getMinDepositCents(store);
  return {
    min_deposit_cents: min,
    min_deposit_reais: min / 100,
  };
}
