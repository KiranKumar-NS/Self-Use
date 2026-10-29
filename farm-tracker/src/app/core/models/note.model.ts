import { Timestamp } from '@angular/fire/firestore';

export type NoteCategory = 'learning' | 'experience' | 'medicine' | 'market' | 'feed' | 'contacts' | 'general';

export interface NoteCategoryDef {
  key: NoteCategory;
  label: string;
  icon: string;
  color: string;
}

export const NOTE_CATEGORIES: NoteCategoryDef[] = [
  { key: 'learning', label: 'Learning', icon: 'school', color: '#2563eb' },
  { key: 'experience', label: 'Experience', icon: 'psychology', color: '#7c3aed' },
  { key: 'medicine', label: 'Medicine', icon: 'medication', color: '#dc2626' },
  { key: 'market', label: 'Market & Breeds', icon: 'storefront', color: '#16a34a' },
  { key: 'feed', label: 'Feed & Nutrition', icon: 'grass', color: '#d97706' },
  { key: 'contacts', label: 'Contacts', icon: 'contacts', color: '#0891b2' },
  { key: 'general', label: 'General', icon: 'sticky_note_2', color: '#64748b' },
];

export interface MedicineDetails {
  name?: string;
  purpose?: string;
  animal?: string;
  dosage?: string;
  route?: string;
  withdrawalDays?: number | null;
  supplier?: string;
  cost?: number | null;
}

export interface MarketDetails {
  breed?: string;
  animal?: string;
  marketName?: string;
  pricePerUnit?: number | null;
  unit?: 'kg' | 'head';
  observedOn?: string; // yyyy-MM-dd
}

export interface Note {
  id: string;
  category: NoteCategory;
  title: string;
  contentHtml: string;
  contentText: string;
  tags: string[];
  pinned: boolean;

  medicine?: MedicineDetails | null;
  market?: MarketDetails | null;

  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isDeleted: boolean;
  deletedAt?: Timestamp | null;
}
