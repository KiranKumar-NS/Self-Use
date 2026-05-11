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

  async getAll(): Promise<AppUser[]> {
    const q = query(collection(this.firestore, 'users'), orderBy('displayName'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as AppUser);
  }

  async getById(uid: string): Promise<AppUser | null> {
    const docSnap = await getDoc(doc(this.firestore, 'users', uid));
    return docSnap.exists() ? (docSnap.data() as AppUser) : null;
  }

  async update(uid: string, data: Partial<AppUser>): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  }

  async toggleActive(uid: string, isActive: boolean): Promise<void> {
    await updateDoc(doc(this.firestore, 'users', uid), {
      isActive,
      updatedAt: serverTimestamp(),
    });
  }
}
