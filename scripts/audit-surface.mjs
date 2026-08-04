#!/usr/bin/env node
/**
 * Auditoria de superfície — garante arquivos e contratos críticos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { protectionHealthPayload, CREATE_PROTECTION_MODEL } from './lib/protection-flow-contract.mjs';
import { labelForBucket } from './lib/wallet-buckets-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html',
  'app.html',
  'entrar.html',
  'cadastro.html',
  'public/assets/hero-stadium.jpg',
  'app-proteger.html',
  'app-protecoes.html',
  'app-desafio.html',
  'app-desafio-jornada.html',
  'app-carteira.html',
  'app-indicacao.html',
  'app-perfil.html',
  'admin-jogos.html',
  'admin-desafios.html',
  'admin-monitoring-desafios.html',
  'admin-monitoring-protections.html',
  'admin-manual-deposits.html',
  'admin-financeiro.html',
  'admin-users.html',
  'admin-transactions.html',
  'scripts/lib/protection-flow-contract.mjs',
  'scripts/lib/wallet-buckets-contract.mjs',
  'scripts/lib/admin-ops-contract.mjs',
  'scripts/lib/financeiro-ops.mjs',
  'docs/PROTECTION_FLOW_LOCKED.md',
  'docs/SYSTEM_NON_REGRESSION.md',
  'AGENTS.md',
  'local/index.html',
  'local/workshop.js',
  'scripts/local-dev.mjs',
  'public/brand/futgrn-mark.svg',
  'public/brand/futgrn-avatar.svg',
  'public/brand/favicon.svg',
  'public/js/brand.js',
  'brand.html',
];

let failed = 0;
for (const rel of required) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    console.error('MISSING', rel);
    failed++;
  }
}

const health = protectionHealthPayload();
if (health.createProtectionModel !== 'stake_lock_v1') {
  console.error('BAD model', health.createProtectionModel);
  failed++;
}
if (CREATE_PROTECTION_MODEL !== 'stake_lock_v1') failed++;
if (labelForBucket('deduction_balance_cents') !== 'Saldo Reembolso') {
  console.error('BAD label Reembolso');
  failed++;
}

if (failed) {
  console.error(`audit:prod FAIL (${failed})`);
  process.exit(1);
}
console.log('audit:prod OK — surface + contracts');
console.log(health);
