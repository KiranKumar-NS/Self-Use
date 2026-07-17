/**
 * Reconcile denormalized aggregates from raw transactions.
 *
 * Recomputes:
 *   1. monthlySummaries / yearlySummaries (totals, category/person maps,
 *      pending counters net of partial payments, distributions)
 *   2. buyers / suppliers stat counters (totals, segment maps, supplier
 *      pendingAmount)
 *
 * Usage:
 *   node reconcile-summaries.js           # dry run — report drift only
 *   node reconcile-summaries.js --apply   # write corrections
 *
 * Requires service-account-key.json (same as the other admin scripts).
 * Mirrors src/app/core/services/summary-reconciliation.service.ts — keep in sync.
 */

const admin = require('firebase-admin');
const path = require('path');

const APPLY = process.argv.includes('--apply');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, 'service-account-key.json'))),
});
const db = admin.firestore();

/** Mirrors TransactionService.personSummaryKey */
function personSummaryKey(paidBy, paidByName, fallbackUid) {
  if (paidBy === 'other' && paidByName) {
    const normalized = paidByName.trim().replace(/\s+/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return normalized.replace(/[.$/\[\]#]/g, '_');
  }
  return paidBy || fallbackUid;
}

/** Mirrors pendingRemaining() in transaction.model.ts */
function pendingRemaining(txn) {
  if (txn.type === 'income') {
    if ((txn.paymentStatus || 'received') !== 'pending') return 0;
    return Math.max(0, txn.amount - (txn.amountReceived || 0));
  }
  if ((txn.expensePaymentStatus || 'paid') !== 'pending') return 0;
  return Math.max(0, txn.amount - (txn.amountPaid || 0));
}

function emptyAcc() {
  return {
    totalExpense: 0, totalIncome: 0,
    expenseByCategory: {}, incomeBySource: {},
    expenseByCategoryId: {}, incomeBySourceId: {},
    expenseByPerson: {}, incomeByPerson: {},
    pendingIncome: 0, pendingExpense: 0,
    totalDistributed: 0, distributionByPerson: {},
  };
}

function accumulate(acc, txn) {
  const personKey = personSummaryKey(txn.paidBy, txn.paidByName, txn.createdBy);
  if (txn.type === 'expense') {
    acc.totalExpense += txn.amount;
    acc.expenseByCategory[txn.categoryName] = (acc.expenseByCategory[txn.categoryName] || 0) + txn.amount;
    acc.expenseByCategoryId[txn.category] = (acc.expenseByCategoryId[txn.category] || 0) + txn.amount;
    acc.expenseByPerson[personKey] = (acc.expenseByPerson[personKey] || 0) + txn.amount;
    if ((txn.expensePaymentStatus || 'paid') === 'pending') acc.pendingExpense += pendingRemaining(txn);
  } else {
    acc.totalIncome += txn.amount;
    acc.incomeBySource[txn.categoryName] = (acc.incomeBySource[txn.categoryName] || 0) + txn.amount;
    acc.incomeBySourceId[txn.category] = (acc.incomeBySourceId[txn.category] || 0) + txn.amount;
    acc.incomeByPerson[personKey] = (acc.incomeByPerson[personKey] || 0) + txn.amount;
    if ((txn.paymentStatus || 'received') === 'pending') acc.pendingIncome += pendingRemaining(txn);
  }
  if (Array.isArray(txn.distributions)) {
    for (const d of txn.distributions) {
      acc.totalDistributed += d.amount;
      acc.distributionByPerson[d.uid] = (acc.distributionByPerson[d.uid] || 0) + d.amount;
    }
  }
}

const sameMap = (a, b) =>
  JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());

function summaryDrifted(existing, computed) {
  if (!existing) return 'missing';
  const scalarFields = ['totalExpense', 'totalIncome', 'netProfit', 'pendingIncome', 'pendingExpense', 'totalDistributed'];
  for (const f of scalarFields) {
    if ((existing[f] || 0) !== computed[f]) return `${f}: ${existing[f] || 0} → ${computed[f]}`;
  }
  const mapFields = ['expenseByCategory', 'incomeBySource', 'expenseByCategoryId', 'incomeBySourceId',
    'expenseByPerson', 'incomeByPerson', 'distributionByPerson'];
  for (const f of mapFields) {
    if (!sameMap(existing[f], computed[f])) return `${f} map differs`;
  }
  return null;
}

async function commitInBatches(writes) {
  const BATCH = 500;
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + BATCH)) {
      if (w.delete) batch.delete(w.ref);
      else if (w.update) batch.update(w.ref, w.data);
      else batch.set(w.ref, w.data);
    }
    await batch.commit();
  }
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing corrections)' : 'DRY RUN (report only)'}\n`);

  const txnSnap = await db.collection('transactions').where('isDeleted', '==', false).get();
  const transactions = txnSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Transactions loaded: ${transactions.length}`);

  // ---------- 1. Summaries ----------
  const monthlyMap = new Map();
  const yearlyMap = new Map();
  for (const txn of transactions) {
    const mKey = `${txn.month}-${txn.segment}`;
    if (!monthlyMap.has(mKey)) monthlyMap.set(mKey, { acc: emptyAcc(), month: txn.month, year: txn.year, segment: txn.segment });
    accumulate(monthlyMap.get(mKey).acc, txn);

    const yKey = `${txn.year}-${txn.segment}`;
    if (!yearlyMap.has(yKey)) yearlyMap.set(yKey, { acc: emptyAcc(), year: txn.year, segment: txn.segment });
    accumulate(yearlyMap.get(yKey).acc, txn);
  }

  const [existingMonthly, existingYearly] = await Promise.all([
    db.collection('monthlySummaries').get(),
    db.collection('yearlySummaries').get(),
  ]);
  const existingMonthlyMap = new Map(existingMonthly.docs.map(d => [d.id, d.data()]));
  const existingYearlyMap = new Map(existingYearly.docs.map(d => [d.id, d.data()]));

  const writes = [];
  let monthlyCorrected = 0;
  let yearlyCorrected = 0;

  const buildDoc = (acc, identity) => ({
    ...identity,
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
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  for (const [key, { acc, month, year, segment }] of monthlyMap) {
    const computedDoc = buildDoc(acc, { month, year, segment });
    const drift = summaryDrifted(existingMonthlyMap.get(key), { ...acc, netProfit: acc.totalIncome - acc.totalExpense });
    if (drift) {
      monthlyCorrected++;
      console.log(`  monthly ${key}: ${drift}`);
      writes.push({ ref: db.collection('monthlySummaries').doc(key), data: computedDoc });
    }
  }
  for (const [key, { acc, year, segment }] of yearlyMap) {
    const computedDoc = buildDoc(acc, { year, segment });
    const drift = summaryDrifted(existingYearlyMap.get(key), { ...acc, netProfit: acc.totalIncome - acc.totalExpense });
    if (drift) {
      yearlyCorrected++;
      console.log(`  yearly ${key}: ${drift}`);
      writes.push({ ref: db.collection('yearlySummaries').doc(key), data: computedDoc });
    }
  }

  const orphanMonthly = [...existingMonthlyMap.keys()].filter(id => !monthlyMap.has(id));
  const orphanYearly = [...existingYearlyMap.keys()].filter(id => !yearlyMap.has(id));
  for (const id of orphanMonthly) {
    console.log(`  monthly ${id}: orphaned (no transactions) — delete`);
    writes.push({ ref: db.collection('monthlySummaries').doc(id), delete: true });
  }
  for (const id of orphanYearly) {
    console.log(`  yearly ${id}: orphaned (no transactions) — delete`);
    writes.push({ ref: db.collection('yearlySummaries').doc(id), delete: true });
  }

  console.log(`\nSummaries: ${monthlyMap.size} monthly / ${yearlyMap.size} yearly computed; ` +
    `${monthlyCorrected} monthly + ${yearlyCorrected} yearly drifted; ` +
    `${orphanMonthly.length + orphanYearly.length} orphaned`);

  // ---------- 2. Counterparties ----------
  const emptyParty = () => ({ count: 0, amount: 0, pending: 0, lastDate: 0, countBySegment: {}, amountBySegment: {} });
  const buyerAcc = new Map();
  const supplierAcc = new Map();
  for (const txn of transactions) {
    if (txn.type === 'income' && txn.linkedBuyerId) {
      if (!buyerAcc.has(txn.linkedBuyerId)) buyerAcc.set(txn.linkedBuyerId, emptyParty());
      const acc = buyerAcc.get(txn.linkedBuyerId);
      const units = txn.quantity || 1;
      acc.count += units;
      acc.amount += txn.amount;
      acc.lastDate = Math.max(acc.lastDate, txn.date.toMillis());
      acc.countBySegment[txn.segment] = (acc.countBySegment[txn.segment] || 0) + units;
      acc.amountBySegment[txn.segment] = (acc.amountBySegment[txn.segment] || 0) + txn.amount;
    }
    if (txn.type === 'expense' && txn.linkedSupplierId && !txn.linkedLoanId) {
      if (!supplierAcc.has(txn.linkedSupplierId)) supplierAcc.set(txn.linkedSupplierId, emptyParty());
      const acc = supplierAcc.get(txn.linkedSupplierId);
      acc.count += 1;
      acc.amount += txn.amount;
      acc.pending += pendingRemaining(txn);
      acc.lastDate = Math.max(acc.lastDate, txn.date.toMillis());
      acc.countBySegment[txn.segment] = (acc.countBySegment[txn.segment] || 0) + 1;
      acc.amountBySegment[txn.segment] = (acc.amountBySegment[txn.segment] || 0) + txn.amount;
    }
  }

  const round2 = n => Math.round(n * 100) / 100;
  const [buyerSnap, supplierSnap] = await Promise.all([
    db.collection('buyers').get(),
    db.collection('suppliers').get(),
  ]);

  let buyersCorrected = 0;
  for (const snap of buyerSnap.docs) {
    const buyer = snap.data();
    if (buyer.isDeleted) continue;
    const acc = buyerAcc.get(snap.id) || emptyParty();
    const averageRate = acc.count > 0 ? round2(acc.amount / acc.count) : 0;
    const drifted =
      (buyer.totalPurchases || 0) !== acc.count ||
      (buyer.totalAmountPaid || 0) !== acc.amount ||
      (buyer.averageRate || 0) !== averageRate ||
      ((buyer.lastPurchaseDate && buyer.lastPurchaseDate.toMillis()) || 0) !== acc.lastDate ||
      !sameMap(buyer.purchasesBySegment, acc.countBySegment) ||
      !sameMap(buyer.amountBySegment, acc.amountBySegment);
    if (!drifted) continue;
    buyersCorrected++;
    console.log(`  buyer ${buyer.name} (${snap.id}): purchases ${buyer.totalPurchases || 0}→${acc.count}, amount ${buyer.totalAmountPaid || 0}→${acc.amount}`);
    writes.push({
      ref: db.collection('buyers').doc(snap.id),
      update: true,
      data: {
        totalPurchases: acc.count,
        totalAmountPaid: acc.amount,
        averageRate,
        lastPurchaseDate: acc.lastDate ? admin.firestore.Timestamp.fromMillis(acc.lastDate) : null,
        purchasesBySegment: acc.countBySegment,
        amountBySegment: acc.amountBySegment,
      },
    });
  }

  let suppliersCorrected = 0;
  for (const snap of supplierSnap.docs) {
    const supplier = snap.data();
    if (supplier.isDeleted) continue;
    const acc = supplierAcc.get(snap.id) || emptyParty();
    const averageRate = acc.count > 0 ? round2(acc.amount / acc.count) : 0;
    const drifted =
      (supplier.totalOrders || 0) !== acc.count ||
      (supplier.totalAmountPaid || 0) !== acc.amount ||
      (supplier.pendingAmount || 0) !== acc.pending ||
      (supplier.averageRate || 0) !== averageRate ||
      ((supplier.lastOrderDate && supplier.lastOrderDate.toMillis()) || 0) !== acc.lastDate ||
      !sameMap(supplier.ordersBySegment, acc.countBySegment) ||
      !sameMap(supplier.amountBySegment, acc.amountBySegment);
    if (!drifted) continue;
    suppliersCorrected++;
    console.log(`  supplier ${supplier.name} (${snap.id}): orders ${supplier.totalOrders || 0}→${acc.count}, amount ${supplier.totalAmountPaid || 0}→${acc.amount}, pending ${supplier.pendingAmount || 0}→${acc.pending}`);
    writes.push({
      ref: db.collection('suppliers').doc(snap.id),
      update: true,
      data: {
        totalOrders: acc.count,
        totalAmountPaid: acc.amount,
        pendingAmount: acc.pending,
        averageRate,
        lastOrderDate: acc.lastDate ? admin.firestore.Timestamp.fromMillis(acc.lastDate) : null,
        ordersBySegment: acc.countBySegment,
        amountBySegment: acc.amountBySegment,
      },
    });
  }

  console.log(`Counterparties: ${buyersCorrected} buyer(s) + ${suppliersCorrected} supplier(s) drifted`);
  console.log(`\nTotal pending writes: ${writes.length}`);

  if (!APPLY) {
    console.log('\nDry run complete — re-run with --apply to write corrections.');
    return;
  }
  if (writes.length === 0) {
    console.log('\nNothing to correct.');
    return;
  }
  await commitInBatches(writes);
  console.log(`\nApplied ${writes.length} correction(s).`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('Reconciliation failed:', err); process.exit(1); });
