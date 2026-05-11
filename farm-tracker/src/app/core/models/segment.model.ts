import { Timestamp } from '@angular/fire/firestore';

export interface Segment {
  id: string;
  name: string;
  description: string;
  icon: string;
  isActive: boolean;
  createdAt: Timestamp;
}

export const DEFAULT_SEGMENTS: Omit<Segment, 'createdAt'>[] = [
  { id: 'goats', name: 'Goats', description: 'Goat farming', icon: '🐐', isActive: true },
  { id: 'chickens', name: 'Chickens', description: 'Chicken farming', icon: '🐔', isActive: true },
  { id: 'cows', name: 'Cows', description: 'Cow farming', icon: '🐄', isActive: true },
  { id: 'fruits', name: 'Fruits', description: 'Fruit cultivation', icon: '🍎', isActive: true },
  { id: 'crops', name: 'Crops', description: 'Crop cultivation', icon: '🌾', isActive: true },
];
