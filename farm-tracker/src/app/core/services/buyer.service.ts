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
  }

  async getAll(): Promise<Buyer[]> {
    const q = query(
      collection(this.firestore, 'buyers'),
      where('isDeleted', '==', false),
      orderBy('name', 'asc'),
      limit(500)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Buyer);
  }

  async getById(id: string): Promise<Buyer | null> {
    const docSnap = await getDoc(doc(this.firestore, 'buyers', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Buyer;
    return data.isDeleted ? null : data;
  }

  async updateStats(buyerId: string, saleAmount: number, count: number, date: Date, segmentId?: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const buyerRef = doc(this.firestore, 'buyers', buyerId);

    const updates: Record<string, any> = {
      totalPurchases: increment(count),
      totalAmountPaid: increment(saleAmount),
      lastPurchaseDate: Timestamp.fromDate(date),
    };

    // Track per-segment breakdown
    if (segmentId) {
      updates[`purchasesBySegment.${segmentId}`] = increment(count);
      updates[`amountBySegment.${segmentId}`] = increment(saleAmount);
    }

    batch.update(buyerRef, updates);

    // Recalculate averageRate after increment
    const snap = await getDoc(buyerRef);
    if (snap.exists()) {
      const buyer = snap.data() as Buyer;
      const newTotal = buyer.totalAmountPaid + saleAmount;
      const newCount = buyer.totalPurchases + count;
      batch.update(buyerRef, {
        averageRate: newCount > 0 ? Math.round((newTotal / newCount) * 100) / 100 : 0,
      });
    }

    await batch.commit();
  }

  async softDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'buyers', id), { isDeleted: true });
    await batch.commit();
  }
}
