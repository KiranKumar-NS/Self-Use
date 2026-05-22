/**
 * ============================================================
 * IMPORT EXPENSES FROM EXCEL
 * Farm Tracker - Import transactions from Details.xlsx
 * ============================================================
 *
 * Reads the Excel file and creates expense transactions in Firestore.
 * Same format as the UI creates them.
 *
 * Usage:
 *   node scripts/import-expenses.js
 *
 * ============================================================
 */

const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');

// ── Initialize Firebase Admin ──────────────────────────────
const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Created By (Admin who imports) ─────────────────────────
const CREATED_BY_UID = 'u2TongdaAFczeNvi4RbhvyFtzXu1';
const CREATED_BY_NAME = 'Kiran';

// ── Mapping: Excel "Paid By" → Firestore paidBy/paidByName ─
const PAID_BY_MAP = {
  'kk': { paidBy: 'u2TongdaAFczeNvi4RbhvyFtzXu1', paidByName: 'Kiran' },
  'sk': { paidBy: 'C3o7HxJoWoYLLnUmYlgdaz2r7lL2', paidByName: 'Sathis' },
  'bank': { paidBy: 'other', paidByName: 'Bank' },
  'gold loan': { paidBy: 'other', paidByName: 'Gold Loan' },
};

// ── Mapping: Excel "Business Category" → Firestore segment ─
const SEGMENT_MAP = {
  'goat': { id: 'goats', name: 'Goats' },
  'goats': { id: 'goats', name: 'Goats' },
  'dragon': { id: 'dragon', name: 'Dragon' },
  'chicks': { id: 'chickens', name: 'Chickens' },
  'chickens': { id: 'chickens', name: 'Chickens' },
  'chicken': { id: 'chickens', name: 'Chickens' },
};

// ── Mapping: Excel "Expense Category" → Firestore category ─
const CATEGORY_MAP = {
  'food': { id: 'feed', name: 'Feed' },
  'feed': { id: 'feed', name: 'Feed' },
  'maintenance': { id: 'maintenance', name: 'Maintenance' },
  'people': { id: 'labor', name: 'Labor' },
  'labour': { id: 'labor', name: 'Labor' },
  'labor': { id: 'labor', name: 'Labor' },
  'people, food': { id: 'labor', name: 'Labor' },
  'transport': { id: 'transport', name: 'Transport' },
  'medicine': { id: 'medicine', name: 'Medicine' },
  'inventry': { id: 'animal-stock', name: 'Animal Stock' },
  'inventory': { id: 'animal-stock', name: 'Animal Stock' },
  'loan repayment': { id: 'loan_repayment', name: 'Loan Repayment' },
  'loan repaymnet': { id: 'loan_repayment', name: 'Loan Repayment' },
  'mannur clean': { id: 'maintenance', name: 'Maintenance' },
};

// ── Helper: Excel date serial → JS Date ────────────────────
function excelDateToDate(serial) {
  const epoch = new Date(1899, 11, 30);
  return new Date(epoch.getTime() + serial * 86400000);
}

function getMonthString(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

// ── Main ───────────────────────────────────────────────────
async function run() {
  console.log('');
  console.log('=== IMPORT EXPENSES FROM EXCEL ===');
  console.log('');

  // Read Excel
  const filePath = path.join(__dirname, 'Details.xlsx');
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Expenses'];
  const rows = XLSX.utils.sheet_to_json(ws);

  console.log(`Found ${rows.length} rows in "Expenses" sheet`);
  console.log(`Created by: ${CREATED_BY_NAME} (${CREATED_BY_UID})`);
  console.log('');

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel row (header is row 1)

    // Parse date
    const date = typeof row['Date'] === 'number'
      ? excelDateToDate(row['Date'])
      : new Date(row['Date']);

    if (isNaN(date.getTime())) {
      console.log(`  [SKIP] Row ${rowNum}: Invalid date "${row['Date']}"`);
      skipped++;
      continue;
    }

    // Parse segment
    const rawSegment = (row['Business Category'] || '').toString().toLowerCase().trim();
    const segment = SEGMENT_MAP[rawSegment];
    if (!segment) {
      console.log(`  [SKIP] Row ${rowNum}: Unknown segment "${row['Business Category']}"`);
      skipped++;
      continue;
    }

    // Parse category
    const rawCategory = (row['Expense Category'] || '').toString().toLowerCase().trim();
    const category = CATEGORY_MAP[rawCategory] || { id: 'other-expense', name: 'Other' };

    // Parse amount
    const amount = parseFloat(row['Amount']);
    if (!amount || amount <= 0) {
      console.log(`  [SKIP] Row ${rowNum}: Invalid amount "${row['Amount']}"`);
      skipped++;
      continue;
    }

    // Parse paid by
    const rawPaidBy = (row['Paid By'] || '').toString().toLowerCase().trim();
    const paidByInfo = PAID_BY_MAP[rawPaidBy] || { paidBy: 'other', paidByName: row['Paid By'] || 'Unknown' };

    // Parse payment method
    const rawPayment = (row['Payment Type'] || 'upi').toString().toLowerCase().trim();
    const paymentMethod = rawPayment === 'cash' ? 'cash' : 'upi';

    // Description — use Description column, fallback to Loan Name, fallback to category
    let description = '';
    if (row['Description'] && typeof row['Description'] === 'string') {
      description = row['Description'];
    } else if (row['Description'] && typeof row['Description'] === 'number') {
      description = row['Description'].toString();
    }
    if (row['Loan Name']) {
      description = description ? `${description} | Loan: ${row['Loan Name']}` : `Loan: ${row['Loan Name']}`;
    }
    if (!description) {
      description = row['Expense Category'] || '';
    }

    const month = getMonthString(date);
    const year = date.getFullYear();

    // ── Write to Firestore (same as UI) ────────────────────
    const txnRef = db.collection('transactions').doc();
    const summaryId = `${month}-${segment.id}`;
    const summaryRef = db.doc(`monthlySummaries/${summaryId}`);

    const batch = db.batch();

    // Transaction document
    batch.set(txnRef, {
      id: txnRef.id,
      type: 'expense',
      date: admin.firestore.Timestamp.fromDate(date),
      amount: amount,
      category: category.id,
      categoryName: category.name,
      segment: segment.id,
      segmentName: segment.name,
      description: description,
      paymentMethod: paymentMethod,
      paidBy: paidByInfo.paidBy,
      paidByName: paidByInfo.paidByName,
      createdBy: CREATED_BY_UID,
      createdByName: CREATED_BY_NAME,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      isDeleted: false,
      timeline: [{
        action: 'created',
        by: CREATED_BY_UID,
        byName: CREATED_BY_NAME,
        at: admin.firestore.Timestamp.now(),
        changes: 'Imported from Details.xlsx',
      }],
      month: month,
      year: year,
    });

    // Monthly summary update
    batch.set(summaryRef, {
      totalExpense: admin.firestore.FieldValue.increment(amount),
      netProfit: admin.firestore.FieldValue.increment(-amount),
      [`expenseByCategory.${category.id}`]: admin.firestore.FieldValue.increment(amount),
      month: month,
      year: year,
      segment: segment.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    console.log(`  [ADD] Row ${rowNum}: ${dateStr} | ${segment.name} | ${category.name} | ₹${amount} | ${paidByInfo.paidByName} | ${paymentMethod.toUpperCase()}`);
    created++;
  }

  console.log('');
  console.log('=== IMPORT COMPLETE ===');
  console.log(`  Created: ${created} transactions`);
  console.log(`  Skipped: ${skipped} rows`);
  console.log('');

  process.exit(0);
}

run().catch((err) => {
  console.error('Import failed:', err.message);
  process.exit(1);
});
