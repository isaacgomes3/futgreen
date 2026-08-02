/**
 * Espelho tipado de scripts/lib/desafio-ciclo-math.mjs
 * Contrato: desafio-ciclo-sinais-v1
 */
export const DESAFIO_CICLO_VERSION = 'desafio-ciclo-sinais-v1';
export const DEFAULT_TARGET_PROFIT = 0.05;
export const DEFAULT_HOUSE_COMMISSION = 0.045;
export const MAX_ENTRIES_PER_CYCLE = 5;

export function suggestedHouseStake(input: {
  stakeArbiReais: number;
  oddArbi: number;
  oddCasa: number;
  houseCommission?: number;
}): number {
  const c = input.houseCommission ?? DEFAULT_HOUSE_COMMISSION;
  const ocEff = 1 + (input.oddCasa - 1) * (1 - c);
  return Math.round(((input.stakeArbiReais * (input.oddArbi - 1)) / (ocEff - 1)) * 100) / 100;
}

export function zebraPayoutCents(stakeCents: number, oddArbi: number): number {
  return Math.round(stakeCents * oddArbi);
}
