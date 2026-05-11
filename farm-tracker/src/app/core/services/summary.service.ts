import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '@angular/fire/firestore';
import { MonthlySummary } from '../models/monthly-summary.model';

@Injectable({ providedIn: 'root' })
export class SummaryService {
  private firestore = inject(Firestore);

  async getForMonth(month: string): Promise<MonthlySummary[]> {
    const q = query(
      collection(this.firestore, 'monthlySummaries'),
      where('month', '==', month)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as MonthlySummary);
  }

  async getForMonthAndSegment(month: string, segment: string): Promise<MonthlySummary | null> {
    const docId = `${month}-${segment}`;
    const docSnap = await getDoc(doc(this.firestore, 'monthlySummaries', docId));
    return docSnap.exists() ? (docSnap.data() as MonthlySummary) : null;
  }

  async getForMonths(months: string[]): Promise<MonthlySummary[]> {
    if (months.length === 0) return [];
    const q = query(
      collection(this.firestore, 'monthlySummaries'),
      where('month', 'in', months)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as MonthlySummary);
  }

  aggregateSummaries(summaries: MonthlySummary[]): {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
  } {
    return summaries.reduce(
      (acc, s) => ({
        totalIncome: acc.totalIncome + (s.totalIncome || 0),
        totalExpense: acc.totalExpense + (s.totalExpense || 0),
        netProfit: acc.netProfit + (s.netProfit || 0),
      }),
      { totalIncome: 0, totalExpense: 0, netProfit: 0 }
    );
  }
}
