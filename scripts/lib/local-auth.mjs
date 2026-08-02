/**
 * Senhas padrão para contas seed no ambiente local (FG_LOCAL).
 */
import { hashPassword } from './auth.mjs';

export const LOCAL_DEV_PASSWORD = 'Futgreen@local';

export const LOCAL_SEED_EMAILS = [
  'admin@futgreen.local',
  'isaac@futgreen.local',
  'carlos@futgreen.local',
  'cliente@futgreen.local',
];

/**
 * Garante password_hash nas contas seed locais.
 * - Sem senha → aplica Futgreen@local
 * - LOCAL_RESET_SEED_PASSWORDS=1 → regrava senha padrão
 */
export async function ensureLocalSeedPasswords(store) {
  const force = process.env.LOCAL_RESET_SEED_PASSWORDS === '1';
  let changed = false;
  let hash = null;
  for (const email of LOCAL_SEED_EMAILS) {
    const u = store.getUserByEmail(email);
    if (!u) continue;
    if (u.password_hash && !force) continue;
    if (!hash) hash = await hashPassword(LOCAL_DEV_PASSWORD);
    u.password_hash = hash;
    u.is_active = true;
    changed = true;
  }
  if (changed) store.save();
  return { changed, password: LOCAL_DEV_PASSWORD, emails: LOCAL_SEED_EMAILS };
}
