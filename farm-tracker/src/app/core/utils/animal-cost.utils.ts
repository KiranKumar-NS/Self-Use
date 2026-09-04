import { Timestamp } from '@angular/fire/firestore';
import { Animal, AnimalCostEntry } from '../models/animal.model';
import { Transaction } from '../models/transaction.model';

/**
 * Pure animal-cost math shared by the write path (TransactionService.setAnimalAttribution,
 * AnimalService sale/purchase edits), the reconciler (SummaryReconciliationService
 * .reconcileAnimalCosts) and the Node mirror in scripts/reconcile-summaries.js.
 * Nothing here touches Firestore, so every rule is unit-testable and the two
 * paths can never disagree.
 */

export type AnimalSplitMode = 'equal' | 'custom' | 'by_days';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** profit = salePrice − totalInvested; margin = profit / totalInvested (%, 2dp). */
export function animalProfitFields(salePrice: number, totalInvested: number): { profit: number; profitMargin: number } {
  const profit = salePrice - totalInvested;
  return {
    profit,
    profitMargin: totalInvested > 0 ? round2((profit / totalInvested) * 100) : 0,
  };
}

/**
 * Recompute every derived cost field from a full set of cost entries.
 * Returns the exact Firestore update to write. `profit`/`profitMargin` are only
 * produced for sold animals with a sale price (same rule as recordSale).
 */
export function costFieldsFromEntries(
  animal: Pick<Animal, 'purchasePrice' | 'status' | 'salePrice'>,
  costEntries: AnimalCostEntry[],
): { costEntries: AnimalCostEntry[]; totalCosts: number; totalInvested: number; profit?: number; profitMargin?: number } {
  const totalCosts = round2(costEntries.reduce((s, e) => s + e.amount, 0));
  const totalInvested = round2((animal.purchasePrice || 0) + totalCosts);
  const fields: ReturnType<typeof costFieldsFromEntries> = { costEntries, totalCosts, totalInvested };
  if (animal.status === 'sold' && animal.salePrice) {
    Object.assign(fields, animalProfitFields(animal.salePrice, totalInvested));
  }
  return fields;
}

/** Days an animal has been on the farm at `expenseDate`, minimum 1 (drives `by_days` splits). */
export function daysActive(originDate: Timestamp | undefined, expenseDate: Date): number {
  const originMs = originDate?.toDate?.()?.getTime();
  if (originMs == null) return 1;
  return Math.max(1, Math.ceil((expenseDate.getTime() - originMs) / (1000 * 60 * 60 * 24)));
}

/**
 * Split one expense across animals. Every mode returns a per-animal amount map;
 * `by_days` and `equal` give the last animal the rounding remainder so the shares
 * always sum to `totalAmount`. Custom splits pass through (zero/missing → 0).
 */
export function computeCostSplits(
  animals: Pick<Animal, 'id' | 'originDate'>[],
  totalAmount: number,
  mode: AnimalSplitMode,
  expenseDate: Date,
  customSplits?: Record<string, number>,
): Record<string, number> {
  const splits: Record<string, number> = {};
  if (animals.length === 0) return splits;

  if (mode === 'custom') {
    for (const a of animals) splits[a.id] = round2(customSplits?.[a.id] || 0);
    return splits;
  }

  const weights = animals.map(a => (mode === 'by_days' ? daysActive(a.originDate, expenseDate) : 1));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let allocated = 0;
  animals.forEach((a, i) => {
    if (i === animals.length - 1) {
      splits[a.id] = round2(totalAmount - allocated);
    } else {
      const share = round2((weights[i] / totalWeight) * totalAmount);
      splits[a.id] = share;
      allocated += share;
    }
  });
  return splits;
}

/**
 * Whether a transaction contributes to an animal's raising cost.
 * Excludes income (sales carry linkedAnimalIds too), soft-deleted docs, and the
 * animal's own purchase expense — its price already sits in `purchasePrice`, so
 * counting it again would double the investment. The tag check covers purchase
 * expenses whose back-link (`purchaseTransactionId`) was never stamped.
 */
export function isAttributableCost(txn: Pick<Transaction, 'type' | 'isDeleted' | 'tags' | 'id'>, animal: Pick<Animal, 'purchaseTransactionId'>): boolean {
  if (txn.type !== 'expense' || txn.isDeleted) return false;
  if (animal.purchaseTransactionId && txn.id === animal.purchaseTransactionId) return false;
  if (txn.tags?.includes('animal-purchase')) return false;
  return true;
}

/**
 * The cost entry one transaction contributes to one animal, or null when it
 * contributes nothing. Uses the stored `animalCostSplit` when present and falls
 * back to an equal split — the same rule the write path applies when no split
 * map is stored.
 */
export function costEntryFor(txn: Transaction, animal: Pick<Animal, 'id' | 'purchaseTransactionId'>): AnimalCostEntry | null {
  const linked = txn.linkedAnimalIds || [];
  if (!linked.includes(animal.id) || !isAttributableCost(txn, animal)) return null;
  const amount = txn.animalCostSplit
    ? round2(txn.animalCostSplit[animal.id] || 0)
    : round2(txn.amount / linked.length);
  if (amount <= 0) return null;
  const entry: AnimalCostEntry = {
    transactionId: txn.id,
    date: txn.date,
    category: txn.category,
    categoryName: txn.categoryName,
    amount,
  };
  if (txn.description) entry.description = txn.description;
  return entry;
}

/** Rebuild an animal's full cost ledger from every transaction that names it (reconciler path). */
export function rebuildCostEntries(animal: Pick<Animal, 'id' | 'purchaseTransactionId'>, txns: Transaction[]): AnimalCostEntry[] {
  const entries: AnimalCostEntry[] = [];
  for (const txn of txns) {
    const entry = costEntryFor(txn, animal);
    if (entry) entries.push(entry);
  }
  return entries.sort((a, b) => a.date.toMillis() - b.date.toMillis() || a.transactionId.localeCompare(b.transactionId));
}

/** True when the stored ledger differs from the rebuilt one (ignores entry order and description). */
export function costEntriesDiffer(stored: AnimalCostEntry[] | undefined, rebuilt: AnimalCostEntry[]): boolean {
  const key = (e: AnimalCostEntry) => `${e.transactionId}:${round2(e.amount)}`;
  const a = (stored || []).map(key).sort();
  const b = rebuilt.map(key).sort();
  return a.length !== b.length || a.some((k, i) => k !== b[i]);
}
