import { Timestamp } from '@angular/fire/firestore';

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  assignedSegments: string[];
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
