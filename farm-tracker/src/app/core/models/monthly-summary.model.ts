import { Timestamp } from '@angular/fire/firestore';

export interface MonthlySummary {
  month: string;
  year: number;
  segment: string;
  totalExpense: number;
  totalIncome: number;
  netProfit: number;
  expenseByCategory: Record<string, number>;    // categoryName → amount (legacy)
  incomeBySource: Record<string, number>;       // categoryName → amount (legacy)
  expenseByCategoryId?: Record<string, number>; // categoryId → amount (preferred, rename-safe)
  incomeBySourceId?: Record<string, number>;    // categoryId → amount (preferred, rename-safe)
  expenseByPerson?: Record<string, number>;
  incomeByPerson?: Record<string, number>;
  totalDistributed?: number;
  distributionByPerson?: Record<string, number>;
  pendingIncome?: number;
  pendingExpense?: number;
  updatedAt: Timestamp;
}

/**
 * Precomputed yearly rollup — 1 doc per segment per year.
 * Doc ID: `{year}-{segmentId}` (e.g. "2026-goats")
 * Maintained alongside MonthlySummary on every transaction write.
 */
export interface YearlySummary {
  year: number;
  segment: string;
  totalExpense: number;
  totalIncome: number;
  netProfit: number;
  expenseByCategory: Record<string, number>;
  incomeBySource: Record<string, number>;
  expenseByCategoryId?: Record<string, number>;
  incomeBySourceId?: Record<string, number>;
  expenseByPerson?: Record<string, number>;
  incomeByPerson?: Record<string, number>;
  totalDistributed?: number;
  distributionByPerson?: Record<string, number>;
  pendingIncome?: number;
  pendingExpense?: number;
  updatedAt: Timestamp;
}
