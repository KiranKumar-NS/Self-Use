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
  serverTimestamp,
  Timestamp,
} from '@angular/fire/firestore';
import { Animal, AnimalFormData, AnimalCostEntry, VaccinationEntry, MedicalEntry, WeightLogEntry } from '../models/animal.model';
import { AuthService } from './auth.service';
import { getMonthString, getYear } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class AnimalService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  async create(data: AnimalFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.requireUser();
    const animalRef = doc(collection(this.firestore, 'animals'));

    if (!data.batchSize || data.batchSize < 1) throw new Error('Invalid batch size');
    const purchasePrice = data.purchasePrice || 0;
    const purchasePricePerHead = data.batchSize > 1 && purchasePrice
      ? Math.round((purchasePrice / data.batchSize) * 100) / 100
      : purchasePrice;

    const animalDoc: Record<string, any> = {
      id: animalRef.id,
      segment: data.segment,
      segmentName: data.segmentName,
      trackingMode: data.trackingMode,
      batchSize: data.batchSize,
      currentCount: data.batchSize,
      origin: data.origin,
      originDate: Timestamp.fromDate(data.originDate),
      purchasePrice: purchasePrice,
      purchasePricePerHead: purchasePricePerHead,
      status: 'active',
      totalCosts: 0,
      costEntries: [],
      totalInvested: purchasePrice,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      month: getMonthString(data.originDate),
      year: getYear(data.originDate),
    };

    if (data.tag) animalDoc['tag'] = data.tag;
    if (data.name) animalDoc['name'] = data.name;
    if (data.breed) animalDoc['breed'] = data.breed;
    if (data.gender) animalDoc['gender'] = data.gender;
    if (data.batchLabel) animalDoc['batchLabel'] = data.batchLabel;
    if (data.originInventoryEventId) animalDoc['originInventoryEventId'] = data.originInventoryEventId;
    if (data.note) animalDoc['note'] = data.note;

    batch.set(animalRef, animalDoc);
    await batch.commit();
    return animalRef.id;
  }

  async update(id: string, data: Partial<AnimalFormData>): Promise<void> {
    const batch = writeBatch(this.firestore);
    const animalRef = doc(this.firestore, 'animals', id);

    const updates: Record<string, any> = {};
    if (data.segment !== undefined) updates['segment'] = data.segment;
    if (data.segmentName !== undefined) updates['segmentName'] = data.segmentName;
    if (data.tag !== undefined) updates['tag'] = data.tag;
    if (data.name !== undefined) updates['name'] = data.name;
    if (data.breed !== undefined) updates['breed'] = data.breed;
    if (data.gender !== undefined) updates['gender'] = data.gender;
    if (data.batchLabel !== undefined) updates['batchLabel'] = data.batchLabel;
    if (data.note !== undefined) updates['note'] = data.note;
    if (data.originDate !== undefined) updates['originDate'] = Timestamp.fromDate(data.originDate);
    if (data.purchasePrice !== undefined) {
      updates['purchasePrice'] = data.purchasePrice;
      // Recalculate totalInvested
      const existing = await getDoc(animalRef);
      const existingData = existing.data() as Animal;
      updates['totalInvested'] = data.purchasePrice + existingData.totalCosts;
      if (existingData.status === 'sold' && existingData.salePrice) {
        updates['profit'] = existingData.salePrice - updates['totalInvested'];
        updates['profitMargin'] = updates['totalInvested'] > 0
          ? Math.round((updates['profit'] / updates['totalInvested']) * 10000) / 100
          : 0;
      }
    }

    batch.update(animalRef, updates);
    await batch.commit();
  }

  async getAll(filters: { segment?: string; status?: string; breed?: string } = {}, pageSize = 200): Promise<Animal[]> {
    const constraints: any[] = [where('isDeleted', '==', false)];
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    if (filters.status) constraints.push(where('status', '==', filters.status));
    constraints.push(orderBy('originDate', 'desc'), limit(pageSize));

    const q = query(collection(this.firestore, 'animals'), ...constraints);
    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(d => d.data() as Animal);
    if (filters.breed) {
      results = results.filter(a => a.breed?.toLowerCase() === filters.breed!.toLowerCase());
    }
    return results;
  }

  async getById(id: string): Promise<Animal | null> {
    const docSnap = await getDoc(doc(this.firestore, 'animals', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Animal;
    return data.isDeleted ? null : data;
  }

  async getActiveBySegment(segmentId: string): Promise<Animal[]> {
    const q = query(
      collection(this.firestore, 'animals'),
      where('isDeleted', '==', false),
      where('segment', '==', segmentId),
      where('status', '==', 'active'),
      orderBy('originDate', 'desc'),
      limit(200)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Animal);
  }

  async attributeCost(
    animalIds: string[],
    transactionId: string,
    costData: { category: string; categoryName: string; date: Date; totalAmount: number; description?: string },
    splitMode: 'equal' | 'custom' | 'by_days',
    customSplits?: Record<string, number>
  ): Promise<void> {
    const batch = writeBatch(this.firestore);

    // Batch-fetch all animals upfront to avoid N+1 queries
    const animalSnaps = await Promise.all(
      animalIds.map(id => getDoc(doc(this.firestore, 'animals', id)))
    );
    const animalMap = new Map<string, Animal>();
    for (const snap of animalSnaps) {
      if (snap.exists()) animalMap.set(snap.id, snap.data() as Animal);
    }

    // Pre-calculate splits for by_days mode
    if (splitMode === 'by_days' && !customSplits) {
      customSplits = {};
      const expenseDate = costData.date.getTime();
      let totalDays = 0;
      const daysByAnimal: Record<string, number> = {};

      for (const animalId of animalIds) {
        const animal = animalMap.get(animalId);
        if (!animal) continue;
        const originMs = animal.originDate.toDate().getTime();
        const days = Math.max(1, Math.ceil((expenseDate - originMs) / (1000 * 60 * 60 * 24)));
        daysByAnimal[animalId] = days;
        totalDays += days;
      }

      // Proportional split
      if (totalDays > 0) {
        let allocated = 0;
        const ids = Object.keys(daysByAnimal);
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          if (i === ids.length - 1) {
            // Last animal gets remainder to avoid rounding errors
            customSplits[id] = Math.round((costData.totalAmount - allocated) * 100) / 100;
          } else {
            const share = Math.round((daysByAnimal[id] / totalDays) * costData.totalAmount * 100) / 100;
            customSplits[id] = share;
            allocated += share;
          }
        }
      }
      // Switch to custom mode for the actual attribution
      splitMode = 'custom';
    }

    const perAnimalAmount = splitMode === 'equal'
      ? Math.round((costData.totalAmount / animalIds.length) * 100) / 100
      : 0;

    for (const animalId of animalIds) {
      const animal = animalMap.get(animalId);
      if (!animal) continue;
      const animalRef = doc(this.firestore, 'animals', animalId);

      const amount = splitMode === 'custom' && customSplits
        ? (customSplits[animalId] || 0)
        : perAnimalAmount;

      if (amount <= 0) continue;

      const entry: AnimalCostEntry = {
        transactionId,
        date: Timestamp.fromDate(costData.date),
        category: costData.category,
        categoryName: costData.categoryName,
        amount,
        description: costData.description,
      };

      const newTotalCosts = animal.totalCosts + amount;
      const newTotalInvested = (animal.purchasePrice || 0) + newTotalCosts;

      const updates: Record<string, any> = {
        costEntries: [...animal.costEntries, entry],
        totalCosts: newTotalCosts,
        totalInvested: newTotalInvested,
      };

      if (animal.status === 'sold' && animal.salePrice) {
        updates['profit'] = animal.salePrice - newTotalInvested;
        updates['profitMargin'] = newTotalInvested > 0
          ? Math.round(((animal.salePrice - newTotalInvested) / newTotalInvested) * 10000) / 100
          : 0;
      }

      batch.update(animalRef, updates);
    }

    await batch.commit();
  }

  async removeCost(animalId: string, transactionId: string): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;

    const removedEntries = animal.costEntries.filter(e => e.transactionId === transactionId);
    if (removedEntries.length === 0) return;

    const removedAmount = removedEntries.reduce((sum, e) => sum + e.amount, 0);
    const newCostEntries = animal.costEntries.filter(e => e.transactionId !== transactionId);
    const newTotalCosts = animal.totalCosts - removedAmount;
    const newTotalInvested = (animal.purchasePrice || 0) + newTotalCosts;

    const updates: Record<string, any> = {
      costEntries: newCostEntries,
      totalCosts: newTotalCosts,
      totalInvested: newTotalInvested,
    };

    if (animal.status === 'sold' && animal.salePrice) {
      updates['profit'] = animal.salePrice - newTotalInvested;
      updates['profitMargin'] = newTotalInvested > 0
        ? Math.round(((animal.salePrice - newTotalInvested) / newTotalInvested) * 10000) / 100
        : 0;
    }

    const batch = writeBatch(this.firestore);
    batch.update(animalRef, updates);
    await batch.commit();
  }

  async recordSale(animalId: string, saleData: {
    salePrice: number;
    buyerId?: string;
    buyerName?: string;
    saleTransactionId?: string;
    saleInventoryEventId?: string;
    date: Date;
    countSold?: number;
  }): Promise<void> {
    const batch = writeBatch(this.firestore);
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;

    const countSold = saleData.countSold || animal.currentCount;
    if (countSold > animal.currentCount) throw new Error('Cannot sell more than available count');
    const newCount = animal.currentCount - countSold;
    const isFullySold = newCount <= 0;

    const updates: Record<string, any> = {
      currentCount: Math.max(0, newCount),
    };

    if (isFullySold) {
      updates['status'] = 'sold';
      updates['exitDate'] = Timestamp.fromDate(saleData.date);
      updates['exitType'] = 'sale';
      updates['salePrice'] = saleData.salePrice;
      updates['salePricePerHead'] = countSold > 1
        ? Math.round((saleData.salePrice / countSold) * 100) / 100
        : saleData.salePrice;
      updates['profit'] = saleData.salePrice - animal.totalInvested;
      updates['profitMargin'] = animal.totalInvested > 0
        ? Math.round(((saleData.salePrice - animal.totalInvested) / animal.totalInvested) * 10000) / 100
        : 0;
    }

    if (saleData.buyerId) updates['buyerId'] = saleData.buyerId;
    if (saleData.buyerName) updates['buyerName'] = saleData.buyerName;
    if (saleData.saleTransactionId) updates['saleTransactionId'] = saleData.saleTransactionId;
    if (saleData.saleInventoryEventId) updates['saleInventoryEventId'] = saleData.saleInventoryEventId;

    batch.update(animalRef, updates);
    await batch.commit();
  }

  async recordDeath(animalId: string, date: Date, note?: string, countDead?: number, deathCause?: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;

    const dead = countDead || 1;
    const newCount = animal.currentCount - dead;
    const isAllDead = newCount <= 0;

    const updates: Record<string, any> = {
      currentCount: Math.max(0, newCount),
    };

    if (isAllDead) {
      updates['status'] = 'dead';
      updates['exitDate'] = Timestamp.fromDate(date);
      updates['exitType'] = 'death';
    }

    if (note) updates['note'] = (animal.note ? animal.note + '; ' : '') + note;
    if (deathCause) updates['deathCause'] = deathCause;
    if (note) updates['deathNote'] = note;

    // Compute age at death in days
    const originMs = animal.originDate.toDate().getTime();
    const deathMs = date.getTime();
    updates['ageAtDeathDays'] = Math.max(0, Math.floor((deathMs - originMs) / (1000 * 60 * 60 * 24)));

    batch.update(animalRef, updates);
    await batch.commit();
  }

  async softDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, 'animals', id), { isDeleted: true });
    await batch.commit();
  }

  async hardDelete(id: string): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, 'animals', id));
    await batch.commit();
  }

  getDisplayName(animal: Animal): string {
    if (animal.trackingMode === 'individual') {
      return animal.name || animal.tag || `${animal.segmentName} #${animal.id.slice(0, 6)}`;
    }
    return animal.batchLabel || `Batch of ${animal.batchSize} ${animal.segmentName}`;
  }

  // --- Vaccination Records ---

  async addVaccination(animalId: string, entry: VaccinationEntry): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;
    const history = [...(animal.vaccinationHistory || []), entry];
    const batch = writeBatch(this.firestore);
    batch.update(animalRef, { vaccinationHistory: history });
    await batch.commit();
  }

  async removeVaccination(animalId: string, entryId: string): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;
    const history = (animal.vaccinationHistory || []).filter(e => e.id !== entryId);
    const batch = writeBatch(this.firestore);
    batch.update(animalRef, { vaccinationHistory: history });
    await batch.commit();
  }

  // --- Medical Records ---

  async addMedicalRecord(animalId: string, entry: MedicalEntry): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;
    const history = [...(animal.medicalHistory || []), entry];
    const batch = writeBatch(this.firestore);
    batch.update(animalRef, { medicalHistory: history });
    await batch.commit();
  }

  async removeMedicalRecord(animalId: string, entryId: string): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;
    const history = (animal.medicalHistory || []).filter(e => e.id !== entryId);
    const batch = writeBatch(this.firestore);
    batch.update(animalRef, { medicalHistory: history });
    await batch.commit();
  }

  // --- Weight Logs ---

  async addWeightLog(animalId: string, entry: WeightLogEntry): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;
    const logs = [...(animal.weightLogs || []), entry];
    const batch = writeBatch(this.firestore);
    batch.update(animalRef, { weightLogs: logs });
    await batch.commit();
  }

  async removeWeightLog(animalId: string, entryId: string): Promise<void> {
    const animalRef = doc(this.firestore, 'animals', animalId);
    const animalSnap = await getDoc(animalRef);
    if (!animalSnap.exists()) return;
    const animal = animalSnap.data() as Animal;
    const logs = (animal.weightLogs || []).filter(e => e.id !== entryId);
    const batch = writeBatch(this.firestore);
    batch.update(animalRef, { weightLogs: logs });
    await batch.commit();
  }
}
