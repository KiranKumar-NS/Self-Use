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

  async getForMonthsBatched(months: string[]): Promise<MonthlySummary[]> {
    if (months.length === 0) return [];
    if (months.length <= 30) return this.getForMonths(months);
    const batches: string[][] = [];
    for (let i = 0; i < months.length; i += 30) {
      batches.push(months.slice(i, i + 30));
    }
    const results = await Promise.all(batches.map(b => this.getForMonths(b)));
    return results.flat();
  }

  async getAll(): Promise<MonthlySummary[]> {
    const snapshot = await getDocs(collection(this.firestore, 'monthlySummaries'));
    return snapshot.docs.map((d) => d.data() as MonthlySummary);
  }

  aggregateSummaries(summaries: MonthlySummary[]): {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
    pendingIncome: number;
  } {
    return summaries.reduce(
      (acc, s) => ({
        totalIncome: acc.totalIncome + (s.totalIncome || 0),
        totalExpense: acc.totalExpense + (s.totalExpense || 0),
        netProfit: acc.netProfit + (s.netProfit || 0),
        pendingIncome: acc.pendingIncome + (s.pendingIncome || 0),
      }),
      { totalIncome: 0, totalExpense: 0, netProfit: 0, pendingIncome: 0 }
    );
  }
}
