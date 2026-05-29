import { Timestamp } from '@angular/fire/firestore';

export interface MonthlySummary {
  month: string;
  year: number;
  segment: string;
  totalExpense: number;
  totalIncome: number;
  netProfit: number;
  expenseByCategory: Record<string, number>;
  incomeBySource: Record<string, number>;
  expenseByPerson?: Record<string, number>;
  incomeByPerson?: Record<string, number>;
  totalDistributed?: number;
  distributionByPerson?: Record<string, number>;
  updatedAt: Timestamp;
}
