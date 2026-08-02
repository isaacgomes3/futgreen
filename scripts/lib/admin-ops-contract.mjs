/**
 * admin-ops-contract-v1
 * Allowlist de e-mail + MFA — role no banco não basta.
 * Ops especiais: Isaac/Carlos (protect-ops-isaac-carlos-v1)
 */

export const ADMIN_OPS_VERSION = 'admin-ops-contract-v1';
export const PROTECT_OPS_ISAAC_CARLOS = 'protect-ops-isaac-carlos-v1';
export const BLOCK_CANCEL_DELETE_ANDAMENTO = 'block-cancel-delete-andamento-v1';
export const ADMIN_DESAFIOS_EDIT_PRESERVA = 'admin-desafios-edit-preserva-publicacao-v1';

export function parseAllowedAdminEmails(envValue) {
  return String(envValue || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email, allowedList) {
  const e = String(email || '').trim().toLowerCase();
  return Boolean(e) && allowedList.map((x) => x.toLowerCase()).includes(e);
}

/** Isaac/Carlos podem cancelar desafio publicado/agendado (não ao vivo) */
export function canCancelPublishedDesafio(email) {
  const e = String(email || '').toLowerCase();
  return e.startsWith('isaac@') || e.startsWith('carlos@') || e.includes('isaac') || e.includes('carlos');
}

export function assertCanCancelOrDeleteDesafio({ stepStatus, email, force = false }) {
  const status = String(stepStatus || '').toLowerCase();
  if (status === 'live' || status === 'andamento' || status === 'in_play') {
    const err = new Error('Etapa ao vivo: só liquidar — cancelar/excluir bloqueado');
    err.status = 403;
    err.code = BLOCK_CANCEL_DELETE_ANDAMENTO;
    throw err;
  }
  if ((status === 'published' || status === 'scheduled' || status === 'active') && !force) {
    if (!canCancelPublishedDesafio(email)) {
      const err = new Error('Apenas ops Isaac/Carlos podem cancelar desafio publicado');
      err.status = 403;
      err.code = PROTECT_OPS_ISAAC_CARLOS;
      throw err;
    }
  }
}

export function editDesafioPreservesPublication(existing, patch, mode) {
  if (mode !== 'edit_only') return { ...existing, ...patch };
  return {
    ...existing,
    ...patch,
    is_active: existing.is_active,
    published_at: existing.published_at,
    is_published: existing.is_published,
  };
}
