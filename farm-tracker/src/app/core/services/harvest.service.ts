import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, limit, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { Harvest, HarvestSaleEntry } from '../models/harvest.model';
import { Transaction, TransactionFormData, IncomePaymentStatus, PaymentMethod, ExpensePaymentStatus } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { TransactionService } from './transaction.service';
import { getMonthString, getYear } from '../utils/date.utils';
import { stripUndefinedDeep } from '../utils/object.utils';

/** "Who paid" + categorisation details for the auto-created harvest-cost expense (lives only on the transaction). */
export interface HarvestExpenseMeta {
  paidBy: string;                             // uid | 'other'
  paidByName: string;                         // resolved display name / typed name
  paymentMethod: PaymentMethod;               // 'cash' | 'upi'
  expensePaymentStatus: ExpensePaymentStatus; // 'paid' | 'pending'
  category?: string;                          // expense category id (defaults to 'other-expense')
  categoryName?: string;
  expectedPaymentDate?: Date;                 // only meaningful when status === 'pending'
}

@Injectable({ providedIn: 'root' })
export class HarvestService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);

  private get ref() { return collection(this.firestore, 'harvests'); }

  async create(data: Partial<Harvest>, expenseMeta?: HarvestExpenseMeta): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);
    const hDate = data.harvestDate?.toDate() || new Date();

    // Auto-create a linked expense when a harvest cost is entered.
    let harvestCostTransactionId: string | null = null;
    if (data.harvestCost && data.harvestCost > 0) {
      harvestCostTransactionId = await this.transactionService.create(
        this.buildCostExpensePayload(docRef.id, data, expenseMeta),
      );
    }

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
      harvestCostTransactionId,
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

  /** Generic partial writer — used by recordSale/recordWastage. Strips nested undefined (Firestore rejects it). */
  async update(id: string, data: Partial<Harvest>): Promise<void> {
    await updateDoc(doc(this.firestore, 'harvests', id), stripUndefinedDeep({ ...data }));
  }

  /**
   * Form-edit path: reconciles the linked harvest-cost expense (create / update / reverse)
   * then writes the harvest doc fields. Do NOT route recordSale/recordWastage through here.
   */
  async updateDetails(id: string, data: Partial<Harvest>, expenseMeta?: HarvestExpenseMeta): Promise<void> {
    const old = await this.getById(id);
    const oldTxnId = old?.harvestCostTransactionId || null;
    const newCost = data.harvestCost ?? null;

    let harvestCostTransactionId = oldTxnId;
    if (oldTxnId && newCost && newCost > 0) {
      // Cost still present → update the linked expense in place.
      await this.transactionService.update(oldTxnId, this.buildCostExpensePayload(id, data, expenseMeta));
    } else if (oldTxnId && (!newCost || newCost <= 0)) {
      // Cost cleared → reverse the linked expense.
      await this.transactionService.softDelete(oldTxnId);
      harvestCostTransactionId = null;
    } else if (!oldTxnId && newCost && newCost > 0) {
      // Cost newly added (incl. legacy harvests) → create the linked expense.
      harvestCostTransactionId = await this.transactionService.create(this.buildCostExpensePayload(id, data, expenseMeta));
    }

    // Coerce to null (not undefined) so cleared values actually overwrite the stored field.
    await this.update(id, {
      ...data,
      harvestCost: (newCost && newCost > 0 ? newCost : null) as any,
      harvestCostTransactionId: (harvestCostTransactionId ?? null) as any,
    });
  }

  /** Build the expense transaction payload for a harvest cost. */
  private buildCostExpensePayload(harvestId: string, data: Partial<Harvest>, meta?: HarvestExpenseMeta): TransactionFormData {
    const hDate = data.harvestDate?.toDate() || new Date();
    return {
      type: 'expense',
      date: hDate,
      amount: data.harvestCost || 0,
      category: meta?.category || 'other-expense',
      categoryName: meta?.categoryName || 'Other',
      segment: data.segment || '',
      segmentName: data.segmentName || '',
      description: `${data.cropName || 'Crop'} — harvest cost`,
      paymentMethod: meta?.paymentMethod || 'upi',
      paidBy: meta?.paidBy,
      paidByName: meta?.paidByName,
      expensePaymentStatus: meta?.expensePaymentStatus || 'paid',
      expectedPaymentDate: meta?.expensePaymentStatus === 'pending' ? meta?.expectedPaymentDate : undefined,
      linkedHarvestId: harvestId,
      linkedHarvestName: data.cropName && data.harvestDate
        ? this.displayName({ cropName: data.cropName, harvestDate: data.harvestDate })
        : undefined,
      tags: ['harvest-cost'],
      month: getMonthString(hDate),
      year: getYear(hDate),
    };
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
    expectedPaymentDate?: Date;
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
      category: 'crop-sales',
      categoryName: 'Crop Sales',
      segment: harvest.segment,
      segmentName: harvest.segmentName,
      description: `${harvest.cropName} sale from harvest`,
      paymentMethod: 'upi',
      paymentStatus: saleData.paymentStatus || 'received',
      expectedPaymentDate: saleData.paymentStatus === 'pending' ? saleData.expectedPaymentDate : undefined,
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
    // Buyer stats are updated by TransactionService.create (linkedBuyerId)
    const txnId = await this.transactionService.create(txnData);

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
    const harvest = await this.getById(id);
    if (harvest?.harvestCostTransactionId) {
      // Reverse the linked cost expense; never let a txn hiccup block the harvest delete.
      try {
        await this.transactionService.softDelete(harvest.harvestCostTransactionId);
      } catch (err) {
        console.error('Failed to reverse linked harvest-cost expense', err);
      }
    }
    await updateDoc(doc(this.firestore, 'harvests', id), { isDeleted: true });
  }
}
