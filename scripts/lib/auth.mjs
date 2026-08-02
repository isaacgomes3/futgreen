import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(String(password), salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const derived = await scrypt(String(password), salt, 64);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derived.toString('hex'), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/** Contas antigas sem o campo seguem ativas */
export function isUserActive(user) {
  if (!user) return false;
  return user.is_active !== false;
}

export function assertAuthPayload({ email, password, name }, { requireName = false } = {}) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@') || e.length < 5) {
    throw Object.assign(new Error('Informe um e-mail válido'), { status: 400 });
  }
  if (!password || String(password).length < 6) {
    throw Object.assign(new Error('Senha deve ter ao menos 6 caracteres'), { status: 400 });
  }
  if (requireName && !String(name || '').trim()) {
    throw Object.assign(new Error('Informe seu nome'), { status: 400 });
  }
  return { email: e, password: String(password), name: String(name || '').trim() };
}
