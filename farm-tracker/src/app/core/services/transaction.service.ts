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
  startAfter,
  writeBatch,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp,
  DocumentSnapshot,
} from '@angular/fire/firestore';
import { Transaction, TransactionFormData, DistributionEntry, IncomePaymentStatus, ExpensePaymentStatus } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { SummaryService } from './summary.service';
import { appendTimelineCapped } from '../utils/timeline.utils';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private summaryService = inject(SummaryService);

  /** Build a unique summary key per person. Custom "other" names get normalized and sanitized. */
  private personSummaryKey(paidBy: string | null | undefined, paidByName: string | null | undefined, fallbackUid: string): string {
    if (paidBy === 'other' && paidByName) {
      // Normalize: trim, collapse whitespace, title-case, then sanitize for Firestore field paths
      const normalized = paidByName.trim().replace(/\s+/g, ' ')
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return normalized.replace(/[.$/\[\]#]/g, '_');
    }
    return paidBy || fallbackUid;
  }

  /**
   * Build summary reversal fields for a transaction.
   * Used by update (reverse old), softDelete, and hardDelete to avoid code duplication.
   */
  private buildReversalFields(txn: Transaction): Record<string, any> {
    const incField = txn.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = txn.type === 'income' ? -txn.amount : txn.amount;
    const catField = txn.type === 'expense'
      ? `expenseByCategory.${txn.category}`
      : `incomeBySource.${txn.category}`;
    const catIdField = txn.type === 'expense'
      ? `expenseByCategoryId.${txn.category}`
      : `incomeBySourceId.${txn.category}`;

    const fields: Record<string, any> = {
      [incField]: increment(-txn.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(-txn.amount),
      [catIdField]: increment(-txn.amount),
      updatedAt: serverTimestamp(),
    };

    // Reverse per-person
    const personKey = this.personSummaryKey(txn.paidBy, txn.paidByName, txn.createdBy);
    const personField = txn.type === 'expense'
      ? `expenseByPerson.${personKey}`
      : `incomeByPerson.${personKey}`;
    fields[personField] = increment(-txn.amount);

    // Reverse pending income
    if (txn.type === 'income' && (txn.paymentStatus || 'received') === 'pending') {
      fields['pendingIncome'] = increment(-txn.amount);
    }

    // Reverse pending expense
    if (txn.type === 'expense' && (txn.expensePaymentStatus || 'paid') === 'pending') {
      fields['pendingExpense'] = increment(-txn.amount);
    }

    // Reverse distributions
    if (txn.distributions?.length) {
      const totalDist = txn.distributions.reduce((s, d) => s + d.amount, 0);
      fields['totalDistributed'] = increment(-totalDist);
      for (const d of txn.distributions) {
        fields[`distributionByPerson.${d.uid}`] = increment(-d.amount);
      }
    }

    return fields;
  }

  /**
   * Build summary application fields for new/updated transaction data.
   */
  private buildApplyFields(data: TransactionFormData, userUid: string): Record<string, any> {
    const incField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = data.type === 'income' ? data.amount : -data.amount;
    const catField = data.type === 'expense'
      ? `expenseByCategory.${data.category}`
      : `incomeBySource.${data.category}`;
    const catIdField = data.type === 'expense'
      ? `expenseByCategoryId.${data.category}`
      : `incomeBySourceId.${data.category}`;

    const fields: Record<string, any> = {
      [incField]: increment(data.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(data.amount),
      [catIdField]: increment(data.amount),
      updatedAt: serverTimestamp(),
    };

    const personKey = this.personSummaryKey(data.paidBy, data.paidByName, userUid);
    const personField = data.type === 'expense'
      ? `expenseByPerson.${personKey}`
      : `incomeByPerson.${personKey}`;
    fields[personField] = increment(data.amount);

    if (data.type === 'income' && (data.paymentStatus || 'received') === 'pending') {
      fields['pendingIncome'] = increment(data.amount);
    }
    if (data.type === 'expense' && (data.expensePaymentStatus || 'paid') === 'pending') {
      fields['pendingExpense'] = increment(data.amount);
    }

    return fields;
  }

  async create(data: TransactionFormData): Promise<string> {
    const batch = writeBatch(this.firestore);
    const user = this.authService.requireUser();

    const txnRef = doc(collection(this.firestore, 'transactions'));
    const summaryId = `${data.month}-${data.segment}`;
    const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);

    const timelineEntry: any = {
      action: 'created',
      by: user.uid,
      byName: user.displayName,
      at: Timestamp.now(),
    };

    const txnDoc: Record<string, any> = {
      id: txnRef.id,
      type: data.type,
      date: Timestamp.fromDate(data.date),
      amount: data.amount,
      category: data.category,
      categoryName: data.categoryName,
      segment: data.segment,
      segmentName: data.segmentName,
      description: data.description,
      paymentMethod: data.paymentMethod || 'upi',
      paidBy: data.paidBy || user.uid,
      paidByName: data.paidByName || user.displayName,
      createdBy: user.uid,
      createdByName: user.displayName,
      createdAt: serverTimestamp(),
      isDeleted: false,
      timeline: [timelineEntry],
      month: data.month,
      year: data.year,
    };

    if (data.quantity) txnDoc['quantity'] = data.quantity;
    if (data.unit) txnDoc['unit'] = data.unit;
    if (data.ratePerUnit) txnDoc['ratePerUnit'] = data.ratePerUnit;

    // Animal & buyer links
    if (data.linkedAnimalIds?.length) {
      txnDoc['linkedAnimalIds'] = data.linkedAnimalIds;
      txnDoc['linkedAnimalNames'] = data.linkedAnimalNames || [];
    }
    if (data.animalCostSplit) txnDoc['animalCostSplit'] = data.animalCostSplit;
    if (data.linkedBuyerId) txnDoc['linkedBuyerId'] = data.linkedBuyerId;
    if (data.linkedBuyerName) txnDoc['linkedBuyerName'] = data.linkedBuyerName;
    if (data.linkedSupplierId) txnDoc['linkedSupplierId'] = data.linkedSupplierId;
    if (data.linkedSupplierName) txnDoc['linkedSupplierName'] = data.linkedSupplierName;
    if (data.linkedHarvestId) {
      txnDoc['linkedHarvestId'] = data.linkedHarvestId;
      txnDoc['linkedHarvestName'] = data.linkedHarvestName || null;
    }
    if (data.tags?.length) txnDoc['tags'] = data.tags;

    if (data.type === 'income') {
      txnDoc['paymentStatus'] = data.paymentStatus || 'received';
    }
    if (data.type === 'expense') {
      txnDoc['expensePaymentStatus'] = data.expensePaymentStatus || 'paid';
    }

    batch.set(txnRef, txnDoc);

    // Build summary apply fields
    const applyFields = this.buildApplyFields(data, user.uid);
    const summaryData: Record<string, any> = {
      ...applyFields,
      month: data.month,
      year: data.year,
      segment: data.segment,
    };

    batch.set(summaryRef, summaryData, { merge: true });

    // Also update yearly summary
    const yearlySummaryId = `${data.year}-${data.segment}`;
    const yearlySummaryRef = doc(this.firestore, 'yearlySummaries', yearlySummaryId);
    const yearlySummaryData: Record<string, any> = {
      ...applyFields,
      year: data.year,
      segment: data.segment,
    };

    batch.set(yearlySummaryRef, yearlySummaryData, { merge: true });

    await batch.commit();
    this.summaryService.clearCache();
    return txnRef.id;
  }

  async update(id: string, data: TransactionFormData): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', id);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      // Block edit of linked loan transactions
      if (oldData.linkedLoanId) {
        throw new Error('This transaction is linked to a loan. Manage it from the loan detail page.');
      }

      // Build changes description
      const changesList: string[] = [];
      if (oldData.amount !== data.amount) changesList.push(`amount: ${oldData.amount}→${data.amount}`);
      if (oldData.category !== data.category) changesList.push(`category: ${oldData.categoryName}→${data.categoryName}`);
      if (oldData.segment !== data.segment) changesList.push(`segment: ${oldData.segmentName}→${data.segmentName}`);
      if (oldData.type !== data.type) changesList.push(`type: ${oldData.type}→${data.type}`);
      const oldPayStatus = oldData.paymentStatus || 'received';
      const newPayStatus = data.type === 'income' ? (data.paymentStatus || 'received') : 'received';
      if (oldData.type === 'income' && data.type === 'income' && oldPayStatus !== newPayStatus) {
        changesList.push(`payment: ${oldPayStatus}→${newPayStatus}`);
      }
      const oldExpPayStatus = oldData.expensePaymentStatus || 'paid';
      const newExpPayStatus = data.type === 'expense' ? (data.expensePaymentStatus || 'paid') : 'paid';
      if (oldData.type === 'expense' && data.type === 'expense' && oldExpPayStatus !== newExpPayStatus) {
        changesList.push(`expense payment: ${oldExpPayStatus}→${newExpPayStatus}`);
      }
      const newBuyerId = data.type === 'income' ? (data.linkedBuyerId || null) : null;
      const newSupplierId = data.type === 'expense' ? (data.linkedSupplierId || null) : null;
      if ((oldData.linkedBuyerId || null) !== newBuyerId) {
        changesList.push(`customer: ${oldData.linkedBuyerName || 'none'}→${data.linkedBuyerName || 'none'}`);
      }
      if ((oldData.linkedSupplierId || null) !== newSupplierId) {
        changesList.push(`supplier: ${oldData.linkedSupplierName || 'none'}→${data.linkedSupplierName || 'none'}`);
      }
      // Harvest link: form-managed for expenses; income keeps its recordSale-stamped link
      const keepIncomeHarvestLink = oldData.type === 'income' && data.type === 'income';
      const newHarvestId = data.type === 'expense'
        ? (data.linkedHarvestId || null)
        : (keepIncomeHarvestLink ? (oldData.linkedHarvestId || null) : null);
      const newHarvestName = data.type === 'expense'
        ? (data.linkedHarvestName || null)
        : (keepIncomeHarvestLink ? (oldData.linkedHarvestName || null) : null);
      if ((oldData.linkedHarvestId || null) !== newHarvestId) {
        changesList.push(`harvest: ${oldData.linkedHarvestName || 'none'}→${newHarvestName || 'none'}`);
      }
      const changesStr = changesList.length > 0 ? changesList.join(', ') : 'details updated';

      // Should we clear distributions?
      const shouldClearDistributions = oldData.distributions?.length &&
        (oldData.amount !== data.amount || oldData.segment !== data.segment || oldData.type !== data.type);

      // Build reversal fields for old data
      const reversalFields = this.buildReversalFields(oldData);
      // Remove distribution reversal if not clearing (it was included by buildReversalFields)
      if (!shouldClearDistributions && oldData.distributions?.length) {
        delete reversalFields['totalDistributed'];
        for (const d of oldData.distributions) {
          delete reversalFields[`distributionByPerson.${d.uid}`];
        }
      }

      // Build apply fields for new data
      const applyFields = this.buildApplyFields(data, user.uid);

      // Monthly summaries
      const oldSummaryId = `${oldData.month}-${oldData.segment}`;
      const newSummaryId = `${data.month}-${data.segment}`;
      const oldSummaryRef = doc(this.firestore, 'monthlySummaries', oldSummaryId);

      if (oldSummaryId === newSummaryId) {
        // Same summary doc — build combined fields manually to avoid double-set
        const combined: Record<string, any> = { updatedAt: serverTimestamp(), month: data.month, year: data.year, segment: data.segment };
        const allKeys = new Set([...Object.keys(reversalFields), ...Object.keys(applyFields)]);
        allKeys.delete('updatedAt');

        // For same-doc, we need to compute net increments
        // Since both reversal and apply use increment(), and we can't combine FieldValue objects,
        // we need to compute the raw deltas and create single increment() calls
        const oldIncField = oldData.type === 'expense' ? 'totalExpense' : 'totalIncome';
        const newIncField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';

        if (oldIncField === newIncField) {
          combined[oldIncField] = increment(data.amount - oldData.amount);
        } else {
          combined[oldIncField] = increment(-oldData.amount);
          combined[newIncField] = increment(data.amount);
        }

        const oldProfitDelta = oldData.type === 'income' ? -oldData.amount : oldData.amount;
        const newProfitDelta = data.type === 'income' ? data.amount : -data.amount;
        combined['netProfit'] = increment(oldProfitDelta + newProfitDelta);

        // Category fields
        const oldCatField = oldData.type === 'expense' ? `expenseByCategory.${oldData.category}` : `incomeBySource.${oldData.category}`;
        const newCatField = data.type === 'expense' ? `expenseByCategory.${data.category}` : `incomeBySource.${data.category}`;
        const oldCatIdField = oldData.type === 'expense' ? `expenseByCategoryId.${oldData.category}` : `incomeBySourceId.${oldData.category}`;
        const newCatIdField = data.type === 'expense' ? `expenseByCategoryId.${data.category}` : `incomeBySourceId.${data.category}`;

        if (oldCatField === newCatField) {
          combined[oldCatField] = increment(data.amount - oldData.amount);
          combined[oldCatIdField] = increment(data.amount - oldData.amount);
        } else {
          combined[oldCatField] = increment(-oldData.amount);
          combined[newCatField] = increment(data.amount);
          combined[oldCatIdField] = increment(-oldData.amount);
          combined[newCatIdField] = increment(data.amount);
        }

        // Person fields
        const oldPersonKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
        const newPersonKey = this.personSummaryKey(data.paidBy, data.paidByName, user.uid);
        const oldPersonField = oldData.type === 'expense' ? `expenseByPerson.${oldPersonKey}` : `incomeByPerson.${oldPersonKey}`;
        const newPersonField = data.type === 'expense' ? `expenseByPerson.${newPersonKey}` : `incomeByPerson.${newPersonKey}`;

        if (oldPersonField === newPersonField) {
          combined[oldPersonField] = increment(data.amount - oldData.amount);
        } else {
          combined[oldPersonField] = increment(-oldData.amount);
          combined[newPersonField] = increment(data.amount);
        }

        // Pending income
        const oldPendingInc = oldData.type === 'income' && oldPayStatus === 'pending' ? oldData.amount : 0;
        const newPendingInc = data.type === 'income' && newPayStatus === 'pending' ? data.amount : 0;
        if (oldPendingInc !== 0 || newPendingInc !== 0) {
          combined['pendingIncome'] = increment(newPendingInc - oldPendingInc);
        }

        // Pending expense
        const oldPendingExp = oldData.type === 'expense' && oldExpPayStatus === 'pending' ? oldData.amount : 0;
        const newPendingExp = data.type === 'expense' && newExpPayStatus === 'pending' ? data.amount : 0;
        if (oldPendingExp !== 0 || newPendingExp !== 0) {
          combined['pendingExpense'] = increment(newPendingExp - oldPendingExp);
        }

        // Distribution reversal (if applicable)
        if (shouldClearDistributions) {
          const oldTotalDist = oldData.distributions!.reduce((s, d) => s + d.amount, 0);
          combined['totalDistributed'] = increment(-oldTotalDist);
          for (const d of oldData.distributions!) {
            combined[`distributionByPerson.${d.uid}`] = increment(-d.amount);
          }
        }

        transaction.set(oldSummaryRef, combined, { merge: true });
      } else {
        // Different summary docs — safe to do two separate sets
        transaction.set(oldSummaryRef, {
          ...reversalFields,
          month: oldData.month,
          year: oldData.year,
          segment: oldData.segment,
        }, { merge: true });

        const newSummaryRef = doc(this.firestore, 'monthlySummaries', newSummaryId);
        transaction.set(newSummaryRef, {
          ...applyFields,
          month: data.month,
          year: data.year,
          segment: data.segment,
        }, { merge: true });
      }

      // Yearly summaries — same logic
      const oldYearlyId = `${oldData.year}-${oldData.segment}`;
      const newYearlyId = `${data.year}-${data.segment}`;
      const oldYearlyRef = doc(this.firestore, 'yearlySummaries', oldYearlyId);

      if (oldYearlyId === newYearlyId) {
        // Reuse same combined logic as monthly
        const combined: Record<string, any> = { updatedAt: serverTimestamp(), year: data.year, segment: data.segment };

        const oldIncField = oldData.type === 'expense' ? 'totalExpense' : 'totalIncome';
        const newIncField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';

        if (oldIncField === newIncField) {
          combined[oldIncField] = increment(data.amount - oldData.amount);
        } else {
          combined[oldIncField] = increment(-oldData.amount);
          combined[newIncField] = increment(data.amount);
        }

        combined['netProfit'] = increment(
          (oldData.type === 'income' ? -oldData.amount : oldData.amount) +
          (data.type === 'income' ? data.amount : -data.amount)
        );

        const oldCatField = oldData.type === 'expense' ? `expenseByCategory.${oldData.category}` : `incomeBySource.${oldData.category}`;
        const newCatField = data.type === 'expense' ? `expenseByCategory.${data.category}` : `incomeBySource.${data.category}`;
        const oldCatIdField = oldData.type === 'expense' ? `expenseByCategoryId.${oldData.category}` : `incomeBySourceId.${oldData.category}`;
        const newCatIdField = data.type === 'expense' ? `expenseByCategoryId.${data.category}` : `incomeBySourceId.${data.category}`;

        if (oldCatField === newCatField) {
          combined[oldCatField] = increment(data.amount - oldData.amount);
          combined[oldCatIdField] = increment(data.amount - oldData.amount);
        } else {
          combined[oldCatField] = increment(-oldData.amount);
          combined[newCatField] = increment(data.amount);
          combined[oldCatIdField] = increment(-oldData.amount);
          combined[newCatIdField] = increment(data.amount);
        }

        const oldPersonKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
        const newPersonKey = this.personSummaryKey(data.paidBy, data.paidByName, user.uid);
        const oldPersonField = oldData.type === 'expense' ? `expenseByPerson.${oldPersonKey}` : `incomeByPerson.${oldPersonKey}`;
        const newPersonField = data.type === 'expense' ? `expenseByPerson.${newPersonKey}` : `incomeByPerson.${newPersonKey}`;

        if (oldPersonField === newPersonField) {
          combined[oldPersonField] = increment(data.amount - oldData.amount);
        } else {
          combined[oldPersonField] = increment(-oldData.amount);
          combined[newPersonField] = increment(data.amount);
        }

        const oldPendingInc = oldData.type === 'income' && oldPayStatus === 'pending' ? oldData.amount : 0;
        const newPendingInc = data.type === 'income' && newPayStatus === 'pending' ? data.amount : 0;
        if (oldPendingInc !== 0 || newPendingInc !== 0) {
          combined['pendingIncome'] = increment(newPendingInc - oldPendingInc);
        }

        const oldPendingExp = oldData.type === 'expense' && oldExpPayStatus === 'pending' ? oldData.amount : 0;
        const newPendingExp = data.type === 'expense' && newExpPayStatus === 'pending' ? data.amount : 0;
        if (oldPendingExp !== 0 || newPendingExp !== 0) {
          combined['pendingExpense'] = increment(newPendingExp - oldPendingExp);
        }

        if (shouldClearDistributions) {
          const oldTotalDist = oldData.distributions!.reduce((s, d) => s + d.amount, 0);
          combined['totalDistributed'] = increment(-oldTotalDist);
          for (const d of oldData.distributions!) {
            combined[`distributionByPerson.${d.uid}`] = increment(-d.amount);
          }
        }

        transaction.set(oldYearlyRef, combined, { merge: true });
      } else {
        const oldYearlyReversal = { ...reversalFields, year: oldData.year, segment: oldData.segment };
        transaction.set(oldYearlyRef, oldYearlyReversal, { merge: true });

        const newYearlyRef = doc(this.firestore, 'yearlySummaries', newYearlyId);
        transaction.set(newYearlyRef, {
          ...applyFields,
          year: data.year,
          segment: data.segment,
        }, { merge: true });
      }

      // Update transaction + add timeline entry
      const txnUpdates: Record<string, any> = {
        type: data.type,
        date: Timestamp.fromDate(data.date),
        amount: data.amount,
        category: data.category,
        categoryName: data.categoryName,
        segment: data.segment,
        segmentName: data.segmentName,
        description: data.description,
        paymentMethod: data.paymentMethod || 'upi',
        paidBy: data.paidBy || user.uid,
        paidByName: data.paidByName || user.displayName,
        paymentStatus: data.type === 'income' ? (data.paymentStatus || 'received') : null,
        expensePaymentStatus: data.type === 'expense' ? (data.expensePaymentStatus || 'paid') : null,
        linkedBuyerId: data.type === 'income' ? (data.linkedBuyerId || null) : null,
        linkedBuyerName: data.type === 'income' ? (data.linkedBuyerName || null) : null,
        linkedSupplierId: data.type === 'expense' ? (data.linkedSupplierId || null) : null,
        linkedSupplierName: data.type === 'expense' ? (data.linkedSupplierName || null) : null,
        linkedHarvestId: newHarvestId,
        linkedHarvestName: newHarvestName,
        quantity: data.quantity || null,
        unit: data.unit || null,
        ratePerUnit: data.ratePerUnit || null,
        tags: data.tags || [],
        month: data.month,
        year: data.year,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'updated',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: changesStr,
        }),
      };

      // Clear distributions if amount, segment, or type changed (no longer valid)
      if (shouldClearDistributions) {
        txnUpdates['distributions'] = [];
      }

      transaction.update(txnRef, txnUpdates);
    });
    this.summaryService.clearCache();
  }

  async softDelete(id: string): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', id);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      // Block delete of linked loan transactions
      if (oldData.linkedLoanId) {
        throw new Error('This transaction is linked to a loan. Manage it from the loan detail page.');
      }

      // Build reversal fields using shared helper
      const reversalFields = this.buildReversalFields(oldData);

      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      transaction.set(summaryRef, {
        ...reversalFields,
        month: oldData.month,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });

      // Reverse yearly summary
      const yearlyId = `${oldData.year}-${oldData.segment}`;
      const yearlyRef = doc(this.firestore, 'yearlySummaries', yearlyId);
      transaction.set(yearlyRef, {
        ...reversalFields,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });

      transaction.update(txnRef, {
        isDeleted: true,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'deleted',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
        }),
      });
    });
    this.summaryService.clearCache();
  }

  async hardDelete(id: string): Promise<void> {
    const txnRef = doc(this.firestore, 'transactions', id);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      // Block delete of linked loan transactions
      if (oldData.linkedLoanId) {
        throw new Error('This transaction is linked to a loan. Manage it from the loan detail page.');
      }

      // Build reversal fields using shared helper
      const reversalFields = this.buildReversalFields(oldData);

      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      transaction.set(summaryRef, {
        ...reversalFields,
        month: oldData.month,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });

      // Reverse yearly summary
      const yearlyId = `${oldData.year}-${oldData.segment}`;
      const yearlyRef = doc(this.firestore, 'yearlySummaries', yearlyId);
      transaction.set(yearlyRef, {
        ...reversalFields,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });

      transaction.delete(txnRef);
    });
    this.summaryService.clearCache();
  }

  async updateDistribution(transactionId: string, distributions: DistributionEntry[]): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      if (oldData.isDeleted) throw new Error('Cannot distribute a deleted transaction');
      if (oldData.type !== 'income') throw new Error('Can only distribute income');

      const totalDist = distributions.reduce((s, d) => s + d.amount, 0);
      if (totalDist > oldData.amount) throw new Error('Distribution exceeds income amount');

      // Filter out zero-amount entries
      const nonZero = distributions.filter(d => d.amount > 0);

      // Build changes description
      const oldDist = oldData.distributions || [];
      const changesList: string[] = [];
      for (const d of nonZero) {
        const old = oldDist.find(o => o.uid === d.uid);
        const oldAmt = old?.amount || 0;
        if (oldAmt !== d.amount) changesList.push(`${d.name}: ${oldAmt}→${d.amount}`);
      }
      for (const old of oldDist) {
        if (!nonZero.find(d => d.uid === old.uid)) {
          changesList.push(`${old.name}: ${old.amount}→0`);
        }
      }

      // Update transaction
      transaction.update(txnRef, {
        distributions: nonZero,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'distributed',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: changesList.join(', ') || 'distribution updated',
        }),
      });

      // Update summary distribution totals
      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);

      const summaryUpdates: Record<string, any> = {
        updatedAt: serverTimestamp(),
      };

      // Reverse old distributions
      const oldTotalDist = oldDist.reduce((s, d) => s + d.amount, 0);
      for (const d of oldDist) {
        summaryUpdates[`distributionByPerson.${d.uid}`] = increment(-d.amount);
      }

      // Apply new distributions
      const newTotalDist = nonZero.reduce((s, d) => s + d.amount, 0);
      for (const d of nonZero) {
        const existing = summaryUpdates[`distributionByPerson.${d.uid}`];
        if (existing) {
          summaryUpdates[`distributionByPerson.${d.uid}`] = increment(d.amount - (oldDist.find(o => o.uid === d.uid)?.amount || 0));
        } else {
          summaryUpdates[`distributionByPerson.${d.uid}`] = increment(d.amount);
        }
      }

      summaryUpdates['totalDistributed'] = increment(newTotalDist - oldTotalDist);

      transaction.set(summaryRef, {
        ...summaryUpdates,
        month: oldData.month,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });

      // Also update yearly summary distribution totals
      const yearlyId = `${oldData.year}-${oldData.segment}`;
      const yearlyRef = doc(this.firestore, 'yearlySummaries', yearlyId);
      transaction.set(yearlyRef, {
        ...summaryUpdates,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });
    });
    this.summaryService.clearCache();
  }

  async markAsReceived(transactionId: string): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      if (oldData.isDeleted) throw new Error('Cannot update a deleted transaction');
      if (oldData.type !== 'income') throw new Error('Only income transactions have payment status');
      if (oldData.paymentStatus !== 'pending') throw new Error('Transaction is already received');

      transaction.update(txnRef, {
        paymentStatus: 'received' as IncomePaymentStatus,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'payment_received',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
        }),
      });

      // Decrement pendingIncome in monthly + yearly summaries
      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      const pendingUpdate = { pendingIncome: increment(-oldData.amount), updatedAt: serverTimestamp() };
      transaction.set(summaryRef, {
        ...pendingUpdate,
        month: oldData.month,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });
      const yearlyRef = doc(this.firestore, 'yearlySummaries', `${oldData.year}-${oldData.segment}`);
      transaction.set(yearlyRef, {
        ...pendingUpdate,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });
    });
    this.summaryService.clearCache();
  }

  async markAsPaid(transactionId: string): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      if (oldData.isDeleted) throw new Error('Cannot update a deleted transaction');
      if (oldData.type !== 'expense') throw new Error('Only expense transactions have expense payment status');
      if (oldData.expensePaymentStatus !== 'pending') throw new Error('Expense is already paid');

      transaction.update(txnRef, {
        expensePaymentStatus: 'paid' as ExpensePaymentStatus,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'payment_paid',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
        }),
      });

      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      const pendingUpdate = { pendingExpense: increment(-oldData.amount), updatedAt: serverTimestamp() };
      transaction.set(summaryRef, {
        ...pendingUpdate,
        month: oldData.month,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });
      const yearlyRef = doc(this.firestore, 'yearlySummaries', `${oldData.year}-${oldData.segment}`);
      transaction.set(yearlyRef, {
        ...pendingUpdate,
        year: oldData.year,
        segment: oldData.segment,
      }, { merge: true });
    });
    this.summaryService.clearCache();
  }

  async getAll(
    filters: {
      type?: 'expense' | 'income';
      segment?: string;
      month?: string;
      createdBy?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {},
    pageSize = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ transactions: Transaction[]; lastDoc: DocumentSnapshot | null }> {
    const constraints: any[] = [
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
      limit(pageSize),
    ];

    if (filters.type) constraints.push(where('type', '==', filters.type));
    if (filters.segment) constraints.push(where('segment', '==', filters.segment));
    if (filters.month) constraints.push(where('month', '==', filters.month));
    if (filters.createdBy) constraints.push(where('createdBy', '==', filters.createdBy));
    if (filters.dateFrom) constraints.push(where('date', '>=', Timestamp.fromDate(filters.dateFrom)));
    if (filters.dateTo) constraints.push(where('date', '<=', Timestamp.fromDate(filters.dateTo)));
    if (lastDoc) constraints.push(startAfter(lastDoc));

    const q = query(collection(this.firestore, 'transactions'), ...constraints);
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map((d) => d.data() as Transaction);
    const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { transactions, lastDoc: last };
  }

  async getById(id: string): Promise<Transaction | null> {
    const docSnap = await getDoc(doc(this.firestore, 'transactions', id));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as Transaction;
    return data.isDeleted ? null : data;
  }

  async getRecent(count = 10): Promise<Transaction[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Transaction);
  }
}
