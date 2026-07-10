import { Timestamp } from '@angular/fire/firestore';
import { SaleUnit } from './transaction.model';

/**
 * Manually recorded market rate for a product — reference data for comparing
 * the farm's own sale rates against prevailing market prices.
 */
export interface MarketPrice {
  id: string;
  date: Timestamp;
  product: string;      // normalized commodity key, matches Transaction.product
  unit: SaleUnit;
  price: number;        // rate per unit
  market?: string;      // e.g. mandi/market name
  note?: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
}

export interface MarketPriceFormData {
  date: Date;
  product: string;
  unit: SaleUnit;
  price: number;
  market?: string;
  note?: string;
}
