/**
 * Live reload local — SSE + watcher de arquivos estáticos.
 * Ativo somente com FG_LOCAL=1.
 */
import fs from 'node:fs';
import path from 'node:path';

const clients = new Set();
let generation = 1;

export function livereloadEnabled() {
  return process.env.FG_LOCAL === '1' || process.env.NODE_ENV === 'development';
}

export function attachLivereload(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', generation })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

export function broadcastReload(reason = 'change') {
  generation += 1;
  const payload = `data: ${JSON.stringify({ type: 'reload', generation, reason })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function injectLivereload(html) {
  if (!livereloadEnabled()) return html;
  const snippet = `
<script>
(() => {
  const es = new EventSource('/__livereload');
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'reload') location.reload();
    } catch {}
  };
  es.onerror = () => { /* reconnect automático do EventSource */ };
})();
</script>
`;
  if (html.includes('</body>')) return html.replace('</body>', `${snippet}</body>`);
  return html + snippet;
}

export function watchForReload(rootDir, { onReload } = {}) {
  if (!livereloadEnabled()) return () => {};
  const watchDirs = [
    rootDir,
    path.join(rootDir, 'public'),
    path.join(rootDir, 'local'),
  ];
  const watchers = [];
  let timer = null;
  const bounce = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const rel = path.relative(rootDir, file);
      console.log(`[livereload] ${rel}`);
      broadcastReload(rel);
      onReload?.(rel);
    }, 120);
  };

  for (const dir of watchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const w = fs.watch(dir, { recursive: true }, (_evt, filename) => {
        if (!filename) return;
        if (filename.includes('data' + path.sep) || filename.endsWith('.json')) return;
        if (filename.includes('node_modules')) return;
        bounce(path.join(dir, filename));
      });
      watchers.push(w);
    } catch (e) {
      console.warn('[livereload] watch falhou em', dir, e.message);
    }
  }

  return () => watchers.forEach((w) => w.close());
}
