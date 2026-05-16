import { Timestamp } from '@angular/fire/firestore';
import { TimelineEntry } from './transaction.model';

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
  isDeleted: boolean;

  // Status Timeline
  timeline: TimelineEntry[];

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
