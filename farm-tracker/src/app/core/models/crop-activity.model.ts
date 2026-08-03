import { Timestamp } from '@angular/fire/firestore';

export type CropActivityType = 'irrigation' | 'fertilizer' | 'pruning' | 'spraying' |
  'weeding' | 'flowering' | 'harvest' | 'planting' | 'mulching' | 'soil_testing' | 'other';

export interface CropActivity {
  id: string;
  segment: string;
  segmentName: string;
  activityType: CropActivityType;
  date: Timestamp;
  description: string;

  productUsed?: string;
  quantity?: number;
  unit?: string;
  area?: string;
  duration?: number;
  laborCount?: number;

  cost?: number;
  linkedTransactionId?: string;
  /** True when the cost was recorded WITHOUT creating an expense (e.g. material applied from already-purchased bulk stock). */
  expenseSkipped?: boolean;

  weather?: string;
  temperature?: number;

  note?: string;

  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
  month: string;
  year: number;
}
