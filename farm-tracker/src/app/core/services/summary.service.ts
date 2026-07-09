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
import { MonthlySummary, YearlySummary } from '../models/monthly-summary.model';

@Injectable({ providedIn: 'root' })
export class SummaryService {
  private firestore = inject(Firestore);

  private monthCache = new Map<string, { data: MonthlySummary[]; time: number }>();
  private allCache: { data: MonthlySummary[]; time: number } | null = null;
  private readonly CACHE_TTL = 60 * 1000; // 1 minute

  clearCache(): void {
    this.monthCache.clear();
    this.allCache = null;
  }

  async getForMonth(month: string): Promise<MonthlySummary[]> {
    const cached = this.monthCache.get(month);
    if (cached && Date.now() - cached.time < this.CACHE_TTL) {
      return cached.data;
    }
    const q = query(
      collection(this.firestore, 'monthlySummaries'),
      where('month', '==', month)
    );
    const snapshot = await getDocs(q);
    const result = snapshot.docs.map((d) => d.data() as MonthlySummary);
    this.monthCache.set(month, { data: result, time: Date.now() });
    return result;
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
    if (this.allCache && Date.now() - this.allCache.time < this.CACHE_TTL) {
      return this.allCache.data;
    }
    const snapshot = await getDocs(collection(this.firestore, 'monthlySummaries'));
    const result = snapshot.docs.map((d) => d.data() as MonthlySummary);
    this.allCache = { data: result, time: Date.now() };
    return result;
  }

  async getForYear(year: number): Promise<YearlySummary[]> {
    const q = query(
      collection(this.firestore, 'yearlySummaries'),
      where('year', '==', year)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as YearlySummary);
  }

  async getForYearAndSegment(year: number, segment: string): Promise<YearlySummary | null> {
    const docId = `${year}-${segment}`;
    const docSnap = await getDoc(doc(this.firestore, 'yearlySummaries', docId));
    return docSnap.exists() ? (docSnap.data() as YearlySummary) : null;
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
