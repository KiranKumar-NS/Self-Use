import { Timestamp } from 'firebase/firestore';

export type TransactionType =
  | 'goat_sale'
  | 'goat_purchase'
  | 'milk_sale'
  | 'feed_purchase'
  | 'veterinary'
  | 'other_income'
  | 'other_expense';

export type TransactionCategory = 'income' | 'expense';

export interface Transaction {
  id: string;
  farmId: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amountInr: number;
  goatId?: string;
  quantityKg?: number;
  partyName?: string;
  partyPhone?: string;
  transactionDate: Timestamp;
  createdAt: Timestamp;
  createdBy: string;
}
