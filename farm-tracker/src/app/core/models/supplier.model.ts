import { Timestamp } from '@angular/fire/firestore';

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  gstNumber?: string;

  itemCategories?: string[];

  totalOrders: number;
  totalAmountPaid: number;
  pendingAmount: number;
  averageRate?: number;
  lastOrderDate?: Timestamp;

  ordersBySegment?: Record<string, number>;
  amountBySegment?: Record<string, number>;

  note?: string;

  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
}
