import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, serverTimestamp, Timestamp, increment,
} from '@angular/fire/firestore';
import { Supplier } from '../models/supplier.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get ref() { return collection(this.firestore, 'suppliers'); }

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
    return docRef.id;
  }

  async update(id: string, data: Partial<Supplier>): Promise<void> {
    await updateDoc(doc(this.firestore, 'suppliers', id), { ...data });
  }

  async getAll(): Promise<Supplier[]> {
    const q = query(this.ref, where('isDeleted', '==', false), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Supplier);
  }

  async getById(id: string): Promise<Supplier | null> {
    const docSnap = await getDoc(doc(this.firestore, 'suppliers', id));
    return docSnap.exists() ? (docSnap.data() as Supplier) : null;
  }

  async updateStats(supplierId: string, amount: number, date: Date, segmentId?: string): Promise<void> {
    const updates: Record<string, any> = {
      totalOrders: increment(1),
      totalAmountPaid: increment(amount),
      lastOrderDate: Timestamp.fromDate(date),
    };
    if (segmentId) {
      updates[`ordersBySegment.${segmentId}`] = increment(1);
      updates[`amountBySegment.${segmentId}`] = increment(amount);
    }
    await updateDoc(doc(this.firestore, 'suppliers', supplierId), updates);

    // Recalculate average
    const supplier = await this.getById(supplierId);
    if (supplier && supplier.totalOrders > 0) {
      await updateDoc(doc(this.firestore, 'suppliers', supplierId), {
        averageRate: Math.round((supplier.totalAmountPaid / supplier.totalOrders) * 100) / 100,
      });
    }
  }

  async updatePendingAmount(supplierId: string, delta: number): Promise<void> {
    await updateDoc(doc(this.firestore, 'suppliers', supplierId), {
      pendingAmount: increment(delta),
    });
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'suppliers', id), { isDeleted: true });
  }
}
