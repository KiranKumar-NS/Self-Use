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
}
