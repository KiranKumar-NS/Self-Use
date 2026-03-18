import { inject, Injectable } from '@angular/core';
import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from '../../../core/firebase/firestore.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Goat, GoatBreed } from '../../../core/models';
import { Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GoatService {
  private readonly db = inject(FirestoreService);
  private readonly auth = inject(AuthService);
  private readonly COLLECTION = 'goats';

  getActiveGoats$(): Observable<Goat[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      where('status', '==', 'active'),
      orderBy('tagNumber', 'asc'),
    ]);
  }

  getAllGoats$(): Observable<Goat[]> {
    const farmId = this.auth.currentFarmId();
    if (!farmId) return of([]);
    return this.db.listenToCollection<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      orderBy('tagNumber', 'asc'),
    ]);
  }

  async getGoatsByBreed(breed: GoatBreed): Promise<Goat[]> {
    const farmId = this.auth.currentFarmId();
    return this.db.queryDocuments<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      where('breed', '==', breed),
    ]);
  }

  async getDoes(): Promise<Goat[]> {
    const farmId = this.auth.currentFarmId();
    return this.db.queryDocuments<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      where('gender', '==', 'female'),
      where('status', '==', 'active'),
    ]);
  }

  async getBucks(): Promise<Goat[]> {
    const farmId = this.auth.currentFarmId();
    return this.db.queryDocuments<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      where('gender', '==', 'male'),
      where('status', '==', 'active'),
    ]);
  }

  async registerGoat(goatData: Omit<Goat, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return this.db.addDocument(this.COLLECTION, {
      ...goatData,
      farmId: this.auth.currentFarmId(),
      createdBy: this.auth.currentUid(),
    });
  }

  async updateGoat(goatId: string, updates: Partial<Goat>): Promise<void> {
    return this.db.updateDocument(this.COLLECTION, goatId, updates as Record<string, unknown>);
  }

  async getGoatById(goatId: string): Promise<Goat | null> {
    return this.db.getDocument<Goat>(this.COLLECTION, goatId);
  }

  async getOffspring(goatId: string): Promise<Goat[]> {
    const farmId = this.auth.currentFarmId();
    const bySire = await this.db.queryDocuments<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      where('sireId', '==', goatId),
    ]);
    const byDam = await this.db.queryDocuments<Goat>(this.COLLECTION, [
      where('farmId', '==', farmId),
      where('damId', '==', goatId),
    ]);
    const map = new Map<string, Goat>();
    [...bySire, ...byDam].forEach((g) => map.set(g.id, g));
    return Array.from(map.values());
  }
}
