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
