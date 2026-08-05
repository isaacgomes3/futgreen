/** Espelho browser do desafio-ciclo-math (sinais / preview local) */
export const DEFAULT_TARGET_PROFIT = 0.05;
export const DEFAULT_HOUSE_COMMISSION = 0.045;

/** odd_futgreen-surebet-v1: 1/oddArbi + 1/oddCasa = 1 - targetProfit */
export function computeSurebetOddArbi({ oddCasa, targetProfit = DEFAULT_TARGET_PROFIT }) {
  const oc = Number(oddCasa);
  const m = Number(targetProfit);
  if (!(oc > 1)) return null;
  const inv = 1 - m - 1 / oc;
  if (!(inv > 0)) return null;
  return Math.round((1 / inv) * 100) / 100;
}

export function suggestedHouseStake({ stakeArbiReais, oddArbi, oddCasa }) {
  const s = Number(stakeArbiReais);
  const oa = Number(oddArbi);
  const oc = Number(oddCasa);
  const betbraStake = (s * oa) / oc;
  return Math.round(betbraStake * 100) / 100;
}

export function previewSinal(step, stakeArbiReais) {
  const oddArbi = Number(step.odd_futgreen || step.odd_arbishield || step.oddArbi);
  const oddCasa = Number(step.odd_casa || step.oddCasa);
  const houseStake = suggestedHouseStake({ stakeArbiReais, oddArbi, oddCasa });
  return {
    stakeArbi: stakeArbiReais,
    oddArbi,
    oddCasa,
    houseStake,
    payoutIfZebra: Math.round(stakeArbiReais * oddArbi * 100) / 100,
    targetProfit: DEFAULT_TARGET_PROFIT,
  };
}
