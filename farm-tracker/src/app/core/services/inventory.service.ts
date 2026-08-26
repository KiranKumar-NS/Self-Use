import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  orderBy,
  where,
  limit,
  writeBatch,
  WriteBatch,
  updateDoc,
  serverTimestamp,
  increment,
  arrayUnion,
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
    const user = this.authService.requireUser();

    const eventRef = doc(collection(this.firestore, 'inventoryEvents'));

    // Determine count sign based on event type
    // Adjustment keeps user-provided sign (can be positive or negative for count corrections)
    const countDelta = data.eventType === 'adjustment'
      ? data.count
      : ['birth', 'purchase'].includes(data.eventType)
        ? Math.abs(data.count)
        : -Math.abs(data.count);

    const eventDoc: Record<string, any> = {
      id: eventRef.id,
      segment: data.segment,
      segmentName: data.segmentName,
      eventType: data.eventType,
      count: countDelta,
      breed: data.breed || '',
      note: data.note,
      date: Timestamp.fromDate(data.date),
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      month: data.month,
      year: data.year,
    };
    if (data.estimatedValue) eventDoc['estimatedValue'] = data.estimatedValue;
    if (data.deathCause) eventDoc['deathCause'] = data.deathCause;
    if (data.linkedAnimalIds?.length) eventDoc['linkedAnimalIds'] = data.linkedAnimalIds;
    if (data.linkedTransactionId) eventDoc['linkedTransactionId'] = data.linkedTransactionId;
    batch.set(eventRef, eventDoc);

    // Update segment's currentStock + add breed if new
    const segRef = doc(this.firestore, 'segments', data.segment);
    const segUpdate: any = { currentStock: increment(countDelta) };
    if (data.breed) segUpdate.breeds = arrayUnion(data.breed);
    batch.update(segRef, segUpdate);

    await batch.commit();
    this.segmentService.clearCache();
    return eventRef.id;
  }

  /**
   * Stamp the animal / transaction an event created onto the event itself.
   * Called right after recordEvent() because the batch record and its expense are
   * created afterwards — without this back-link, editing the event later has no way
   * to find what it produced (see the fallback in InventoryEventDialogComponent).
   */
  async setLinks(eventId: string, links: { animalId?: string; transactionId?: string }): Promise<void> {
    const updates: Record<string, any> = {};
    if (links.animalId) updates['linkedAnimalIds'] = [links.animalId];
    if (links.transactionId) updates['linkedTransactionId'] = links.transactionId;
    if (!Object.keys(updates).length) return;
    await updateDoc(doc(this.firestore, 'inventoryEvents', eventId), updates);
  }

  async getEvents(segmentId?: string, pageSize = 50): Promise<InventoryEvent[]> {
    const constraints: any[] = [];
    if (segmentId) constraints.push(where('segment', '==', segmentId));
    constraints.push(orderBy('date', 'desc'), limit(pageSize));

    const q = query(collection(this.firestore, 'inventoryEvents'), ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as InventoryEvent).filter(e => !e.isDeleted);
  }

  async getEventById(eventId: string): Promise<InventoryEvent | null> {
    const snap = await getDoc(doc(this.firestore, 'inventoryEvents', eventId));
    if (!snap.exists()) return null;
    const event = snap.data() as InventoryEvent;
    return event.isDeleted ? null : event;
  }

  /**
   * Appends the deletion (soft or hard) of an event plus the reversal of its stock
   * delta to a caller-owned batch. Caller commits and clears the segment cache.
   */
  reverseEventInBatch(
    batch: WriteBatch,
    event: Pick<InventoryEvent, 'id' | 'segment' | 'count'>,
    hard: boolean
  ): void {
    const eventRef = doc(this.firestore, 'inventoryEvents', event.id);
    if (hard) {
      batch.delete(eventRef);
    } else {
      batch.update(eventRef, { isDeleted: true });
    }
    batch.update(doc(this.firestore, 'segments', event.segment), {
      currentStock: increment(-event.count),
    });
  }

  async deleteEvent(eventId: string, segment: string, countDelta: number): Promise<void> {
    const batch = writeBatch(this.firestore);
    this.reverseEventInBatch(batch, { id: eventId, segment, count: countDelta }, true);
    await batch.commit();
    this.segmentService.clearCache();
  }

  async softDeleteEvent(eventId: string, segment: string, countDelta: number): Promise<void> {
    const batch = writeBatch(this.firestore);
    this.reverseEventInBatch(batch, { id: eventId, segment, count: countDelta }, false);
    await batch.commit();
    this.segmentService.clearCache();
  }

  async updateEvent(eventId: string, oldEvent: InventoryEvent, data: InventoryEventFormData): Promise<void> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.requireUser();

    const newCountDelta = data.eventType === 'adjustment'
      ? data.count
      : ['birth', 'purchase'].includes(data.eventType)
        ? Math.abs(data.count)
        : -Math.abs(data.count);

    // Update the event document
    const updateData: Record<string, any> = {
      segment: data.segment,
      segmentName: data.segmentName,
      eventType: data.eventType,
      count: newCountDelta,
      breed: data.breed || '',
      note: data.note,
      date: Timestamp.fromDate(data.date),
      month: data.month,
      year: data.year,
      estimatedValue: data.estimatedValue || null,
    };
    // Only death events carry a cause; leave the field alone for every other type
    // so an edit can never blank a value the form never showed.
    if (data.eventType === 'death') updateData['deathCause'] = data.deathCause || null;
    batch.update(doc(this.firestore, 'inventoryEvents', eventId), updateData);

    // Reverse old stock, apply new
    if (oldEvent.segment === data.segment) {
      // Same segment — apply net difference
      const stockDiff = newCountDelta - oldEvent.count;
      if (stockDiff !== 0) {
        batch.update(doc(this.firestore, 'segments', data.segment), {
          currentStock: increment(stockDiff),
        });
      }
    } else {
      // Different segment — reverse old, apply new
      batch.update(doc(this.firestore, 'segments', oldEvent.segment), {
        currentStock: increment(-oldEvent.count),
      });
      batch.update(doc(this.firestore, 'segments', data.segment), {
        currentStock: increment(newCountDelta),
      });
    }

    await batch.commit();
    this.segmentService.clearCache();
  }
}
