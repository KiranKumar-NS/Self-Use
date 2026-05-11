import { Timestamp } from '@angular/fire/firestore';

export type LoanType = 'given' | 'received';
export type RepaymentStatus = 'pending' | 'partial' | 'completed';

export interface Loan {
  id: string;
  date: Timestamp;
  amount: number;
  type: LoanType;
  personName: string;
  purpose: string;
  segment: string;
  segmentName: string;
  repaymentStatus: RepaymentStatus;
  totalRepaid: number;
  balanceRemaining: number;

  // Audit
  recordedBy: string;
  recordedByName: string;
  createdAt: Timestamp;
  updatedBy: string | null;
  updatedAt: Timestamp | null;
  isDeleted: boolean;
  deletedBy: string | null;
  deletedAt: Timestamp | null;

  month: string;
  year: number;
}

export interface Repayment {
  id: string;
  date: Timestamp;
  amount: number;
  note: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: Timestamp;
}

export interface LoanFormData {
  date: Date;
  amount: number;
  type: LoanType;
  personName: string;
  purpose: string;
  segment: string;
  segmentName: string;
  month: string;
  year: number;
}
