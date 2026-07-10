import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { MarketPrice, MarketPriceFormData } from '../models/market-price.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class MarketPriceService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get ref() {
    return collection(this.firestore, 'marketPrices');
  }

  /** Normalize product to the same key format used on transactions */
  normalizeProduct(product: string): string {
    return product.trim().toLowerCase().replace(/[.$/\[\]#]/g, '_');
  }

  async create(data: MarketPriceFormData): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);
    await setDoc(docRef, {
      id: docRef.id,
      date: Timestamp.fromDate(data.date),
      product: this.normalizeProduct(data.product),
      unit: data.unit,
      price: data.price,
      market: data.market || null,
      note: data.note || null,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
    });
    return docRef.id;
  }

  async getRecent(count = 100): Promise<MarketPrice[]> {
    const q = query(
      this.ref,
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as MarketPrice);
  }

  async getByProduct(product: string, count = 50): Promise<MarketPrice[]> {
    const q = query(
      this.ref,
      where('isDeleted', '==', false),
      where('product', '==', this.normalizeProduct(product)),
      orderBy('date', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as MarketPrice);
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'marketPrices', id), { isDeleted: true });
  }
}
