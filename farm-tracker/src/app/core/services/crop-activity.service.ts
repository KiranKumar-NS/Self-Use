import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, limit, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { CropActivity } from '../models/crop-activity.model';
import { AuthService } from './auth.service';
import { getMonthString, getYear } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class CropActivityService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get ref() { return collection(this.firestore, 'cropActivities'); }

  async create(data: Partial<CropActivity>): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);
    const actDate = data.date?.toDate() || new Date();

    await setDoc(docRef, {
      id: docRef.id,
      segment: data.segment || '',
      segmentName: data.segmentName || '',
      activityType: data.activityType || 'other',
      date: data.date || Timestamp.now(),
      description: data.description || '',
      productUsed: data.productUsed || null,
      quantity: data.quantity || null,
      unit: data.unit || null,
      area: data.area || null,
      duration: data.duration || null,
      laborCount: data.laborCount || null,
      cost: data.cost || null,
      linkedTransactionId: data.linkedTransactionId || null,
      weather: data.weather || null,
      temperature: data.temperature || null,
      note: data.note || null,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      month: getMonthString(actDate),
      year: getYear(actDate),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<CropActivity>): Promise<void> {
    await updateDoc(doc(this.firestore, 'cropActivities', id), { ...data });
  }

  async getAll(filters: { segment?: string; activityType?: string } = {}, pageSize = 200): Promise<CropActivity[]> {
    const constraints: any[] = [where('isDeleted', '==', false)];
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    constraints.push(orderBy('date', 'desc'), limit(pageSize));
    const q = query(this.ref, ...constraints);
    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(d => d.data() as CropActivity);
    if (filters.activityType) results = results.filter(a => a.activityType === filters.activityType);
    return results;
  }

  async getById(id: string): Promise<CropActivity | null> {
    const docSnap = await getDoc(doc(this.firestore, 'cropActivities', id));
    return docSnap.exists() ? (docSnap.data() as CropActivity) : null;
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'cropActivities', id), { isDeleted: true });
  }
}
