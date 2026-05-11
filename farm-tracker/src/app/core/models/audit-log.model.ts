import { Timestamp } from '@angular/fire/firestore';

export type EntityType = 'transaction' | 'loan' | 'repayment' | 'user';
export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface AuditLog {
  id: string;
  entityType: EntityType;
  entityId: string;
  action: AuditAction;
  userId: string;
  userName: string;
  timestamp: Timestamp;
  changes: AuditChange[];
  month: string;
  year: number;
}
