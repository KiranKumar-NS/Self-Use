import { Timestamp } from 'firebase/firestore';

export type GoatBreed = 'semmeri' | 'kanni_adu' | 'salem_black' | 'mecheri' | 'other' | string;
export type GoatGender = 'male' | 'female';
export type GoatStatus = 'active' | 'sold' | 'deceased' | 'dead' | 'quarantined';
export type HealthStatus = 'healthy' | 'sick' | 'under_treatment' | 'recovering';

export interface Goat {
  id: string;
  farmId: string;
  tagNumber: string;
  name?: string;
  breed: GoatBreed;
  gender: GoatGender;
  dateOfBirth: Timestamp;
  weight: number;
  status: GoatStatus;
  healthStatus: HealthStatus;
  sireId?: string;
  damId?: string;
  photoUrls: string[];
  acquisitionType: 'born_on_farm' | 'purchased';
  acquisitionDate: Timestamp;
  purchasePrice?: number;
  lastVaccinationDate?: Timestamp;
  nextVaccinationDue?: Timestamp;
  vaccinationType?: string;
  veterinarianName?: string;
  veterinarianPhone?: string;
  medicalNotes?: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
