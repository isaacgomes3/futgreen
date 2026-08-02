/** Espelho browser do desafio-ciclo-math (sinais / preview local) */
export const DEFAULT_TARGET_PROFIT = 0.05;
export const DEFAULT_HOUSE_COMMISSION = 0.045;

export function suggestedHouseStake({ stakeArbiReais, oddArbi, oddCasa, houseCommission = DEFAULT_HOUSE_COMMISSION }) {
  const s = Number(stakeArbiReais);
  const oa = Number(oddArbi);
  const oc = Number(oddCasa);
  const ocEff = 1 + (oc - 1) * (1 - houseCommission);
  const cover = (s * (oa - 1)) / (ocEff - 1);
  return Math.round(cover * 100) / 100;
}

export function previewSinal(step, stakeArbiReais) {
  const oddArbi = Number(step.odd_futgreen || step.odd_arbishield || step.oddArbi);
  const oddCasa = Number(step.odd_casa || step.oddCasa);
  const houseCommission = Number(step.house_commission ?? DEFAULT_HOUSE_COMMISSION);
  const houseStake = suggestedHouseStake({ stakeArbiReais, oddArbi, oddCasa, houseCommission });
  return {
    stakeArbi: stakeArbiReais,
    oddArbi,
    oddCasa,
    houseStake,
    payoutIfZebra: Math.round(stakeArbiReais * oddArbi * 100) / 100,
    houseCommission,
    targetProfit: DEFAULT_TARGET_PROFIT,
  };
}
