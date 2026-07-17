import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, limit, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { Harvest, HarvestSaleEntry } from '../models/harvest.model';
import { Transaction, TransactionFormData, IncomePaymentStatus } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { TransactionService } from './transaction.service';
import { BuyerService } from './buyer.service';
import { getMonthString, getYear } from '../utils/date.utils';

@Injectable({ providedIn: 'root' })
export class HarvestService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);
  private buyerService = inject(BuyerService);

  private get ref() { return collection(this.firestore, 'harvests'); }

  async create(data: Partial<Harvest>): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);
    const hDate = data.harvestDate?.toDate() || new Date();

    await setDoc(docRef, {
      id: docRef.id,
      segment: data.segment || '',
      segmentName: data.segmentName || '',
      status: data.status || 'harvested',
      harvestDate: data.harvestDate || Timestamp.now(),
      cropName: data.cropName || '',
      variety: data.variety || null,
      totalQuantity: data.totalQuantity || 0,
      unit: data.unit || 'kg',
      grade: data.grade || null,
      storageLocation: data.storageLocation || null,
      storageDate: data.storageDate || null,
      sales: [],
      totalSold: 0,
      totalRevenue: 0,
      wastageQuantity: 0,
      wastageReason: null,
      wastageDate: null,
      remainingQuantity: data.totalQuantity || 0,
      harvestCost: data.harvestCost || null,
      linkedCropActivityId: data.linkedCropActivityId || null,
      note: data.note || null,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      month: getMonthString(hDate),
      year: getYear(hDate),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<Harvest>): Promise<void> {
    await updateDoc(doc(this.firestore, 'harvests', id), { ...data });
  }

  async getAll(filters: { segment?: string; status?: string } = {}, pageSize = 200): Promise<Harvest[]> {
    const constraints: any[] = [where('isDeleted', '==', false)];
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    if (filters.status) constraints.push(where('status', '==', filters.status));
    constraints.push(orderBy('harvestDate', 'desc'), limit(pageSize));
    const q = query(this.ref, ...constraints);
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Harvest);
  }

  async getById(id: string): Promise<Harvest | null> {
    const docSnap = await getDoc(doc(this.firestore, 'harvests', id));
    return docSnap.exists() ? (docSnap.data() as Harvest) : null;
  }

  /** Display label used as linkedHarvestName on transactions, e.g. "Mango — 12 Jul 2026" */
  displayName(harvest: Pick<Harvest, 'cropName' | 'harvestDate'>): string {
    const d = harvest.harvestDate.toDate();
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${harvest.cropName} — ${dateStr}`;
  }

  /** Expense transactions linked to this harvest (live query, no denormalized counters). */
  async getLinkedExpenses(harvestId: string): Promise<Transaction[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('linkedHarvestId', '==', harvestId),
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Transaction).filter(t => t.type === 'expense');
  }

  async recordSale(harvestId: string, saleData: {
    quantity: number; unit: string; ratePerUnit: number;
    buyerId?: string; buyerName?: string; note?: string;
    paymentStatus?: IncomePaymentStatus;
  }): Promise<void> {
    const harvest = await this.getById(harvestId);
    if (!harvest) throw new Error('Harvest not found');
    if (saleData.quantity > harvest.remainingQuantity) throw new Error('Not enough stock');

    const saleDate = new Date();
    const totalAmount = saleData.quantity * saleData.ratePerUnit;

    // Create income transaction
    const txnData: TransactionFormData = {
      type: 'income',
      date: saleDate,
      amount: totalAmount,
      quantity: saleData.quantity,
      unit: saleData.unit as any,
      ratePerUnit: saleData.ratePerUnit,
      category: 'crop_sales',
      categoryName: 'Crop Sales',
      segment: harvest.segment,
      segmentName: harvest.segmentName,
      description: `${harvest.cropName} sale from harvest`,
      paymentMethod: 'upi',
      paymentStatus: saleData.paymentStatus || 'received',
      linkedHarvestId: harvestId,
      linkedHarvestName: this.displayName(harvest),
      tags: ['harvest-sale'],
      month: getMonthString(saleDate),
      year: getYear(saleDate),
    };
    if (saleData.buyerId) {
      txnData.linkedBuyerId = saleData.buyerId;
      txnData.linkedBuyerName = saleData.buyerName;
    }
    const txnId = await this.transactionService.create(txnData);

    // Update buyer stats
    if (saleData.buyerId) {
      await this.buyerService.updateStats(saleData.buyerId, totalAmount, saleData.quantity, saleDate, harvest.segment);
    }

    // Update harvest
    const saleEntry: HarvestSaleEntry = {
      id: crypto.randomUUID(),
      date: Timestamp.fromDate(saleDate),
      quantity: saleData.quantity,
      unit: saleData.unit,
      ratePerUnit: saleData.ratePerUnit,
      totalAmount,
      buyerId: saleData.buyerId,
      buyerName: saleData.buyerName,
      linkedTransactionId: txnId,
      note: saleData.note,
    };

    const newSales = [...harvest.sales, saleEntry];
    const newTotalSold = harvest.totalSold + saleData.quantity;
    const newTotalRevenue = harvest.totalRevenue + totalAmount;
    const newRemaining = harvest.totalQuantity - newTotalSold - harvest.wastageQuantity;

    let newStatus = harvest.status;
    if (newRemaining <= 0) newStatus = 'fully_sold';
    else if (newTotalSold > 0) newStatus = 'partially_sold';

    await this.update(harvestId, {
      sales: newSales,
      totalSold: newTotalSold,
      totalRevenue: newTotalRevenue,
      remainingQuantity: Math.max(0, newRemaining),
      averageRate: newTotalSold > 0 ? Math.round((newTotalRevenue / newTotalSold) * 100) / 100 : undefined,
      status: newStatus,
    });
  }

  async recordWastage(harvestId: string, quantity: number, reason?: string): Promise<void> {
    const harvest = await this.getById(harvestId);
    if (!harvest) throw new Error('Harvest not found');

    const newWastage = harvest.wastageQuantity + quantity;
    const newRemaining = harvest.totalQuantity - harvest.totalSold - newWastage;

    let newStatus = harvest.status;
    if (newRemaining <= 0 && harvest.totalSold > 0) newStatus = 'fully_sold';
    else if (newRemaining <= 0 && harvest.totalSold === 0) newStatus = 'harvested'; // all wasted, nothing sold

    await this.update(harvestId, {
      wastageQuantity: newWastage,
      wastageReason: reason || harvest.wastageReason,
      wastageDate: Timestamp.now(),
      remainingQuantity: Math.max(0, newRemaining),
      status: newStatus,
    });
  }

  async softDelete(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'harvests', id), { isDeleted: true });
  }
}
