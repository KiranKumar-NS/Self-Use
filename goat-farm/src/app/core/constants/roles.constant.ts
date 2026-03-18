import { UserRole } from '../models';

export interface RoleInfo {
  value: UserRole;
  labelEn: string;
  labelTa: string;
  description: string;
}

export const USER_ROLES: RoleInfo[] = [
  {
    value: 'admin',
    labelEn: 'Administrator',
    labelTa: 'நிர்வாகி',
    description: 'Full access to all features including user management',
  },
  {
    value: 'manager',
    labelEn: 'Manager',
    labelTa: 'மேலாளர்',
    description: 'Can manage goats, breeding, transactions, and reports',
  },
  {
    value: 'worker',
    labelEn: 'Farm Worker',
    labelTa: 'பண்ணை தொழிலாளி',
    description: 'Can log daily feed, milk yield, and view goat profiles',
  },
];
