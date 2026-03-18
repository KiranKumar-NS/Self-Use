import { inject, Injectable } from '@angular/core';
import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from '../../../core/firebase/firestore.service';
import { AuthService } from '../../../core/auth/auth.service';
import { FeedLog, FeedStock } from '../../../core/models';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly db = inject(FirestoreService);
  private readonly auth = inject(AuthService);

  getFeedLogs$(): Observable<FeedLog[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<FeedLog>('feedLogs', [
      where('farmId', '==', farmId),
      orderBy('feedDate', 'desc'),
    ]);
  }

  getFeedStock$(): Observable<FeedStock[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<FeedStock>('feedStock', [
      where('farmId', '==', farmId),
    ]);
  }

  async addFeedLog(data: Omit<FeedLog, 'id' | 'createdAt'>): Promise<string> {
    return this.db.addDocument('feedLogs', {
      ...data,
      farmId: this.auth.currentFarmId(),
      createdBy: this.auth.currentUid(),
    });
  }

  async updateFeedStock(id: string, updates: Partial<FeedStock>): Promise<void> {
    return this.db.updateDocument('feedStock', id, updates as Record<string, unknown>);
  }

  async addFeedStock(data: Omit<FeedStock, 'id'>): Promise<string> {
    return this.db.addDocument('feedStock', {
      ...data,
      farmId: this.auth.currentFarmId(),
    });
  }
}
