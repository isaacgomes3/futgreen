#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.mjs';
import { createDesafio } from './lib/desafio-ops.mjs';
import { hashPassword } from './lib/auth.mjs';
import { LOCAL_DEV_PASSWORD } from './lib/local-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = createStore(path.join(ROOT, 'data'));
const password_hash = await hashPassword(LOCAL_DEV_PASSWORD);

store.upsertUser({
  email: 'admin@futgreen.local',
  name: 'Admin',
  role: 'admin',
  is_active: true,
  password_hash,
  wallet: {
    balance_cents: 0,
    deduction_balance_cents: 0,
    locked_balance_cents: 0,
    desafio_balance_cents: 0,
    investor_balance_cents: 0,
    demo_balance_cents: 0,
  },
});

store.upsertUser({
  email: 'isaac@futgreen.local',
  name: 'Isaac',
  role: 'admin',
  is_active: true,
  password_hash,
});

store.upsertUser({
  email: 'carlos@futgreen.local',
  name: 'Carlos',
  role: 'admin',
  is_active: true,
  password_hash,
});

const cliente = store.upsertUser({
  email: 'cliente@futgreen.local',
  name: 'Cliente Demo',
  role: 'client',
  is_active: true,
  password_hash,
  wallet: {
    balance_cents: 1000000, // R$ 10.000
    deduction_balance_cents: 20000, // R$ 200 reembolso
    locked_balance_cents: 0,
    desafio_balance_cents: 50000, // R$ 500 desafio
    investor_balance_cents: 0,
    demo_balance_cents: 100000,
  },
});

const in3h = new Date(Date.now() + 3 * 3600e3).toISOString();
const in6h = new Date(Date.now() + 6 * 3600e3).toISOString();

const m1 = {
  id: store.nextId('match'),
  home_team: 'Flamengo',
  away_team: 'Palmeiras',
  league: 'Brasileirão',
  starts_at: in3h,
  is_published: true,
  published_at: new Date().toISOString(),
  source: 'seed',
  created_at: new Date().toISOString(),
  settled_at: null,
  home_score: null,
  away_score: null,
};
const m2 = {
  id: store.nextId('match'),
  home_team: 'Grêmio',
  away_team: 'Internacional',
  league: 'Brasileirão',
  starts_at: in6h,
  is_published: true,
  published_at: new Date().toISOString(),
  source: 'seed',
  created_at: new Date().toISOString(),
  settled_at: null,
  home_score: null,
  away_score: null,
};
store.data.matches.push(m1, m2);

// Seed de Jornada fica rascunho — não entra na grade/cliente
await createDesafio(store, {
  title: 'Desafio seed',
  publish: false,
  steps: [
    {
      home_team: 'Corinthians',
      away_team: 'São Paulo',
      bet_team_side: 'away',
      odd_futgreen: 4.2,
      odd_casa: 1.48,
      liquidity: 8000,
      starts_at: in3h,
      market_flag: 'dnb',
      casa_name: 'Casa',
      casa_logo: '/public/assets/casa-default.svg',
    },
  ],
});

store.save();
console.log('Seed OK');
console.log('  login local (todos seed): senha', LOCAL_DEV_PASSWORD);
console.log('  cliente:', cliente.email, cliente.wallet);
console.log('  matches publicados:', store.data.matches.filter((m) => m.is_published).length);
console.log('  desafios:', store.data.desafios.length);
console.log('Rode: npm start → http://localhost:3101');
