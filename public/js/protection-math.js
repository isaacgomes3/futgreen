/** Preview client-side — espelha protection-flow-contract-v11 */

export const EXCHANGE_COMMISSION = 0.025;
export const CLIENT_PROFIT_SHARE = 0.01;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function calcGrossProfitReais({ side, amountReais, odd }) {
  const o = Number(odd);
  const a = Number(amountReais);
  if (!(o > 1) || !(a > 0)) return 0;
  if (String(side).toUpperCase() === 'LAY') return round2(a / (o - 1));
  return round2(a * (o - 1));
}

export function calcIndicationEconomics({ side, amountReais, odd }) {
  const gross = calcGrossProfitReais({ side, amountReais, odd });
  // 1% sobre stake/responsabilidade (não sobre o lucro bruto)
  const client = round2(Number(amountReais) * CLIENT_PROFIT_SHARE);
  const exchange = round2(gross * EXCHANGE_COMMISSION);
  const futgreen = round2(Math.max(0, gross - client - exchange));
  const sideU = String(side || 'LAY').toUpperCase();
  return {
    side: sideU,
    odd: Number(odd),
    amount_reais: round2(amountReais),
    amount_kind: sideU === 'BACK' ? 'stake' : 'liability',
    gross_profit_reais: gross,
    client_share_reais: client,
    exchange_fee_reais: exchange,
    futgreen_share_reais: futgreen,
    wallet_deduction_cents: 0,
  };
}
