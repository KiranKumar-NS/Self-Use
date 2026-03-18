import { inject, Injectable } from '@angular/core';
import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from '../../../core/firebase/firestore.service';
import { AuthService } from '../../../core/auth/auth.service';
import { FarmNotification } from '../../../core/models';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ScheduledNotificationService {
  private readonly db = inject(FirestoreService);
  private readonly auth = inject(AuthService);
  private readonly COLLECTION = 'notifications';

  getNotifications$(): Observable<FarmNotification[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<FarmNotification>(this.COLLECTION, [
      where('farmId', '==', farmId),
      orderBy('scheduledDate', 'desc'),
    ]);
  }

  async markAsRead(id: string): Promise<void> {
    return this.db.updateDocument(this.COLLECTION, id, { isRead: true });
  }

  async markAllAsRead(ids: string[]): Promise<void> {
    const ops = ids.map((id) => ({
      type: 'update' as const,
      collection: this.COLLECTION,
      docId: id,
      data: { isRead: true },
    }));
    return this.db.batchWrite(ops);
  }

  async addNotification(data: Omit<FarmNotification, 'id' | 'createdAt'>): Promise<string> {
    return this.db.addDocument(this.COLLECTION, {
      ...data,
      farmId: this.auth.currentFarmId(),
    });
  }
}
