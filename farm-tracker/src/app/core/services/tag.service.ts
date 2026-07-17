import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
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

  /**
   * Remove a tag from the suggestion list AND strip it from every transaction
   * that carries it (including soft-deleted ones). Returns the number of
   * transactions updated.
   */
  async deleteTag(tag: string): Promise<number> {
    const target = tag.trim().toLowerCase();
    if (!target) return 0;
    const updated = await this.replaceTagOnTransactions(target, null);
    await setDoc(this.tagDocRef, { all: arrayRemove(target) }, { merge: true });
    this.cache = null;
    return updated;
  }

  /**
   * Rename a tag across the suggestion list and every transaction that
   * carries it. Merges into the new tag if it already exists. Returns the
   * number of transactions updated.
   */
  async renameTag(oldTag: string, newTag: string): Promise<number> {
    const from = oldTag.trim().toLowerCase();
    const to = newTag.trim().toLowerCase();
    if (!from || !to || from === to) return 0;
    const updated = await this.replaceTagOnTransactions(from, to);
    await setDoc(this.tagDocRef, { all: arrayRemove(from) }, { merge: true });
    await setDoc(this.tagDocRef, { all: arrayUnion(to) }, { merge: true });
    this.cache = null;
    return updated;
  }

  /** Replace (or remove, when newTag is null) a tag on all transactions carrying it. */
  private async replaceTagOnTransactions(oldTag: string, newTag: string | null): Promise<number> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('tags', 'array-contains', oldTag)
    );
    const snapshot = await getDocs(q);

    const BATCH_LIMIT = 400;
    let updated = 0;
    for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const d of snapshot.docs.slice(i, i + BATCH_LIMIT)) {
        const tags = (d.data()['tags'] as string[] | undefined) || [];
        const next = [...new Set(
          tags.map(t => (t === oldTag ? newTag : t)).filter((t): t is string => !!t)
        )];
        batch.update(d.ref, { tags: next });
        updated++;
      }
      await batch.commit();
    }
    return updated;
  }
}
