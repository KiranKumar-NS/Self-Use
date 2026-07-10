import { Loan, Repayment, EMIEntry, InterestFrequency } from '../models/loan.model';

// Pure loan/interest/EMI math — no Angular, no Firestore. Unit-testable directly.

// Gold loan helpers

export function purityFactor(purity: string): number {
  switch (purity) {
    case '24K': return 1.0;
    case '22K': return 0.916;
    case '18K': return 0.75;
    default: return 0.916;
  }
}

export function computeGoldValue(netWeight: number, purity: string, ratePerGram: number): number {
  return Math.round(netWeight * purityFactor(purity) * ratePerGram * 100) / 100;
}

export function rbiLtvRatio(totalGoldValue: number): number {
  if (totalGoldValue <= 250000) return 0.85;
  if (totalGoldValue <= 500000) return 0.80;
  return 0.75;
}

/** Structural shape covering just the fields gold aggregation reads */
export interface GoldCollateralLike {
  type?: string;
  isReleased?: boolean | null;
  weight?: number | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  goldValue?: number | null;
  estimatedValue?: number | null;
}

export function computeGoldAggregates(collaterals: GoldCollateralLike[] | undefined): { totalGoldWeight: number; totalGoldValue: number } {
  const goldItems = (collaterals ?? []).filter(c => c.type === 'gold' && !c.isReleased);
  return {
    totalGoldWeight: goldItems.reduce((sum, c) => sum + (c.netWeight ?? c.grossWeight ?? c.weight ?? 0), 0),
    totalGoldValue: goldItems.reduce((sum, c) => sum + (c.goldValue ?? c.estimatedValue ?? 0), 0),
  };
}

// Interest rate helpers

/** Convert interest rate to annual based on frequency */
export function toAnnualRate(rate: number, frequency: InterestFrequency): number {
  switch (frequency) {
    case 'monthly': return rate * 12;
    case 'weekly': return rate * 52;
    case 'annual': return rate;
  }
}

/** Convert annual rate to monthly rate (decimal) */
export function annualToMonthlyDecimal(annualPercent: number): number {
  return annualPercent / 100 / 12;
}

/**
 * Generate EMI schedule using reducing-balance method.
 * Used for: loan creation preview, fresh loans with no payments yet.
 *
 * Formula: EMI = P × r × (1+r)^n / ((1+r)^n - 1)
 * where P = principal, r = monthly rate (decimal), n = tenure in months
 */
export function generateEMISchedule(
  principal: number,
  annualRate: number,
  tenureMonths: number,
  startDate: Date,
  moratoriumMonths = 0,
  effectiveRate?: number,
): EMIEntry[] {
  const rate = effectiveRate ?? annualRate;
  const r = annualToMonthlyDecimal(rate);
  const entries: EMIEntry[] = [];

  // Moratorium period: interest accrues, added to principal
  let currentPrincipal = principal;
  let emiNumber = 1;
  const start = new Date(startDate);

  for (let i = 0; i < moratoriumMonths; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + i);
    const interestAccrued = currentPrincipal * r;
    currentPrincipal += interestAccrued; // interest added to principal during moratorium

    entries.push({
      emiNumber: emiNumber++,
      dueDate,
      emiAmount: 0,
      principal: 0,
      interest: Math.round(interestAccrued * 100) / 100,
    });
  }

  // EMI period
  const n = tenureMonths;
  if (r === 0) {
    // Zero interest: simple division
    const emi = Math.round((currentPrincipal / n) * 100) / 100;
    let remaining = currentPrincipal;
    for (let i = 0; i < n; i++) {
      const principalPart = i === n - 1 ? remaining : emi; // last EMI takes remainder
      const dueDate = new Date(start);
      dueDate.setMonth(dueDate.getMonth() + moratoriumMonths + i);
      remaining -= principalPart;

      entries.push({
        emiNumber: emiNumber++,
        dueDate,
        emiAmount: principalPart,
        principal: principalPart,
        interest: 0,
      });
    }
    return entries;
  }

  const rPowN = Math.pow(1 + r, n);
  const emi = Math.round((currentPrincipal * r * rPowN / (rPowN - 1)) * 100) / 100;
  let remaining = currentPrincipal;

  for (let i = 0; i < n; i++) {
    const dueDate = new Date(start);
    dueDate.setMonth(dueDate.getMonth() + moratoriumMonths + i);

    const interestPart = Math.round(remaining * r * 100) / 100;
    const principalPart = i === n - 1
      ? remaining  // last EMI clears remaining principal exactly
      : Math.round((emi - interestPart) * 100) / 100;
    const actualEMI = i === n - 1
      ? Math.round((principalPart + interestPart) * 100) / 100
      : emi;

    remaining = Math.max(0, remaining - principalPart);

    entries.push({
      emiNumber: emiNumber++,
      dueDate,
      emiAmount: actualEMI,
      principal: principalPart,
      interest: interestPart,
    });
  }

  return entries;
}

export interface LiveEMIEntry extends EMIEntry {
  status: 'moratorium' | 'paid' | 'upcoming' | 'overdue';
  paidAmount?: number;
  paidDate?: Date;
  paymentReference?: string;
  isPartPayment?: boolean;
}

/**
 * Build the live EMI schedule for display on loan detail page.
 * Merges paid history (from repayments) with projected future EMIs.
 */
export function buildLiveEMISchedule(
  loan: Loan,
  paidRepayments: Repayment[],
): LiveEMIEntry[] {
  const now = new Date();
  const entries: LiveEMIEntry[] = [];

  // Separate EMI payments, part-payments, and other repayments
  const emiPayments = paidRepayments
    .filter(r => r.isEMIPayment && r.emiNumber != null)
    .sort((a, b) => (a.emiNumber ?? 0) - (b.emiNumber ?? 0));
  const emiByNumber = new Map<number, Repayment>();
  for (const r of emiPayments) {
    emiByNumber.set(r.emiNumber!, r);
  }

  // Generate the theoretical full schedule
  const startDate = loan.emiStartDate?.toDate()
    ?? loan.disbursementDate?.toDate()
    ?? loan.date.toDate();
  const annualRate = loan.interestRate ?? 0;
  const tenure = loan.tenure ?? 0;
  const moratorium = loan.moratoriumMonths ?? 0;
  const effectiveRate = loan.isSubsidized ? loan.effectiveRate : undefined;

  const theoreticalSchedule = generateEMISchedule(
    loan.sanctionedAmount ?? loan.amount,
    annualRate,
    tenure,
    startDate,
    moratorium,
    effectiveRate,
  );

  // If we have rate changes or part-payments, regenerate remaining schedule
  const emisPaid = loan.emisPaid ?? 0;
  const hasPartPayments = (loan.totalPartPayments ?? 0) > 0;
  const hasRateChanges = (loan.rateChanges?.length ?? 0) > 0;

  // Use theoretical for paid EMIs, regenerate for remaining if needed
  let remainingSchedule: EMIEntry[] | null = null;
  if ((hasPartPayments || hasRateChanges) && emisPaid > 0 && emisPaid < (moratorium + tenure)) {
    const currentRate = loan.interestRate ?? annualRate;
    const remainingTenure = tenure - emisPaid;
    const outstanding = loan.outstandingBalance ?? 0;
    if (remainingTenure > 0 && outstanding > 0) {
      const nextStartDate = new Date(startDate);
      nextStartDate.setMonth(nextStartDate.getMonth() + moratorium + emisPaid);
      remainingSchedule = generateEMISchedule(outstanding, currentRate, remainingTenure, nextStartDate, 0, effectiveRate);
    }
  }

  // Build live entries
  for (let i = 0; i < theoreticalSchedule.length; i++) {
    const entry = theoreticalSchedule[i];
    const paid = emiByNumber.get(entry.emiNumber);

    // Moratorium entries
    if (entry.emiAmount === 0 && i < moratorium) {
      entries.push({ ...entry, status: 'moratorium' });
      continue;
    }

    // Paid EMIs: show actual paid data
    if (paid) {
      entries.push({
        ...entry,
        status: 'paid',
        emiAmount: paid.amount,
        principal: paid.principalPortion ?? entry.principal,
        interest: paid.interestPortion ?? entry.interest,
        paidAmount: paid.amount,
        paidDate: paid.date.toDate(),
        paymentReference: paid.paymentReference,
      });
      continue;
    }

    // Unpaid EMIs: use regenerated schedule if available
    if (remainingSchedule) {
      const adjustedIndex = entry.emiNumber - moratorium - emisPaid - 1;
      if (adjustedIndex >= 0 && adjustedIndex < remainingSchedule.length) {
        const regen = remainingSchedule[adjustedIndex];
        entries.push({
          ...regen,
          emiNumber: entry.emiNumber,
          dueDate: entry.dueDate,
          status: entry.dueDate < now ? 'overdue' : 'upcoming',
        });
        continue;
      }
    }

    // Fallback to theoretical
    entries.push({
      ...entry,
      status: entry.dueDate < now ? 'overdue' : 'upcoming',
    });
  }

  // Add part-payment entries inline (between EMIs)
  const partPayments = paidRepayments
    .filter(r => r.isPartPayment)
    .sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

  for (const pp of partPayments) {
    const ppDate = pp.date.toDate();
    // Find insertion index: after the last EMI with dueDate <= ppDate
    let insertIdx = entries.findIndex(e => e.dueDate > ppDate);
    if (insertIdx === -1) insertIdx = entries.length;

    entries.splice(insertIdx, 0, {
      emiNumber: 0, // 0 indicates part-payment, not a regular EMI
      dueDate: ppDate,
      emiAmount: pp.amount,
      principal: pp.principalPortion ?? pp.amount,
      interest: 0,
      status: 'paid',
      paidAmount: pp.amount,
      paidDate: ppDate,
      paymentReference: pp.paymentReference,
      isPartPayment: true,
    });
  }

  return entries;
}
