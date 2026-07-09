import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  limit,
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { BreedingRecord } from '../models/breeding.model';
import { AuthService } from './auth.service';
import { getMonthString, getYear } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class BreedingService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get breedingRef() {
    return collection(this.firestore, 'breedingRecords');
  }

  async create(data: Partial<BreedingRecord>): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.breedingRef);
    const matingDate = data.matingDate?.toDate() || new Date();

    await setDoc(docRef, {
      id: docRef.id,
      segment: data.segment || '',
      segmentName: data.segmentName || '',
      sireId: data.sireId || null,
      sireName: data.sireName || null,
      damId: data.damId || '',
      damName: data.damName || '',
      matingDate: data.matingDate || Timestamp.now(),
      matingMethod: data.matingMethod || 'natural',
      status: data.status || 'mated',
      expectedDeliveryDate: data.expectedDeliveryDate || null,
      gestationDays: data.gestationDays || null,
      note: data.note || '',
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      month: getMonthString(matingDate),
      year: getYear(matingDate),
    });

    return docRef.id;
  }

  async update(id: string, data: Partial<BreedingRecord>): Promise<void> {
    await updateDoc(doc(this.firestore, 'breedingRecords', id), { ...data });
  }

  async getAll(filters: { segment?: string; status?: string } = {}, pageSize = 100): Promise<BreedingRecord[]> {
    const constraints: any[] = [where('isDeleted', '==', false)];
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    if (filters.status) constraints.push(where('status', '==', filters.status));
    constraints.push(orderBy('matingDate', 'desc'), limit(pageSize));

    const q = query(this.breedingRef, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as BreedingRecord);
  }

  async getById(id: string): Promise<BreedingRecord | null> {
    const docSnap = await getDoc(doc(this.firestore, 'breedingRecords', id));
    return docSnap.exists() ? (docSnap.data() as BreedingRecord) : null;
  }

  async getByAnimal(animalId: string): Promise<BreedingRecord[]> {
    const all = await this.getAll({}, 200);
    return all.filter(r => r.sireId === animalId || r.damId === animalId);
  }

  async getUpcomingDeliveries(): Promise<BreedingRecord[]> {
    const records = await this.getAll({ status: 'confirmed_pregnant' });
    return records.filter(r => r.expectedDeliveryDate);
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'breedingRecords', id), { isDeleted: true });
  }
}
