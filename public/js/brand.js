/** Identidade ARBISHIELD */
export const BRAND = {
  name: 'ARBISHIELD',
  short: 'ARBISHIELD',
  legal: 'ArbiShield',
  tagline: '',
  /** ARBI branco · SHIELD lime — mesmo corte visual da marca */
  parts: { lead: 'ARBI', accent: 'SHIELD' },
  mark: '/public/brand/arbishield-mark.svg',
  avatar: '/public/brand/arbishield-avatar.svg',
  iconPng: '/public/brand/arbishield-icon-1024.png',
  favicon: '/public/brand/favicon.svg',
};

/** Wordmark HTML: ARBI (branco) + SHIELD (lime) */
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
