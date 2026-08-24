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
import { Transaction, TransactionFormData, DistributionEntry, IncomePaymentStatus, ExpensePaymentStatus, pendingRemaining, settledPortion, personSummaryKey } from '../models/transaction.model';
import { AuthService } from './auth.service';
import { SummaryService } from './summary.service';
import { BuyerService } from './buyer.service';
import { SupplierService } from './supplier.service';
import { AnimalService } from './animal.service';
import { appendTimelineCapped } from '../utils/timeline.utils';

/** Summary maps are keyed by category id. Firestore rejects an empty map key and fails the
 *  whole write, so a legacy transaction saved with a blank category must land in a bucket
 *  rather than break every update that touches its month. Mirrors the same fallback in
 *  SummaryReconciliationService. */
const catKey = (category: string | null | undefined): string => category || 'uncategorized';

@Injectable({ providedIn: 'root' })
export class TransactionService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private summaryService = inject(SummaryService);
  private buyerService = inject(BuyerService);
  private supplierService = inject(SupplierService);
  private animalService = inject(AnimalService);

  /**
   * Keep buyer purchase counters in sync with income transactions
   * (units = quantity || 1, matching counterparty reconciliation).
   * Failures are swallowed: the transaction write already succeeded and
   * reconciliation self-heals counter drift.
   */
  private async adjustBuyerStats(
    buyerId: string | null | undefined,
    amountDelta: number,
    countDelta: number,
    date: Date | null,
    segment: string,
  ): Promise<void> {
    if (!buyerId) return;
    try {
      await this.buyerService.updateStats(buyerId, amountDelta, countDelta, date, segment);
    } catch (err) {
      console.error('Failed to update buyer stats', err);
    }
  }

  /**
   * The supplier-side mirror of adjustBuyerStats, for expense transactions.
   * Without this, SupplierService.updateStats had no callers at all and supplier
   * Total Orders / Total Paid never moved until someone ran the reconciler.
   */
  private async adjustSupplierStats(
    supplierId: string | null | undefined,
    amountDelta: number,
    countDelta: number,
    pendingDelta: number,
    date: Date | null,
    segment: string,
  ): Promise<void> {
    if (!supplierId) return;
    try {
      await this.supplierService.updateStats(supplierId, amountDelta, countDelta, pendingDelta, date, segment);
    } catch (err) {
      console.error('Failed to update supplier stats', err);
    }
  }

  /**
   * Strip attributed cost entries from linked animals after a txn is deleted.
   * Runs post-commit (removeCost does its own reads/writes, disallowed inside
   * runTransaction) and best-effort per animal, mirroring buyer-stats sync.
   */
  private async reverseAnimalCosts(txn: Transaction | undefined, txnId: string): Promise<void> {
    if (!txn?.linkedAnimalIds?.length) return;
    for (const animalId of txn.linkedAnimalIds) {
      try {
        await this.animalService.removeCost(animalId, txnId);
      } catch (err) {
        console.error('Failed to remove attributed animal cost', animalId, err);
      }
    }
  }

  /** Build a unique summary key per person. Delegates to the shared model helper. */
  private personSummaryKey(paidBy: string | null | undefined, paidByName: string | null | undefined, fallbackUid: string): string {
    return personSummaryKey(paidBy, paidByName, fallbackUid);
  }

  /**
   * Build summary reversal fields for a transaction.
   * Used by update (reverse old), softDelete, and hardDelete to avoid code duplication.
   */
  private buildReversalFields(txn: Transaction): Record<string, any> {
    const incField = txn.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = txn.type === 'income' ? -txn.amount : txn.amount;
    const catField = txn.type === 'expense'
      ? `expenseByCategory.${catKey(txn.category)}`
      : `incomeBySource.${catKey(txn.category)}`;
    const catIdField = txn.type === 'expense'
      ? `expenseByCategoryId.${catKey(txn.category)}`
      : `incomeBySourceId.${catKey(txn.category)}`;

    const fields: Record<string, any> = {
      [incField]: increment(-txn.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(-txn.amount),
      [catIdField]: increment(-txn.amount),
      updatedAt: serverTimestamp(),
    };

    // Reverse per-person (settled cash only — pending portion never entered the map)
    const personKey = this.personSummaryKey(txn.paidBy, txn.paidByName, txn.createdBy);
    const personField = txn.type === 'expense'
      ? `expenseByPerson.${personKey}`
      : `incomeByPerson.${personKey}`;
    const settled = settledPortion(txn);
    if (settled !== 0) fields[personField] = increment(-settled);

    // Reverse pending income (net of partial payments already received)
    if (txn.type === 'income' && (txn.paymentStatus || 'received') === 'pending') {
      fields['pendingIncome'] = increment(-pendingRemaining(txn));
    }

    // Reverse pending expense (net of partial payments already made)
    if (txn.type === 'expense' && (txn.expensePaymentStatus || 'paid') === 'pending') {
      fields['pendingExpense'] = increment(-pendingRemaining(txn));
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
  private buildApplyFields(
    data: TransactionFormData,
    userUid: string,
    pendingOverride?: { income: number; expense: number }
  ): Record<string, any> {
    const incField = data.type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = data.type === 'income' ? data.amount : -data.amount;
    const catField = data.type === 'expense'
      ? `expenseByCategory.${catKey(data.category)}`
      : `incomeBySource.${catKey(data.category)}`;
    const catIdField = data.type === 'expense'
      ? `expenseByCategoryId.${catKey(data.category)}`
      : `incomeBySourceId.${catKey(data.category)}`;

    const fields: Record<string, any> = {
      [incField]: increment(data.amount),
      netProfit: increment(profitDelta),
      [catField]: increment(data.amount),
      [catIdField]: increment(data.amount),
      updatedAt: serverTimestamp(),
    };

    // Pending counters — on updates the caller passes the remaining amount
    // (net of partial payments carried through the edit)
    const pendingInc = pendingOverride
      ? pendingOverride.income
      : (data.type === 'income' && (data.paymentStatus || 'received') === 'pending' ? data.amount : 0);
    const pendingExp = pendingOverride
      ? pendingOverride.expense
      : (data.type === 'expense' && (data.expensePaymentStatus || 'paid') === 'pending' ? data.amount : 0);
    if (pendingInc !== 0) fields['pendingIncome'] = increment(pendingInc);
    if (pendingExp !== 0) fields['pendingExpense'] = increment(pendingExp);

    // Per-person maps hold settled cash only; the pending portion joins the map
    // when it is actually paid/received (markAsPaid/markAsReceived/partial payment)
    const personKey = this.personSummaryKey(data.paidBy, data.paidByName, userUid);
    const personField = data.type === 'expense'
      ? `expenseByPerson.${personKey}`
      : `incomeByPerson.${personKey}`;
    const personSettled = data.amount - pendingInc - pendingExp;
    if (personSettled !== 0) fields[personField] = increment(personSettled);

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
    if (data.linkedSaleTransactionId) {
      txnDoc['linkedSaleTransactionId'] = data.linkedSaleTransactionId;
      txnDoc['linkedSaleLabel'] = data.linkedSaleLabel || null;
    }
    if (data.tags?.length) txnDoc['tags'] = data.tags;

    if (data.type === 'income') {
      txnDoc['paymentStatus'] = data.paymentStatus || 'received';
    }
    if (data.type === 'expense') {
      txnDoc['expensePaymentStatus'] = data.expensePaymentStatus || 'paid';
    }
    const isPendingCreate =
      (data.type === 'income' && (data.paymentStatus || 'received') === 'pending') ||
      (data.type === 'expense' && (data.expensePaymentStatus || 'paid') === 'pending');
    if (isPendingCreate && data.expectedPaymentDate) {
      txnDoc['expectedPaymentDate'] = Timestamp.fromDate(data.expectedPaymentDate);
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

    if (data.type === 'income' && data.linkedBuyerId) {
      await this.adjustBuyerStats(data.linkedBuyerId, data.amount, data.quantity || 1, data.date, data.segment);
    }
    if (data.type === 'expense' && data.linkedSupplierId) {
      const pending = (data.expensePaymentStatus || 'paid') === 'pending' ? data.amount : 0;
      await this.adjustSupplierStats(data.linkedSupplierId, data.amount, 1, pending, data.date, data.segment);
    }
    return txnRef.id;
  }

  async update(id: string, data: TransactionFormData): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', id);
    let capturedOld: Transaction | undefined;

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;
      capturedOld = oldData;

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

      // Carry partial payments through the edit (clamped to the new amount);
      // if prior payments already cover the new amount, the txn auto-settles.
      let effectivePayStatus = newPayStatus;
      let keepReceived = 0;
      if (oldData.type === 'income' && data.type === 'income' && newPayStatus === 'pending') {
        keepReceived = Math.min(oldData.amountReceived || 0, data.amount);
        if (keepReceived >= data.amount) effectivePayStatus = 'received';
      }
      let effectiveExpPayStatus = newExpPayStatus;
      let keepPaid = 0;
      if (oldData.type === 'expense' && data.type === 'expense' && newExpPayStatus === 'pending') {
        keepPaid = Math.min(oldData.amountPaid || 0, data.amount);
        if (keepPaid >= data.amount) effectiveExpPayStatus = 'paid';
      }
      // Pending counter deltas, net of partial payments on both sides
      const oldPendingInc = oldData.type === 'income' ? pendingRemaining(oldData) : 0;
      const oldPendingExp = oldData.type === 'expense' ? pendingRemaining(oldData) : 0;
      const newPendingInc = data.type === 'income' && effectivePayStatus === 'pending' ? data.amount - keepReceived : 0;
      const newPendingExp = data.type === 'expense' && effectiveExpPayStatus === 'pending' ? data.amount - keepPaid : 0;
      // Person maps hold settled cash only — an edit moves just the settled portions
      const oldSettled = settledPortion(oldData);
      const newSettled = data.amount - newPendingInc - newPendingExp;
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
      // Sale link: expense-only, form-managed
      const newSaleId = data.type === 'expense' ? (data.linkedSaleTransactionId || null) : null;
      const newSaleLabel = data.type === 'expense' ? (data.linkedSaleLabel || null) : null;
      if ((oldData.linkedSaleTransactionId || null) !== newSaleId) {
        changesList.push(`linked sale: ${oldData.linkedSaleLabel || 'none'}→${newSaleLabel || 'none'}`);
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
      const applyFields = this.buildApplyFields(data, user.uid, { income: newPendingInc, expense: newPendingExp });

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
        const oldCatField = oldData.type === 'expense' ? `expenseByCategory.${catKey(oldData.category)}` : `incomeBySource.${catKey(oldData.category)}`;
        const newCatField = data.type === 'expense' ? `expenseByCategory.${catKey(data.category)}` : `incomeBySource.${catKey(data.category)}`;
        const oldCatIdField = oldData.type === 'expense' ? `expenseByCategoryId.${catKey(oldData.category)}` : `incomeBySourceId.${catKey(oldData.category)}`;
        const newCatIdField = data.type === 'expense' ? `expenseByCategoryId.${catKey(data.category)}` : `incomeBySourceId.${catKey(data.category)}`;

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
          if (newSettled !== oldSettled) combined[oldPersonField] = increment(newSettled - oldSettled);
        } else {
          if (oldSettled !== 0) combined[oldPersonField] = increment(-oldSettled);
          if (newSettled !== 0) combined[newPersonField] = increment(newSettled);
        }

        // Pending income/expense (deltas net of partial payments, computed above)
        if (oldPendingInc !== 0 || newPendingInc !== 0) {
          combined['pendingIncome'] = increment(newPendingInc - oldPendingInc);
        }
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

        const oldCatField = oldData.type === 'expense' ? `expenseByCategory.${catKey(oldData.category)}` : `incomeBySource.${catKey(oldData.category)}`;
        const newCatField = data.type === 'expense' ? `expenseByCategory.${catKey(data.category)}` : `incomeBySource.${catKey(data.category)}`;
        const oldCatIdField = oldData.type === 'expense' ? `expenseByCategoryId.${catKey(oldData.category)}` : `incomeBySourceId.${catKey(oldData.category)}`;
        const newCatIdField = data.type === 'expense' ? `expenseByCategoryId.${catKey(data.category)}` : `incomeBySourceId.${catKey(data.category)}`;

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
          if (newSettled !== oldSettled) combined[oldPersonField] = increment(newSettled - oldSettled);
        } else {
          if (oldSettled !== 0) combined[oldPersonField] = increment(-oldSettled);
          if (newSettled !== 0) combined[newPersonField] = increment(newSettled);
        }

        if (oldPendingInc !== 0 || newPendingInc !== 0) {
          combined['pendingIncome'] = increment(newPendingInc - oldPendingInc);
        }
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
        paymentStatus: data.type === 'income' ? effectivePayStatus : null,
        expensePaymentStatus: data.type === 'expense' ? effectiveExpPayStatus : null,
        amountReceived: keepReceived > 0 ? keepReceived : null,
        amountPaid: keepPaid > 0 ? keepPaid : null,
        expectedPaymentDate: (newPendingInc > 0 || newPendingExp > 0) && data.expectedPaymentDate
          ? Timestamp.fromDate(data.expectedPaymentDate)
          : null,
        linkedBuyerId: data.type === 'income' ? (data.linkedBuyerId || null) : null,
        linkedBuyerName: data.type === 'income' ? (data.linkedBuyerName || null) : null,
        linkedSupplierId: data.type === 'expense' ? (data.linkedSupplierId || null) : null,
        linkedSupplierName: data.type === 'expense' ? (data.linkedSupplierName || null) : null,
        linkedHarvestId: newHarvestId,
        linkedHarvestName: newHarvestName,
        linkedSaleTransactionId: newSaleId,
        linkedSaleLabel: newSaleLabel,
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

    // Re-sync buyer counters when the buyer-facing contribution changed
    if (capturedOld) {
      const oldBuyerId = capturedOld.type === 'income' ? (capturedOld.linkedBuyerId || null) : null;
      const newBuyerId = data.type === 'income' ? (data.linkedBuyerId || null) : null;
      const oldUnits = capturedOld.quantity || 1;
      const newUnits = data.quantity || 1;
      const unchanged = oldBuyerId === newBuyerId
        && capturedOld.amount === data.amount
        && oldUnits === newUnits
        && capturedOld.segment === data.segment;
      if (!unchanged) {
        if (oldBuyerId) {
          await this.adjustBuyerStats(oldBuyerId, -capturedOld.amount, -oldUnits, null, capturedOld.segment);
        }
        if (newBuyerId) {
          await this.adjustBuyerStats(newBuyerId, data.amount, newUnits, data.date, data.segment);
        }
      }

      // Supplier counters count ONE order per transaction and skip loan-funded expenses,
      // matching reconcileCounterparties so the two can never disagree. Form-created
      // transactions never carry linkedLoanId (loan.service writes those docs itself and
      // the form blocks editing them), so only the captured old doc needs the guard.
      const oldSupplierId = (capturedOld.type === 'expense' && !capturedOld.linkedLoanId) ? (capturedOld.linkedSupplierId || null) : null;
      const newSupplierId2 = data.type === 'expense' ? (data.linkedSupplierId || null) : null;
      const oldPending = pendingRemaining(capturedOld);
      const newPending = (data.expensePaymentStatus || 'paid') === 'pending' ? data.amount : 0;
      const supplierUnchanged = oldSupplierId === newSupplierId2
        && capturedOld.amount === data.amount
        && oldPending === newPending
        && capturedOld.segment === data.segment;
      if (!supplierUnchanged) {
        if (oldSupplierId) {
          await this.adjustSupplierStats(oldSupplierId, -capturedOld.amount, -1, -oldPending, null, capturedOld.segment);
        }
        if (newSupplierId2) {
          await this.adjustSupplierStats(newSupplierId2, data.amount, 1, newPending, data.date, data.segment);
        }
      }
    }
  }

  async softDelete(id: string): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', id);
    let capturedOld: Transaction | undefined;

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;
      capturedOld = oldData;

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

    if (capturedOld?.type === 'income' && capturedOld.linkedBuyerId) {
      await this.adjustBuyerStats(capturedOld.linkedBuyerId, -capturedOld.amount, -(capturedOld.quantity || 1), null, capturedOld.segment);
    }
    if (capturedOld?.type === 'expense' && capturedOld.linkedSupplierId && !capturedOld.linkedLoanId) {
      await this.adjustSupplierStats(capturedOld.linkedSupplierId, -capturedOld.amount, -1, -pendingRemaining(capturedOld), null, capturedOld.segment);
    }
    await this.reverseAnimalCosts(capturedOld, id);
  }

  async hardDelete(id: string): Promise<void> {
    const txnRef = doc(this.firestore, 'transactions', id);
    let capturedOld: Transaction | undefined;

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;
      capturedOld = oldData;

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

    if (capturedOld?.type === 'income' && capturedOld.linkedBuyerId) {
      await this.adjustBuyerStats(capturedOld.linkedBuyerId, -capturedOld.amount, -(capturedOld.quantity || 1), null, capturedOld.segment);
    }
    if (capturedOld?.type === 'expense' && capturedOld.linkedSupplierId && !capturedOld.linkedLoanId) {
      await this.adjustSupplierStats(capturedOld.linkedSupplierId, -capturedOld.amount, -1, -pendingRemaining(capturedOld), null, capturedOld.segment);
    }
    await this.reverseAnimalCosts(capturedOld, id);
  }

  async updateDistribution(transactionId: string, distributions: DistributionEntry[]): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    // Linked selling costs cap the distributable amount at net realization.
    // Queried outside runTransaction (queries aren't allowed inside Firestore transactions).
    const sellingCosts = (await this.getLinkedSellingExpenses(transactionId))
      .reduce((s, t) => s + t.amount, 0);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      const oldData = oldDoc.data() as Transaction;

      if (oldData.isDeleted) throw new Error('Cannot distribute a deleted transaction');
      if (oldData.type !== 'income') throw new Error('Can only distribute income');

      const totalDist = distributions.reduce((s, d) => s + d.amount, 0);
      if (totalDist > oldData.amount) throw new Error('Distribution exceeds income amount');
      const distributable = oldData.amount - sellingCosts;
      if (totalDist > distributable) {
        throw new Error(`Distribution exceeds net realization of ₹${distributable.toLocaleString('en-IN')} (after selling expenses)`);
      }

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
      const remaining = pendingRemaining(oldData);

      transaction.update(txnRef, {
        paymentStatus: 'received' as IncomePaymentStatus,
        amountReceived: oldData.amount,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'payment_received',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
        }),
      });

      // Decrement remaining pendingIncome (net of partials) and move the settled
      // cash into incomeByPerson in monthly + yearly summaries
      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      const personKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
      const pendingUpdate = {
        pendingIncome: increment(-remaining),
        [`incomeByPerson.${personKey}`]: increment(remaining),
        updatedAt: serverTimestamp(),
      };
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
      const remaining = pendingRemaining(oldData);

      transaction.update(txnRef, {
        expensePaymentStatus: 'paid' as ExpensePaymentStatus,
        amountPaid: oldData.amount,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: 'payment_paid',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
        }),
      });

      const summaryId = `${oldData.month}-${oldData.segment}`;
      const summaryRef = doc(this.firestore, 'monthlySummaries', summaryId);
      const personKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
      const pendingUpdate = {
        pendingExpense: increment(-remaining),
        [`expenseByPerson.${personKey}`]: increment(remaining),
        updatedAt: serverTimestamp(),
      };
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

  /**
   * Record a partial payment against a pending transaction (income or expense).
   * Decrements the summary pending counters by exactly the paid amount; when the
   * cumulative payments cover the full amount the transaction auto-settles.
   */
  async recordPartialPayment(transactionId: string, amount: number): Promise<void> {
    const user = this.authService.requireUser();
    const txnRef = doc(this.firestore, 'transactions', transactionId);

    await runTransaction(this.firestore, async (transaction) => {
      const oldDoc = await transaction.get(txnRef);
      if (!oldDoc.exists()) throw new Error('Transaction not found');
      const oldData = oldDoc.data() as Transaction;

      if (oldData.isDeleted) throw new Error('Cannot update a deleted transaction');
      const isIncome = oldData.type === 'income';
      const status = isIncome ? oldData.paymentStatus : oldData.expensePaymentStatus;
      if (status !== 'pending') throw new Error('Transaction has no pending amount');

      const remaining = pendingRemaining(oldData);
      if (!(amount > 0)) throw new Error('Enter an amount greater than 0');
      if (amount > remaining) {
        throw new Error(`Amount exceeds pending balance of ₹${remaining.toLocaleString('en-IN')}`);
      }

      const settled = amount >= remaining;
      const prior = (isIncome ? oldData.amountReceived : oldData.amountPaid) || 0;
      const verb = isIncome ? 'received' : 'paid';

      const txnUpdates: Record<string, any> = {
        [isIncome ? 'amountReceived' : 'amountPaid']: settled ? oldData.amount : prior + amount,
        timeline: appendTimelineCapped(oldData.timeline, {
          action: settled ? (isIncome ? 'payment_received' : 'payment_paid') : 'partial_payment',
          by: user.uid,
          byName: user.displayName,
          at: Timestamp.now(),
          changes: settled
            ? `₹${amount.toLocaleString('en-IN')} ${verb} — settled`
            : `₹${amount.toLocaleString('en-IN')} ${verb}, ₹${(remaining - amount).toLocaleString('en-IN')} remaining`,
        }),
      };
      if (settled) {
        if (isIncome) txnUpdates['paymentStatus'] = 'received' as IncomePaymentStatus;
        else txnUpdates['expensePaymentStatus'] = 'paid' as ExpensePaymentStatus;
      }
      transaction.update(txnRef, txnUpdates);

      const pendingField = isIncome ? 'pendingIncome' : 'pendingExpense';
      const personKey = this.personSummaryKey(oldData.paidBy, oldData.paidByName, oldData.createdBy);
      const personField = isIncome ? `incomeByPerson.${personKey}` : `expenseByPerson.${personKey}`;
      const pendingUpdate = {
        [pendingField]: increment(-amount),
        [personField]: increment(amount),
        updatedAt: serverTimestamp(),
      };
      const summaryRef = doc(this.firestore, 'monthlySummaries', `${oldData.month}-${oldData.segment}`);
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
    let transactions = snapshot.docs.map((d) => d.data() as Transaction);
    // Viewer segment scoping runs after the page fetch, so a restricted viewer may
    // get short pages; the cursor still advances over the unfiltered page.
    if (this.authService.isSegmentRestricted()) {
      transactions = transactions.filter((t) => this.authService.canViewSegment(t.segment));
    }
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

  /** Recent income transactions, for the expense form's "Link to Sale" picker. */
  async getRecentIncome(count = 25): Promise<Transaction[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('isDeleted', '==', false),
      where('type', '==', 'income'),
      orderBy('date', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as Transaction);
  }

  /** Expense transactions linked to a sale income txn (live query, no denormalized counters). */
  async getLinkedSellingExpenses(saleTxnId: string): Promise<Transaction[]> {
    const q = query(
      collection(this.firestore, 'transactions'),
      where('linkedSaleTransactionId', '==', saleTxnId),
      where('isDeleted', '==', false),
      orderBy('date', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as Transaction).filter(t => t.type === 'expense');
  }

  /** Display label stored as linkedSaleLabel on expenses, e.g. "19 Jul 2026 — Goat Sales ₹45,000 (Rahim Traders)" */
  saleLabel(t: Pick<Transaction, 'date' | 'categoryName' | 'amount' | 'linkedBuyerName'>): string {
    const d = t.date.toDate();
    const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const base = `${dateStr} — ${t.categoryName} ₹${t.amount.toLocaleString('en-IN')}`;
    return t.linkedBuyerName ? `${base} (${t.linkedBuyerName})` : base;
  }
}
