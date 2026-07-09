import { Timestamp } from '@angular/fire/firestore';

export type ConsumableCategory = 'feed' | 'medicine' | 'fertilizer' | 'seeds' |
  'fuel' | 'diesel' | 'packaging' | 'tools' | 'other';

export interface StockMovement {
  id: string;
  date: Timestamp;
  type: 'opening' | 'purchase' | 'used' | 'adjustment' | 'wastage';
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  linkedTransactionId?: string;
  supplierId?: string;
  supplierName?: string;
  note?: string;
  recordedBy: string;
  recordedByName: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: ConsumableCategory;
  unit: string;

  currentStock: number;
  minimumStock?: number;

  segments: string[];
  segmentNames: string[];

  movements: StockMovement[];

  totalPurchased: number;
  totalUsed: number;
  totalWastage: number;
  totalSpent: number;

  lastPurchaseRate?: number;
  averagePurchaseRate?: number;

  note?: string;

  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
}
