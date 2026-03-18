import { inject, Injectable } from '@angular/core';
import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from '../../../core/firebase/firestore.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Transaction } from '../../../core/models';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private readonly db = inject(FirestoreService);
  private readonly auth = inject(AuthService);
  private readonly COLLECTION = 'transactions';

  getTransactions$(): Observable<Transaction[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<Transaction>(this.COLLECTION, [
      where('farmId', '==', farmId),
      orderBy('transactionDate', 'desc'),
    ]);
  }

  async addTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Promise<string> {
    return this.db.addDocument(this.COLLECTION, {
      ...data,
      farmId: this.auth.currentFarmId(),
      createdBy: this.auth.currentUid(),
    });
  }

  async deleteTransaction(id: string): Promise<void> {
    return this.db.deleteDocument(this.COLLECTION, id);
  }
}
