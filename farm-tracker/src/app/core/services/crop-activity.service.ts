import { Injectable, inject } from '@angular/core';
import {
  Firestore, collection, doc, getDocs, getDoc, setDoc, updateDoc,
  query, orderBy, where, limit, serverTimestamp, Timestamp,
} from '@angular/fire/firestore';
import { CropActivity, CropActivityType } from '../models/crop-activity.model';
import { PaymentMethod, ExpensePaymentStatus, TransactionFormData } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { TransactionService } from './transaction.service';
import { getMonthString, getYear } from '../utils/date.utils';

/** "Who paid" + categorisation details for the auto-created expense (lives only on the transaction). */
export interface CropExpenseMeta {
  paidBy: string;                             // uid | 'other'
  paidByName: string;                         // resolved display name / typed name
  paymentMethod: PaymentMethod;               // 'cash' | 'upi'
  expensePaymentStatus: ExpensePaymentStatus; // 'paid' | 'pending'
  category?: string;                          // expense category id (falls back to smart default)
  categoryName?: string;
  expectedPaymentDate?: Date;                 // only meaningful when status === 'pending'
}

@Injectable({ providedIn: 'root' })
export class CropActivityService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);

  private get ref() { return collection(this.firestore, 'cropActivities'); }

  async create(data: Partial<CropActivity>, expenseMeta?: CropExpenseMeta, skipExpense = false): Promise<string> {
    const user = this.authService.requireUser();
    const docRef = doc(this.ref);
    const actDate = data.date?.toDate() || new Date();

    // Auto-create a linked expense when a cost is entered — unless the user opted out
    // (material applied from already-purchased stock, so the expense was booked earlier).
    let linkedTransactionId: string | null = null;
    if (data.cost && data.cost > 0 && !skipExpense) {
      linkedTransactionId = await this.transactionService.create(
        this.buildExpensePayload(data, expenseMeta),
      );
    }

    await setDoc(docRef, {
      id: docRef.id,
      ...this.toDocFields(data),
      linkedTransactionId,
      expenseSkipped: skipExpense,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      month: getMonthString(actDate),
      year: getYear(actDate),
    });
    return docRef.id;
  }

  async update(id: string, data: Partial<CropActivity>, expenseMeta?: CropExpenseMeta, skipExpense = false): Promise<void> {
    const old = await this.getById(id);
    const oldTxnId = old?.linkedTransactionId || null;
    const newCost = data.cost ?? null;

    let linkedTransactionId = oldTxnId;
    if (skipExpense) {
      // "Don't create an expense" chosen → reverse any existing linked expense, create none.
      if (oldTxnId) {
        await this.transactionService.softDelete(oldTxnId);
        linkedTransactionId = null;
      }
    } else if (oldTxnId && newCost && newCost > 0) {
      // Cost still present → update the linked expense in place.
      await this.transactionService.update(oldTxnId, this.buildExpensePayload(data, expenseMeta));
    } else if (oldTxnId && (!newCost || newCost <= 0)) {
      // Cost cleared → reverse the linked expense.
      await this.transactionService.softDelete(oldTxnId);
      linkedTransactionId = null;
    } else if (!oldTxnId && newCost && newCost > 0) {
      // Cost newly added (incl. pre-feature activities) → create the linked expense.
      linkedTransactionId = await this.transactionService.create(this.buildExpensePayload(data, expenseMeta));
    }

    const actDate = data.date?.toDate() || new Date();
    await updateDoc(doc(this.firestore, 'cropActivities', id), {
      ...this.toDocFields(data),
      linkedTransactionId,
      expenseSkipped: skipExpense,
      month: getMonthString(actDate),
      year: getYear(actDate),
    });
  }

  /** Activity fields for a Firestore write — coerce blanks to null (Firestore rejects undefined). */
  private toDocFields(data: Partial<CropActivity>) {
    return {
      segment: data.segment || '',
      segmentName: data.segmentName || '',
      activityType: data.activityType || 'other',
      date: data.date || Timestamp.now(),
      description: data.description || '',
      productUsed: data.productUsed || null,
      quantity: data.quantity ?? null,
      unit: data.unit || null,
      area: data.area || null,
      duration: data.duration ?? null,
      laborCount: data.laborCount ?? null,
      cost: data.cost ?? null,
      weather: data.weather || null,
      temperature: data.temperature ?? null,
      note: data.note || null,
    };
  }

  async getAll(filters: { segment?: string; activityType?: string } = {}, pageSize = 200): Promise<CropActivity[]> {
    const constraints: any[] = [where('isDeleted', '==', false)];
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    constraints.push(orderBy('date', 'desc'), limit(pageSize));
    const q = query(this.ref, ...constraints);
    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(d => d.data() as CropActivity);
    if (filters.activityType) results = results.filter(a => a.activityType === filters.activityType);
    return results;
  }

  async getById(id: string): Promise<CropActivity | null> {
    const docSnap = await getDoc(doc(this.firestore, 'cropActivities', id));
    return docSnap.exists() ? (docSnap.data() as CropActivity) : null;
  }

  async softDelete(id: string): Promise<void> {
    const activity = await this.getById(id);
    if (activity?.linkedTransactionId) {
      // Reverse the linked expense; never let a txn hiccup block the activity delete.
      try {
        await this.transactionService.softDelete(activity.linkedTransactionId);
      } catch (err) {
        console.error('Failed to reverse linked crop expense', err);
      }
    }
    await updateDoc(doc(this.firestore, 'cropActivities', id), { isDeleted: true });
  }

  /** Build the expense transaction payload from an activity + who-paid meta. */
  private buildExpensePayload(data: Partial<CropActivity>, meta?: CropExpenseMeta): TransactionFormData {
    const actDate = data.date?.toDate() || new Date();
    // Use the picked category when provided, else fall back to the smart default.
    const fallback = this.expenseCategoryFor(data.activityType, data.laborCount);
    const catId = meta?.category || fallback.id;
    const catName = meta?.categoryName || fallback.name;
    const typeLabel = this.formatType(data.activityType || 'other');
    const description = data.productUsed
      ? `${typeLabel} — crop activity (${data.productUsed})`
      : `${typeLabel} — crop activity`;

    return {
      type: 'expense',
      date: actDate,
      amount: data.cost || 0,
      category: catId,
      categoryName: catName,
      segment: data.segment || '',
      segmentName: data.segmentName || '',
      description,
      paymentMethod: meta?.paymentMethod || 'upi',
      paidBy: meta?.paidBy,
      paidByName: meta?.paidByName,
      expensePaymentStatus: meta?.expensePaymentStatus || 'paid',
      expectedPaymentDate: meta?.expensePaymentStatus === 'pending' ? meta?.expectedPaymentDate : undefined,
      tags: ['crop-activity'],
      month: getMonthString(actDate),
      year: getYear(actDate),
    };
  }

  /** No crop-specific expense category is seeded; map labor vs. everything-else to the defaults. */
  private expenseCategoryFor(type: CropActivityType | undefined, laborCount: number | undefined): { id: string; name: string } {
    if (laborCount && laborCount > 0) return { id: 'labor', name: 'Labor' };
    return { id: 'other-expense', name: 'Other' };
  }

  private formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
