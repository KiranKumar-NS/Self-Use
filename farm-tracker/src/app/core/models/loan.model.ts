import { Timestamp } from '@angular/fire/firestore';
import { TimelineEntry } from './transaction.model';

// --- Existing types ---
export type LoanType = 'given' | 'received';
export type RepaymentStatus = 'pending' | 'partial' | 'completed';

// --- New types for formal loans ---
export type LoanCategory = 'simple' | 'formal';
export type LoanSource = 'bank' | 'finance_company' | 'individual' | 'gold_loan';
export type RepaymentType = 'emi' | 'interest_only';
export type InterestType = 'fixed' | 'floating';
export type InterestFrequency = 'annual' | 'monthly' | 'weekly';
export type DeductionType =
  | 'documentation_charges'
  | 'processing_fee'
  | 'insurance'
  | 'legal_charges'
  | 'valuation_charges'
  | 'stamp_duty'
  | 'other';
export type ClosureReason = 'fully_paid' | 'pre_closed' | 'balance_transfer' | 'renewed';
export type CollateralType = 'gold' | 'property' | 'vehicle' | 'fixed_deposit' | 'other';
export type LoanDocumentType = 'sanction_letter' | 'agreement' | 'insurance_policy' | 'noc' | 'other';

// --- New interfaces for formal loans ---

export interface LoanDeduction {
  id: string;
  type: DeductionType;
  customLabel?: string;
  amount: number;
  paidTo: string;
  date: Timestamp;
  paymentReference?: string;
  isFinanced: boolean;
  note?: string;
}

export interface CollateralItem {
  id: string;
  type: CollateralType;
  description: string;
  estimatedValue: number;
  weight?: number;
  purity?: string;
  documentReference?: string;
  note?: string;
  isReleased?: boolean;
  releasedDate?: Timestamp;

  // Gold-specific fields
  itemName?: string;
  quantity?: number;
  grossWeight?: number;
  netWeight?: number;
  goldRatePerGram?: number;
  goldValue?: number;
}

export interface RateChangeEntry {
  id: string;
  date: Timestamp;
  oldRate: number;
  newRate: number;
  newEMI?: number;
  note?: string;
  recordedBy: string;
  recordedByName: string;
}

export interface LoanDocument {
  id: string;
  type: LoanDocumentType;
  customLabel?: string;
  referenceNumber?: string;
  date?: Timestamp;
  note?: string;
}

/**
 * Cash advanced from a formal loan's unused funds to a person to hold for a
 * business purpose (a float / imprest). It is custody, NOT personal debt:
 * the person holds `amount − spent − returned` in hand until they spend it
 * (booked as a business expense) or return the rest to the holder.
 */
export interface LoanAdvance {
  id: string;
  personUid?: string;
  personName: string;
  amount: number;    // total cash handed to the person
  spent: number;     // settled as a business expense so far
  returned: number;  // returned to the loan/holder so far
  date: Timestamp;
  note?: string;
  status: 'open' | 'settled';
}

/** Computed on-the-fly — NOT stored in Firestore */
export interface EMIEntry {
  emiNumber: number;
  dueDate: Date;
  emiAmount: number;
  principal: number;
  interest: number;
}

// --- Main Loan interface ---

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

  // --- Formal loan fields (all optional for backward compatibility) ---

  // Classification
  loanCategory?: LoanCategory;
  loanSource?: LoanSource;
  loanSourceName?: string;
  accountNumber?: string;

  // Disbursement
  sanctionedAmount?: number;
  netDisbursedAmount?: number;
  totalDeductions?: number;
  deductions?: LoanDeduction[];
  disbursementDate?: Timestamp;

  // Repayment structure
  repaymentType?: RepaymentType;

  // Interest
  interestType?: InterestType;
  interestFrequency?: InterestFrequency;
  interestRateInput?: number;
  interestRate?: number;

  // EMI mode (repaymentType === 'emi')
  tenure?: number;
  emiAmount?: number;
  totalEMIs?: number;
  emisPaid?: number;
  moratoriumMonths?: number;
  emiStartDate?: Timestamp;

  // Interest-only mode (repaymentType === 'interest_only')
  interestPaymentFrequency?: InterestFrequency;
  interestAmountPerPeriod?: number;
  totalInterestPaymentsMade?: number;

  // Common repayment tracking (both modes)
  totalInterestPaid?: number;
  totalPrincipalPaid?: number;
  outstandingBalance?: number;

  // Floating rate history
  rateChanges?: RateChangeEntry[];

  // Part-payment tracking
  totalPartPayments?: number;

  // Penalty tracking
  totalPenaltyPaid?: number;

  // Next payment due (works for both EMI and interest-only)
  nextPaymentDueDate?: Timestamp;
  nextPaymentNumber?: number;

  // Collateral / Security
  collaterals?: CollateralItem[];
  totalCollateralValue?: number;

  // Documents / References
  documents?: LoanDocument[];

  // Gold loan fields
  pledgeReceiptNumber?: string;
  ltvRatio?: number;
  totalGoldWeight?: number;
  totalGoldValue?: number;
  eligibleLoanAmount?: number;
  renewedFromLoanId?: string;
  renewedByLoanId?: string;
  isRenewal?: boolean;

  // Government subsidy
  isSubsidized?: boolean;
  subsidyDetails?: string;
  effectiveRate?: number;

  // Closure
  preClosureCharges?: number;
  loanClosureDate?: Timestamp;
  closureReason?: ClosureReason;

  // Balance Transfer / Refinancing
  replacedByLoanId?: string;
  replacesLoanId?: string;
  isBalanceTransfer?: boolean;

  // Utilization tracking
  utilizationTotal?: number;
  utilizationRemaining?: number;

  // Loan holder — who physically holds/manages the remaining loan funds
  heldByUid?: string;              // user UID of the person holding the money
  heldByName?: string;             // display name

  // Cash advances handed to other people to hold for business use (float / imprest).
  // The holder's own custody = utilizationRemaining − Σ(open advance balances).
  advances?: LoanAdvance[];

  // Multi-segment support (formal loans can span multiple segments)
  segments?: string[];
  segmentNames?: string[];

  // Link to parent formal loan (for simple loans created from personal use)
  parentFormalLoanId?: string;
  personUid?: string;             // UID of the person (for consistent key resolution in analytics)
}

// --- Repayment interface ---

export interface Repayment {
  id: string;
  date: Timestamp;
  amount: number;
  note: string;
  paidBy?: string;
  paidByName?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: Timestamp;

  // Scheduled due date for delay/discipline analysis
  scheduledDueDate?: Timestamp;

  // Formal loan fields (all optional)
  isEMIPayment?: boolean;
  emiNumber?: number;
  principalPortion?: number;
  interestPortion?: number;
  paymentReference?: string;
  transactionId?: string;
  isPreClosure?: boolean;
  preClosureCharges?: number;
  isPartPayment?: boolean;
  penaltyAmount?: number;
}

// --- Form data ---

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

  // Formal loan fields (all optional)
  loanCategory?: LoanCategory;
  loanSource?: LoanSource;
  loanSourceName?: string;
  accountNumber?: string;
  sanctionedAmount?: number;
  repaymentType?: RepaymentType;
  interestType?: InterestType;
  interestFrequency?: InterestFrequency;
  interestRateInput?: number;
  interestRate?: number;
  // EMI mode
  tenure?: number;
  emiAmount?: number;
  totalEMIs?: number;
  moratoriumMonths?: number;
  // Interest-only mode
  interestPaymentFrequency?: InterestFrequency;
  disbursementDate?: Date;
  segments?: string[];
  segmentNames?: string[];
  heldByUid?: string;
  heldByName?: string;
  deductions?: Omit<LoanDeduction, 'id'>[];
  collaterals?: Omit<CollateralItem, 'id'>[];
  documents?: Omit<LoanDocument, 'id'>[];
  isSubsidized?: boolean;
  subsidyDetails?: string;
  effectiveRate?: number;
  replacesLoanId?: string;

  // Gold loan
  pledgeReceiptNumber?: string;
  ltvRatio?: number;
  renewedFromLoanId?: string;
}
