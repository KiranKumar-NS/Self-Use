/**
 * ============================================================
 * SETUP COLLECTIONS SCRIPT
 * Farm Tracker - Multi-User Farming Financial Management System
 * ============================================================
 *
 * Creates all system collections in Firestore with default data:
 *   - segments    (Goats, Chickens, Dragon)
 *   - categories  (Feed, Medicine, Labor... / Milk, Eggs, Animal Sales...)
 *
 * Also validates that the Firestore schema supports:
 *   - transactions  (expense/income with linkedLoanId support)
 *   - loans         (simple + formal with EMI/interest-only, deductions, collateral)
 *   - monthlySummaries
 *   - inventoryEvents
 *   - tasks
 *   - users
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   cd scripts
 *   npm install
 *   node setup-collections.js
 *
 * Safe to re-run — skips existing documents.
 *
 * ────────────────────────────────────────────────────────────
 * COLLECTIONS SCHEMA
 * ────────────────────────────────────────────────────────────
 *
 * segments
 *   id, name, description, icon, isActive, segmentType, unit,
 *   currentStock, breeds[], budgets { monthlyExpenseLimit, monthlyIncomeTarget }
 *
 * categories
 *   id, name, type (expense|income), isActive
 *
 * transactions
 *   id, type, date, amount, category, categoryName, segment, segmentName,
 *   description, paymentMethod, paidBy, paidByName, createdBy, createdByName,
 *   createdAt, isDeleted, timeline[], distributions[], paymentStatus,
 *   expensePaymentStatus, linkedLoanId?, month, year
 *
 * loans (simple: owe/lent)
 *   id, date, amount, type (given|received), personName, personUid?,
 *   purpose, segment, segmentName, repaymentStatus, totalRepaid,
 *   balanceRemaining, recordedBy, recordedByName, createdAt, isDeleted,
 *   timeline[], month, year, loanCategory? (simple|formal),
 *   parentFormalLoanId?
 *
 * loans (formal: bank/finance/gold/individual)
 *   ...all simple fields plus:
 *   loanSource, loanSourceName, accountNumber,
 *   sanctionedAmount, netDisbursedAmount, totalDeductions, deductions[],
 *   disbursementDate, repaymentType (emi|interest_only),
 *   interestType (fixed|floating), interestFrequency (annual|monthly|weekly),
 *   interestRateInput, interestRate (annual),
 *   tenure, emiAmount, totalEMIs, emisPaid, moratoriumMonths, emiStartDate,
 *   interestPaymentFrequency, interestAmountPerPeriod, totalInterestPaymentsMade,
 *   totalInterestPaid, totalPrincipalPaid, outstandingBalance,
 *   rateChanges[], totalPartPayments, totalPenaltyPaid,
 *   nextPaymentDueDate, nextPaymentNumber,
 *   collaterals[], totalCollateralValue, documents[],
 *   isSubsidized, subsidyDetails, effectiveRate,
 *   preClosureCharges, loanClosureDate, closureReason,
 *   replacedByLoanId, replacesLoanId, isBalanceTransfer,
 *   utilizationTotal, utilizationRemaining,
 *   heldByUid, heldByName, segments[], segmentNames[]
 *
 * loans/{loanId}/repayments
 *   id, date, amount, note, paidBy, paidByName, recordedBy, recordedByName,
 *   createdAt, isEMIPayment?, emiNumber?, principalPortion?, interestPortion?,
 *   paymentReference?, transactionId?, isPreClosure?, preClosureCharges?,
 *   isPartPayment?, penaltyAmount?
 *
 * monthlySummaries (id: "{month}-{segment}")
 *   month, year, segment, totalExpense, totalIncome, netProfit,
 *   expenseByCategory{}, incomeBySource{}, expenseByPerson{}, incomeByPerson{},
 *   totalDistributed, distributionByPerson{}, pendingIncome, pendingExpense
 *
 * users
 *   uid, email, displayName, role (admin|manager|viewer),
 *   assignedSegments[], isActive, createdAt, updatedAt, createdBy
 *
 * inventoryEvents
 *   id, segment, segmentName, eventType, count, breed?, note,
 *   date, createdBy, createdByName, createdAt, month, year, isDeleted?
 *
 * tasks
 *   id, title, description, priority, status, visibility,
 *   assignee, assigneeName, dueDate, subtasks[], tags[],
 *   kanbanOrder, createdBy, createdByName, createdAt, updatedAt,
 *   completedAt, isDeleted?
 *
 * ============================================================
 */

const admin = require('firebase-admin');
const path = require('path');

// ── Initialize Firebase Admin ──────────────────────────────
const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (err) {
  console.error('ERROR: Cannot find service-account-key.json');
  console.error('');
  console.error('Please download it from Firebase Console:');
  console.error('  Project Settings > Service Accounts > Generate New Private Key');
  console.error(`  Save as: ${serviceAccountPath}`);
  process.exit(1);
}

const db = admin.firestore();

// ── Default Data ───────────────────────────────────────────

const SEGMENTS = [
  { id: 'goats',    name: 'Goats',        description: 'Goat farming',        icon: '🐐', segmentType: 'animal', unit: 'head' },
  { id: 'chickens', name: 'Chickens',     description: 'Chicken farming',     icon: '🐔', segmentType: 'animal', unit: 'head' },
  { id: 'dragon',   name: 'Dragon Fruit', description: 'Dragon fruit farming', icon: '🌵', segmentType: 'crop',   unit: 'kg' },
];

const CATEGORIES = [
  // Expense categories
  { id: 'feed',           name: 'Feed',           type: 'expense' },
  { id: 'medicine',       name: 'Medicine',       type: 'expense' },
  { id: 'labor',          name: 'Labor',          type: 'expense' },
  { id: 'transport',      name: 'Transport',      type: 'expense' },
  { id: 'maintenance',    name: 'Maintenance',    type: 'expense' },
  { id: 'loan-repayment', name: 'Loan Repayment', type: 'expense' },
  { id: 'other-expense',  name: 'Other',          type: 'expense' },
  // Income categories
  { id: 'milk',           name: 'Milk',           type: 'income' },
  { id: 'eggs',           name: 'Eggs',           type: 'income' },
  { id: 'animal-sales',   name: 'Animal Sales',   type: 'income' },
  { id: 'crop-sales',     name: 'Crop Sales',     type: 'income' },
  { id: 'fruit-sales',    name: 'Fruit Sales',    type: 'income' },
  { id: 'other-income',   name: 'Other',          type: 'income' },
];

// ── Main ───────────────────────────────────────────────────

async function setup() {
  console.log('');
  console.log('=== FARM TRACKER - SETUP COLLECTIONS ===');
  console.log('');

  // ── Create Segments ──────────────────────────────────────
  console.log('Creating segments...');
  let segCreated = 0;
  let segSkipped = 0;

  for (const seg of SEGMENTS) {
    const docRef = db.collection('segments').doc(seg.id);
    const existing = await docRef.get();

    if (existing.exists) {
      console.log(`  [SKIP] ${seg.id} — already exists`);
      segSkipped++;
    } else {
      await docRef.set({
        id: seg.id,
        name: seg.name,
        description: seg.description,
        icon: seg.icon,
        segmentType: seg.segmentType,
        unit: seg.unit,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  [ADD]  ${seg.icon} ${seg.name} (${seg.id})`);
      segCreated++;
    }
  }
  console.log(`  Segments: ${segCreated} created, ${segSkipped} skipped`);
  console.log('');

  // ── Create Categories ────────────────────────────────────
  console.log('Creating categories...');
  let catCreated = 0;
  let catSkipped = 0;

  for (const cat of CATEGORIES) {
    const docRef = db.collection('categories').doc(cat.id);
    const existing = await docRef.get();

    if (existing.exists) {
      console.log(`  [SKIP] ${cat.id} — already exists`);
      catSkipped++;
    } else {
      await docRef.set({
        id: cat.id,
        name: cat.name,
        type: cat.type,
        isActive: true,
      });
      console.log(`  [ADD]  ${cat.name} (${cat.id}) — ${cat.type}`);
      catCreated++;
    }
  }
  console.log(`  Categories: ${catCreated} created, ${catSkipped} skipped`);

  // ── Verify existing collections ──────────────────────────
  console.log('');
  console.log('Checking existing collections...');

  const collections = ['transactions', 'loans', 'monthlySummaries', 'users', 'inventoryEvents', 'tasks'];
  for (const col of collections) {
    const snap = await db.collection(col).limit(1).get();
    const count = snap.size;
    console.log(`  ${col}: ${count > 0 ? 'has data' : 'empty'}`);
  }

  // ── Summary ──────────────────────────────────────────────
  console.log('');
  console.log('=== SETUP COMPLETE ===');
  console.log('');
  console.log('Collections in Firestore:');
  console.log(`  segments:   ${SEGMENTS.length} documents (${segCreated} new, ${segSkipped} existing)`);
  console.log(`  categories: ${CATEGORIES.length} documents (${catCreated} new, ${catSkipped} existing)`);
  console.log('');
  console.log('Supported features:');
  console.log('  - Transactions (expense/income with distributions)');
  console.log('  - Loans (simple owe/lent + formal bank/finance/gold/individual)');
  console.log('  - EMI tracking + interest-only + part-payments + penalties');
  console.log('  - Loan utilization, personal withdrawals, balance transfers');
  console.log('  - Collateral tracking, rate changes, loan documents');
  console.log('  - Inventory events, tasks, budget tracking');
  console.log('  - Excel backup/restore (Admin > Data Setup > Import)');
  console.log('');

  process.exit(0);
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
