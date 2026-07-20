/**
 * ============================================================
 * IMPORT FROM EXCEL BACKUP
 * Farm Tracker - Restore data from exported Excel files
 * ============================================================
 *
 * Auto-detects file type and imports:
 *   - Full backup (v2, has "Meta" sheet) — every persisted collection
 *   - Transaction backup (v1, has "Expenses"/"Income" sheets)
 *   - Loan detail backup (has "Overview" sheet)
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   cd scripts
 *   npm install
 *
 *   # Import full/transaction backup
 *   node import-backup.js farm-backup-all-time-2026-07-17.xlsx
 *
 *   # Import loan detail backup
 *   node import-backup.js loan-SBI-detail.xlsx
 *
 *   # Dry run (preview without writing)
 *   node import-backup.js farm-backup.xlsx --dry-run
 *
 *   # Skip the automatic summary rebuild after import
 *   node import-backup.js farm-backup.xlsx --skip-summaries
 *
 * ────────────────────────────────────────────────────────────
 * FULL BACKUP (v2) SHEETS
 * ────────────────────────────────────────────────────────────
 *
 *   Meta                — Format Version / Exported At / per-sheet counts
 *   Expenses, Income    — transactions
 *   Loans               — all loans (simple + formal), all fields
 *   Loan Deductions / Loan Collateral / Loan Rate Changes /
 *   Loan Documents      — formal-loan embedded detail (by Loan ID)
 *   Loan Repayments     — loans/{id}/repayments subcollection (by Loan ID)
 *   Inventory Events    — stock change events
 *   Animals             — animal/batch registry
 *   Animal Costs / Animal Vaccinations / Animal Medical /
 *   Animal Weights      — animal embedded detail (by Animal ID)
 *   Buyers, Suppliers, Categories, Segments, Users,
 *   Tasks, Schedules, Breeding, Crop Activities              — one doc per row
 *   Harvests + Harvest Sales (by Harvest ID)
 *   Consumables + Stock Movements (by Item ID)               — inventoryItems
 *   Tags                — meta/tags single doc
 *
 * v1 files (no Meta sheet) still import: missing sheets are skipped.
 *
 * NOT covered (by design):
 *   - Soft-deleted docs (isDeleted: true) and per-doc timeline audit arrays
 *   - monthlySummaries/yearlySummaries — rebuilt automatically after import
 *   - Firebase Auth accounts — the Users sheet restores profile docs only
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
  const parts = String(str).split('/');
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

/** Like num() but preserves legitimate 0 and returns null for blank cells. */
function numOrNull(val) {
  if (val == null || val === '') return null;
  const n = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(n) ? null : n;
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

function splitSemi(val) {
  const s = str(val);
  return s ? s.split(';').map(x => x.trim()).filter(Boolean) : null;
}

function splitComma(val) {
  const s = str(val);
  return s ? s.split(',').map(x => x.trim()).filter(Boolean) : null;
}

/** Parse "id:amt; id:amt" pairs into a map, or null when blank. */
function parseIdAmtMap(val) {
  const s = str(val);
  if (!s) return null;
  return Object.fromEntries(
    s.split(';').map(x => x.trim()).filter(Boolean).map(x => {
      const idx = x.lastIndexOf(':');
      return [x.slice(0, idx).trim(), num(x.slice(idx + 1))];
    })
  );
}

function parseJson(val, fallback) {
  const s = str(val);
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

/** createdAt: preserve the exported timestamp when present, else server time. */
function createdAtOf(r) {
  return toTimestamp(str(r['Created At'])) || FieldValue.serverTimestamp();
}

function importTimeline(note) {
  return [{ action: 'created', by: 'import', byName: 'Import Script', at: admin.firestore.Timestamp.now(), changes: note || 'imported from backup' }];
}

function sheetRows(wb, name) {
  return wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name]) : [];
}

/** Group child-sheet rows by a parent-ID column. */
function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = str(r[key]);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

// ── Chunked batch writer (Firestore limit: 500 ops/batch) ──

const BATCH_CHUNK = 450;

async function commitOps(ops, dryRun) {
  if (dryRun) {
    console.log(`\n  [DRY RUN] ${ops.length} writes prepared, nothing committed`);
    return;
  }
  for (let i = 0; i < ops.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_CHUNK)) batch.set(op.ref, op.data);
    await batch.commit();
    console.log(`  Committed ${Math.min(i + BATCH_CHUNK, ops.length)}/${ops.length} writes`);
  }
}

// ── Meta sheet ─────────────────────────────────────────────

function readMeta(wb) {
  if (!wb.Sheets['Meta']) return { version: 1, counts: {} };
  const meta = {};
  for (const row of XLSX.utils.sheet_to_json(wb.Sheets['Meta'])) meta[row.Field] = row.Value;
  const counts = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith('Count: ')) counts[k.slice(7)] = num(v);
  }
  return { version: num(meta['Format Version']) || 1, exportedAt: str(meta['Exported At']), counts };
}

// ── Child-sheet row mappers (shared by backup + loan detail) ─

function mapDeduction(d, index) {
  return {
    id: str(d['ID']) || `ded_imp_${Date.now()}_${index}`,
    type: str(d['Type']), customLabel: str(d['Custom Label']) || null,
    amount: num(d['Amount']), paidTo: str(d['Paid To']),
    date: toTimestamp(str(d['Date'])) || admin.firestore.Timestamp.now(),
    paymentReference: str(d['Reference']) || null,
    isFinanced: bool(d['Financed']), note: str(d['Note']) || null,
  };
}

function mapCollateral(c, index) {
  return {
    id: str(c['ID']) || `col_imp_${Date.now()}_${index}`,
    type: str(c['Type']), description: str(c['Description']),
    estimatedValue: num(c['Value']), weight: numOrNull(c['Weight']),
    purity: str(c['Purity']) || null, documentReference: str(c['Document Ref']) || null,
    note: str(c['Note']) || null,
    isReleased: str(c['Status']).toLowerCase() === 'released',
    releasedDate: str(c['Status']).toLowerCase() === 'released' ? toTimestamp(str(c['Released Date'])) : null,
    itemName: str(c['Item Name']) || null,
    quantity: numOrNull(c['Quantity']),
    grossWeight: numOrNull(c['Gross Weight']),
    netWeight: numOrNull(c['Net Weight']),
    goldRatePerGram: numOrNull(c['Gold Rate Per Gram']),
    goldValue: numOrNull(c['Gold Value']),
  };
}

function mapRateChange(rc, index) {
  return {
    id: str(rc['ID']) || `rc_imp_${Date.now()}_${index}`,
    date: toTimestamp(str(rc['Date'])) || admin.firestore.Timestamp.now(),
    oldRate: num(rc['Old Rate']), newRate: num(rc['New Rate']),
    newEMI: numOrNull(rc['New EMI']), recordedBy: str(rc['Recorded By']) || 'import',
    recordedByName: str(rc['Recorded By Name']) || 'Import Script', note: str(rc['Note']) || null,
  };
}

function mapLoanDocument(d, index) {
  return {
    id: str(d['ID']) || `doc_imp_${Date.now()}_${index}`,
    type: str(d['Type']), customLabel: str(d['Custom Label']) || null,
    referenceNumber: str(d['Reference Number']) || null,
    date: toTimestamp(str(d['Date'])), note: str(d['Note']) || null,
  };
}

function mapRepayment(r, repId) {
  return {
    id: repId, date: toTimestamp(str(r['Date'])) || admin.firestore.Timestamp.now(),
    amount: num(r['Amount']), note: str(r['Note']),
    paidBy: str(r['Paid By']) || 'import', paidByName: str(r['Paid By Name']) || 'Import',
    recordedBy: str(r['Recorded By']) || 'import',
    recordedByName: str(r['Recorded By Name']) || 'Import Script',
    createdAt: createdAtOf(r),
    scheduledDueDate: toTimestamp(str(r['Scheduled Due Date'])),
    isEMIPayment: bool(r['EMI Payment']), emiNumber: numOrNull(r['EMI Number']),
    principalPortion: numOrNull(r['Principal']), interestPortion: numOrNull(r['Interest']),
    isPartPayment: bool(r['Part Payment']), isPreClosure: bool(r['Pre-closure']),
    preClosureCharges: numOrNull(r['Pre-closure Charges']),
    penaltyAmount: numOrNull(r['Penalty']), paymentReference: str(r['Reference']) || null,
    transactionId: str(r['Transaction ID']) || null,
  };
}

// ── Import Transaction / Full Backup ───────────────────────

async function importBackup(wb, dryRun) {
  const stats = {};
  const ops = [];
  const count = (key, n) => { stats[key] = (stats[key] || 0) + (n == null ? 1 : n); };

  // Expenses
  {
    const rows = sheetRows(wb, 'Expenses');
    if (rows.length) console.log(`  Expenses sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('transactions').doc().id;
      const txnDate = parseDate(str(r['Date'])) || new Date();
      const month = str(r['Month']) || monthStr(txnDate);
      ops.push({ ref: db.collection('transactions').doc(id), data: {
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
        createdAt: createdAtOf(r),
        isDeleted: false,
        timeline: importTimeline(),
        expensePaymentStatus: str(r['Payment Status']) || 'paid',
        linkedLoanId: str(r['Linked Loan ID']) || null,
        tags: splitComma(r['Tags']),
        linkedAnimalIds: splitSemi(r['Linked Animal IDs']),
        linkedAnimalNames: splitSemi(r['Linked Animal Names']),
        animalCostSplit: parseIdAmtMap(r['Animal Cost Split']),
        linkedBuyerId: str(r['Linked Buyer ID']) || null,
        linkedBuyerName: str(r['Linked Buyer Name']) || null,
        linkedSupplierId: str(r['Linked Supplier ID']) || null,
        linkedSupplierName: str(r['Linked Supplier Name']) || null,
        linkedHarvestId: str(r['Linked Harvest ID']) || null,
        linkedHarvestName: str(r['Linked Harvest Name']) || null,
        linkedSaleTransactionId: str(r['Linked Sale Txn ID']) || null,
        linkedSaleLabel: str(r['Linked Sale Label']) || null,
        month, year: txnDate.getFullYear(),
      }});
      count('expenses');
    }
  }

  // Income
  {
    const rows = sheetRows(wb, 'Income');
    if (rows.length) console.log(`  Income sheet: ${rows.length} rows`);
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

      ops.push({ ref: db.collection('transactions').doc(id), data: {
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
        createdAt: createdAtOf(r),
        isDeleted: false,
        timeline: importTimeline(),
        paymentStatus: str(r['Payment Status']) || 'received',
        distributions: distributions.length > 0 ? distributions : null,
        tags: splitComma(r['Tags']),
        linkedAnimalIds: splitSemi(r['Linked Animal IDs']),
        linkedAnimalNames: splitSemi(r['Linked Animal Names']),
        animalCostSplit: parseIdAmtMap(r['Animal Cost Split']),
        linkedBuyerId: str(r['Linked Buyer ID']) || null,
        linkedBuyerName: str(r['Linked Buyer Name']) || null,
        linkedHarvestId: str(r['Linked Harvest ID']) || null,
        linkedHarvestName: str(r['Linked Harvest Name']) || null,
        month, year: txnDate.getFullYear(),
      }});
      count('income');
    }
  }

  // Loan child sheets — grouped by Loan ID, attached to formal loan docs
  const dedByLoan = groupBy(sheetRows(wb, 'Loan Deductions'), 'Loan ID');
  const colByLoan = groupBy(sheetRows(wb, 'Loan Collateral'), 'Loan ID');
  const rcByLoan = groupBy(sheetRows(wb, 'Loan Rate Changes'), 'Loan ID');
  const docByLoan = groupBy(sheetRows(wb, 'Loan Documents'), 'Loan ID');

  // Loans
  {
    const rows = sheetRows(wb, 'Loans');
    if (rows.length) console.log(`  Loans sheet: ${rows.length} rows`);
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
        createdAt: createdAtOf(r), isDeleted: false,
        timeline: importTimeline(),
        month, year: loanDate.getFullYear(),
        loanCategory: str(r['Category']) || 'simple',
        parentFormalLoanId: str(r['Parent Formal Loan']) || null,
      };

      if (isFormal) {
        const deductions = (dedByLoan.get(id) || []).map(mapDeduction);
        const collaterals = (colByLoan.get(id) || []).map(mapCollateral);
        const rateChanges = (rcByLoan.get(id) || []).map(mapRateChange);
        const documents = (docByLoan.get(id) || []).map(mapLoanDocument);
        count('loanDeductions', deductions.length);
        count('loanCollateral', collaterals.length);
        count('loanRateChanges', rateChanges.length);
        count('loanDocuments', documents.length);

        Object.assign(loanDoc, {
          loanSource: str(r['Source']) || null,
          loanSourceName: str(r['Source Name']) || null,
          accountNumber: str(r['Account']) || null,
          sanctionedAmount: num(r['Sanctioned']),
          netDisbursedAmount: num(r['Net Disbursed']),
          totalDeductions: num(r['Total Deductions']),
          deductions: deductions.length > 0 ? deductions : null,
          disbursementDate: toTimestamp(str(r['Disbursement Date'])),
          repaymentType: str(r['Repayment Type']) || 'emi',
          interestType: str(r['Interest Type']) || 'fixed',
          interestFrequency: str(r['Interest Frequency']) || 'annual',
          interestRateInput: num(r['Interest Rate Input']),
          interestRate: num(r['Interest Rate Annual']),
          isSubsidized: bool(r['Is Subsidized']),
          subsidyDetails: str(r['Subsidy Details']) || null,
          effectiveRate: num(r['Effective Rate']) || null,
          tenure: num(r['Tenure']) || null,
          emiAmount: num(r['EMI Amount']) || null,
          totalEMIs: num(r['Total EMIs']) || null,
          emisPaid: num(r['EMIs Paid']),
          moratoriumMonths: num(r['Moratorium']),
          emiStartDate: toTimestamp(str(r['EMI Start Date'])),
          nextPaymentDueDate: toTimestamp(str(r['Next Payment Due'])),
          nextPaymentNumber: numOrNull(r['Next Payment Number']),
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
          segments: splitSemi(r['Segments']),
          segmentNames: splitSemi(r['Segment Names']),
          collaterals: collaterals.length > 0 ? collaterals : null,
          totalCollateralValue: num(r['Collateral Value']) || null,
          rateChanges: rateChanges.length > 0 ? rateChanges : null,
          documents: documents.length > 0 ? documents : null,
          pledgeReceiptNumber: str(r['Pledge Receipt']) || null,
          ltvRatio: numOrNull(r['LTV Ratio']),
          totalGoldWeight: numOrNull(r['Total Gold Weight']),
          totalGoldValue: numOrNull(r['Total Gold Value']),
          eligibleLoanAmount: numOrNull(r['Eligible Loan Amount']),
          renewedFromLoanId: str(r['Renewed From Loan']) || null,
          renewedByLoanId: str(r['Renewed By Loan']) || null,
          isRenewal: bool(r['Is Renewal']),
        });
      }

      ops.push({ ref: db.collection('loans').doc(id), data: loanDoc });
      count('loans');
    }
  }

  // Loan Repayments (subcollection docs, grouped by Loan ID)
  {
    const rows = sheetRows(wb, 'Loan Repayments');
    if (rows.length) console.log(`  Loan Repayments sheet: ${rows.length} rows`);
    for (const r of rows) {
      const loanId = str(r['Loan ID']);
      if (!loanId) continue;
      const repId = str(r['ID']) || db.collection(`loans/${loanId}/repayments`).doc().id;
      ops.push({ ref: db.collection(`loans/${loanId}/repayments`).doc(repId), data: mapRepayment(r, repId) });
      count('loanRepayments');
    }
  }

  // Inventory Events
  {
    const rows = sheetRows(wb, 'Inventory Events');
    if (rows.length) console.log(`  Inventory Events sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('inventoryEvents').doc().id;
      const eventDate = parseDate(str(r['Date'])) || new Date();
      const month = str(r['Month']) || monthStr(eventDate);
      ops.push({ ref: db.collection('inventoryEvents').doc(id), data: {
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
        estimatedValue: numOrNull(r['Estimated Value']),
        linkedAnimalIds: splitSemi(r['Linked Animal IDs']),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('inventoryEvents');
    }
  }

  // Animal child sheets — embedded detail grouped by Animal ID
  const costsByAnimal = groupBy(sheetRows(wb, 'Animal Costs'), 'Animal ID');
  const vaccByAnimal = groupBy(sheetRows(wb, 'Animal Vaccinations'), 'Animal ID');
  const medByAnimal = groupBy(sheetRows(wb, 'Animal Medical'), 'Animal ID');
  const weightsByAnimal = groupBy(sheetRows(wb, 'Animal Weights'), 'Animal ID');

  // Animals
  {
    const rows = sheetRows(wb, 'Animals');
    if (rows.length) console.log(`  Animals sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('animals').doc().id;
      const originDate = parseDate(str(r['Origin Date'])) || new Date();
      const month = monthStr(originDate);

      const costEntries = (costsByAnimal.get(id) || []).map(c => ({
        transactionId: str(c['Transaction ID']),
        date: toTimestamp(str(c['Date'])) || admin.firestore.Timestamp.now(),
        category: str(c['Category']),
        categoryName: str(c['Category Name']) || str(c['Category']),
        amount: num(c['Amount']),
        description: str(c['Description']) || null,
      }));
      const vaccinationHistory = (vaccByAnimal.get(id) || []).map((v, i) => ({
        id: str(v['ID']) || `vac_imp_${Date.now()}_${i}`,
        date: toTimestamp(str(v['Date'])) || admin.firestore.Timestamp.now(),
        vaccineName: str(v['Vaccine']),
        dosage: str(v['Dosage']) || null,
        administeredBy: str(v['Administered By']) || null,
        nextDueDate: toTimestamp(str(v['Next Due Date'])),
        batchNumber: str(v['Batch Number']) || null,
        cost: numOrNull(v['Cost']),
        linkedTransactionId: str(v['Linked Txn ID']) || null,
        note: str(v['Note']) || null,
      }));
      const medicalHistory = (medByAnimal.get(id) || []).map((m, i) => ({
        id: str(m['ID']) || `med_imp_${Date.now()}_${i}`,
        date: toTimestamp(str(m['Date'])) || admin.firestore.Timestamp.now(),
        type: str(m['Type']) || 'treatment',
        disease: str(m['Disease']) || null,
        symptoms: str(m['Symptoms']) || null,
        medicine: str(m['Medicine']) || null,
        dosage: str(m['Dosage']) || null,
        doctor: str(m['Doctor']) || null,
        temperature: numOrNull(m['Temperature']),
        weight: numOrNull(m['Weight']),
        cost: numOrNull(m['Cost']),
        linkedTransactionId: str(m['Linked Txn ID']) || null,
        note: str(m['Note']) || null,
      }));
      const weightLogs = (weightsByAnimal.get(id) || []).map((w, i) => ({
        id: str(w['ID']) || `wt_imp_${Date.now()}_${i}`,
        date: toTimestamp(str(w['Date'])) || admin.firestore.Timestamp.now(),
        weight: num(w['Weight']),
        remarks: str(w['Remarks']) || null,
      }));
      count('animalCosts', costEntries.length);
      count('animalVaccinations', vaccinationHistory.length);
      count('animalMedical', medicalHistory.length);
      count('animalWeights', weightLogs.length);

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
        originInventoryEventId: str(r['Origin Event ID']) || null,
        purchasePrice: num(r['Purchase Price']),
        purchasePricePerHead: numOrNull(r['Purchase Price Per Head']),
        status: str(r['Status']) || 'active',
        totalCosts: num(r['Total Costs']),
        totalInvested: num(r['Total Invested']),
        costEntries,
        salePrice: num(r['Sale Price']) || null,
        salePricePerHead: numOrNull(r['Sale Price Per Head']),
        profit: num(r['Profit']) || null,
        profitMargin: num(r['Profit Margin %']) || null,
        buyerId: str(r['Buyer ID']) || null,
        buyerName: str(r['Buyer']) || null,
        exitDate: toTimestamp(str(r['Exit Date'])),
        exitType: str(r['Exit Type']) || null,
        saleTransactionId: str(r['Sale Txn ID']) || null,
        saleInventoryEventId: str(r['Sale Event ID']) || null,
        deathCause: str(r['Death Cause']) || null,
        deathNote: str(r['Death Note']) || null,
        ageAtDeathDays: numOrNull(r['Age At Death Days']),
        note: str(r['Note']) || null,
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
        month,
        year: originDate.getFullYear(),
      };
      if (vaccinationHistory.length) animalDoc.vaccinationHistory = vaccinationHistory;
      if (medicalHistory.length) animalDoc.medicalHistory = medicalHistory;
      if (weightLogs.length) animalDoc.weightLogs = weightLogs;

      ops.push({ ref: db.collection('animals').doc(id), data: animalDoc });
      count('animals');
    }
  }

  // Buyers
  {
    const rows = sheetRows(wb, 'Buyers');
    if (rows.length) console.log(`  Buyers sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('buyers').doc().id;
      ops.push({ ref: db.collection('buyers').doc(id), data: {
        id,
        name: str(r['Name']),
        phone: str(r['Phone']) || '',
        location: str(r['Location']) || '',
        note: str(r['Note']) || '',
        totalPurchases: num(r['Total Purchases']),
        totalAmountPaid: num(r['Total Amount Paid']),
        averageRate: num(r['Average Rate']) || null,
        lastPurchaseDate: toTimestamp(str(r['Last Purchase'])),
        purchasesBySegment: parseIdAmtMap(r['Purchases By Segment']),
        amountBySegment: parseIdAmtMap(r['Amount By Segment']),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('buyers');
    }
  }

  // Suppliers
  {
    const rows = sheetRows(wb, 'Suppliers');
    if (rows.length) console.log(`  Suppliers sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('suppliers').doc().id;
      ops.push({ ref: db.collection('suppliers').doc(id), data: {
        id,
        name: str(r['Name']),
        phone: str(r['Phone']) || null,
        location: str(r['Location']) || null,
        gstNumber: str(r['GST Number']) || null,
        itemCategories: splitSemi(r['Item Categories']),
        totalOrders: num(r['Total Orders']),
        totalAmountPaid: num(r['Total Amount Paid']),
        pendingAmount: num(r['Pending Amount']),
        averageRate: numOrNull(r['Average Rate']),
        lastOrderDate: toTimestamp(str(r['Last Order Date'])),
        ordersBySegment: parseIdAmtMap(r['Orders By Segment']),
        amountBySegment: parseIdAmtMap(r['Amount By Segment']),
        note: str(r['Note']) || null,
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('suppliers');
    }
  }

  // Categories
  {
    const rows = sheetRows(wb, 'Categories');
    if (rows.length) console.log(`  Categories sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('categories').doc().id;
      ops.push({ ref: db.collection('categories').doc(id), data: {
        id,
        name: str(r['Name']),
        type: str(r['Type']) || 'expense',
        isActive: bool(r['Active']),
        segments: splitSemi(r['Segments']),
      }});
      count('categories');
    }
  }

  // Segments
  {
    const rows = sheetRows(wb, 'Segments');
    if (rows.length) console.log(`  Segments sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('segments').doc().id;
      const expenseLimit = numOrNull(r['Monthly Expense Limit']);
      const incomeTarget = numOrNull(r['Monthly Income Target']);
      const segDoc = {
        id,
        name: str(r['Name']),
        description: str(r['Description']) || '',
        icon: str(r['Icon']) || '',
        isActive: bool(r['Active']),
        segmentType: str(r['Segment Type']) || null,
        unit: str(r['Unit']) || null,
        currentStock: numOrNull(r['Current Stock']),
        breeds: splitSemi(r['Breeds']),
        createdAt: createdAtOf(r),
      };
      if (expenseLimit != null || incomeTarget != null) {
        segDoc.budgets = {};
        if (expenseLimit != null) segDoc.budgets.monthlyExpenseLimit = expenseLimit;
        if (incomeTarget != null) segDoc.budgets.monthlyIncomeTarget = incomeTarget;
      }
      ops.push({ ref: db.collection('segments').doc(id), data: segDoc });
      count('segments');
    }
  }

  // Users (doc ID = UID; restores Firestore profile docs, not Auth accounts)
  {
    const rows = sheetRows(wb, 'Users');
    if (rows.length) console.log(`  Users sheet: ${rows.length} rows`);
    for (const r of rows) {
      const uid = str(r['UID']);
      if (!uid) continue;
      ops.push({ ref: db.collection('users').doc(uid), data: {
        uid,
        email: str(r['Email']),
        displayName: str(r['Display Name']),
        role: str(r['Role']) || 'viewer',
        assignedSegments: splitSemi(r['Assigned Segments']) || [],
        isActive: bool(r['Active']),
        createdBy: str(r['Created By']) || 'import',
        createdAt: createdAtOf(r),
        updatedAt: toTimestamp(str(r['Updated At'])) || FieldValue.serverTimestamp(),
      }});
      count('users');
    }
  }

  // Tasks
  {
    const rows = sheetRows(wb, 'Tasks');
    if (rows.length) console.log(`  Tasks sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('tasks').doc().id;
      ops.push({ ref: db.collection('tasks').doc(id), data: {
        id,
        title: str(r['Title']),
        description: str(r['Description']) || '',
        priority: str(r['Priority']) || 'medium',
        status: str(r['Status']) || 'todo',
        visibility: str(r['Visibility']) || 'shared',
        assignee: str(r['Assignee']) || null,
        assigneeName: str(r['Assignee Name']) || null,
        dueDate: toTimestamp(str(r['Due Date'])),
        subtasks: parseJson(r['Subtasks'], []),
        tags: splitComma(r['Tags']) || [],
        kanbanOrder: num(r['Kanban Order']),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        updatedAt: toTimestamp(str(r['Updated At'])) || FieldValue.serverTimestamp(),
        completedAt: toTimestamp(str(r['Completed At'])),
        isDeleted: false,
      }});
      count('tasks');
    }
  }

  // Schedules
  {
    const rows = sheetRows(wb, 'Schedules');
    if (rows.length) console.log(`  Schedules sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('schedules').doc().id;
      ops.push({ ref: db.collection('schedules').doc(id), data: {
        id,
        type: str(r['Type']) || 'reminder',
        title: str(r['Title']),
        description: str(r['Description']) || '',
        frequency: str(r['Frequency']) || 'monthly',
        startDate: toTimestamp(str(r['Start Date'])) || admin.firestore.Timestamp.now(),
        endDate: toTimestamp(str(r['End Date'])),
        nextDueDate: toTimestamp(str(r['Next Due Date'])) || admin.firestore.Timestamp.now(),
        lastProcessedDate: toTimestamp(str(r['Last Processed'])),
        transactionTemplate: parseJson(r['Transaction Template'], null),
        reminderConfig: parseJson(r['Reminder Config'], null),
        isActive: bool(r['Active']),
        isDeleted: false,
        processedCount: num(r['Processed Count']),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
      }});
      count('schedules');
    }
  }

  // Harvests (+ Harvest Sales child sheet)
  {
    const salesByHarvest = groupBy(sheetRows(wb, 'Harvest Sales'), 'Harvest ID');
    const rows = sheetRows(wb, 'Harvests');
    if (rows.length) console.log(`  Harvests sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('harvests').doc().id;
      const harvestDate = parseDate(str(r['Harvest Date'])) || new Date();
      const sales = (salesByHarvest.get(id) || []).map((s, i) => ({
        id: str(s['ID']) || `hs_imp_${Date.now()}_${i}`,
        date: toTimestamp(str(s['Date'])) || admin.firestore.Timestamp.now(),
        quantity: num(s['Quantity']),
        unit: str(s['Unit']),
        ratePerUnit: num(s['Rate Per Unit']),
        totalAmount: num(s['Total Amount']),
        buyerId: str(s['Buyer ID']) || null,
        buyerName: str(s['Buyer Name']) || null,
        linkedTransactionId: str(s['Linked Txn ID']) || null,
        note: str(s['Note']) || null,
      }));
      count('harvestSales', sales.length);
      ops.push({ ref: db.collection('harvests').doc(id), data: {
        id,
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        status: str(r['Status']) || 'harvested',
        harvestDate: admin.firestore.Timestamp.fromDate(harvestDate),
        cropName: str(r['Crop Name']),
        variety: str(r['Variety']) || null,
        totalQuantity: num(r['Total Quantity']),
        unit: str(r['Unit']),
        grade: str(r['Grade']) || null,
        storageLocation: str(r['Storage Location']) || null,
        storageDate: toTimestamp(str(r['Storage Date'])),
        sales,
        totalSold: num(r['Total Sold']),
        totalRevenue: num(r['Total Revenue']),
        wastageQuantity: num(r['Wastage Quantity']),
        wastageReason: str(r['Wastage Reason']) || null,
        wastageDate: toTimestamp(str(r['Wastage Date'])),
        remainingQuantity: num(r['Remaining Quantity']),
        averageRate: numOrNull(r['Average Rate']),
        harvestCost: numOrNull(r['Harvest Cost']),
        linkedCropActivityId: str(r['Linked Crop Activity ID']) || null,
        note: str(r['Note']) || null,
        month: str(r['Month']) || monthStr(harvestDate),
        year: num(r['Year']) || harvestDate.getFullYear(),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('harvests');
    }
  }

  // Breeding
  {
    const rows = sheetRows(wb, 'Breeding');
    if (rows.length) console.log(`  Breeding sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('breedingRecords').doc().id;
      const matingDate = parseDate(str(r['Mating Date'])) || new Date();
      ops.push({ ref: db.collection('breedingRecords').doc(id), data: {
        id,
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        sireId: str(r['Sire ID']) || null,
        sireName: str(r['Sire Name']) || null,
        damId: str(r['Dam ID']),
        damName: str(r['Dam Name']),
        matingDate: admin.firestore.Timestamp.fromDate(matingDate),
        matingMethod: str(r['Mating Method']) || null,
        status: str(r['Status']) || 'mated',
        expectedDeliveryDate: toTimestamp(str(r['Expected Delivery'])),
        gestationDays: numOrNull(r['Gestation Days']),
        actualDeliveryDate: toTimestamp(str(r['Actual Delivery'])),
        offspringCount: numOrNull(r['Offspring Count']),
        offspringMale: numOrNull(r['Offspring Male']),
        offspringFemale: numOrNull(r['Offspring Female']),
        offspringAnimalIds: splitSemi(r['Offspring Animal IDs']),
        complications: str(r['Complications']) || null,
        veterinaryCost: numOrNull(r['Veterinary Cost']),
        linkedTransactionId: str(r['Linked Txn ID']) || null,
        note: str(r['Note']) || null,
        month: str(r['Month']) || monthStr(matingDate),
        year: num(r['Year']) || matingDate.getFullYear(),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('breeding');
    }
  }

  // Crop Activities
  {
    const rows = sheetRows(wb, 'Crop Activities');
    if (rows.length) console.log(`  Crop Activities sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('cropActivities').doc().id;
      const actDate = parseDate(str(r['Date'])) || new Date();
      ops.push({ ref: db.collection('cropActivities').doc(id), data: {
        id,
        date: admin.firestore.Timestamp.fromDate(actDate),
        segment: str(r['Segment']),
        segmentName: str(r['Segment Name']) || str(r['Segment']),
        activityType: str(r['Activity Type']) || 'other',
        description: str(r['Description']) || '',
        productUsed: str(r['Product Used']) || null,
        quantity: numOrNull(r['Quantity']),
        unit: str(r['Unit']) || null,
        area: str(r['Area']) || null,
        duration: numOrNull(r['Duration']),
        laborCount: numOrNull(r['Labor Count']),
        cost: numOrNull(r['Cost']),
        linkedTransactionId: str(r['Linked Txn ID']) || null,
        weather: str(r['Weather']) || null,
        temperature: numOrNull(r['Temperature']),
        note: str(r['Note']) || null,
        month: str(r['Month']) || monthStr(actDate),
        year: num(r['Year']) || actDate.getFullYear(),
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('cropActivities');
    }
  }

  // Consumables (inventoryItems, + Stock Movements child sheet)
  {
    const movementsByItem = groupBy(sheetRows(wb, 'Stock Movements'), 'Item ID');
    const rows = sheetRows(wb, 'Consumables');
    if (rows.length) console.log(`  Consumables sheet: ${rows.length} rows`);
    for (const r of rows) {
      const id = str(r['ID']) || db.collection('inventoryItems').doc().id;
      const movements = (movementsByItem.get(id) || []).map((m, i) => ({
        id: str(m['ID']) || `mv_imp_${Date.now()}_${i}`,
        date: toTimestamp(str(m['Date'])) || admin.firestore.Timestamp.now(),
        type: str(m['Type']) || 'adjustment',
        quantity: num(m['Quantity']),
        unitCost: numOrNull(m['Unit Cost']),
        totalCost: numOrNull(m['Total Cost']),
        linkedTransactionId: str(m['Linked Txn ID']) || null,
        supplierId: str(m['Supplier ID']) || null,
        supplierName: str(m['Supplier Name']) || null,
        note: str(m['Note']) || null,
        recordedBy: str(m['Recorded By']) || 'import',
        recordedByName: str(m['Recorded By Name']) || 'Import Script',
      }));
      count('stockMovements', movements.length);
      ops.push({ ref: db.collection('inventoryItems').doc(id), data: {
        id,
        name: str(r['Name']),
        category: str(r['Category']) || 'other',
        unit: str(r['Unit']),
        currentStock: num(r['Current Stock']),
        minimumStock: numOrNull(r['Minimum Stock']),
        segments: splitSemi(r['Segments']) || [],
        segmentNames: splitSemi(r['Segment Names']) || [],
        movements,
        totalPurchased: num(r['Total Purchased']),
        totalUsed: num(r['Total Used']),
        totalWastage: num(r['Total Wastage']),
        totalSpent: num(r['Total Spent']),
        lastPurchaseRate: numOrNull(r['Last Purchase Rate']),
        averagePurchaseRate: numOrNull(r['Average Purchase Rate']),
        note: str(r['Note']) || null,
        createdBy: str(r['Created By']) || 'import',
        createdByName: str(r['Created By Name']) || 'Import Script',
        createdAt: createdAtOf(r),
        isDeleted: false,
      }});
      count('consumables');
    }
  }

  // Tags (single meta/tags doc)
  {
    const rows = sheetRows(wb, 'Tags');
    if (rows.length) {
      console.log(`  Tags sheet: ${rows.length} rows`);
      const all = rows.map(r => str(r['Tag'])).filter(Boolean);
      ops.push({ ref: db.collection('meta').doc('tags'), data: { all } });
      count('tags', all.length);
    }
  }

  await commitOps(ops, dryRun);
  return stats;
}

// ── Rebuild monthly/yearly summaries from transactions ─────
// Port of SummaryReconciliationService (summary-reconciliation.service.ts)

function personSummaryKey(paidBy, paidByName, fallbackUid) {
  if (paidBy === 'other' && paidByName) {
    const normalized = paidByName.trim().replace(/\s+/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return normalized.replace(/[.$/\[\]#]/g, '_');
  }
  return paidBy || fallbackUid;
}

function createEmptyAccumulator() {
  return {
    totalExpense: 0, totalIncome: 0,
    expenseByCategory: {}, incomeBySource: {},
    expenseByCategoryId: {}, incomeBySourceId: {},
    expenseByPerson: {}, incomeByPerson: {},
    pendingIncome: 0, pendingExpense: 0,
    totalDistributed: 0, distributionByPerson: {},
  };
}

function accumulateTransaction(acc, txn) {
  const personKey = personSummaryKey(txn.paidBy, txn.paidByName, txn.createdBy);

  if (txn.type === 'expense') {
    acc.totalExpense += txn.amount;
    acc.expenseByCategory[txn.categoryName] = (acc.expenseByCategory[txn.categoryName] || 0) + txn.amount;
    acc.expenseByCategoryId[txn.category] = (acc.expenseByCategoryId[txn.category] || 0) + txn.amount;
    acc.expenseByPerson[personKey] = (acc.expenseByPerson[personKey] || 0) + txn.amount;
    if ((txn.expensePaymentStatus || 'paid') === 'pending') acc.pendingExpense += txn.amount;
  } else {
    acc.totalIncome += txn.amount;
    acc.incomeBySource[txn.categoryName] = (acc.incomeBySource[txn.categoryName] || 0) + txn.amount;
    acc.incomeBySourceId[txn.category] = (acc.incomeBySourceId[txn.category] || 0) + txn.amount;
    acc.incomeByPerson[personKey] = (acc.incomeByPerson[personKey] || 0) + txn.amount;
    if ((txn.paymentStatus || 'received') === 'pending') acc.pendingIncome += txn.amount;
  }

  if (txn.distributions?.length) {
    for (const d of txn.distributions) {
      acc.totalDistributed += d.amount;
      acc.distributionByPerson[d.uid] = (acc.distributionByPerson[d.uid] || 0) + d.amount;
    }
  }
}

async function rebuildSummaries() {
  console.log('');
  console.log('Rebuilding monthly/yearly summaries from transactions...');
  const snap = await db.collection('transactions').where('isDeleted', '==', false).get();
  const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const monthlyMap = new Map();
  const yearlyMap = new Map();
  for (const txn of transactions) {
    const monthKey = `${txn.month}-${txn.segment}`;
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { acc: createEmptyAccumulator(), month: txn.month, year: txn.year, segment: txn.segment });
    }
    accumulateTransaction(monthlyMap.get(monthKey).acc, txn);

    const yearKey = `${txn.year}-${txn.segment}`;
    if (!yearlyMap.has(yearKey)) {
      yearlyMap.set(yearKey, { acc: createEmptyAccumulator(), year: txn.year, segment: txn.segment });
    }
    accumulateTransaction(yearlyMap.get(yearKey).acc, txn);
  }

  const summaryData = (acc, extra) => ({
    ...extra,
    totalExpense: acc.totalExpense,
    totalIncome: acc.totalIncome,
    netProfit: acc.totalIncome - acc.totalExpense,
    expenseByCategory: acc.expenseByCategory,
    incomeBySource: acc.incomeBySource,
    expenseByCategoryId: acc.expenseByCategoryId,
    incomeBySourceId: acc.incomeBySourceId,
    expenseByPerson: acc.expenseByPerson,
    incomeByPerson: acc.incomeByPerson,
    pendingIncome: acc.pendingIncome,
    pendingExpense: acc.pendingExpense,
    totalDistributed: acc.totalDistributed,
    distributionByPerson: acc.distributionByPerson,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Orphaned summary docs (no matching transactions anymore) get deleted
  const [existingMonthly, existingYearly] = await Promise.all([
    db.collection('monthlySummaries').get(),
    db.collection('yearlySummaries').get(),
  ]);
  const orphanedMonthly = existingMonthly.docs.map(d => d.id).filter(id => !monthlyMap.has(id));
  const orphanedYearly = existingYearly.docs.map(d => d.id).filter(id => !yearlyMap.has(id));

  const writes = [];
  for (const [key, { acc, month, year, segment }] of monthlyMap) {
    writes.push({ ref: db.collection('monthlySummaries').doc(key), data: summaryData(acc, { month, year, segment }) });
  }
  for (const [key, { acc, year, segment }] of yearlyMap) {
    writes.push({ ref: db.collection('yearlySummaries').doc(key), data: summaryData(acc, { year, segment }) });
  }
  for (const id of orphanedMonthly) writes.push({ ref: db.collection('monthlySummaries').doc(id), isDelete: true });
  for (const id of orphanedYearly) writes.push({ ref: db.collection('yearlySummaries').doc(id), isDelete: true });

  for (let i = 0; i < writes.length; i += BATCH_CHUNK) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH_CHUNK)) {
      if (w.isDelete) batch.delete(w.ref);
      else batch.set(w.ref, w.data);
    }
    await batch.commit();
  }

  console.log(`  ${transactions.length} transactions → ${monthlyMap.size} monthly + ${yearlyMap.size} yearly summaries`);
  if (orphanedMonthly.length || orphanedYearly.length) {
    console.log(`  Deleted ${orphanedMonthly.length + orphanedYearly.length} orphaned summary docs`);
  }
}

// ── Import Loan Detail ─────────────────────────────────────

async function importLoanDetail(wb, dryRun) {
  const stats = { loan: false, repayments: 0, utilizations: 0, personalLoans: 0 };
  const ops = [];

  // Overview
  const overviewRows = XLSX.utils.sheet_to_json(wb.Sheets['Overview']);
  const overview = {};
  for (const row of overviewRows) overview[row.Field] = row.Value;

  const loanId = str(overview['ID']);
  if (!loanId) { console.error('  ERROR: Loan ID missing in Overview'); return stats; }

  console.log(`  Loan: ${str(overview['Source Name'])} (${loanId})`);

  const deductions = sheetRows(wb, 'Deductions').map(mapDeduction);
  const collaterals = sheetRows(wb, 'Collateral').map(mapCollateral);
  const rateChanges = sheetRows(wb, 'Rate Changes').map(mapRateChange);
  const documents = sheetRows(wb, 'Documents').map(mapLoanDocument);

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
    timeline: importTimeline('imported from Excel backup'),
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
    segments: splitSemi(overview['Segments']),
  };

  ops.push({ ref: db.collection('loans').doc(loanId), data: loanDoc });
  stats.loan = true;

  // Repayments
  {
    const rows = sheetRows(wb, 'Repayments');
    if (rows.length) console.log(`  Repayments: ${rows.length} rows`);
    for (const r of rows) {
      const repId = str(r['ID']) || db.collection(`loans/${loanId}/repayments`).doc().id;
      ops.push({ ref: db.collection(`loans/${loanId}/repayments`).doc(repId), data: mapRepayment(r, repId) });
      stats.repayments++;
    }
  }

  // Utilization (linked transactions)
  {
    const rows = sheetRows(wb, 'Utilization');
    if (rows.length) console.log(`  Utilization: ${rows.length} rows`);
    for (const t of rows) {
      const txnId = str(t['ID']) || db.collection('transactions').doc().id;
      const txnDate = parseDate(str(t['Date'])) || new Date();
      const month = str(t['Month']) || monthStr(txnDate);
      ops.push({ ref: db.collection('transactions').doc(txnId), data: {
        id: txnId, type: 'expense',
        date: admin.firestore.Timestamp.fromDate(txnDate), amount: num(t['Amount']),
        category: str(t['Category']), categoryName: str(t['Category Name']),
        segment: str(t['Segment']), segmentName: str(t['Segment Name']),
        description: str(t['Description']), paymentMethod: str(t['Payment Method']) || 'upi',
        paidBy: str(t['Paid By']) || 'import', paidByName: str(t['Paid By Name']) || 'Import',
        createdBy: 'import', createdByName: 'Import Script',
        createdAt: FieldValue.serverTimestamp(), isDeleted: false,
        timeline: importTimeline(),
        expensePaymentStatus: 'paid', linkedLoanId: loanId, month, year: txnDate.getFullYear(),
      }});
      stats.utilizations++;
    }
  }

  // Personal Withdrawals (linked simple loans)
  {
    const rows = sheetRows(wb, 'Personal');
    if (rows.length) console.log(`  Personal: ${rows.length} rows`);
    for (const sl of rows) {
      const slId = str(sl['ID']) || db.collection('loans').doc().id;
      const slDate = parseDate(str(sl['Date'])) || new Date();
      const month = monthStr(slDate);
      ops.push({ ref: db.collection('loans').doc(slId), data: {
        id: slId, date: admin.firestore.Timestamp.fromDate(slDate),
        amount: num(sl['Amount']), type: 'given',
        personName: str(sl['Person']), personUid: str(sl['Person UID']) || null,
        purpose: str(sl['Purpose']), segment: str(sl['Segment']) || loanDoc.segment,
        segmentName: str(sl['Segment']) || loanDoc.segmentName,
        repaymentStatus: str(sl['Status']) || 'pending',
        totalRepaid: num(sl['Repaid']), balanceRemaining: num(sl['Holding']),
        recordedBy: 'import', recordedByName: 'Import Script',
        createdAt: FieldValue.serverTimestamp(), isDeleted: false,
        timeline: importTimeline(),
        month, year: slDate.getFullYear(),
        loanCategory: 'simple', parentFormalLoanId: str(sl['Parent Loan ID']) || loanId,
      }});
      stats.personalLoans++;
    }
  }

  await commitOps(ops, dryRun);
  return stats;
}

// ── Main ───────────────────────────────────────────────────

// Maps Meta "Count: <Sheet>" names to importBackup stats keys for verification
const SHEET_STAT_KEYS = {
  'Expenses': 'expenses', 'Income': 'income', 'Loans': 'loans',
  'Loan Deductions': 'loanDeductions', 'Loan Collateral': 'loanCollateral',
  'Loan Rate Changes': 'loanRateChanges', 'Loan Documents': 'loanDocuments',
  'Loan Repayments': 'loanRepayments', 'Inventory Events': 'inventoryEvents',
  'Animals': 'animals', 'Animal Costs': 'animalCosts',
  'Animal Vaccinations': 'animalVaccinations', 'Animal Medical': 'animalMedical',
  'Animal Weights': 'animalWeights', 'Buyers': 'buyers', 'Suppliers': 'suppliers',
  'Categories': 'categories', 'Segments': 'segments', 'Users': 'users',
  'Tasks': 'tasks', 'Schedules': 'schedules', 'Harvests': 'harvests',
  'Harvest Sales': 'harvestSales', 'Breeding': 'breeding',
  'Crop Activities': 'cropActivities', 'Consumables': 'consumables',
  'Stock Movements': 'stockMovements', 'Tags': 'tags',
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipSummaries = args.includes('--skip-summaries');
  const filePath = args.find(a => !a.startsWith('--'));

  if (!filePath) {
    console.error('Usage: node import-backup.js <excel-file> [--dry-run] [--skip-summaries]');
    console.error('');
    console.error('Examples:');
    console.error('  node import-backup.js farm-backup-all-time-2026-07-17.xlsx');
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

    // Utilization rows write transactions, so summaries need a refresh too
    if (!dryRun && !skipSummaries && stats.utilizations > 0) {
      await rebuildSummaries();
    }

  } else if (sheets.includes('Expenses') || sheets.includes('Income')) {
    const meta = readMeta(wb);
    console.log(`  Detected: ${meta.version >= 2 ? 'FULL BACKUP (v2)' : 'TRANSACTION BACKUP (v1)'}`);
    if (meta.exportedAt) console.log(`  Exported at: ${meta.exportedAt}`);
    console.log('');
    const stats = await importBackup(wb, dryRun);
    console.log('');
    console.log('=== IMPORT COMPLETE ===');
    for (const [key, val] of Object.entries(stats)) {
      if (val > 0) console.log(`  ${key}: ${val}`);
    }

    // Verify imported counts against the Meta sheet
    let mismatches = 0;
    for (const [sheetName, expected] of Object.entries(meta.counts)) {
      const key = SHEET_STAT_KEYS[sheetName];
      if (!key) continue;
      const actual = stats[key] || 0;
      if (actual !== expected) {
        console.warn(`  WARNING: ${sheetName} — Meta says ${expected}, imported ${actual}`);
        mismatches++;
      }
    }
    if (Object.keys(meta.counts).length > 0 && mismatches === 0) {
      console.log('  All counts match the Meta sheet ✓');
    }

    if (!dryRun && !skipSummaries) {
      await rebuildSummaries();
    } else if (!dryRun) {
      console.log('');
      console.log('NOTE: Summary rebuild skipped (--skip-summaries).');
      console.log('Run without the flag or trigger reconciliation in the app to refresh summaries.');
    }

  } else {
    console.error(`ERROR: Unrecognized Excel format. Sheets: ${sheets.join(', ')}`);
    console.error('Expected "Overview" (loan detail) or "Expenses"/"Income" (backup)');
    process.exit(1);
  }

  console.log('');
  process.exit(0);
}

main().catch(err => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
