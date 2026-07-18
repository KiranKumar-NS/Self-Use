import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp,
} from '@angular/fire/firestore';
import { Buyer, BuyerFormData } from '../models/buyer.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class BuyerService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private cache: Buyer[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  clearCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  async create(data: BuyerFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.requireUser();
    const buyerRef = doc(collection(this.firestore, 'buyers'));

    batch.set(buyerRef, {
      id: buyerRef.id,
      name: data.name.trim(),
      phone: data.phone?.trim() || '',
      location: data.location?.trim() || '',
      note: data.note?.trim() || '',
      totalPurchases: 0,
      totalAmountPaid: 0,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
    });

    await batch.commit();
    this.clearCache();
    return buyerRef.id;
  }

  async update(id: string, data: Partial<BuyerFormData>): Promise<void> {
    const batch = writeBatch(this.firestore);
    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates['name'] = data.name.trim();
    if (data.phone !== undefined) updates['phone'] = data.phone?.trim() || '';
    if (data.location !== undefined) updates['location'] = data.location?.trim() || '';
    if (data.note !== undefined) updates['note'] = data.note?.trim() || '';

    batch.update(doc(this.firestore, 'buyers', id), updates);
    await batch.commit();
    this.clearCache();
  }

  async getAll(): Promise<Buyer[]> {
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }
    const q = query(
      collection(this.firestore, 'buyers'),
      where('isDeleted', '==', false),
      orderBy('name', 'asc'),
      limit(500)
    );
    const snapshot = await getDocs(q);
    this.cache = snapshot.docs.map(d => d.data() as Buyer);
    this.cacheTime = Date.now();
    return this.cache;
  }

  async getById(id: string): Promise<Buyer | null> {
    const docSnap = await getDoc(doc(this.firestore, 'buyers', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Buyer;
    return data.isDeleted ? null : data;
  }

  /**
   * Adjust buyer purchase counters. Deltas may be negative (reversal on
   * transaction edit/delete). lastPurchaseDate only moves forward; backdated
   * corrections are healed by counterparty reconciliation.
   */
  async updateStats(buyerId: string, saleAmount: number, count: number, date: Date | null, segmentId?: string): Promise<void> {
    const buyerRef = doc(this.firestore, 'buyers', buyerId);

    await runTransaction(this.firestore, async (transaction) => {
      const snap = await transaction.get(buyerRef);
      if (!snap.exists()) return;

      const buyer = snap.data() as Buyer;
      const newTotalAmount = (buyer.totalAmountPaid || 0) + saleAmount;
      const newTotalCount = (buyer.totalPurchases || 0) + count;

      const updates: Record<string, any> = {
        totalPurchases: increment(count),
        totalAmountPaid: increment(saleAmount),
        averageRate: newTotalCount > 0 ? Math.round((newTotalAmount / newTotalCount) * 100) / 100 : 0,
      };
      if (date && (!buyer.lastPurchaseDate || buyer.lastPurchaseDate.toMillis() < date.getTime())) {
        updates['lastPurchaseDate'] = Timestamp.fromDate(date);
      }

      // Track per-segment breakdown
      if (segmentId) {
        updates[`purchasesBySegment.${segmentId}`] = increment(count);
        updates[`amountBySegment.${segmentId}`] = increment(saleAmount);
      }

      transaction.update(buyerRef, updates);
    });

    this.clearCache();
  }

  async softDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'buyers', id), { isDeleted: true });
    await batch.commit();
    this.clearCache();
  }
}
