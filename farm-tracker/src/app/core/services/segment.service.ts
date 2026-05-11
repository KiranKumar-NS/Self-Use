import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Segment, DEFAULT_SEGMENTS } from '../models/segment.model';

@Injectable({ providedIn: 'root' })
export class SegmentService {
  private firestore = inject(Firestore);

  async getAll(): Promise<Segment[]> {
    const q = query(collection(this.firestore, 'segments'), orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Segment);
  }

  async seedDefaults(): Promise<void> {
    for (const seg of DEFAULT_SEGMENTS) {
      await setDoc(doc(this.firestore, 'segments', seg.id), {
        ...seg,
        createdAt: serverTimestamp(),
      });
    }
  }
}
