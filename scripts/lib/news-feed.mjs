/**
 * news-feed-v1
 * Proxy simples para notícias de futebol via API não-oficial da FotMob
 * (https://www.fotmob.com/api/worldnews). Sem chave/autenticação — mesma
 * fonte já usada em live-score-sync.mjs para placares/escudos.
 * Cache em memória (TTL) para não bater no FotMob a cada refresh de tela.
 */

const FOTMOB_NEWS_URL = 'https://www.fotmob.com/api/worldnews';
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

let cache = { at: 0, lang: null, items: [] };

function normalizeItem(raw) {
  return {
    id: String(raw.id || raw.page?.url || Math.random()),
    title: raw.title || '',
    image_url: raw.imageUrl || null,
    source: raw.sourceStr || raw.source || 'FotMob',
    source_icon: raw.sourceIconUrl || null,
    url: raw.page?.url || raw.url || null,
    published_at: raw.gmtTime || null,
  };
}

export async function fetchWorldNews({ lang = 'pt-BR', page = 1, force = false } = {}) {
  const now = Date.now();
  if (!force && cache.lang === lang && now - cache.at < NEWS_CACHE_TTL_MS) {
    return cache.items;
  }
  const res = await fetch(`${FOTMOB_NEWS_URL}?page=${encodeURIComponent(page)}&lang=${encodeURIComponent(lang)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw Object.assign(new Error(`FotMob news HTTP ${res.status}`), { status: 502 });
  const raw = await res.json();
  const items = (Array.isArray(raw) ? raw : []).map(normalizeItem).filter((it) => it.title);
  cache = { at: now, lang, items };
  return items;
}
