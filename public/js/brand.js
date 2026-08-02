/** Identidade FUTGRN */
export const BRAND = {
  name: 'FUTGRN',
  short: 'FUTGRN',
  legal: 'FutGrn',
  tagline: 'Proteção & Desafio',
  mark: '/public/brand/futgrn-mark.svg',
  avatar: '/public/brand/futgrn-avatar.svg',
  iconPng: '/public/brand/futgrn-icon-1024.png',
  favicon: '/public/brand/favicon.svg',
};

/** Wordmark HTML reutilizável (sidebar / mobile) */
export function brandLink({ href = '/', compact = false } = {}) {
  return `
    <a class="fg-brand${compact ? ' fg-brand-mobile' : ''}" href="${href}" aria-label="${BRAND.name}">
      <img class="fg-logo" src="${BRAND.mark}" width="28" height="28" alt="" />
      <span class="fg-wordmark">${BRAND.name}</span>
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
