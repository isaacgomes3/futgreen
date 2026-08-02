/** Apresentação de times com logo (área do usuário) */

export function teamAvatar(name, logo, { size = 48 } = {}) {
  const initial = (name || '?').slice(0, 2).toUpperCase();
  const safeName = String(name || '').replace(/"/g, '&quot;');
  return `<span class="fg-team-avatar" style="--avatar-size:${size}px" data-initial="${initial}">
    ${
      logo
        ? `<img class="fg-team-logo" src="${logo}" alt="${safeName}" width="${size}" height="${size}" loading="lazy" onerror="this.remove()" />`
        : ''
    }
    <span class="fg-logo-fallback" aria-hidden="true">${initial}</span>
  </span>`;
}

export function teamBlock(name, logo, { size = 48 } = {}) {
  return `<div class="fg-team">${teamAvatar(name, logo, { size })}<span>${name || '—'}</span></div>`;
}

/** Célula compacta para tabelas / listas */
export function teamPairCell(home, away, homeLogo, awayLogo) {
  return `<div class="fg-team-pair">
    <span class="fg-team-mini">${teamAvatar(home, homeLogo, { size: 28 })}<strong>${home || '—'}</strong></span>
    <span class="fg-vs">×</span>
    <span class="fg-team-mini"><strong>${away || '—'}</strong>${teamAvatar(away, awayLogo, { size: 28 })}</span>
  </div>`;
}
