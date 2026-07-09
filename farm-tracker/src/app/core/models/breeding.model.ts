import { Timestamp } from '@angular/fire/firestore';

export type BreedingStatus = 'mated' | 'confirmed_pregnant' | 'delivered' | 'failed';

export interface BreedingRecord {
  id: string;
  segment: string;
  segmentName: string;

  // Parents
  sireId?: string;
  sireName?: string;
  damId: string;
  damName: string;

  // Mating
  matingDate: Timestamp;
  matingMethod?: 'natural' | 'artificial';

  // Pregnancy
  status: BreedingStatus;
  expectedDeliveryDate?: Timestamp;
  gestationDays?: number;

  // Delivery
  actualDeliveryDate?: Timestamp;
  offspringCount?: number;
  offspringMale?: number;
  offspringFemale?: number;
  offspringAnimalIds?: string[];
  complications?: string;

  // Cost
  veterinaryCost?: number;
  linkedTransactionId?: string;

  note?: string;

  // Audit
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  isDeleted: boolean;
  month: string;
  year: number;
}
