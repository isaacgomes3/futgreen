#!/usr/bin/env node
/**
 * Cria/atualiza acesso master (admin allowlist + senha).
 * Uso: node scripts/create-master.mjs --email=isaacgomes3@gmail.com --password='...'
 * Se --password omitido, gera uma senha temporária.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.mjs';
import { hashPassword, normalizeEmail } from './lib/auth.mjs';
import { emptyWallet } from './lib/wallet-buckets-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  }),
);

const email = normalizeEmail(args.email || 'isaacgomes3@gmail.com');
const name = String(args.name || 'Isaac Gomes');
const password = args.password ? String(args.password) : crypto.randomBytes(9).toString('base64url');

const store = createStore(DATA_DIR);
const existing = store.getUserByEmail(email);
const password_hash = await hashPassword(password);

if (existing) {
  existing.name = name || existing.name;
  existing.role = 'admin';
  existing.is_active = true;
  existing.password_hash = password_hash;
  store.save();
  console.log(JSON.stringify({ ok: true, action: 'updated', email, password }, null, 2));
} else {
  store.upsertUser({
    email,
    name,
    role: 'admin',
    is_active: true,
    password_hash,
    wallet: {
      ...emptyWallet(),
      balance_cents: 0,
      demo_balance_cents: 0,
    },
  });
  console.log(JSON.stringify({ ok: true, action: 'created', email, password }, null, 2));
}
