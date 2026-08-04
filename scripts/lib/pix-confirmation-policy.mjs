/**
 * Política de confirmação PIX após webhook do gateway.
 * Default: manual (admin aprova). Automático: PIX_AUTO_GATEWAY_CONFIRM=1
 */

export function isAutoConfirmGateway() {
  const v = String(process.env.PIX_AUTO_GATEWAY_CONFIRM || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
