#!/usr/bin/env node
/**
 * Ambiente local FutGreen — visualização e aprimoramento.
 * Sobe API + live reload + hub /local/
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStore } from './lib/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3101);
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const dbFile = path.join(DATA_DIR, 'futgreen.json');

process.env.FG_LOCAL = '1';
process.env.PORT = String(PORT);

// carrega .env simples (KEY=VALUE)
try {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (process.env[m[1]] == null || process.env[m[1]] === '') {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
} catch { /* ignore */ }

function ensureSeed() {
  const force = process.argv.includes('--reseed');
  if (force && fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
    console.log('[local] dados anteriores removidos (--reseed)');
  }
  const store = createStore(DATA_DIR);
  const hasCliente = Boolean(store.getUserByEmail('cliente@futgreen.local'));
  const hasMatches = store.data.matches.length > 0;
  if (!hasCliente || !hasMatches || force) {
    console.log('[local] rodando seed…');
    const seed = spawn(process.execPath, [path.join(ROOT, 'scripts', 'seed.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    return new Promise((resolve, reject) => {
      seed.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('seed falhou'))));
    });
  }
  console.log('[local] seed já presente — mantendo data/futgreen.json');
  return Promise.resolve();
}

async function main() {
  await ensureSeed();

  const child = spawn(
    process.execPath,
    ['--watch', path.join(ROOT, 'scripts', 'futgreen-server.mjs')],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        FG_LOCAL: '1',
        PORT: String(PORT),
      },
    },
  );

  const hub = `http://localhost:${PORT}/local/`;
  const home = `http://localhost:${PORT}/`;

  setTimeout(() => {
    console.log('');
    console.log('══════════════════════════════════════════════');
    console.log('  FutGreen · ambiente local');
    console.log(`  Hub workshop → ${hub}`);
    console.log(`  App          → ${home}`);
    console.log(`  Health       → http://localhost:${PORT}/health`);
    console.log('  Live reload  → HTML/CSS/JS (FG_LOCAL=1)');
    console.log('  Reseed       → npm run local -- --reseed');
    console.log('══════════════════════════════════════════════');
    console.log('');
  }, 600);

  const open = process.argv.includes('--open');
  if (open) {
    setTimeout(() => {
      const cmd =
        process.platform === 'win32'
          ? spawn('cmd', ['/c', 'start', '', hub], { stdio: 'ignore', detached: true })
          : spawn('xdg-open', [hub], { stdio: 'ignore', detached: true });
      cmd.unref();
    }, 900);
  }

  const shutdown = () => {
    child.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
