import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'manager' | 'worker';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: UserRole;
  farmId: string;
  isActive: boolean;
  preferredLanguage: 'en' | 'ta';
  fcmTokens: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
