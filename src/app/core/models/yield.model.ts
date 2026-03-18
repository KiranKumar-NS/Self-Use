import { Timestamp } from 'firebase/firestore';

export interface MilkYield {
  id: string;
  farmId: string;
  goatId: string;
  dateRecorded: Timestamp;
  morningYieldLiters: number;
  eveningYieldLiters: number;
  totalYieldLiters: number;
  notes?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export interface WeightRecord {
  id: string;
  farmId: string;
  goatId: string;
  weightKg: number;
  dateRecorded: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  createdBy: string;
}
