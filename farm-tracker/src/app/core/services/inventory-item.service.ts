import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { InventoryItem, StockMovement } from '../models/inventory-item.model';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class InventoryItemService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private get ref() { return collection(this.firestore, 'inventoryItems'); }

  async create(data: Partial<InventoryItem>): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);

    await setDoc(docRef, {
      id: docRef.id,
      name: data.name || '',
      category: data.category || 'other',
      unit: data.unit || 'kg',
      currentStock: data.currentStock || 0,
      minimumStock: data.minimumStock || null,
      segments: data.segments || [],
      segmentNames: data.segmentNames || [],
      movements: [],
      totalPurchased: 0,
      totalUsed: 0,
      totalWastage: 0,
      totalSpent: 0,
      note: data.note || null,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<InventoryItem>): Promise<void> {
    await updateDoc(doc(this.firestore, 'inventoryItems', id), { ...data });
  }

  async getAll(): Promise<InventoryItem[]> {
    const q = query(this.ref, where('isDeleted', '==', false), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as InventoryItem);
  }

  async getById(id: string): Promise<InventoryItem | null> {
    const docSnap = await getDoc(doc(this.firestore, 'inventoryItems', id));
    return docSnap.exists() ? (docSnap.data() as InventoryItem) : null;
  }

  async getLowStockItems(): Promise<InventoryItem[]> {
    const all = await this.getAll();
    return all.filter(item => item.minimumStock != null && item.currentStock <= item.minimumStock);
  }

  async recordPurchase(itemId: string, qty: number, unitCost: number, supplierId?: string, supplierName?: string, note?: string, linkedTransactionId?: string): Promise<void> {
    const user = this.authService.requireUser();
    const item = await this.getById(itemId);
    if (!item) throw new Error('Item not found');

    const totalCost = qty * unitCost;
    const movement: StockMovement = {
      id: crypto.randomUUID(),
      date: Timestamp.now(),
      type: 'purchase',
      quantity: qty,
      unitCost,
      totalCost,
      linkedTransactionId: linkedTransactionId || undefined,
      supplierId: supplierId || undefined,
      supplierName: supplierName || undefined,
      note,
      recordedBy: user.uid,
      recordedByName: user.displayName,
    };

    const newMovements = [...item.movements, movement];
    const newTotalPurchased = item.totalPurchased + qty;
    const newTotalSpent = item.totalSpent + totalCost;

    await this.update(itemId, {
      movements: newMovements,
      currentStock: item.currentStock + qty,
      totalPurchased: newTotalPurchased,
      totalSpent: newTotalSpent,
      lastPurchaseRate: unitCost,
      averagePurchaseRate: newTotalPurchased > 0
        ? Math.round((newTotalSpent / newTotalPurchased) * 100) / 100
        : unitCost,
    });
  }

  async recordUsage(itemId: string, qty: number, note?: string): Promise<void> {
    const user = this.authService.requireUser();
    const item = await this.getById(itemId);
    if (!item) throw new Error('Item not found');
    if (qty > item.currentStock) throw new Error('Not enough stock');

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      date: Timestamp.now(),
      type: 'used',
      quantity: -qty,
      note,
      recordedBy: user.uid,
      recordedByName: user.displayName,
    };

    await this.update(itemId, {
      movements: [...item.movements, movement],
      currentStock: item.currentStock - qty,
      totalUsed: item.totalUsed + qty,
    });
  }

  async recordWastage(itemId: string, qty: number, reason?: string): Promise<void> {
    const user = this.authService.requireUser();
    const item = await this.getById(itemId);
    if (!item) throw new Error('Item not found');

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      date: Timestamp.now(),
      type: 'wastage',
      quantity: -qty,
      note: reason,
      recordedBy: user.uid,
      recordedByName: user.displayName,
    };

    await this.update(itemId, {
      movements: [...item.movements, movement],
      currentStock: Math.max(0, item.currentStock - qty),
      totalWastage: item.totalWastage + qty,
    });
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'inventoryItems', id), { isDeleted: true });
  }
}
