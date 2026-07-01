/**
 * ============================================================
 * IMPORT TRANSACTIONS FROM CSV
 * Farm Tracker - Import expense + income from exported CSV
 * ============================================================
 *
 * Reads a CSV file and creates transactions in Firestore.
 * Supports both expense and income types, with optional
 * quantity/unit/rate fields.
 *
 * ────────────────────────────────────────────────────────────
 * CSV FORMAT (expected columns)
 * ────────────────────────────────────────────────────────────
 *
 *   Date            - dd-mm-yy or dd/mm/yyyy
 *   Type            - expense | income
 *   Segment         - Goats, Dragon, Chickens, etc.
 *   Category        - Feed, Medicine, Sale, etc.
 *   Amount          - Total amount in INR
 *   Paid By         - Person name (Kiran, Sathish, etc.)
 *   Payment Method  - cash | upi (optional, defaults to upi)
 *   Description     - Free text
 *   Quantity        - Optional (e.g. 10)
 *   Unit            - Optional (kg, head, dozen, litre, pieces, bag, bundle)
 *   Rate Per Unit   - Optional (e.g. 100)
 *   Payment Status  - Optional, income only (received | pending, defaults to received)
 *   Distribution    - Optional (e.g. "Kiran: 5000; Sathish: 3000")
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   node scripts/import-csv.js <csv-file>
 *
 *   # Examples:
 *   node scripts/import-csv.js scripts/transactions-all_to_2026-06.csv
 *   node scripts/import-csv.js scripts/my-data.csv
 *
 * ============================================================
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ── Initialize Firebase Admin ──────────────────────────────
const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Created By (Admin who imports) ─────────────────────────
const CREATED_BY_UID = 'u2TongdaAFczeNvi4RbhvyFtzXu1';
const CREATED_BY_NAME = 'Kiran';

// ── Mapping: Paid By name → Firestore paidBy/paidByName ────
const PAID_BY_MAP = {
  'kiran': { paidBy: 'u2TongdaAFczeNvi4RbhvyFtzXu1', paidByName: 'Kiran' },
  'sathish': { paidBy: 'C3o7HxJoWoYLLnUmYlgdaz2r7lL2', paidByName: 'Sathish' },
  'sathis': { paidBy: 'C3o7HxJoWoYLLnUmYlgdaz2r7lL2', paidByName: 'Sathish' },
  'sk': { paidBy: 'C3o7HxJoWoYLLnUmYlgdaz2r7lL2', paidByName: 'Sathish' },
  'kk': { paidBy: 'u2TongdaAFczeNvi4RbhvyFtzXu1', paidByName: 'Kiran' },
  'bank': { paidBy: 'other', paidByName: 'Bank' },
  'gold loan': { paidBy: 'other', paidByName: 'Gold Loan' },
  'icici loan': { paidBy: 'other', paidByName: 'ICICI Loan' },
};

// ── Mapping: Segment name → Firestore segment ─────────────
const SEGMENT_MAP = {
  'goat': { id: 'goats', name: 'Goats' },
  'goats': { id: 'goats', name: 'Goats' },
  'dragon': { id: 'dragon', name: 'Dragon Fruit' },
  'dragon fruit': { id: 'dragon', name: 'Dragon Fruit' },
  'chicks': { id: 'chickens', name: 'Chickens' },
  'chickens': { id: 'chickens', name: 'Chickens' },
  'chicken': { id: 'chickens', name: 'Chickens' },
};

// ── Mapping: Category name → Firestore category ───────────
const CATEGORY_MAP = {
  'food': { id: 'feed', name: 'Feed' },
  'feed': { id: 'feed', name: 'Feed' },
  'maintenance': { id: 'maintenance', name: 'Maintenance' },
  'people': { id: 'labor', name: 'Labor' },
  'labour': { id: 'labor', name: 'Labor' },
  'labor': { id: 'labor', name: 'Labor' },
  'transport': { id: 'transport', name: 'Transport' },
  'medicine': { id: 'medicine', name: 'Medicine' },
  'fertilizer': { id: 'fertilizer', name: 'Fertilizer' },
  'farm equipment': { id: 'farm-equipment', name: 'Farm Equipment' },
  'inventry': { id: 'animal-stock', name: 'Animal Stock' },
  'inventory': { id: 'animal-stock', name: 'Animal Stock' },
  'loan repayment': { id: 'loan_repayment', name: 'Loan Repayment' },
  'loan repaymnet': { id: 'loan_repayment', name: 'Loan Repayment' },
  'mannur clean': { id: 'maintenance', name: 'Maintenance' },
  'sale': { id: 'sale', name: 'Sale' },
  'milk': { id: 'milk', name: 'Milk' },
  'eggs': { id: 'eggs', name: 'Eggs' },
};

// ── Helper: Parse CSV (handles quoted fields with commas/newlines) ──
function parseCSV(content) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  const lines = content.split('\n');

  for (const line of lines) {
    if (inQuotes) {
      current += '\n' + line;
      if (line.includes('"')) {
        // Check if quotes are closed
        const quoteCount = (current.match(/"/g) || []).length;
        if (quoteCount % 2 === 0) {
          inQuotes = false;
          rows.push(current);
          current = '';
        }
      }
    } else {
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        inQuotes = true;
        current = line;
      } else {
        rows.push(line);
      }
    }
  }

  if (current) rows.push(current);

  // Parse each row into fields
  return rows.map(row => {
    const fields = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  });
}

// ── Helper: Parse date (dd-mm-yy, dd/mm/yyyy, dd/mm/yy) ──
function parseDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/\//g, '-');
  const parts = cleaned.split('-');
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000; // 26 → 2026

  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

function getMonthString(date) {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}`;
}

// ── Confirm prompt ────────────────────────────────────────
async function confirm(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// ── Main ───────────────────────────────────────────────────
async function run() {
  const csvFile = process.argv[2];
  if (!csvFile) {
    console.error('Usage: node scripts/import-csv.js <csv-file>');
    console.error('Example: node scripts/import-csv.js scripts/transactions-all_to_2026-06.csv');
    process.exit(1);
  }

  const filePath = path.resolve(csvFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('');
  console.log('=== IMPORT TRANSACTIONS FROM CSV ===');
  console.log(`File: ${filePath}`);
  console.log(`Created by: ${CREATED_BY_NAME}`);
  console.log('');

  const content = fs.readFileSync(filePath, 'utf-8');
  const allRows = parseCSV(content);

  if (allRows.length < 2) {
    console.error('CSV file is empty or has no data rows');
    process.exit(1);
  }

  // Header row
  const headers = allRows[0].map(h => h.toLowerCase().trim());
  const col = (row, name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] || '').trim() : '';
  };

  // Count valid rows
  const dataRows = allRows.slice(1).filter(row => col(row, 'date') && col(row, 'amount'));
  console.log(`Found ${dataRows.length} valid rows (${allRows.length - 1} total, ${allRows.length - 1 - dataRows.length} empty/skipped)`);
  console.log('');

  const ok = await confirm(`Import ${dataRows.length} transactions?`);
  if (!ok) {
    console.log('Cancelled.');
    process.exit(0);
  }
  console.log('');

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2;

    // Parse date
    const date = parseDate(col(row, 'date'));
    if (!date) {
      console.log(`  [SKIP] Row ${rowNum}: Invalid date "${col(row, 'date')}"`);
      skipped++;
      continue;
    }

    // Parse type
    const rawType = col(row, 'type').toLowerCase();
    const type = rawType === 'income' ? 'income' : 'expense';

    // Parse segment
    const rawSegment = col(row, 'segment').toLowerCase();
    const segment = SEGMENT_MAP[rawSegment];
    if (!segment) {
      console.log(`  [SKIP] Row ${rowNum}: Unknown segment "${col(row, 'segment')}"`);
      skipped++;
      continue;
    }

    // Parse category
    const rawCategory = col(row, 'category').toLowerCase();
    const category = CATEGORY_MAP[rawCategory] || { id: rawCategory.replace(/\s+/g, '-'), name: col(row, 'category') };

    // Parse amount
    const amount = parseFloat(col(row, 'amount'));
    if (!amount || amount <= 0) {
      console.log(`  [SKIP] Row ${rowNum}: Invalid amount "${col(row, 'amount')}"`);
      skipped++;
      continue;
    }

    // Parse paid by
    const rawPaidBy = col(row, 'paid by').toLowerCase();
    const paidByInfo = PAID_BY_MAP[rawPaidBy] || { paidBy: 'other', paidByName: col(row, 'paid by') || 'Unknown' };

    // Parse payment method
    const rawPayment = col(row, 'payment method').toLowerCase();
    const paymentMethod = rawPayment === 'cash' ? 'cash' : 'upi';

    // Description
    const description = col(row, 'description') || col(row, 'category');

    // Quantity / Unit / Rate
    const quantity = parseFloat(col(row, 'quantity')) || null;
    const unit = col(row, 'unit').toLowerCase() || null;
    const ratePerUnit = parseFloat(col(row, 'rate per unit')) || null;

    // Payment status (income only)
    const rawPayStatus = col(row, 'payment status').toLowerCase();
    const paymentStatus = type === 'income' ? (rawPayStatus === 'pending' ? 'pending' : 'received') : null;

    // Distribution (income only)
    const rawDist = col(row, 'distribution');
    let distributions = [];
    if (rawDist && type === 'income') {
      // Parse "Kiran: 5000; Sathish: 3000"
      const parts = rawDist.split(';').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        const [name, amt] = part.split(':').map(s => s.trim());
        if (name && amt) {
          const distPerson = PAID_BY_MAP[name.toLowerCase()];
          distributions.push({
            uid: distPerson?.paidBy || 'other',
            name: distPerson?.paidByName || name,
            amount: parseFloat(amt) || 0,
          });
        }
      }
    }

    const month = getMonthString(date);
    const year = date.getFullYear();

    // ── Write to Firestore ────────────────────────────────
    const txnRef = db.collection('transactions').doc();
    const summaryId = `${month}-${segment.id}`;
    const summaryRef = db.doc(`monthlySummaries/${summaryId}`);

    const batch = db.batch();

    // Transaction document
    const txnDoc = {
      id: txnRef.id,
      type: type,
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
        changes: 'Imported from CSV',
      }],
      month: month,
      year: year,
    };

    if (quantity) txnDoc.quantity = quantity;
    if (unit) txnDoc.unit = unit;
    if (ratePerUnit) txnDoc.ratePerUnit = ratePerUnit;
    if (paymentStatus) txnDoc.paymentStatus = paymentStatus;
    if (distributions.length > 0) txnDoc.distributions = distributions;

    batch.set(txnRef, txnDoc);

    // Monthly summary update
    const incField = type === 'expense' ? 'totalExpense' : 'totalIncome';
    const profitDelta = type === 'income' ? amount : -amount;
    const catField = type === 'expense'
      ? `expenseByCategory.${category.id}`
      : `incomeBySource.${category.id}`;

    const summaryData = {
      [incField]: admin.firestore.FieldValue.increment(amount),
      netProfit: admin.firestore.FieldValue.increment(profitDelta),
      [catField]: admin.firestore.FieldValue.increment(amount),
      month: month,
      year: year,
      segment: segment.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (paymentStatus === 'pending') {
      summaryData.pendingIncome = admin.firestore.FieldValue.increment(amount);
    }

    batch.set(summaryRef, summaryData, { merge: true });

    await batch.commit();

    const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const qtyStr = quantity ? ` | ${quantity} ${unit || ''} × ₹${ratePerUnit || '?'}` : '';
    console.log(`  [${type.toUpperCase()}] Row ${rowNum}: ${dateStr} | ${segment.name} | ${category.name} | ₹${amount}${qtyStr} | ${paidByInfo.paidByName}`);
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
