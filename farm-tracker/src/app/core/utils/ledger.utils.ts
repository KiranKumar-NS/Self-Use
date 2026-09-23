import { Transaction, pendingRemaining, settledPortion } from '../models/transaction.model';
import { normalizeName } from './name.utils';
import { getMonthName, getMonthRange, getMonthString } from './date.utils';

export interface LedgerTotals {
  count: number;
  /** Sum of the billed amount of every row */
  total: number;
  /** Cash actually received (sale) / paid (expense), net of pending balances */
  settled: number;
  /** Still outstanding: pending income not yet received, credit expenses not yet paid */
  pending: number;
}

export interface MonthOption {
  value: string; // 'YYYY-MM'
  label: string; // e.g. "September 2026"
}

/** Total / settled / pending over a set of transactions, using the same helpers as dues and summaries. */
export function computeLedgerTotals(rows: Transaction[]): LedgerTotals {
  return rows.reduce<LedgerTotals>(
    (acc, t) => {
      acc.count += 1;
      acc.total += t.amount;
      acc.settled += settledPortion(t);
      acc.pending += pendingRemaining(t);
      return acc;
    },
    { count: 0, total: 0, settled: 0, pending: 0 },
  );
}

/** Display name for the "By" column and the Person filter (same rule as the Transactions page). */
export function ledgerPersonName(t: Pick<Transaction, 'paidByName' | 'createdByName'>): string {
  return normalizeName(t.paidByName || t.createdByName || 'Unknown');
}

/** Distinct person names in the rows, sorted A→Z. */
export function ledgerPeople(rows: Transaction[]): string[] {
  return [...new Set(rows.map(ledgerPersonName))].sort((a, b) => a.localeCompare(b));
}

/** Every month from `from` up to `now`'s month, newest first, labelled for display. */
export function buildMonthOptions(from = '2024-01', now = new Date()): MonthOption[] {
  const current = getMonthString(now);
  const start = from <= current ? from : current;
  return getMonthRange(start, current)
    .reverse()
    .map((value) => ({ value, label: getMonthName(value) }));
}
