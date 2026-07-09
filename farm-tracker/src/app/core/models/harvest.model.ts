import { Timestamp } from '@angular/fire/firestore';

export type HarvestStatus = 'harvested' | 'in_storage' | 'partially_sold' | 'fully_sold';

export interface HarvestSaleEntry {
  id: string;
  date: Timestamp;
  quantity: number;
  unit: string;
  ratePerUnit: number;
  totalAmount: number;
  buyerId?: string;
  buyerName?: string;
  linkedTransactionId?: string;
  note?: string;
}

export interface Harvest {
  id: string;
  segment: string;
  segmentName: string;
  status: HarvestStatus;

  harvestDate: Timestamp;
  cropName: string;
  variety?: string;
  totalQuantity: number;
  unit: string;
  grade?: string;

  storageLocation?: string;
  storageDate?: Timestamp;

  sales: HarvestSaleEntry[];
  totalSold: number;
  totalRevenue: number;

  wastageQuantity: number;
  wastageReason?: string;
  wastageDate?: Timestamp;

  remainingQuantity: number;
  averageRate?: number;

  harvestCost?: number;
  linkedCropActivityId?: string;

  note?: string;

  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
  month: string;
  year: number;
}
