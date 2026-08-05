/**
 * desafio-ciclo-sinais-v1 · desafio-ciclo-math
 * Lucro alvo padrão ~5%; comissão casa default 4,5%
 * Marcador: desafio-dnb-flag-v1 (Empate Anula/DNB — não resolver por isDraw 1X2)
 */

export const DESAFIO_CICLO_VERSION = 'desafio-ciclo-sinais-v1';
export const DEFAULT_TARGET_PROFIT = 0.05;
export const DEFAULT_HOUSE_COMMISSION = 0.045;
export const MAX_ENTRIES_PER_CYCLE = 5;

/**
 * odd_futgreen-surebet-v1: gera a odd ARBISHIELD a partir da odd_casa real (BetBra)
 * garantindo lucro alvo (default 5%) em ambos os resultados — surebet clássico:
 * 1/oddArbi + 1/oddCasa = 1 - targetProfit
 * @param {number} oddCasa - odd real na BetBra (lado casa/favorito)
 * @param {number} targetProfit - margem de lucro alvo (default 5%)
 */
export function computeSurebetOddArbi({ oddCasa, targetProfit = DEFAULT_TARGET_PROFIT }) {
  const oc = Number(oddCasa);
  const m = Number(targetProfit);
  if (!(oc > 1)) throw new Error('odd_casa inválida para gerar odd surebet');
  const inv = 1 - m - 1 / oc;
  if (!(inv > 0)) throw new Error('não é possível gerar odd surebet com essa odd_casa/margem');
  return Math.round((1 / inv) * 100) / 100;
}

/**
 * Valor a apostar na BetBra (odd_casa) para igualar o retorno da entrada ARBISHIELD,
 * travando o mesmo retorno bruto em ambos os lados (dutching clássico).
 * @param {number} stakeArbiReais - stake debitado da Carteira Desafio
 * @param {number} oddArbi - odd na ARBISHIELD (zebra/indicação)
 * @param {number} oddCasa - odd real na BetBra
 */
export function suggestedHouseStake({ stakeArbiReais, oddArbi, oddCasa }) {
  const s = Number(stakeArbiReais);
  const oa = Number(oddArbi);
  const oc = Number(oddCasa);
  if (!(s > 0) || !(oa > 1) || !(oc > 1)) {
    throw new Error('parâmetros inválidos para suggestedHouseStake');
  }
  const betbraStake = (s * oa) / oc;
  return Math.round(betbraStake * 100) / 100;
}

/** Crédito na Carteira Desafio quando a indicação perde na BetBra (proteção) */
export function zebraPayoutCents(stakeCents, oddArbi) {
  const stake = Number(stakeCents);
  const odd = Number(oddArbi);
  if (!(stake > 0) || !(odd > 1)) throw new Error('stake/odd inválidos');
  // Credita stake + lucro = stake * odd (payout completo reutilizável)
  return Math.round(stake * odd);
}

/** Lucro isolado (sem devolver stake) — lado casa, se houver */
export function houseProfitOnlyCents(stakeCents, oddCasa, houseCommission = DEFAULT_HOUSE_COMMISSION) {
  const stake = Number(stakeCents) / 100;
  const odd = Number(oddCasa);
  const profit = stake * (odd - 1) * (1 - houseCommission);
  return Math.round(profit * 100);
}

/**
 * desafio-dnb-flag-v1:
 * Empate Anula/DNB é aposta no time (V no vencedor, × no outro, E se empatar).
 * NÃO resolver pelo ramo 1X2 isDraw.
 */
export function resolveDesafioMarketResult({ marketFlag, winningSide, homeScore, awayScore, betTeamSide }) {
  const flag = String(marketFlag || '').toLowerCase();
  if (flag === 'dnb' || flag === 'empate_anula' || flag === 'draw_no_bet') {
    const hs = Number(homeScore);
    const as = Number(awayScore);
    if (Number.isFinite(hs) && Number.isFinite(as) && hs === as) {
      return { result: 'void', reason: 'empate_anula' };
    }
    // Se placar define vencedor, compara com time apostado
    if (Number.isFinite(hs) && Number.isFinite(as) && betTeamSide) {
      const winner = hs > as ? 'home' : 'away';
      const won = winner === betTeamSide;
      return { result: won ? 'won' : 'lost', reason: 'dnb_team' };
    }
  }
  return { result: winningSide, reason: 'explicit' };
}

export function previewSinal(step, stakeArbiReais) {
  const oddArbi = Number(step.odd_arbishield || step.odd_futgreen || step.oddArbi);
  const oddCasa = Number(step.odd_casa || step.oddCasa);
  const liq = Number(step.liquidity || step.liquidez || 0);
  const houseStake = suggestedHouseStake({ stakeArbiReais, oddArbi, oddCasa });
  return {
    stakeArbi: stakeArbiReais,
    oddArbi,
    oddCasa,
    houseStake,
    liquidity: liq,
    targetProfit: DEFAULT_TARGET_PROFIT,
    payoutIfZebra: Math.round(stakeArbiReais * oddArbi * 100) / 100,
  };
}
