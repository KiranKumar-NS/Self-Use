import { Timestamp } from '@angular/fire/firestore';

export type SegmentType = 'animal' | 'crop';

export interface SegmentBudget {
  monthlyExpenseLimit?: number;
  monthlyIncomeTarget?: number;
}

export interface Segment {
  id: string;
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  segmentType?: SegmentType;
  unit?: string; // e.g. 'head', 'kg', 'trees', 'litres'
  currentStock?: number;
  breeds?: string[]; // breeds for animals
  budgets?: SegmentBudget;
  createdAt: Timestamp;
}

export const DEFAULT_SEGMENTS: Omit<Segment, 'createdAt'>[] = [
  { id: 'goats', name: 'Goats', description: 'Goat farming', icon: '🐐', isActive: true, segmentType: 'animal', unit: 'head' },
  { id: 'chickens', name: 'Chickens', description: 'Chicken farming', icon: '🐔', isActive: true, segmentType: 'animal', unit: 'head' },
  { id: 'dragon', name: 'Dragon Fruit', description: 'Dragon fruit farming', icon: '🌵', isActive: true, segmentType: 'crop' },
];

export const ANIMAL_EVENT_TYPES = [
  { value: 'birth', label: 'Birth / Hatched' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'sale', label: 'Sale' },
  { value: 'death', label: 'Death' },
  { value: 'adjustment', label: 'Adjustment' },
];
