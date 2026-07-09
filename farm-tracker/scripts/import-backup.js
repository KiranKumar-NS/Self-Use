/**
 * ============================================================
 * IMPORT FROM EXCEL BACKUP
 * Farm Tracker - Restore data from exported Excel files
 * ============================================================
 *
 * Auto-detects file type and imports:
 *   - Transaction backup (Expenses + Income + Loans + Stock sheets)
 *   - Loan detail backup (Overview + Deductions + Repayments + ... sheets)
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   cd scripts
 *   npm install
 *
 *   # Import transaction backup
 *   node import-backup.js farm-backup-July-2026.xlsx
 *
 *   # Import loan detail backup
 *   node import-backup.js loan-SBI-detail.xlsx
 *
 *   # Dry run (preview without writing)
 *   node import-backup.js farm-backup-July-2026.xlsx --dry-run
 *
 * ────────────────────────────────────────────────────────────
 * FILE TYPES
 * ────────────────────────────────────────────────────────────
 *
 * Transaction backup (has "Expenses" sheet):
 *   Sheet 1: Expenses         — all expense transactions
 *   Sheet 2: Income           — all income transactions with distributions
 *   Sheet 3: Loans            — all loans (simple + formal) with all fields
 *   Sheet 4: Inventory Events — stock change events
 *   Sheet 5: Animals          — animal/batch registry with cost tracking
 *   Sheet 6: Buyers           — buyer/customer registry with stats
 *
 * Loan detail backup (has "Overview" sheet):
 *   Sheet 1: Overview      — loan document (47 fields)
 *   Sheet 2: Deductions    — inline on loan doc
 *   Sheet 3: Repayments    — subcollection docs
 *   Sheet 4: Utilization   — linked transaction docs
 *   Sheet 5: Personal      — linked simple loan docs
 *   Sheet 6: Collateral    — inline on loan doc
 *   Sheet 7: Rate Changes  — inline on loan doc
 *   Sheet 8: Documents     — inline on loan doc
 *
 * ============================================================
 */

const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');

// ── Initialize Firebase Admin ──────────────────────────────
const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (err) {
  console.error('ERROR: Cannot find service-account-key.json');
  console.error(`  Expected at: ${serviceAccountPath}`);
  process.exit(1);
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// ── Helpers ────────────────────────────────────────────────

function parseDate(str) {
  if (!str || str === '-') return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (d && m && y) return new Date(y < 100 ? y + 2000 : y, m - 1, d);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toTimestamp(str) {
  const d = parseDate(str);
  return d ? admin.firestore.Timestamp.fromDate(d) : null;
}

function num(val) {
  if (val == null || val === '') return 0;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? 0 : n;
}

function str(val) {
  return val == null ? '' : String(val).trim();
}

function bool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1';
}

function monthStr(date) {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ── Import Transaction Backup ──────────────────────────────

async function importBackup(wb, dryRun) {
  const stats = { expenses: 0, income: 0, loans: 0, inventoryEvents: 0, animals: 0, buyers: 0, skipped: 0 };
  const batch = db.batch();

  // Expenses
  if (wb.Sheets['Expenses']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Expenses']);
    console.log(`  Expenses sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('transactions').doc().id;
      const txnDate = parseDate(str(r['Date'])) || new Date();
      const month = str(r['Month']) || monthStr(txnDate);
      batch.set(db.collection('transactions').doc(id), {
        id, type: 'expense',
        date: admin.firestore.Timestamp.fromDate(txnDate),
        amount: num(r['Amount']),
        quantity: num(r['Quantity']) || null,
        unit: str(r['Unit']) || null,
        ratePerUnit: num(r['Rate Per Unit']) || null,
        category: str(r['Category']),
        categoryName: str(r['Category Name']) || str(r['Category']),
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        description: str(r['Description']),
        paymentMethod: str(r['Payment Method']) || 'upi',
        paidBy: str(r['Paid By']) || 'unknown',
        paidByName: str(r['Paid By Name']) || str(r['Paid By']) || 'Unknown',
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: FieldValue.serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: 'imported from backup' }],
        expensePaymentStatus: str(r['Payment Status']) || 'paid',
        linkedLoanId: str(r['Linked Loan ID']) || null,
        tags: str(r['Tags']) ? str(r['Tags']).split(',').map(t => t.trim()).filter(t => t) : null,
        linkedAnimalIds: str(r['Linked Animal IDs']) ? str(r['Linked Animal IDs']).split(';').map(s => s.trim()).filter(s => s) : null,
        linkedAnimalNames: str(r['Linked Animal Names']) ? str(r['Linked Animal Names']).split(';').map(s => s.trim()).filter(s => s) : null,
        animalCostSplit: str(r['Animal Cost Split']) ? Object.fromEntries(str(r['Animal Cost Split']).split(';').map(s => s.trim()).filter(s => s).map(s => { const [id, amt] = s.split(':'); return [id.trim(), num(amt)]; })) : null,
        linkedBuyerId: str(r['Linked Buyer ID']) || null,
        linkedBuyerName: str(r['Linked Buyer Name']) || null,
        month, year: txnDate.getFullYear(),
      });
      stats.expenses++;
    }
  }

  // Income
  if (wb.Sheets['Income']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Income']);
    console.log(`  Income sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('transactions').doc().id;
      const txnDate = parseDate(str(r['Date'])) || new Date();
      const month = str(r['Month']) || monthStr(txnDate);

      // Parse distributions: "uid:name:amount; uid:name:amount"
      const distributions = [];
      const distStr = str(r['Distribution']);
      if (distStr) {
        for (const part of distStr.split(';')) {
          const segs = part.trim().split(':');
          if (segs.length === 3) {
            distributions.push({ uid: segs[0].trim(), name: segs[1].trim(), amount: num(segs[2]) });
          } else if (segs.length === 2) {
            distributions.push({ uid: '', name: segs[0].trim(), amount: num(segs[1]) });
          }
        }
      }

      batch.set(db.collection('transactions').doc(id), {
        id, type: 'income',
        date: admin.firestore.Timestamp.fromDate(txnDate),
        amount: num(r['Amount']),
        quantity: num(r['Quantity']) || null,
        unit: str(r['Unit']) || null,
        ratePerUnit: num(r['Rate Per Unit']) || null,
        category: str(r['Category']),
        categoryName: str(r['Category Name']) || str(r['Category']),
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        description: str(r['Description']),
        paymentMethod: str(r['Payment Method']) || 'upi',
        paidBy: str(r['Received By']) || 'unknown',
        paidByName: str(r['Received By Name']) || str(r['Received By']) || 'Unknown',
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: FieldValue.serverTimestamp(),
        isDeleted: false,
        timeline: [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: 'imported from backup' }],
        paymentStatus: str(r['Payment Status']) || 'received',
        distributions: distributions.length > 0 ? distributions : null,
        tags: str(r['Tags']) ? str(r['Tags']).split(',').map(t => t.trim()).filter(t => t) : null,
        linkedAnimalIds: str(r['Linked Animal IDs']) ? str(r['Linked Animal IDs']).split(';').map(s => s.trim()).filter(s => s) : null,
        linkedAnimalNames: str(r['Linked Animal Names']) ? str(r['Linked Animal Names']).split(';').map(s => s.trim()).filter(s => s) : null,
        animalCostSplit: str(r['Animal Cost Split']) ? Object.fromEntries(str(r['Animal Cost Split']).split(';').map(s => s.trim()).filter(s => s).map(s => { const [id, amt] = s.split(':'); return [id.trim(), num(amt)]; })) : null,
        linkedBuyerId: str(r['Linked Buyer ID']) || null,
        linkedBuyerName: str(r['Linked Buyer Name']) || null,
        month, year: txnDate.getFullYear(),
      });
      stats.income++;
    }
  }

  // Loans
  if (wb.Sheets['Loans']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Loans']);
    console.log(`  Loans sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('loans').doc().id;
      const loanDate = parseDate(str(r['Date'])) || new Date();
      const month = str(r['Month']) || monthStr(loanDate);
      const isFormal = str(r['Category']) === 'formal';

      const loanDoc = {
        id, date: admin.firestore.Timestamp.fromDate(loanDate),
        amount: num(r['Amount']), type: str(r['Type']) || 'received',
        personName: str(r['Person']), personUid: str(r['Person UID']) || null,
        purpose: str(r['Purpose']), segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        repaymentStatus: str(r['Status']) || 'pending',
        totalRepaid: num(r['Repaid']), balanceRemaining: num(r['Balance']),
        recordedBy: str(r['Recorded By']) || 'import',
        recordedByName: str(r['Recorded By Name']) || 'Import Script',
        createdAt: FieldValue.serverTimestamp(), isDeleted: false,
        timeline: [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: 'imported from backup' }],
        month, year: loanDate.getFullYear(),
        loanCategory: str(r['Category']) || 'simple',
        parentFormalLoanId: str(r['Parent Formal Loan']) || null,
      };

      if (isFormal) {
        Object.assign(loanDoc, {
          loanSource: str(r['Source']) || null,
          loanSourceName: str(r['Source Name']) || null,
          accountNumber: str(r['Account']) || null,
          sanctionedAmount: num(r['Sanctioned']),
          netDisbursedAmount: num(r['Net Disbursed']),
          totalDeductions: num(r['Total Deductions']),
          repaymentType: str(r['Repayment Type']) || 'emi',
          interestType: str(r['Interest Type']) || 'fixed',
          interestFrequency: str(r['Interest Frequency']) || 'annual',
          interestRateInput: num(r['Interest Rate Input']),
          interestRate: num(r['Interest Rate Annual']),
          isSubsidized: bool(r['Is Subsidized']),
          effectiveRate: num(r['Effective Rate']) || null,
          tenure: num(r['Tenure']) || null,
          emiAmount: num(r['EMI Amount']) || null,
          totalEMIs: num(r['Total EMIs']) || null,
          emisPaid: num(r['EMIs Paid']),
          moratoriumMonths: num(r['Moratorium']),
          interestPaymentFrequency: str(r['Interest Payment Freq']) || null,
          interestAmountPerPeriod: num(r['Interest Per Period']) || null,
          totalInterestPaymentsMade: num(r['Interest Payments Made']),
          outstandingBalance: num(r['Outstanding']),
          totalInterestPaid: num(r['Interest Paid']),
          totalPrincipalPaid: num(r['Principal Paid']),
          totalPartPayments: num(r['Part Payments']),
          totalPenaltyPaid: num(r['Penalty Paid']),
          utilizationTotal: num(r['Utilization Total']),
          utilizationRemaining: num(r['Utilization Remaining']),
          heldByUid: str(r['Held By UID']) || null,
          heldByName: str(r['Held By']) || null,
          closureReason: str(r['Closure Reason']) || null,
          loanClosureDate: toTimestamp(str(r['Closure Date'])),
          preClosureCharges: num(r['Pre-closure Charges']) || null,
          replacesLoanId: str(r['Replaces Loan']) || null,
          replacedByLoanId: str(r['Replaced By Loan']) || null,
          isBalanceTransfer: bool(r['Is Balance Transfer']),
          segments: str(r['Segments']) ? str(r['Segments']).split(';').map(s => s.trim()).filter(Boolean) : null,
          totalCollateralValue: num(r['Collateral Value']) || null,
        });
      }

      batch.set(db.collection('loans').doc(id), loanDoc);
      stats.loans++;
    }
  }

  // Inventory Events
  if (wb.Sheets['Inventory Events']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventory Events']);
    console.log(`  Inventory Events sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('inventoryEvents').doc().id;
      const eventDate = parseDate(str(r['Date'])) || new Date();
      const month = str(r['Month']) || monthStr(eventDate);
      batch.set(db.collection('inventoryEvents').doc(id), {
        id,
        date: admin.firestore.Timestamp.fromDate(eventDate),
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        eventType: str(r['Event Type']) || 'adjustment',
        count: num(r['Count']),
        breed: str(r['Breed']) || null,
        note: str(r['Note']) || '',
        month,
        year: eventDate.getFullYear(),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: FieldValue.serverTimestamp(),
      });
      stats.inventoryEvents++;
    }
  }

  // Animals
  if (wb.Sheets['Animals']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Animals']);
    console.log(`  Animals sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('animals').doc().id;
      const originDate = parseDate(str(r['Origin Date'])) || new Date();
      const month = monthStr(originDate);

      const animalDoc = {
        id,
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        trackingMode: str(r['Tracking Mode']) || 'individual',
        tag: str(r['Tag']) || null,
        name: str(r['Name']) || null,
        breed: str(r['Breed']) || null,
        gender: str(r['Gender']) || null,
        batchLabel: str(r['Batch Label']) || null,
        batchSize: num(r['Batch Size']) || 1,
        currentCount: num(r['Current Count']) || num(r['Batch Size']) || 1,
        origin: str(r['Origin']) || 'purchase',
        originDate: admin.firestore.Timestamp.fromDate(originDate),
        purchasePrice: num(r['Purchase Price']),
        status: str(r['Status']) || 'active',
        totalCosts: num(r['Total Costs']),
        totalInvested: num(r['Total Invested']),
        costEntries: [], // Cost entries are not exported in detail, will be empty
        salePrice: num(r['Sale Price']) || null,
        profit: num(r['Profit']) || null,
        profitMargin: num(r['Profit Margin %']) || null,
        buyerId: str(r['Buyer ID']) || null,
        buyerName: str(r['Buyer']) || null,
        exitDate: toTimestamp(str(r['Exit Date'])),
        exitType: str(r['Exit Type']) || null,
        saleTransactionId: str(r['Sale Txn ID']) || null,
        note: str(r['Note']) || null,
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: FieldValue.serverTimestamp(),
        isDeleted: false,
        month,
        year: originDate.getFullYear(),
      };

      batch.set(db.collection('animals').doc(id), animalDoc);
      stats.animals++;
    }
  }

  // Buyers
  if (wb.Sheets['Buyers']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Buyers']);
    console.log(`  Buyers sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('buyers').doc().id;
      batch.set(db.collection('buyers').doc(id), {
        id,
        name: str(r['Name']),
        phone: str(r['Phone']) || '',
        location: str(r['Location']) || '',
        note: str(r['Note']) || '',
        totalPurchases: num(r['Total Purchases']),
        totalAmountPaid: num(r['Total Amount Paid']),
        averageRate: num(r['Average Rate']) || null,
        lastPurchaseDate: toTimestamp(str(r['Last Purchase'])),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: FieldValue.serverTimestamp(),
        isDeleted: false,
      });
      stats.buyers++;
    }
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No data written to Firestore');
  } else {
    await batch.commit();
  }

  return stats;
}

// ── Import Loan Detail ─────────────────────────────────────

async function importLoanDetail(wb, dryRun) {
  const stats = { loan: false, repayments: 0, utilizations: 0, personalLoans: 0 };
  const batch = db.batch();

  // Overview
  const overviewRows = XLSX.utils.sheet_to_json(wb.Sheets['Overview']);
  const overview = {};
  for (const row of overviewRows) overview[row.Field] = row.Value;

  const loanId = str(overview['ID']);
  if (!loanId) { console.error('  ERROR: Loan ID missing in Overview'); return stats; }

  console.log(`  Loan: ${str(overview['Source Name'])} (${loanId})`);

  // Deductions
  const deductions = [];
  if (wb.Sheets['Deductions']) {
    for (const d of XLSX.utils.sheet_to_json(wb.Sheets['Deductions'])) {
      deductions.push({
        id: str(d['ID']) || `ded_imp_${Date.now()}_${deductions.length}`,
        type: str(d['Type']), customLabel: str(d['Custom Label']) || null,
        amount: num(d['Amount']), paidTo: str(d['Paid To']),
        date: toTimestamp(str(d['Date'])) || admin.firestore.Timestamp.now(),
        paymentReference: str(d['Reference']) || null,
        isFinanced: bool(d['Financed']), note: str(d['Note']) || null,
      });
    }
  }

  // Collateral
  const collaterals = [];
  if (wb.Sheets['Collateral']) {
    for (const c of XLSX.utils.sheet_to_json(wb.Sheets['Collateral'])) {
      collaterals.push({
        id: str(c['ID']) || `col_imp_${Date.now()}_${collaterals.length}`,
        type: str(c['Type']), description: str(c['Description']),
        estimatedValue: num(c['Value']), weight: num(c['Weight']) || null,
        purity: str(c['Purity']) || null, documentReference: str(c['Document Ref']) || null,
        note: str(c['Note']) || null,
        isReleased: str(c['Status']).toLowerCase() === 'released',
        releasedDate: str(c['Status']).toLowerCase() === 'released' ? toTimestamp(str(c['Released Date'])) : null,
      });
    }
  }

  // Rate Changes
  const rateChanges = [];
  if (wb.Sheets['Rate Changes']) {
    for (const rc of XLSX.utils.sheet_to_json(wb.Sheets['Rate Changes'])) {
      rateChanges.push({
        id: str(rc['ID']) || `rc_imp_${Date.now()}_${rateChanges.length}`,
        date: toTimestamp(str(rc['Date'])) || admin.firestore.Timestamp.now(),
        oldRate: num(rc['Old Rate']), newRate: num(rc['New Rate']),
        newEMI: num(rc['New EMI']) || null, recordedBy: str(rc['Recorded By']) || 'import',
        recordedByName: 'Import Script', note: str(rc['Note']) || null,
      });
    }
  }

  // Documents
  const documents = [];
  if (wb.Sheets['Documents']) {
    for (const d of XLSX.utils.sheet_to_json(wb.Sheets['Documents'])) {
      documents.push({
        id: str(d['ID']) || `doc_imp_${Date.now()}_${documents.length}`,
        type: str(d['Type']), customLabel: str(d['Custom Label']) || null,
        referenceNumber: str(d['Reference Number']) || null,
        date: toTimestamp(str(d['Date'])), note: str(d['Note']) || null,
      });
    }
  }

  // Build loan doc
  const loanDate = parseDate(str(overview['Date'])) || new Date();
  const loanDoc = {
    id: loanId, date: admin.firestore.Timestamp.fromDate(loanDate),
    amount: num(overview['Sanctioned Amount']), type: 'received',
    personName: str(overview['Person']), purpose: str(overview['Purpose']),
    segment: str(overview['Segment']), segmentName: str(overview['Segment']),
    repaymentStatus: str(overview['Status']) || 'pending',
    totalRepaid: num(overview['Total Repaid']), balanceRemaining: num(overview['Balance Remaining']),
    recordedBy: 'import', recordedByName: 'Import Script',
    createdAt: FieldValue.serverTimestamp(), isDeleted: false,
    timeline: [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: 'imported from Excel backup' }],
    month: monthStr(loanDate), year: loanDate.getFullYear(),
    loanCategory: 'formal',
    loanSource: str(overview['Loan Source']) || null,
    loanSourceName: str(overview['Source Name']) || null,
    accountNumber: str(overview['Account Number']) || null,
    sanctionedAmount: num(overview['Sanctioned Amount']),
    netDisbursedAmount: num(overview['Net Disbursed']),
    totalDeductions: num(overview['Total Deductions']),
    deductions: deductions.length > 0 ? deductions : null,
    disbursementDate: toTimestamp(str(overview['Disbursement Date'])),
    repaymentType: str(overview['Repayment Type']) || 'emi',
    interestType: str(overview['Interest Type']) || 'fixed',
    interestFrequency: str(overview['Interest Frequency']) || 'annual',
    interestRateInput: num(overview['Interest Rate Input']),
    interestRate: num(overview['Interest Rate Annual']),
    isSubsidized: bool(overview['Is Subsidized']),
    subsidyDetails: str(overview['Subsidy Details']) || null,
    effectiveRate: num(overview['Effective Rate']) || null,
    tenure: num(overview['Tenure']) || null,
    emiAmount: num(overview['EMI Amount']) || null,
    totalEMIs: num(overview['Total EMIs']) || null,
    emisPaid: num(overview['EMIs Paid']),
    moratoriumMonths: num(overview['Moratorium Months']),
    interestPaymentFrequency: str(overview['Interest Payment Frequency']) || null,
    interestAmountPerPeriod: num(overview['Interest Per Period']) || null,
    outstandingBalance: num(overview['Outstanding Balance']),
    totalInterestPaid: num(overview['Total Interest Paid']),
    totalPrincipalPaid: num(overview['Total Principal Paid']),
    totalPartPayments: num(overview['Total Part Payments']),
    totalPenaltyPaid: num(overview['Total Penalty Paid']),
    utilizationTotal: num(overview['Utilization Total']),
    utilizationRemaining: num(overview['Utilization Remaining']),
    heldByUid: str(overview['Held By UID']) || null,
    heldByName: str(overview['Held By']) || null,
    closureReason: str(overview['Closure Reason']) || null,
    loanClosureDate: toTimestamp(str(overview['Closure Date'])),
    preClosureCharges: num(overview['Pre-closure Charges']) || null,
    replacesLoanId: str(overview['Replaces Loan ID']) || null,
    replacedByLoanId: str(overview['Replaced By Loan ID']) || null,
    isBalanceTransfer: bool(overview['Is Balance Transfer']),
    collaterals: collaterals.length > 0 ? collaterals : null,
    totalCollateralValue: collaterals.reduce((s, c) => s + c.estimatedValue, 0) || null,
    rateChanges: rateChanges.length > 0 ? rateChanges : null,
    documents: documents.length > 0 ? documents : null,
    segments: str(overview['Segments']) ? str(overview['Segments']).split(';').map(s => s.trim()).filter(Boolean) : null,
  };

  batch.set(db.collection('loans').doc(loanId), loanDoc);
  stats.loan = true;

  // Repayments
  if (wb.Sheets['Repayments']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Repayments']);
    console.log(`  Repayments: ${rows.length} rows`);
    for (const r of rows) {
      const repId = str(r['ID']) || db.collection(`loans/${loanId}/repayments`).doc().id;
      batch.set(db.collection(`loans/${loanId}/repayments`).doc(repId), {
        id: repId, date: toTimestamp(str(r['Date'])) || admin.firestore.Timestamp.now(),
        amount: num(r['Amount']), note: str(r['Note']),
        paidBy: str(r['Paid By']) || 'import', paidByName: str(r['Paid By Name']) || 'Import',
        recordedBy: str(r['Recorded By']) || 'import', recordedByName: 'Import Script',
        createdAt: FieldValue.serverTimestamp(),
        isEMIPayment: bool(r['EMI Payment']), emiNumber: num(r['EMI Number']) || null,
        principalPortion: num(r['Principal']) || null, interestPortion: num(r['Interest']) || null,
        isPartPayment: bool(r['Part Payment']), isPreClosure: bool(r['Pre-closure']),
        preClosureCharges: num(r['Pre-closure Charges']) || null,
        penaltyAmount: num(r['Penalty']) || null, paymentReference: str(r['Reference']) || null,
      });
      stats.repayments++;
    }
  }

  // Utilization (linked transactions)
  if (wb.Sheets['Utilization']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Utilization']);
    console.log(`  Utilization: ${rows.length} rows`);
    for (const t of rows) {
      const txnId = str(t['ID']) || db.collection('transactions').doc().id;
      const txnDate = parseDate(str(t['Date'])) || new Date();
      const month = str(t['Month']) || monthStr(txnDate);
      batch.set(db.collection('transactions').doc(txnId), {
        id: txnId, type: 'expense',
        date: admin.firestore.Timestamp.fromDate(txnDate), amount: num(t['Amount']),
        category: str(t['Category']), categoryName: str(t['Category Name']),
        segment: str(t['Segment']), segmentName: str(t['Segment Name']),
        description: str(t['Description']), paymentMethod: str(t['Payment Method']) || 'upi',
        paidBy: str(t['Paid By']) || 'import', paidByName: str(t['Paid By Name']) || 'Import',
        createdBy: 'import', createdByName: 'Import Script',
        createdAt: FieldValue.serverTimestamp(), isDeleted: false,
        timeline: [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: 'imported from backup' }],
        expensePaymentStatus: 'paid', linkedLoanId: loanId, month, year: txnDate.getFullYear(),
      });
      stats.utilizations++;
    }
  }

  // Personal Withdrawals (linked simple loans)
  if (wb.Sheets['Personal']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Personal']);
    console.log(`  Personal: ${rows.length} rows`);
    for (const sl of rows) {
      const slId = str(sl['ID']) || db.collection('loans').doc().id;
      const slDate = parseDate(str(sl['Date'])) || new Date();
      const month = monthStr(slDate);
      batch.set(db.collection('loans').doc(slId), {
        id: slId, date: admin.firestore.Timestamp.fromDate(slDate),
        amount: num(sl['Amount']), type: 'given',
        personName: str(sl['Person']), personUid: str(sl['Person UID']) || null,
        purpose: str(sl['Purpose']), segment: str(sl['Segment']) || loanDoc.segment,
        segmentName: str(sl['Segment']) || loanDoc.segmentName,
        repaymentStatus: str(sl['Status']) || 'pending',
        totalRepaid: num(sl['Repaid']), balanceRemaining: num(sl['Holding']),
        recordedBy: 'import', recordedByName: 'Import Script',
        createdAt: FieldValue.serverTimestamp(), isDeleted: false,
        timeline: [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: 'imported from backup' }],
        month, year: slDate.getFullYear(),
        loanCategory: 'simple', parentFormalLoanId: str(sl['Parent Loan ID']) || loanId,
      });
      stats.personalLoans++;
    }
  }

  if (dryRun) {
    console.log('\n  [DRY RUN] No data written to Firestore');
  } else {
    await batch.commit();
  }

  return stats;
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: node import-backup.js <excel-file> [--dry-run]');
    console.error('');
    console.error('Examples:');
    console.error('  node import-backup.js farm-backup-July-2026.xlsx');
    console.error('  node import-backup.js loan-SBI-detail.xlsx');
    console.error('  node import-backup.js farm-backup.xlsx --dry-run');
    process.exit(1);
  }

  const fullPath = path.resolve(filePath);
  console.log('');
  console.log('=== FARM TRACKER - IMPORT FROM EXCEL ===');
  console.log(`  File: ${fullPath}`);
  if (dryRun) console.log('  Mode: DRY RUN (no writes)');
  console.log('');

  let wb;
  try {
    wb = XLSX.readFile(fullPath);
  } catch (err) {
    console.error(`ERROR: Cannot read file: ${err.message}`);
    process.exit(1);
  }

  const sheets = wb.SheetNames;
  console.log(`  Sheets found: ${sheets.join(', ')}`);
  console.log('');

  if (sheets.includes('Overview')) {
    console.log('  Detected: LOAN DETAIL backup');
    console.log('');
    const stats = await importLoanDetail(wb, dryRun);
    console.log('');
    console.log('=== IMPORT COMPLETE ===');
    console.log(`  Loan: ${stats.loan ? 'imported' : 'skipped'}`);
    console.log(`  Repayments: ${stats.repayments}`);
    console.log(`  Utilizations: ${stats.utilizations}`);
    console.log(`  Personal loans: ${stats.personalLoans}`);

  } else if (sheets.includes('Expenses') || sheets.includes('Income')) {
    console.log('  Detected: TRANSACTION BACKUP');
    console.log('');
    const stats = await importBackup(wb, dryRun);
    console.log('');
    console.log('=== IMPORT COMPLETE ===');
    console.log(`  Expenses: ${stats.expenses}`);
    console.log(`  Income: ${stats.income}`);
    console.log(`  Loans: ${stats.loans}`);
    console.log(`  Inventory Events: ${stats.inventoryEvents}`);
    console.log(`  Animals: ${stats.animals}`);
    console.log(`  Buyers: ${stats.buyers}`);

  } else {
    console.error(`ERROR: Unrecognized Excel format. Sheets: ${sheets.join(', ')}`);
    console.error('Expected "Overview" (loan detail) or "Expenses"/"Income" (backup)');
    process.exit(1);
  }

  if (!dryRun) {
    console.log('');
    console.log('NOTE: Monthly summaries are NOT recalculated during import.');
    console.log('They will be updated on the next transaction operation in the app.');
  }

  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
