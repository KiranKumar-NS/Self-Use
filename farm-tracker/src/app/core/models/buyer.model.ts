import { Timestamp } from '@angular/fire/firestore';

export interface Buyer {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  note?: string;

  // Denormalized stats
  totalPurchases: number;
  totalAmountPaid: number;
  averageRate?: number;
  lastPurchaseDate?: Timestamp;

  // Segment-level breakdown for deeper analytics
  purchasesBySegment?: Record<string, number>;   // segmentId → purchase count
  amountBySegment?: Record<string, number>;       // segmentId → total amount paid

  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
}

export interface BuyerFormData {
  name: string;
  phone?: string;
  location?: string;
  note?: string;
}
