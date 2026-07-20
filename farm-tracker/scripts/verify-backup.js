/**
 * ============================================================
 * VERIFY EXCEL BACKUP AGAINST FIRESTORE
 * Farm Tracker - Read-only round-trip verifier
 * ============================================================
 *
 * For every row of every sheet in a full backup (v2) file, fetches the
 * corresponding Firestore document and compares each exported column
 * against the stored value. Also compares Meta sheet counts against
 * live collection counts. Exits non-zero on any difference.
 *
 * USAGE
 *   cd scripts
 *   node verify-backup.js farm-backup-all-time-2026-07-17.xlsx
 *
 *   # Against the emulator (Git Bash):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node verify-backup.js <file>
 *
 * Comparison rules:
 *   - Business dates (DD/MM/YYYY) compare at day precision
 *   - Audit timestamps (ISO) compare at second precision
 *   - Lists compare order-insensitively; blank cell == null/empty field
 *   - Embedded child sheets (Loan Deductions, Animal Costs, Harvest Sales,
 *     Stock Movements, ...) verify the parent doc contains a matching entry
 * ============================================================
 */

const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account-key.json');
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (err) {
  console.error('ERROR: Cannot find service-account-key.json');
  process.exit(1);
}

const db = admin.firestore();
const MAX_DIFFS_SHOWN = 10;

// ── Cell/value helpers ─────────────────────────────────────

function str(val) { return val == null ? '' : String(val).trim(); }

function bool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1';
}

function parseDate(val) {
  if (val == null || val === '' || val === '-') return null;
  const parts = String(val).split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number);
    if (d && m && y) return new Date(y < 100 ? y + 2000 : y, m - 1, d);
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function fieldDate(val) {
  if (val == null) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return null;
}

// ── Comparison by type ─────────────────────────────────────
// Returns null when equal, otherwise a "cell vs stored" description.

const compare = {
  str(cell, val) {
    const a = str(cell);
    const b = val == null ? '' : String(val).trim();
    return a === b ? null : `'${a}' vs '${b}'`;
  },
  num(cell, val) {
    const cellBlank = cell == null || cell === '';
    const valEmpty = val == null || val === '';
    if (cellBlank && (valEmpty || val === 0)) return null;
    if (cellBlank !== valEmpty && (cellBlank || valEmpty)) {
      if (valEmpty && Number(cell) === 0) return null;
      return `'${cell}' vs '${val}'`;
    }
    return Math.abs(Number(cell) - Number(val)) < 0.005 ? null : `${cell} vs ${val}`;
  },
  bool(cell, val) {
    return bool(cell) === !!val ? null : `${cell} vs ${val}`;
  },
  dateDMY(cell, val) {
    const a = parseDate(cell);
    const b = fieldDate(val);
    if (!a && !b) return null;
    if (!a || !b) return `'${cell}' vs '${b ? b.toISOString() : val}'`;
    const same = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    return same ? null : `${cell} vs ${b.toISOString().slice(0, 10)}`;
  },
  dateISO(cell, val) {
    const a = parseDate(cell);
    const b = fieldDate(val);
    if (!a && !b) return null;
    if (!a || !b) return `'${cell}' vs '${b ? b.toISOString() : val}'`;
    return Math.abs(a.getTime() - b.getTime()) <= 1000 ? null : `${cell} vs ${b.toISOString()}`;
  },
  listSemi(cell, val) {
    const a = str(cell) ? str(cell).split(';').map(x => x.trim()).filter(Boolean).sort() : [];
    const b = Array.isArray(val) ? val.map(x => String(x).trim()).sort() : [];
    return JSON.stringify(a) === JSON.stringify(b) ? null : `[${a}] vs [${b}]`;
  },
  listComma(cell, val) {
    const a = str(cell) ? str(cell).split(',').map(x => x.trim()).filter(Boolean).sort() : [];
    const b = Array.isArray(val) ? val.map(x => String(x).trim()).sort() : [];
    return JSON.stringify(a) === JSON.stringify(b) ? null : `[${a}] vs [${b}]`;
  },
  mapIdAmt(cell, val) {
    const a = {};
    for (const part of str(cell).split(';').map(x => x.trim()).filter(Boolean)) {
      const idx = part.lastIndexOf(':');
      a[part.slice(0, idx).trim()] = Number(part.slice(idx + 1));
    }
    const b = val && typeof val === 'object' ? val : {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (Math.abs((a[k] || 0) - (b[k] || 0)) >= 0.005) return `${k}: ${a[k]} vs ${b[k]}`;
    }
    return null;
  },
  json(cell, val) {
    let a;
    try { a = str(cell) ? JSON.parse(str(cell)) : null; } catch { a = str(cell); }
    const canon = v => JSON.stringify(sortKeys(v));
    // Empty array/object in doc vs blank cell counts as equal
    const isEmptyish = v => v == null || (Array.isArray(v) && v.length === 0);
    if (isEmptyish(a) && isEmptyish(val)) return null;
    return canon(a ?? null) === canon(val ?? null) ? null : 'JSON differs';
  },
};

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object' && !v.toDate) {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]));
  }
  return v;
}

// ── Sheet field maps: column → [firestoreField, type] ──────

const TXN_COMMON = {
  'Date': ['date', 'dateDMY'], 'Month': ['month', 'str'], 'Year': ['year', 'num'],
  'Segment': ['segment', 'str'], 'Segment Name': ['segmentName', 'str'],
  'Category': ['category', 'str'], 'Category Name': ['categoryName', 'str'],
  'Amount': ['amount', 'num'], 'Quantity': ['quantity', 'num'], 'Unit': ['unit', 'str'],
  'Rate Per Unit': ['ratePerUnit', 'num'], 'Payment Method': ['paymentMethod', 'str'],
  'Description': ['description', 'str'], 'Tags': ['tags', 'listComma'],
  'Linked Animal IDs': ['linkedAnimalIds', 'listSemi'],
  'Linked Animal Names': ['linkedAnimalNames', 'listSemi'],
  'Animal Cost Split': ['animalCostSplit', 'mapIdAmt'],
  'Linked Buyer ID': ['linkedBuyerId', 'str'], 'Linked Buyer Name': ['linkedBuyerName', 'str'],
  'Linked Harvest ID': ['linkedHarvestId', 'str'], 'Linked Harvest Name': ['linkedHarvestName', 'str'],
  'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
  'Created At': ['createdAt', 'dateISO'],
};

const SHEETS = {
  'Expenses': {
    ref: r => db.collection('transactions').doc(str(r['ID'])),
    fields: {
      ...TXN_COMMON,
      'Paid By': ['paidBy', 'str'], 'Paid By Name': ['paidByName', 'str'],
      'Payment Status': ['expensePaymentStatus', 'str'],
      'Linked Loan ID': ['linkedLoanId', 'str'],
      'Linked Supplier ID': ['linkedSupplierId', 'str'],
      'Linked Supplier Name': ['linkedSupplierName', 'str'],
      'Linked Sale Txn ID': ['linkedSaleTransactionId', 'str'],
      'Linked Sale Label': ['linkedSaleLabel', 'str'],
    },
  },
  'Income': {
    ref: r => db.collection('transactions').doc(str(r['ID'])),
    fields: {
      ...TXN_COMMON,
      'Received By': ['paidBy', 'str'], 'Received By Name': ['paidByName', 'str'],
      'Payment Status': ['paymentStatus', 'str'],
    },
  },
  'Loans': {
    ref: r => db.collection('loans').doc(str(r['ID'])),
    fields: {
      'Date': ['date', 'dateDMY'], 'Type': ['type', 'str'], 'Person': ['personName', 'str'],
      'Person UID': ['personUid', 'str'], 'Amount': ['amount', 'num'],
      'Repaid': ['totalRepaid', 'num'], 'Balance': ['balanceRemaining', 'num'],
      'Status': ['repaymentStatus', 'str'], 'Purpose': ['purpose', 'str'],
      'Segment': ['segment', 'str'], 'Segment Name': ['segmentName', 'str'],
      'Month': ['month', 'str'], 'Year': ['year', 'num'],
      'Category': ['loanCategory', 'str'], 'Source': ['loanSource', 'str'],
      'Source Name': ['loanSourceName', 'str'], 'Account': ['accountNumber', 'str'],
      'Sanctioned': ['sanctionedAmount', 'num'], 'Net Disbursed': ['netDisbursedAmount', 'num'],
      'Total Deductions': ['totalDeductions', 'num'],
      'Disbursement Date': ['disbursementDate', 'dateDMY'],
      'Repayment Type': ['repaymentType', 'str'], 'Interest Type': ['interestType', 'str'],
      'Interest Frequency': ['interestFrequency', 'str'],
      'Interest Rate Input': ['interestRateInput', 'num'],
      'Interest Rate Annual': ['interestRate', 'num'],
      'Is Subsidized': ['isSubsidized', 'bool'], 'Subsidy Details': ['subsidyDetails', 'str'],
      'Effective Rate': ['effectiveRate', 'num'], 'Tenure': ['tenure', 'num'],
      'EMI Amount': ['emiAmount', 'num'], 'Total EMIs': ['totalEMIs', 'num'],
      'EMIs Paid': ['emisPaid', 'num'], 'Moratorium': ['moratoriumMonths', 'num'],
      'EMI Start Date': ['emiStartDate', 'dateDMY'],
      'Next Payment Due': ['nextPaymentDueDate', 'dateDMY'],
      'Next Payment Number': ['nextPaymentNumber', 'num'],
      'Interest Payment Freq': ['interestPaymentFrequency', 'str'],
      'Interest Per Period': ['interestAmountPerPeriod', 'num'],
      'Interest Payments Made': ['totalInterestPaymentsMade', 'num'],
      'Outstanding': ['outstandingBalance', 'num'], 'Interest Paid': ['totalInterestPaid', 'num'],
      'Principal Paid': ['totalPrincipalPaid', 'num'], 'Part Payments': ['totalPartPayments', 'num'],
      'Penalty Paid': ['totalPenaltyPaid', 'num'], 'Utilization Total': ['utilizationTotal', 'num'],
      'Utilization Remaining': ['utilizationRemaining', 'num'],
      'Held By': ['heldByName', 'str'], 'Held By UID': ['heldByUid', 'str'],
      'Closure Reason': ['closureReason', 'str'], 'Closure Date': ['loanClosureDate', 'dateDMY'],
      'Pre-closure Charges': ['preClosureCharges', 'num'],
      'Replaces Loan': ['replacesLoanId', 'str'], 'Replaced By Loan': ['replacedByLoanId', 'str'],
      'Is Balance Transfer': ['isBalanceTransfer', 'bool'],
      'Parent Formal Loan': ['parentFormalLoanId', 'str'],
      'Segments': ['segments', 'listSemi'], 'Segment Names': ['segmentNames', 'listSemi'],
      'Collateral Value': ['totalCollateralValue', 'num'],
      'Pledge Receipt': ['pledgeReceiptNumber', 'str'], 'LTV Ratio': ['ltvRatio', 'num'],
      'Total Gold Weight': ['totalGoldWeight', 'num'], 'Total Gold Value': ['totalGoldValue', 'num'],
      'Eligible Loan Amount': ['eligibleLoanAmount', 'num'],
      'Renewed From Loan': ['renewedFromLoanId', 'str'], 'Renewed By Loan': ['renewedByLoanId', 'str'],
      'Is Renewal': ['isRenewal', 'bool'],
      'Recorded By': ['recordedBy', 'str'], 'Recorded By Name': ['recordedByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Loan Repayments': {
    ref: r => db.collection(`loans/${str(r['Loan ID'])}/repayments`).doc(str(r['ID'])),
    fields: {
      'Date': ['date', 'dateDMY'], 'Amount': ['amount', 'num'], 'Note': ['note', 'str'],
      'Paid By': ['paidBy', 'str'], 'Paid By Name': ['paidByName', 'str'],
      'Recorded By': ['recordedBy', 'str'], 'Recorded By Name': ['recordedByName', 'str'],
      'Created At': ['createdAt', 'dateISO'], 'Scheduled Due Date': ['scheduledDueDate', 'dateDMY'],
      'EMI Payment': ['isEMIPayment', 'bool'], 'EMI Number': ['emiNumber', 'num'],
      'Principal': ['principalPortion', 'num'], 'Interest': ['interestPortion', 'num'],
      'Reference': ['paymentReference', 'str'], 'Transaction ID': ['transactionId', 'str'],
      'Part Payment': ['isPartPayment', 'bool'], 'Pre-closure': ['isPreClosure', 'bool'],
      'Pre-closure Charges': ['preClosureCharges', 'num'], 'Penalty': ['penaltyAmount', 'num'],
    },
  },
  'Inventory Events': {
    ref: r => db.collection('inventoryEvents').doc(str(r['ID'])),
    fields: {
      'Date': ['date', 'dateDMY'], 'Segment': ['segment', 'str'],
      'Segment Name': ['segmentName', 'str'], 'Event Type': ['eventType', 'str'],
      'Count': ['count', 'num'], 'Breed': ['breed', 'str'], 'Note': ['note', 'str'],
      'Month': ['month', 'str'], 'Year': ['year', 'num'],
      'Estimated Value': ['estimatedValue', 'num'],
      'Linked Animal IDs': ['linkedAnimalIds', 'listSemi'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Animals': {
    ref: r => db.collection('animals').doc(str(r['ID'])),
    fields: {
      'Segment': ['segment', 'str'], 'Segment Name': ['segmentName', 'str'],
      'Tracking Mode': ['trackingMode', 'str'], 'Tag': ['tag', 'str'], 'Name': ['name', 'str'],
      'Breed': ['breed', 'str'], 'Gender': ['gender', 'str'], 'Batch Label': ['batchLabel', 'str'],
      'Batch Size': ['batchSize', 'num'], 'Current Count': ['currentCount', 'num'],
      'Origin': ['origin', 'str'], 'Origin Date': ['originDate', 'dateDMY'],
      'Origin Event ID': ['originInventoryEventId', 'str'],
      'Purchase Price': ['purchasePrice', 'num'],
      'Purchase Price Per Head': ['purchasePricePerHead', 'num'],
      'Status': ['status', 'str'], 'Total Costs': ['totalCosts', 'num'],
      'Total Invested': ['totalInvested', 'num'], 'Sale Price': ['salePrice', 'num'],
      'Sale Price Per Head': ['salePricePerHead', 'num'], 'Profit': ['profit', 'num'],
      'Profit Margin %': ['profitMargin', 'num'], 'Buyer': ['buyerName', 'str'],
      'Buyer ID': ['buyerId', 'str'], 'Exit Date': ['exitDate', 'dateDMY'],
      'Exit Type': ['exitType', 'str'], 'Sale Txn ID': ['saleTransactionId', 'str'],
      'Sale Event ID': ['saleInventoryEventId', 'str'], 'Death Cause': ['deathCause', 'str'],
      'Death Note': ['deathNote', 'str'], 'Age At Death Days': ['ageAtDeathDays', 'num'],
      'Note': ['note', 'str'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Buyers': {
    ref: r => db.collection('buyers').doc(str(r['ID'])),
    fields: {
      'Name': ['name', 'str'], 'Phone': ['phone', 'str'], 'Location': ['location', 'str'],
      'Total Purchases': ['totalPurchases', 'num'], 'Total Amount Paid': ['totalAmountPaid', 'num'],
      'Average Rate': ['averageRate', 'num'], 'Last Purchase': ['lastPurchaseDate', 'dateDMY'],
      'Purchases By Segment': ['purchasesBySegment', 'mapIdAmt'],
      'Amount By Segment': ['amountBySegment', 'mapIdAmt'], 'Note': ['note', 'str'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Suppliers': {
    ref: r => db.collection('suppliers').doc(str(r['ID'])),
    fields: {
      'Name': ['name', 'str'], 'Phone': ['phone', 'str'], 'Location': ['location', 'str'],
      'GST Number': ['gstNumber', 'str'], 'Item Categories': ['itemCategories', 'listSemi'],
      'Total Orders': ['totalOrders', 'num'], 'Total Amount Paid': ['totalAmountPaid', 'num'],
      'Pending Amount': ['pendingAmount', 'num'], 'Average Rate': ['averageRate', 'num'],
      'Last Order Date': ['lastOrderDate', 'dateDMY'],
      'Orders By Segment': ['ordersBySegment', 'mapIdAmt'],
      'Amount By Segment': ['amountBySegment', 'mapIdAmt'], 'Note': ['note', 'str'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Categories': {
    ref: r => db.collection('categories').doc(str(r['ID'])),
    fields: { 'Name': ['name', 'str'], 'Type': ['type', 'str'], 'Active': ['isActive', 'bool'], 'Segments': ['segments', 'listSemi'] },
  },
  'Segments': {
    ref: r => db.collection('segments').doc(str(r['ID'])),
    fields: {
      'Name': ['name', 'str'], 'Description': ['description', 'str'], 'Icon': ['icon', 'str'],
      'Active': ['isActive', 'bool'], 'Segment Type': ['segmentType', 'str'],
      'Unit': ['unit', 'str'], 'Current Stock': ['currentStock', 'num'],
      'Breeds': ['breeds', 'listSemi'], 'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Users': {
    ref: r => db.collection('users').doc(str(r['UID'])),
    idColumn: 'UID',
    fields: {
      'Email': ['email', 'str'], 'Display Name': ['displayName', 'str'], 'Role': ['role', 'str'],
      'Assigned Segments': ['assignedSegments', 'listSemi'], 'Active': ['isActive', 'bool'],
      'Created By': ['createdBy', 'str'], 'Created At': ['createdAt', 'dateISO'],
      'Updated At': ['updatedAt', 'dateISO'],
    },
  },
  'Tasks': {
    ref: r => db.collection('tasks').doc(str(r['ID'])),
    fields: {
      'Title': ['title', 'str'], 'Description': ['description', 'str'],
      'Priority': ['priority', 'str'], 'Status': ['status', 'str'],
      'Visibility': ['visibility', 'str'], 'Assignee': ['assignee', 'str'],
      'Assignee Name': ['assigneeName', 'str'], 'Due Date': ['dueDate', 'dateDMY'],
      'Subtasks': ['subtasks', 'json'], 'Tags': ['tags', 'listComma'],
      'Kanban Order': ['kanbanOrder', 'num'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'], 'Updated At': ['updatedAt', 'dateISO'],
      'Completed At': ['completedAt', 'dateISO'],
    },
  },
  'Schedules': {
    ref: r => db.collection('schedules').doc(str(r['ID'])),
    fields: {
      'Type': ['type', 'str'], 'Title': ['title', 'str'], 'Description': ['description', 'str'],
      'Frequency': ['frequency', 'str'], 'Start Date': ['startDate', 'dateDMY'],
      'End Date': ['endDate', 'dateDMY'], 'Next Due Date': ['nextDueDate', 'dateDMY'],
      'Last Processed': ['lastProcessedDate', 'dateISO'], 'Active': ['isActive', 'bool'],
      'Processed Count': ['processedCount', 'num'],
      'Transaction Template': ['transactionTemplate', 'json'],
      'Reminder Config': ['reminderConfig', 'json'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Harvests': {
    ref: r => db.collection('harvests').doc(str(r['ID'])),
    fields: {
      'Segment': ['segment', 'str'], 'Segment Name': ['segmentName', 'str'],
      'Status': ['status', 'str'], 'Harvest Date': ['harvestDate', 'dateDMY'],
      'Crop Name': ['cropName', 'str'], 'Variety': ['variety', 'str'],
      'Total Quantity': ['totalQuantity', 'num'], 'Unit': ['unit', 'str'],
      'Grade': ['grade', 'str'], 'Storage Location': ['storageLocation', 'str'],
      'Storage Date': ['storageDate', 'dateDMY'], 'Total Sold': ['totalSold', 'num'],
      'Total Revenue': ['totalRevenue', 'num'], 'Wastage Quantity': ['wastageQuantity', 'num'],
      'Wastage Reason': ['wastageReason', 'str'], 'Wastage Date': ['wastageDate', 'dateDMY'],
      'Remaining Quantity': ['remainingQuantity', 'num'], 'Average Rate': ['averageRate', 'num'],
      'Harvest Cost': ['harvestCost', 'num'],
      'Linked Crop Activity ID': ['linkedCropActivityId', 'str'], 'Note': ['note', 'str'],
      'Month': ['month', 'str'], 'Year': ['year', 'num'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Breeding': {
    ref: r => db.collection('breedingRecords').doc(str(r['ID'])),
    fields: {
      'Segment': ['segment', 'str'], 'Segment Name': ['segmentName', 'str'],
      'Sire ID': ['sireId', 'str'], 'Sire Name': ['sireName', 'str'],
      'Dam ID': ['damId', 'str'], 'Dam Name': ['damName', 'str'],
      'Mating Date': ['matingDate', 'dateDMY'], 'Mating Method': ['matingMethod', 'str'],
      'Status': ['status', 'str'], 'Expected Delivery': ['expectedDeliveryDate', 'dateDMY'],
      'Gestation Days': ['gestationDays', 'num'], 'Actual Delivery': ['actualDeliveryDate', 'dateDMY'],
      'Offspring Count': ['offspringCount', 'num'], 'Offspring Male': ['offspringMale', 'num'],
      'Offspring Female': ['offspringFemale', 'num'],
      'Offspring Animal IDs': ['offspringAnimalIds', 'listSemi'],
      'Complications': ['complications', 'str'], 'Veterinary Cost': ['veterinaryCost', 'num'],
      'Linked Txn ID': ['linkedTransactionId', 'str'], 'Note': ['note', 'str'],
      'Month': ['month', 'str'], 'Year': ['year', 'num'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Crop Activities': {
    ref: r => db.collection('cropActivities').doc(str(r['ID'])),
    fields: {
      'Date': ['date', 'dateDMY'], 'Segment': ['segment', 'str'],
      'Segment Name': ['segmentName', 'str'], 'Activity Type': ['activityType', 'str'],
      'Description': ['description', 'str'], 'Product Used': ['productUsed', 'str'],
      'Quantity': ['quantity', 'num'], 'Unit': ['unit', 'str'], 'Area': ['area', 'str'],
      'Duration': ['duration', 'num'], 'Labor Count': ['laborCount', 'num'],
      'Cost': ['cost', 'num'], 'Linked Txn ID': ['linkedTransactionId', 'str'],
      'Weather': ['weather', 'str'], 'Temperature': ['temperature', 'num'],
      'Note': ['note', 'str'], 'Month': ['month', 'str'], 'Year': ['year', 'num'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
  'Consumables': {
    ref: r => db.collection('inventoryItems').doc(str(r['ID'])),
    fields: {
      'Name': ['name', 'str'], 'Category': ['category', 'str'], 'Unit': ['unit', 'str'],
      'Current Stock': ['currentStock', 'num'], 'Minimum Stock': ['minimumStock', 'num'],
      'Segments': ['segments', 'listSemi'], 'Segment Names': ['segmentNames', 'listSemi'],
      'Total Purchased': ['totalPurchased', 'num'], 'Total Used': ['totalUsed', 'num'],
      'Total Wastage': ['totalWastage', 'num'], 'Total Spent': ['totalSpent', 'num'],
      'Last Purchase Rate': ['lastPurchaseRate', 'num'],
      'Average Purchase Rate': ['averagePurchaseRate', 'num'], 'Note': ['note', 'str'],
      'Created By': ['createdBy', 'str'], 'Created By Name': ['createdByName', 'str'],
      'Created At': ['createdAt', 'dateISO'],
    },
  },
};

// Embedded child sheets: verify the parent doc's array contains a matching entry
const EMBEDDED_SHEETS = {
  'Loan Deductions': { parent: 'loans', parentKey: 'Loan ID', arrayField: 'deductions', matchKey: 'ID', matchField: 'id', amountCol: 'Amount', amountField: 'amount' },
  'Loan Collateral': { parent: 'loans', parentKey: 'Loan ID', arrayField: 'collaterals', matchKey: 'ID', matchField: 'id', amountCol: 'Value', amountField: 'estimatedValue' },
  'Loan Rate Changes': { parent: 'loans', parentKey: 'Loan ID', arrayField: 'rateChanges', matchKey: 'ID', matchField: 'id', amountCol: 'New Rate', amountField: 'newRate' },
  'Loan Documents': { parent: 'loans', parentKey: 'Loan ID', arrayField: 'documents', matchKey: 'ID', matchField: 'id' },
  'Animal Costs': { parent: 'animals', parentKey: 'Animal ID', arrayField: 'costEntries', matchKey: 'Transaction ID', matchField: 'transactionId', amountCol: 'Amount', amountField: 'amount' },
  'Animal Vaccinations': { parent: 'animals', parentKey: 'Animal ID', arrayField: 'vaccinationHistory', matchKey: 'ID', matchField: 'id' },
  'Animal Medical': { parent: 'animals', parentKey: 'Animal ID', arrayField: 'medicalHistory', matchKey: 'ID', matchField: 'id' },
  'Animal Weights': { parent: 'animals', parentKey: 'Animal ID', arrayField: 'weightLogs', matchKey: 'ID', matchField: 'id', amountCol: 'Weight', amountField: 'weight' },
  'Harvest Sales': { parent: 'harvests', parentKey: 'Harvest ID', arrayField: 'sales', matchKey: 'ID', matchField: 'id', amountCol: 'Total Amount', amountField: 'totalAmount' },
  'Stock Movements': { parent: 'inventoryItems', parentKey: 'Item ID', arrayField: 'movements', matchKey: 'ID', matchField: 'id', amountCol: 'Quantity', amountField: 'quantity' },
};

// Meta count → live collection (for live count comparison)
const LIVE_COLLECTIONS = {
  'Loans': 'loans', 'Inventory Events': 'inventoryEvents', 'Animals': 'animals',
  'Buyers': 'buyers', 'Suppliers': 'suppliers', 'Categories': 'categories',
  'Segments': 'segments', 'Users': 'users', 'Tasks': 'tasks', 'Schedules': 'schedules',
  'Harvests': 'harvests', 'Breeding': 'breedingRecords', 'Crop Activities': 'cropActivities',
  'Consumables': 'inventoryItems',
};

// ── Verification ───────────────────────────────────────────

async function fetchInChunks(rows, refOf) {
  const results = new Map();
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const snaps = await db.getAll(...chunk.map(refOf));
    snaps.forEach((snap, j) => results.set(i + j, snap));
  }
  return results;
}

async function main() {
  const filePath = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!filePath) {
    console.error('Usage: node verify-backup.js <excel-file>');
    process.exit(1);
  }

  const wb = XLSX.readFile(path.resolve(filePath));
  console.log('');
  console.log('=== FARM TRACKER - VERIFY BACKUP vs FIRESTORE ===');
  console.log(`  File: ${path.resolve(filePath)}`);
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`  Target: emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
  }
  console.log('');

  let totalDiffs = 0;

  // 1. Full field comparison for top-level sheets
  for (const [sheetName, cfg] of Object.entries(SHEETS)) {
    if (!wb.Sheets[sheetName]) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    if (!rows.length) continue;

    const idCol = cfg.idColumn || 'ID';
    const withIds = rows.filter(r => str(r[idCol]));
    const snaps = await fetchInChunks(withIds, r => cfg.ref(r));

    let missing = 0, fieldDiffs = 0;
    const diffSamples = [];
    withIds.forEach((r, i) => {
      const snap = snaps.get(i);
      if (!snap || !snap.exists) {
        missing++;
        if (diffSamples.length < MAX_DIFFS_SHOWN) diffSamples.push(`    MISSING doc ${str(r[idCol])}`);
        return;
      }
      const data = snap.data();
      for (const [col, [field, type]] of Object.entries(cfg.fields)) {
        // Blank cells are omitted by sheet_to_json; also tolerates older files
        if (!(col in r)) continue;
        const diff = compare[type](r[col], data[field]);
        if (diff) {
          fieldDiffs++;
          if (diffSamples.length < MAX_DIFFS_SHOWN) {
            diffSamples.push(`    ${str(r[idCol])} · ${col}: ${diff}`);
          }
        }
      }
    });

    totalDiffs += missing + fieldDiffs;
    const status = missing + fieldDiffs === 0 ? 'OK' : `MISSING ${missing}, FIELD DIFFS ${fieldDiffs}`;
    console.log(`  ${sheetName}: ${withIds.length} rows — ${status}`);
    diffSamples.forEach(s => console.log(s));
  }

  // 2. Embedded child sheets: entry must exist in the parent array
  for (const [sheetName, cfg] of Object.entries(EMBEDDED_SHEETS)) {
    if (!wb.Sheets[sheetName]) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    if (!rows.length) continue;

    const parentIds = [...new Set(rows.map(r => str(r[cfg.parentKey])).filter(Boolean))];
    const parentDocs = new Map();
    for (let i = 0; i < parentIds.length; i += 100) {
      const chunk = parentIds.slice(i, i + 100);
      const snaps = await db.getAll(...chunk.map(id => db.collection(cfg.parent).doc(id)));
      snaps.forEach((snap, j) => parentDocs.set(chunk[j], snap.exists ? snap.data() : null));
    }

    let diffs = 0;
    const diffSamples = [];
    for (const r of rows) {
      const parentId = str(r[cfg.parentKey]);
      const parent = parentDocs.get(parentId);
      const arr = parent ? parent[cfg.arrayField] || [] : null;
      const key = str(r[cfg.matchKey]);
      const entry = arr ? arr.find(e => str(e[cfg.matchField]) === key) : null;
      let problem = null;
      if (!parent) problem = `parent ${parentId} missing`;
      else if (!entry) problem = `entry ${key} not in ${cfg.arrayField}`;
      else if (cfg.amountCol && compare.num(r[cfg.amountCol], entry[cfg.amountField])) {
        problem = `${cfg.amountCol}: ${r[cfg.amountCol]} vs ${entry[cfg.amountField]}`;
      }
      if (problem) {
        diffs++;
        if (diffSamples.length < MAX_DIFFS_SHOWN) diffSamples.push(`    ${parentId}/${key}: ${problem}`);
      }
    }

    totalDiffs += diffs;
    console.log(`  ${sheetName}: ${rows.length} rows — ${diffs === 0 ? 'OK' : `${diffs} diffs`}`);
    diffSamples.forEach(s => console.log(s));
  }

  // 3. Tags
  if (wb.Sheets['Tags']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Tags']);
    const cellTags = rows.map(r => str(r['Tag'])).filter(Boolean).sort();
    const snap = await db.collection('meta').doc('tags').get();
    const liveTags = (snap.exists ? snap.data().all || [] : []).map(String).sort();
    const equal = JSON.stringify(cellTags) === JSON.stringify(liveTags);
    if (!equal) totalDiffs++;
    console.log(`  Tags: ${cellTags.length} rows — ${equal ? 'OK' : `differs (live has ${liveTags.length})`}`);
  }

  // 4. Meta counts vs live collection counts
  if (wb.Sheets['Meta']) {
    console.log('');
    console.log('  Meta counts vs live collections:');
    const meta = {};
    for (const row of XLSX.utils.sheet_to_json(wb.Sheets['Meta'])) meta[row.Field] = row.Value;

    const liveCount = async col => {
      const snap = await db.collection(col).get();
      return snap.docs.filter(d => d.data().isDeleted !== true).length;
    };

    // transactions = Expenses + Income
    const expectedTxns = Number(meta['Count: Expenses'] || 0) + Number(meta['Count: Income'] || 0);
    const liveTxns = await liveCount('transactions');
    if (liveTxns !== expectedTxns) {
      totalDiffs++;
      console.log(`    transactions: Meta ${expectedTxns} vs live ${liveTxns} ✗`);
    } else {
      console.log(`    transactions: ${liveTxns} ✓`);
    }

    for (const [metaName, col] of Object.entries(LIVE_COLLECTIONS)) {
      if (!(`Count: ${metaName}` in meta)) continue;
      const expected = Number(meta[`Count: ${metaName}`]);
      const live = await liveCount(col);
      if (live !== expected) {
        totalDiffs++;
        console.log(`    ${col}: Meta ${expected} vs live ${live} ✗`);
      } else {
        console.log(`    ${col}: ${live} ✓`);
      }
    }
  }

  console.log('');
  if (totalDiffs === 0) {
    console.log('=== VERIFY PASSED: backup matches Firestore ===');
    process.exit(0);
  } else {
    console.log(`=== VERIFY FAILED: ${totalDiffs} differences ===`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Verify failed:', err.message);
  process.exit(1);
});
