import { Timestamp } from '@angular/fire/firestore';

export type InventoryEventType = 'birth' | 'death' | 'purchase' | 'sale' | 'adjustment';

export interface InventoryEvent {
  id: string;
  segment: string;
  segmentName: string;
  eventType: InventoryEventType;
  count: number; // positive = add, negative = remove
  breed?: string;
  note: string;
  date: Timestamp;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  month: string;
  year: number;
  isDeleted?: boolean;
  linkedAnimalIds?: string[];

  /**
   * The purchase expense / sale income transaction this event created. Stamped at
   * creation so editing the event can update that transaction IN PLACE instead of
   * creating a second one. Absent on events recorded before Aug 2026 — the dialog
   * falls back to the animal's purchaseTransactionId/saleTransactionId for those.
   */
  linkedTransactionId?: string;

  // Financial context for mortality/loss tracking
  estimatedValue?: number;  // estimated value of died/lost animals for loss analysis
  deathCause?: string;      // mirrored from the animal so an edit can round-trip it
}

export interface InventoryEventFormData {
  segment: string;
  segmentName: string;
  eventType: InventoryEventType;
  count: number;
  breed?: string;
  note: string;
  date: Date;
  month: string;
  year: number;
  estimatedValue?: number;
  deathCause?: string;
  linkedAnimalIds?: string[];
  linkedTransactionId?: string;
}
