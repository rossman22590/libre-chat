import type { RefillIntervalUnit } from 'librechat-data-provider';
import type { Document, Types } from 'mongoose';

export interface IBalance extends Document {
  user: Types.ObjectId;
  tokenCredits: number;
  // Automatic refill settings
  autoRefillEnabled: boolean;
  refillIntervalValue: number;
  refillIntervalUnit: RefillIntervalUnit;
  lastRefill: Date;
  refillAmount: number;
  usageResets?: Date[];
  bonusResets?: number;
  tenantId?: string;
}

/** Plain data fields for creating or updating a balance record (no Mongoose Document methods) */
export interface IBalanceUpdate {
  user?: string;
  tokenCredits?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: RefillIntervalUnit;
  refillAmount?: number;
  lastRefill?: Date;
}

/** Outcome of a successful usage reset; `balance` reflects the record after the reset */
export interface UsageResetClaim {
  source: 'daily' | 'bonus';
  balance: Pick<IBalance, 'tokenCredits' | 'usageResets' | 'bonusResets'>;
}
