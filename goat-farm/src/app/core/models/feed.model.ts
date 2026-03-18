import { Timestamp } from 'firebase/firestore';

export type FeedType = 'concentrate' | 'green_fodder' | 'dry_fodder' | 'mineral_mixture' | 'supplement';

export interface FeedLog {
  id: string;
  farmId: string;
  feedType: FeedType;
  feedName: string;
  quantityKg: number;
  unitCostInr: number;
  totalCostInr: number;
  targetType: 'individual' | 'group';
  goatId?: string;
  groupName?: string;
  feedDate: Timestamp;
  createdAt: Timestamp;
  createdBy: string;
}

export interface FeedStock {
  id: string;
  farmId: string;
  feedType: FeedType;
  feedName: string;
  currentStockKg: number;
  minimumStockKg: number;
  lastRestockedDate: Timestamp;
  unitCostInr: number;
  updatedAt: Timestamp;
}
