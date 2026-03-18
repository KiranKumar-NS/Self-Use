import { FeedType } from '../models';

export interface FeedTypeInfo {
  value: FeedType;
  labelEn: string;
  labelTa: string;
}

export const FEED_TYPES: FeedTypeInfo[] = [
  { value: 'concentrate', labelEn: 'Concentrate', labelTa: 'செறிவூட்டம்' },
  { value: 'green_fodder', labelEn: 'Green Fodder', labelTa: 'பசுந்தீவனம்' },
  { value: 'dry_fodder', labelEn: 'Dry Fodder', labelTa: 'உலர் தீவனம்' },
  { value: 'mineral_mixture', labelEn: 'Mineral Mixture', labelTa: 'கனிம கலவை' },
  { value: 'supplement', labelEn: 'Supplement', labelTa: 'நிரப்பு உணவு' },
];
