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
  writeBatch,
  serverTimestamp,
  increment,
  Timestamp,
} from '@angular/fire/firestore';
import { InventoryEvent, InventoryEventFormData } from '../models/inventory.model';
import { AuthService } from './auth.service';
import { SegmentService } from './segment.service';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private segmentService = inject(SegmentService);

  async recordEvent(data: InventoryEventFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.userProfile()!;

    const eventRef = doc(collection(this.firestore, 'inventoryEvents'));

    // Determine count sign based on event type
    const countDelta = ['birth', 'purchase', 'adjustment'].includes(data.eventType)
      ? Math.abs(data.count)
      : -Math.abs(data.count);

    batch.set(eventRef, {
      id: eventRef.id,
      segment: data.segment,
      segmentName: data.segmentName,
      eventType: data.eventType,
      count: countDelta,
      note: data.note,
      date: Timestamp.fromDate(data.date),
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      month: data.month,
      year: data.year,
    });

    // Update segment's currentStock
    const segRef = doc(this.firestore, 'segments', data.segment);
    batch.update(segRef, {
      currentStock: increment(countDelta),
    });

    await batch.commit();
    this.segmentService.clearCache();
    return eventRef.id;
  }

  async getEvents(segmentId?: string, pageSize = 50): Promise<InventoryEvent[]> {
    const constraints: any[] = [orderBy('date', 'desc'), limit(pageSize)];
    if (segmentId) constraints.push(where('segment', '==', segmentId));

    const q = query(collection(this.firestore, 'inventoryEvents'), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as InventoryEvent);
  }
}
