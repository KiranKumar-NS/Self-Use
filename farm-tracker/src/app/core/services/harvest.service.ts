import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, limit, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { Harvest, HarvestSaleEntry } from '../models/harvest.model';
import { TransactionFormData } from '../models/transaction.model';
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

  async recordSale(harvestId: string, saleData: {
    quantity: number; unit: string; ratePerUnit: number;
    buyerId?: string; buyerName?: string; note?: string;
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
      tags: ['harvest-sale'],
      product: harvest.cropName,
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
