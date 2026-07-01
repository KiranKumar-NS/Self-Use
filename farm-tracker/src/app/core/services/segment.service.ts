import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Segment, SegmentBudget, DEFAULT_SEGMENTS } from '../models/segment.model';

@Injectable({ providedIn: 'root' })
export class SegmentService {
  private firestore = inject(Firestore);
  private cache: Segment[] | null = null;

  async getAll(): Promise<Segment[]> {
    if (this.cache) return this.cache;
    const q = query(collection(this.firestore, 'segments'), orderBy('name'));
    const snapshot = await getDocs(q);
    this.cache = snapshot.docs.map((d) => d.data() as Segment);
    return this.cache;
  }

  clearCache(): void {
    this.cache = null;
  }

  async updateBudget(segmentId: string, budgets: SegmentBudget): Promise<void> {
    await updateDoc(doc(this.firestore, 'segments', segmentId), { budgets });
    this.clearCache();
  }

  async seedDefaults(): Promise<void> {
    for (const seg of DEFAULT_SEGMENTS) {
      await setDoc(doc(this.firestore, 'segments', seg.id), {
        ...seg,
        createdAt: serverTimestamp(),
      }, { merge: true }); // merge: preserves existing budgets & custom fields
    }
    this.clearCache();
  }

  /** Migrate: set segmentType, unit, and fix icons on existing segments */
  async migrateSegmentTypes(): Promise<number> {
    const segments = await this.getAll();
    let updated = 0;
    for (const seg of segments) {
      const defaultSeg = DEFAULT_SEGMENTS.find(d => d.id === seg.id);
      const updates: any = {};
      if (!seg.segmentType) {
        updates.segmentType = defaultSeg?.segmentType || 'animal';
      }
      if (!seg.unit && (seg.segmentType || updates.segmentType) === 'animal') {
        updates.unit = defaultSeg?.unit || 'head';
      }
      // Fix dragon emoji
      if (seg.id === 'dragon' && seg.icon === '🐉') {
        updates.icon = '🌵';
        updates.name = 'Dragon Fruit';
        updates.description = 'Dragon fruit farming';
      }
      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(this.firestore, 'segments', seg.id), updates);
        updated++;
      }
    }
    if (updated > 0) this.clearCache();
    return updated;
  }
}
