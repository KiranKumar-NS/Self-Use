import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  where,
} from '@angular/fire/firestore';
import { Category, DEFAULT_CATEGORIES } from '../models/category.model';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private firestore = inject(Firestore);
  private allCache: Category[] | null = null;
  private typeCache = new Map<string, Category[]>();

  async getAll(): Promise<Category[]> {
    if (this.allCache) return this.allCache;
    const q = query(collection(this.firestore, 'categories'), orderBy('name'));
    const snapshot = await getDocs(q);
    this.allCache = snapshot.docs.map((d) => d.data() as Category);
    return this.allCache;
  }

  async getByType(type: 'expense' | 'income'): Promise<Category[]> {
    if (this.typeCache.has(type)) return this.typeCache.get(type)!;
    // If we already have all categories cached, filter locally
    if (this.allCache) {
      const filtered = this.allCache.filter(c => c.type === type);
      this.typeCache.set(type, filtered);
      return filtered;
    }
    const q = query(
      collection(this.firestore, 'categories'),
      where('type', '==', type),
      orderBy('name')
    );
    const snapshot = await getDocs(q);
    const result = snapshot.docs.map((d) => d.data() as Category);
    this.typeCache.set(type, result);
    return result;
  }

  clearCache(): void {
    this.allCache = null;
    this.typeCache.clear();
  }

  async seedDefaults(): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      await setDoc(doc(this.firestore, 'categories', cat.id), cat);
    }
    this.clearCache();
  }
}
