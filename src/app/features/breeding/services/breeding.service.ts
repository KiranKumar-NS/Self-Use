import { inject, Injectable } from '@angular/core';
import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from '../../../core/firebase/firestore.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BreedingRecord } from '../../../core/models';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BreedingService {
  private readonly db = inject(FirestoreService);
  private readonly auth = inject(AuthService);
  private readonly COLLECTION = 'breedingRecords';

  getBreedingRecords$(): Observable<BreedingRecord[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<BreedingRecord>(this.COLLECTION, [
      where('farmId', '==', farmId),
      orderBy('createdAt', 'desc'),
    ]);
  }

  async getActivePregnancies(): Promise<BreedingRecord[]> {
    return this.db.queryDocuments<BreedingRecord>(this.COLLECTION, [
      where('farmId', '==', this.auth.currentFarmId()),
      where('status', 'in', ['mated', 'confirmed_pregnant', 'kidding_due']),
    ]);
  }

  async addRecord(data: Omit<BreedingRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.db.addDocument(this.COLLECTION, {
      ...data,
      farmId: this.auth.currentFarmId(),
      createdBy: this.auth.currentUid(),
    });
  }

  async updateRecord(id: string, updates: Partial<BreedingRecord>): Promise<void> {
    return this.db.updateDocument(this.COLLECTION, id, updates as Record<string, unknown>);
  }

  async getRecordById(id: string): Promise<BreedingRecord | null> {
    return this.db.getDocument<BreedingRecord>(this.COLLECTION, id);
  }
}
