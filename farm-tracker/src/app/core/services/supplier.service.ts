import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, limit, writeBatch, serverTimestamp, Timestamp, increment, runTransaction,
} from '@angular/fire/firestore';
import { Supplier } from '../models/supplier.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get ref() { return collection(this.firestore, 'suppliers'); }

  private cache: Supplier[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  clearCache(): void {
    this.cache = null;
    this.cacheTime = 0;
  }

  async create(data: Partial<Supplier>): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);

    await setDoc(docRef, {
      id: docRef.id,
      name: data.name || '',
      phone: data.phone || null,
      location: data.location || null,
      gstNumber: data.gstNumber || null,
      itemCategories: data.itemCategories || [],
      totalOrders: 0,
      totalAmountPaid: 0,
      pendingAmount: 0,
      note: data.note || null,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
    });
    this.clearCache();
    return docRef.id;
  }

  async update(id: string, data: Partial<Supplier>): Promise<void> {
    await updateDoc(doc(this.firestore, 'suppliers', id), { ...data });
    this.clearCache();
  }

  async getAll(): Promise<Supplier[]> {
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_TTL) {
      return this.cache;
    }
    const q = query(this.ref, where('isDeleted', '==', false), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    this.cache = snapshot.docs.map(d => d.data() as Supplier);
    this.cacheTime = Date.now();
    return this.cache;
  }

  async getById(id: string): Promise<Supplier | null> {
    const docSnap = await getDoc(doc(this.firestore, 'suppliers', id));
    return docSnap.exists() ? (docSnap.data() as Supplier) : null;
  }

  /**
   * Keep supplier order counters in sync with expense transactions. Deltas may be
   * negative so an edit or delete reverses cleanly — mirrors BuyerService.updateStats,
   * and one runTransaction keeps the average consistent with the totals it derives from.
   */
  async updateStats(supplierId: string, amountDelta: number, countDelta: number, pendingDelta: number, date: Date | null, segmentId?: string): Promise<void> {
    const supplierRef = doc(this.firestore, 'suppliers', supplierId);

    await runTransaction(this.firestore, async (transaction) => {
      const snap = await transaction.get(supplierRef);
      if (!snap.exists()) return;

      const supplier = snap.data() as Supplier;
      const newTotalAmount = (supplier.totalAmountPaid || 0) + amountDelta;
      const newTotalCount = (supplier.totalOrders || 0) + countDelta;

      const updates: Record<string, any> = {
        totalOrders: increment(countDelta),
        totalAmountPaid: increment(amountDelta),
        averageRate: newTotalCount > 0 ? Math.round((newTotalAmount / newTotalCount) * 100) / 100 : 0,
      };
      if (pendingDelta !== 0) updates['pendingAmount'] = increment(pendingDelta);
      if (date && (!supplier.lastOrderDate || supplier.lastOrderDate.toMillis() < date.getTime())) {
        updates['lastOrderDate'] = Timestamp.fromDate(date);
      }
      if (segmentId) {
        updates[`ordersBySegment.${segmentId}`] = increment(countDelta);
        updates[`amountBySegment.${segmentId}`] = increment(amountDelta);
      }

      transaction.update(supplierRef, updates);
    });

    this.clearCache();
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'suppliers', id), { isDeleted: true });
    this.clearCache();
  }

  /**
   * Permanent delete, refused while any expense transaction still points at the
   * supplier. Stock purchases are covered transitively — every supplier-linked
   * stock movement also writes a linked expense transaction — and dues/payables
   * are derived from those same transactions.
   */
  async hardDelete(id: string): Promise<void> {
    const snap = await getDocs(
      query(collection(this.firestore, 'transactions'), where('linkedSupplierId', '==', id), limit(1))
    );
    if (!snap.empty) {
      throw new Error('Cannot permanently delete: supplier has linked transactions. Use soft delete instead.');
    }
    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, 'suppliers', id));
    await batch.commit();
    this.clearCache();
  }
}
