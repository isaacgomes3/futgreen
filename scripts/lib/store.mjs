import fs from 'node:fs';
import path from 'node:path';
import { emptyWallet } from './wallet-buckets-contract.mjs';

const DEFAULT_DATA = () => ({
  meta: { version: 1, created_at: new Date().toISOString() },
  users: [],
  matches: [],
  protections: [],
  desafios: [],
  desafio_steps: [],
  desafio_participations: [],
  wallet_transactions: [],
  manual_deposits: [],
  withdrawals: [],
  expenses: [],
  area_entries: [],
  treasury_moves: [],
  sessions: {},
  football_teams: [
    { id: 'flamengo', name: 'Flamengo', logo: '/assets/teams/flamengo.svg' },
    { id: 'palmeiras', name: 'Palmeiras', logo: '/assets/teams/palmeiras.svg' },
    { id: 'corinthians', name: 'Corinthians', logo: '/assets/teams/corinthians.svg' },
    { id: 'sao-paulo', name: 'São Paulo', logo: '/assets/teams/sao-paulo.svg' },
    { id: 'fluminense', name: 'Fluminense', logo: '/assets/teams/fluminense.svg' },
    { id: 'gremio', name: 'Grêmio', logo: '/assets/teams/gremio.svg' },
    { id: 'internacional', name: 'Internacional', logo: '/assets/teams/internacional.svg' },
    { id: 'atletico-mg', name: 'Atlético-MG', logo: '/assets/teams/atletico-mg.svg' },
  ],
});

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = DEFAULT_DATA();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.data = { ...DEFAULT_DATA(), ...JSON.parse(raw) };
      } else {
        this.ensureDir();
        this.save();
      }
    } catch {
      this.data = DEFAULT_DATA();
      this.ensureDir();
      this.save();
    }
    // Migração leve: coleções financeiras novas
    if (!Array.isArray(this.data.withdrawals)) this.data.withdrawals = [];
    if (!Array.isArray(this.data.expenses)) this.data.expenses = [];
    if (!Array.isArray(this.data.area_entries)) this.data.area_entries = [];
    if (!Array.isArray(this.data.treasury_moves)) this.data.treasury_moves = [];
  }

  ensureDir() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  save() {
    this.ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  nextId(prefix) {
    return uid(prefix);
  }

  getUser(id) {
    return this.data.users.find((u) => u.id === id) || null;
  }

  getUserByEmail(email) {
    const e = String(email || '').toLowerCase();
    return this.data.users.find((u) => u.email.toLowerCase() === e) || null;
  }

  upsertUser(user) {
    const existing = this.getUser(user.id) || this.getUserByEmail(user.email);
    if (existing) {
      Object.assign(existing, user, { wallet: { ...emptyWallet(), ...existing.wallet, ...user.wallet } });
      this.save();
      return existing;
    }
    const row = {
      id: user.id || uid('user'),
      email: user.email,
      name: user.name || user.email.split('@')[0],
      role: user.role || 'client',
      is_active: user.is_active !== false,
      wallet: { ...emptyWallet(), ...user.wallet },
      created_at: new Date().toISOString(),
    };
    if (user.password_hash) row.password_hash = user.password_hash;
    if (user.is_active === false) row.is_active = false;
    this.data.users.push(row);
    this.save();
    return row;
  }

  patchWallet(userId, patch) {
    const user = this.getUser(userId);
    if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
    user.wallet = { ...emptyWallet(), ...user.wallet };
    for (const [k, v] of Object.entries(patch)) {
      if (k in user.wallet) user.wallet[k] = Math.max(0, Math.round(Number(v)));
    }
    this.save();
    return user;
  }

  addTx(tx) {
    const row = {
      id: uid('tx'),
      created_at: new Date().toISOString(),
      ...tx,
    };
    this.data.wallet_transactions.unshift(row);
    this.save();
    return row;
  }

  listTx({ userId, limit = 100 } = {}) {
    let rows = this.data.wallet_transactions;
    if (userId) rows = rows.filter((t) => t.user_id === userId);
    return rows.slice(0, limit);
  }
}

export function createStore(dataDir = './data') {
  const file = path.resolve(dataDir, 'futgreen.json');
  return new Store(file);
}
