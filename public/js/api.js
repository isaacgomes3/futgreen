/** Cliente HTTP FutGreen */
const FG_API = '';

export function getEmail() {
  return localStorage.getItem('fg_email') || '';
}

export function setEmail(email) {
  localStorage.setItem('fg_email', email);
}

export function isLoggedIn() {
  try {
    return Boolean(localStorage.getItem('fg_email') && localStorage.getItem('fg_authed') === '1');
  } catch {
    return false;
  }
}

/** Encerra sessão local e volta ao login */
export function logout({ redirect = '/entrar.html' } = {}) {
  try {
    localStorage.removeItem('fg_email');
    localStorage.removeItem('fg_authed');
    localStorage.removeItem('fg_impersonate');
  } catch { /* ignore */ }
  if (redirect) location.href = redirect;
}

export function getImpersonate() {
  return localStorage.getItem('fg_impersonate') || '';
}

export function setImpersonate(email) {
  if (email) localStorage.setItem('fg_impersonate', email);
  else localStorage.removeItem('fg_impersonate');
}

export async function api(path, { method = 'GET', body, admin = false } = {}) {
  const email = getEmail();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (email) headers['X-User-Email'] = email;
  if (admin || /admin|isaac|carlos|futgreen@gmail/i.test(email)) {
    headers['X-Admin-Email'] = email;
  }
  const imp = getImpersonate();
  if (imp) headers['X-Impersonate'] = imp;

  const res = await fetch(`${FG_API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function brl(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function toast(msg) {
  const el = document.createElement('div');
  el.className = 'fg-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

export function fmtWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
