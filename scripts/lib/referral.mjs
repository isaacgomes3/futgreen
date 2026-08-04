/**
 * Links de indicação por usuário.
 * URL: {public}/cadastro.html?ref={code}
 */

function publicBaseUrl() {
  return String(process.env.FUTGREEN_PUBLIC_URL || process.env.PUBLIC_BASE_URL || 'https://futgreen.com.br').replace(
    /\/$/,
    '',
  );
}

function randomCode(len = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function ensureReferralCode(store, user) {
  if (!user) return null;
  if (user.referral_code && String(user.referral_code).length >= 4) {
    return String(user.referral_code).toLowerCase();
  }
  let code;
  for (let i = 0; i < 12; i++) {
    const candidate = randomCode(8);
    const taken = store.data.users.some(
      (u) => u.id !== user.id && String(u.referral_code || '').toLowerCase() === candidate,
    );
    if (!taken) {
      code = candidate;
      break;
    }
  }
  if (!code) code = `u${String(user.id).replace(/[^a-z0-9]/gi, '').slice(-7) || randomCode(7)}`.toLowerCase();
  user.referral_code = code;
  store.save();
  return code;
}

export function findUserByReferralCode(store, code) {
  const c = String(code || '')
    .trim()
    .toLowerCase();
  if (!c || c.length < 4) return null;
  return store.data.users.find((u) => String(u.referral_code || '').toLowerCase() === c) || null;
}

export function buildReferralUrl(code) {
  const base = publicBaseUrl();
  return `${base}/cadastro.html?ref=${encodeURIComponent(code)}`;
}

export function referralStats(store, userId) {
  const invited = store.data.users.filter((u) => u.referred_by === userId);
  return {
    count: invited.length,
    users: invited.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      created_at: u.created_at,
      is_active: u.is_active !== false,
    })),
  };
}

/** Atribui indicado; ignora auto-indicação e código inválido. */
export function attachReferrer(store, newUser, refCode) {
  const referrer = findUserByReferralCode(store, refCode);
  if (!referrer) return null;
  if (referrer.id === newUser.id) return null;
  newUser.referred_by = referrer.id;
  newUser.referred_by_code = referrer.referral_code;
  store.save();
  return referrer;
}
