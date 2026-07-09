import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
} from '@angular/fire/firestore';

@Injectable({ providedIn: 'root' })
export class TagService {
  private firestore = inject(Firestore);
  private cache: string[] | null = null;

  private get tagDocRef() {
    return doc(this.firestore, 'meta', 'tags');
  }

  async getTags(): Promise<string[]> {
    if (this.cache) return this.cache;
    try {
      const snap = await getDoc(this.tagDocRef);
      this.cache = snap.exists() ? (snap.data()['all'] as string[]) || [] : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  async addTags(tags: string[]): Promise<void> {
    const normalized = tags
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    if (normalized.length === 0) return;

    try {
      await setDoc(
        this.tagDocRef,
        { all: arrayUnion(...normalized) },
        { merge: true }
      );
      // Update cache
      if (this.cache) {
        const set = new Set(this.cache);
        normalized.forEach((t) => set.add(t));
        this.cache = [...set].sort();
      }
    } catch {
      // silently fail — tags are non-critical
    }
  }
}
