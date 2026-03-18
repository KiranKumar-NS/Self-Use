import { Timestamp } from 'firebase/firestore';

export type BreedingStatus =
  | 'heat_detected'
  | 'mated'
  | 'confirmed_pregnant'
  | 'kidding_due'
  | 'kidded'
  | 'failed';

export interface BreedingRecord {
  id: string;
  farmId: string;
  doeId: string;
  buckId: string;
  status: BreedingStatus;
  heatDetectedDate: Timestamp;
  matingDate?: Timestamp;
  expectedKiddingDate?: Timestamp;
  actualKiddingDate?: Timestamp;
  litterSize?: number;
  kidIds?: string[];
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
