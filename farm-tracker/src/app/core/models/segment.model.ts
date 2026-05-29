import { Timestamp } from '@angular/fire/firestore';

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
  currentStock?: number;
  budgets?: SegmentBudget;
  createdAt: Timestamp;
}

export const DEFAULT_SEGMENTS: Omit<Segment, 'createdAt'>[] = [
  { id: 'goats', name: 'Goats', description: 'Goat farming', icon: '🐐', isActive: true },
  { id: 'chickens', name: 'Chickens', description: 'Chicken farming', icon: '🐔', isActive: true },
  { id: 'dragon', name: 'Dragon', description: 'Dragon farming', icon: '🐉', isActive: true },
];
