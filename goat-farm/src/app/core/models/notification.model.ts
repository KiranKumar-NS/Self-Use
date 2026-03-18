import { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | 'breeding_reminder'
  | 'vaccination_due'
  | 'feed_stock_low'
  | 'kidding_due'
  | 'weight_check'
  | 'custom';

export interface FarmNotification {
  id: string;
  farmId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
  goatId?: string;
  breedingRecordId?: string;
  feedStockId?: string;
  scheduledDate: Timestamp;
  createdAt: Timestamp;
}
