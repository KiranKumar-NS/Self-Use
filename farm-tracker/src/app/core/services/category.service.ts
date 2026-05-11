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

  async getAll(): Promise<Category[]> {
    const q = query(collection(this.firestore, 'categories'), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Category);
  }

  async getByType(type: 'expense' | 'income'): Promise<Category[]> {
    const q = query(
      collection(this.firestore, 'categories'),
      where('type', '==', type),
      orderBy('name')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Category);
  }

  async seedDefaults(): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      await setDoc(doc(this.firestore, 'categories', cat.id), cat);
    }
  }
}
