/**
 * Espelho tipado do create-protection (runtime em scripts/lib/create-protection.mjs).
 * Modelo: stake_lock_v1
 */
export type ProtectionSide = 'LAY' | 'BACK';

export interface CreateProtectionInput {
  userId: string;
  matchId: string;
  side: ProtectionSide;
  odd: number;
  amountCents: number;
}

export const CREATE_PROTECTION_MODEL = 'stake_lock_v1' as const;
