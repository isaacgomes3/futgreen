/** Identidade FUTGREEN */
export const BRAND = {
  name: 'FUTGREEN',
  short: 'FUTGREEN',
  legal: 'FutGreen',
  tagline: 'Proteção & Desafio',
  /** FUT branco · GREEN lime — mesmo corte visual da marca */
  parts: { lead: 'FUT', accent: 'GREEN' },
  mark: '/public/brand/futgrn-mark.svg',
  avatar: '/public/brand/futgrn-avatar.svg',
  iconPng: '/public/brand/futgrn-icon-1024.png',
  favicon: '/public/brand/favicon.svg',
};

/** Wordmark HTML: FUT (branco) + GREEN (lime) */
export function wordmarkHtml() {
  return `<span class="fg-wordmark" aria-label="${BRAND.name}"><span class="fg-wm-lead">${BRAND.parts.lead}</span><span class="fg-wm-accent">${BRAND.parts.accent}</span></span>`;
}

/** Wordmark HTML reutilizável (sidebar / mobile) */
export function brandLink({ href = '/', compact = false } = {}) {
  return `
    <a class="fg-brand${compact ? ' fg-brand-mobile' : ''}" href="${href}" aria-label="${BRAND.name}">
      <img class="fg-logo" src="${BRAND.mark}" width="28" height="28" alt="" />
      ${wordmarkHtml()}
    </a>
  `;
}

export function injectFavicons() {
  const head = document.head;
  const tags = [
    ['icon', BRAND.favicon, 'image/svg+xml'],
    ['apple-touch-icon', '/public/brand/apple-touch-icon.png', null],
  ];
  for (const [rel, href, type] of tags) {
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (type) link.type = type;
    head.appendChild(link);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#070908';
    head.appendChild(meta);
  }
}
