import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  onSnapshot,
  Timestamp,
  QueryConstraint,
  writeBatch,
} from 'firebase/firestore';
import { FIRESTORE } from './firebase.config';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FirestoreService {
  private readonly firestore = inject(FIRESTORE);

  async getDocument<T>(collectionName: string, docId: string): Promise<T | null> {
    const docRef = doc(this.firestore, collectionName, docId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as T) : null;
  }

  async queryDocuments<T>(collectionName: string, constraints: QueryConstraint[]): Promise<T[]> {
    const q = query(collection(this.firestore, collectionName), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
  }

  listenToCollection<T>(
    collectionName: string,
    constraints: QueryConstraint[],
  ): Observable<T[]> {
    return new Observable((subscriber) => {
      const q = query(collection(this.firestore, collectionName), ...constraints);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
          subscriber.next(data);
        },
        (error) => subscriber.error(error),
      );
      return () => unsubscribe();
    });
  }

  async addDocument(
    collectionName: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const docRef = await addDoc(collection(this.firestore, collectionName), {
      ...data,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  }

  async updateDocument(
    collectionName: string,
    docId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const docRef = doc(this.firestore, collectionName, docId);
    await updateDoc(docRef, { ...data, updatedAt: Timestamp.now() });
  }

  async deleteDocument(collectionName: string, docId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, collectionName, docId));
  }

  async batchWrite(
    operations: Array<{
      type: 'set' | 'update' | 'delete';
      collection: string;
      docId: string;
      data?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    const batch = writeBatch(this.firestore);
    for (const op of operations) {
      const ref = doc(this.firestore, op.collection, op.docId);
      switch (op.type) {
        case 'set':
          batch.set(ref, op.data!);
          break;
        case 'update':
          batch.update(ref, op.data!);
          break;
        case 'delete':
          batch.delete(ref);
          break;
      }
    }
    await batch.commit();
  }
}
