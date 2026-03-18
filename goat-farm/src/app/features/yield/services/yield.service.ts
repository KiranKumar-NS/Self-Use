import { inject, Injectable } from '@angular/core';
import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from '../../../core/firebase/firestore.service';
import { AuthService } from '../../../core/auth/auth.service';
import { MilkYield, WeightRecord } from '../../../core/models';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class YieldService {
  private readonly db = inject(FirestoreService);
  private readonly auth = inject(AuthService);

  getMilkYields$(): Observable<MilkYield[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<MilkYield>('milkYields', [
      where('farmId', '==', farmId),
      orderBy('dateRecorded', 'desc'),
    ]);
  }

  getWeightRecords$(goatId: string): Observable<WeightRecord[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<WeightRecord>('weightRecords', [
      where('farmId', '==', farmId),
      where('goatId', '==', goatId),
      orderBy('dateRecorded', 'desc'),
    ]);
  }

  async addMilkYield(data: Omit<MilkYield, 'id' | 'createdAt'>): Promise<string> {
    return this.db.addDocument('milkYields', {
      ...data,
      farmId: this.auth.currentFarmId(),
      createdBy: this.auth.currentUid(),
    });
  }

  async addWeightRecord(data: Omit<WeightRecord, 'id' | 'createdAt'>): Promise<string> {
    return this.db.addDocument('weightRecords', {
      ...data,
      farmId: this.auth.currentFarmId(),
      createdBy: this.auth.currentUid(),
    });
  }
}
