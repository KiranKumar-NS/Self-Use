import { GoatBreed } from '../models';

export interface BreedInfo {
  value: GoatBreed;
  labelEn: string;
  labelTa: string;
  avgGestationDays: number;
  avgMilkYieldLiters: number;
  avgAdultWeightKg: number;
}

export const GOAT_BREEDS: BreedInfo[] = [
  {
    value: 'semmeri',
    labelEn: 'Semmeri',
    labelTa: 'செம்மறி',
    avgGestationDays: 150,
    avgMilkYieldLiters: 0.5,
    avgAdultWeightKg: 30,
  },
  {
    value: 'kanni_adu',
    labelEn: 'Kanni Adu',
    labelTa: 'கன்னி ஆடு',
    avgGestationDays: 148,
    avgMilkYieldLiters: 0.8,
    avgAdultWeightKg: 35,
  },
  {
    value: 'salem_black',
    labelEn: 'Salem Black',
    labelTa: 'சேலம் கருப்பு',
    avgGestationDays: 150,
    avgMilkYieldLiters: 0.6,
    avgAdultWeightKg: 32,
  },
  {
    value: 'mecheri',
    labelEn: 'Mecheri',
    labelTa: 'மேச்சேரி',
    avgGestationDays: 150,
    avgMilkYieldLiters: 0.4,
    avgAdultWeightKg: 28,
  },
  {
    value: 'other',
    labelEn: 'Other',
    labelTa: 'மற்றவை',
    avgGestationDays: 150,
    avgMilkYieldLiters: 0.5,
    avgAdultWeightKg: 30,
  },
];

export const GESTATION_DAYS = 150;
