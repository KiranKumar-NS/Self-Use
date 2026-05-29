import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { AppUser } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private firestore = inject(Firestore);
  private cache: AppUser[] | null = null;

  async getAll(): Promise<AppUser[]> {
    if (this.cache) return this.cache;
    const q = query(collection(this.firestore, 'users'), orderBy('displayName'));
    const snapshot = await getDocs(q);
    this.cache = snapshot.docs.map((d) => d.data() as AppUser);
    return this.cache;
  }

  async getById(uid: string): Promise<AppUser | null> {
    // Check cache first
    if (this.cache) {
      const cached = this.cache.find(u => u.uid === uid);
      if (cached) return cached;
    }
    const docSnap = await getDoc(doc(this.firestore, 'users', uid));
    return docSnap.exists() ? (docSnap.data() as AppUser) : null;
  }

  clearCache(): void {
    this.cache = null;
  }

  async update(uid: string, data: Partial<AppUser>): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    this.clearCache();
  }

  async toggleActive(uid: string, isActive: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      isActive,
      updatedAt: serverTimestamp(),
    });
    this.clearCache();
  }
}
