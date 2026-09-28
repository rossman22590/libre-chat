import type { TUsagePeriodDays } from 'librechat-data-provider';
import { createStorageAtom } from './jotai-utils';

/** Lookback window shared by the Usage tab's spending, model and chat sections */
export const usagePeriodAtom = createStorageAtom<TUsagePeriodDays>('usagePeriodDays', 30);
