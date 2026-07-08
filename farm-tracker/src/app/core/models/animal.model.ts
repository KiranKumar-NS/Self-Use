import { Timestamp } from '@angular/fire/firestore';

export type AnimalStatus = 'active' | 'sold' | 'dead';
export type TrackingMode = 'individual' | 'batch';

export interface AnimalCostEntry {
  transactionId: string;
  date: Timestamp;
  category: string;
  categoryName: string;
  amount: number;
  description?: string;
}

export interface Animal {
  id: string;
  segment: string;
  segmentName: string;
  trackingMode: TrackingMode;

  // Identity (individual)
  tag?: string;
  name?: string;
  breed?: string;
  gender?: 'male' | 'female' | 'unknown';

  // Identity (batch)
  batchLabel?: string;
  batchSize: number;       // 1 for individual, N for batch
  currentCount: number;    // tracks deaths/sales reducing the batch

  // Origin
  origin: 'birth' | 'purchase';
  originDate: Timestamp;
  originInventoryEventId?: string;
  purchasePrice?: number;
  purchasePricePerHead?: number;

  // Current status
  status: AnimalStatus;

  // Exit info
  exitDate?: Timestamp;
  exitType?: 'sale' | 'death';
  saleTransactionId?: string;
  saleInventoryEventId?: string;
  salePrice?: number;
  salePricePerHead?: number;
  buyerId?: string;
  buyerName?: string;

  // Cost tracking
  totalCosts: number;
  costEntries: AnimalCostEntry[];

  // Computed
  totalInvested: number;   // purchasePrice + totalCosts
  profit?: number;         // salePrice - totalInvested
  profitMargin?: number;   // profit / totalInvested * 100

  // Audit
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;

  // For queries
  month: string;
  year: number;
  note?: string;
}

export interface AnimalFormData {
  segment: string;
  segmentName: string;
  trackingMode: TrackingMode;
  tag?: string;
  name?: string;
  breed?: string;
  gender?: 'male' | 'female' | 'unknown';
  batchLabel?: string;
  batchSize: number;
  origin: 'birth' | 'purchase';
  originDate: Date;
  purchasePrice?: number;
  note?: string;
}
