/**
 * ============================================================
 * CLEAN DATABASE SCRIPT
 * Farm Tracker - Multi-User Farming Financial Management System
 * ============================================================
 *
 * Deletes data from Firestore collections. Use this to reset the database
 * during development/testing or to clear specific collections.
 *
 * ────────────────────────────────────────────────────────────
 * PREREQUISITES
 * ────────────────────────────────────────────────────────────
 *
 * 1. Install firebase-admin:
 *      cd scripts
 *      npm install firebase-admin
 *
 * 2. Download service account key:
 *      - Go to Firebase Console > Project Settings > Service Accounts
 *      - Click "Generate New Private Key"
 *      - Save the file as: scripts/service-account-key.json
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   node scripts/clean-db.js <command> [--yes]
 *
 * Commands:
 *
 *   all           - Delete ALL data collections: transactions, loans, tasks,
 *                   inventory events, animals, harvests, breeding records,
 *                   crop activities, schedules, monthly & yearly summaries.
 *                   Keeps users, segments, categories, buyers, suppliers and
 *                   inventoryItems (consumable masters) but resets their
 *                   denormalized counters/stock/movements and clears meta/tags.
 *
 *   transactions  - Delete all transactions + monthly/yearly summaries
 *   loans         - Delete all loans and their repayment subcollections
 *   tasks         - Delete all tasks
 *   inventory     - Delete all inventory events (resets stock via segments)
 *   summaries     - Delete all monthly & yearly summary documents
 *   status        - Read-only: print document counts per collection
 *
 * Flags:
 *
 *   --yes         - Skip the interactive confirmation prompt
 *
 * ────────────────────────────────────────────────────────────
 * EXAMPLES
 * ────────────────────────────────────────────────────────────
 *
 *   # Full database reset (deletes EVERYTHING)
 *   node scripts/clean-db.js all
 *
 *   # Clear only transactions (keeps users, loans, etc.)
 *   node scripts/clean-db.js transactions
 *
 *   # Clear only loans and repayments
 *   node scripts/clean-db.js loans
 *
 * ────────────────────────────────────────────────────────────
 * COLLECTIONS IN THE DATABASE
 * ────────────────────────────────────────────────────────────
 *
 *   users             - User profiles (uid, email, role, segments)        [kept]
 *   segments          - Business segments + currentStock + budgets       [kept, stock reset]
 *   categories        - Transaction categories (Feed, Medicine, Milk...)  [kept]
 *   buyers            - Buyer master + denormalized stats                 [kept, stats reset]
 *   suppliers         - Supplier master + denormalized stats              [kept, stats reset]
 *   inventoryItems    - Consumable item masters + embedded movements      [kept, movements/stock reset]
 *   meta/tags         - Single doc {all: string[]} of transaction tags    [kept, reset to []]
 *   transactions      - All expense and income records (with inline timeline)
 *   tasks             - Task records
 *   loans             - Owe & Lent records (with inline timeline)
 *     └─ repayments   - Subcollection: repayment history + disbursements per loan
 *   inventoryEvents   - Inventory events (birth, death, purchase, sale, adjustment)
 *   animals           - Individual animal records
 *   harvests          - Harvest records (with embedded sales)
 *   breedingRecords   - Breeding records
 *   cropActivities    - Crop activity records
 *   schedules         - Recurring schedules/reminders
 *   monthlySummaries  - Precomputed monthly totals per segment
 *   yearlySummaries   - Precomputed yearly totals per segment
 *
 * ────────────────────────────────────────────────────────────
 * SAFETY NOTES
 * ────────────────────────────────────────────────────────────
 *
 *   - This script permanently deletes data. There is NO undo.
 *   - A confirmation prompt is shown before destructive actions.
 *   - Subcollections (loan repayments) are deleted recursively.
 *   - Monthly summaries are cleaned when transactions are cleared.
 *
 * ============================================================
 */

const admin = require('firebase-admin');
const path = require('path');
const readline = require('readline');

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

// ── Parse Arguments ────────────────────────────────────────
const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes');
const command = args.filter((a) => a !== '--yes')[0];

const VALID_COMMANDS = ['all', 'transactions', 'loans', 'tasks', 'inventory', 'summaries', 'status'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('');
  console.error('Usage: node scripts/clean-db.js <command> [--yes]');
  console.error('');
  console.error('Commands:');
  console.error('  all           - Delete all data collections (keeps users/segments/categories/buyers/suppliers/inventoryItems, resets their counters)');
  console.error('  transactions  - Delete all transactions and summaries');
  console.error('  loans         - Delete all loans and repayments');
  console.error('  tasks         - Delete all tasks');
  console.error('  inventory     - Delete all inventory events and reset stock counts');
  console.error('  summaries     - Delete all monthly & yearly summaries');
  console.error('  status        - Read-only: print document counts per collection');
  console.error('');
  console.error('Flags:');
  console.error('  --yes         - Skip the confirmation prompt');
  console.error('');
  process.exit(1);
}

// ── Helper Functions ───────────────────────────────────────

async function confirm(message) {
  if (skipConfirm) {
    console.log(`${message} (yes/no): yes [--yes flag]`);
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function deleteCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`  ${collectionPath}: already empty`);
    return 0;
  }

  const batchSize = 400; // Firestore batch limit is 500
  let deleted = 0;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + batchSize);
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  console.log(`  ${collectionPath}: ${deleted} documents deleted`);
  return deleted;
}

async function deleteCollectionWithSubcollections(collectionPath, subcollectionName) {
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`  ${collectionPath}: already empty`);
    return 0;
  }

  let deleted = 0;

  for (const doc of snapshot.docs) {
    // Delete subcollection first
    const subSnapshot = await doc.ref.collection(subcollectionName).get();
    if (!subSnapshot.empty) {
      const batch = db.batch();
      subSnapshot.docs.forEach((subDoc) => batch.delete(subDoc.ref));
      await batch.commit();
      deleted += subSnapshot.docs.length;
    }
    // Delete parent doc
    await doc.ref.delete();
    deleted++;
  }

  console.log(`  ${collectionPath}: ${deleted} documents deleted (including ${subcollectionName})`);
  return deleted;
}

async function resetSegmentStock() {
  const snapshot = await db.collection('segments').get();
  if (snapshot.empty) return;
  const batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { currentStock: 0 });
    count++;
  }
  if (count > 0) {
    await batch.commit();
    console.log(`  segments: ${count} stock counts reset to 0`);
  }
}

async function resetBuyerStats() {
  const snapshot = await db.collection('buyers').get();
  if (snapshot.empty) {
    console.log('  buyers: none to reset');
    return;
  }
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      totalPurchases: 0,
      totalAmountPaid: 0,
      purchasesBySegment: {},
      amountBySegment: {},
      averageRate: admin.firestore.FieldValue.delete(),
      lastPurchaseDate: admin.firestore.FieldValue.delete(),
    });
  });
  await batch.commit();
  console.log(`  buyers: ${snapshot.size} stat counters reset`);
}

async function resetSupplierStats() {
  const snapshot = await db.collection('suppliers').get();
  if (snapshot.empty) {
    console.log('  suppliers: none to reset');
    return;
  }
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      totalOrders: 0,
      totalAmountPaid: 0,
      pendingAmount: 0,
      ordersBySegment: {},
      amountBySegment: {},
      averageRate: admin.firestore.FieldValue.delete(),
      lastOrderDate: admin.firestore.FieldValue.delete(),
    });
  });
  await batch.commit();
  console.log(`  suppliers: ${snapshot.size} stat counters reset`);
}

async function resetInventoryItems() {
  const snapshot = await db.collection('inventoryItems').get();
  if (snapshot.empty) {
    console.log('  inventoryItems: none to reset');
    return;
  }
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      movements: [],
      currentStock: 0,
      totalPurchased: 0,
      totalUsed: 0,
      totalWastage: 0,
      totalSpent: 0,
      lastPurchaseRate: admin.firestore.FieldValue.delete(),
      averagePurchaseRate: admin.firestore.FieldValue.delete(),
    });
  });
  await batch.commit();
  console.log(`  inventoryItems: ${snapshot.size} items reset (movements cleared, stock 0)`);
}

async function resetTags() {
  await db.doc('meta/tags').set({ all: [] });
  console.log('  meta/tags: reset to []');
}

async function printStatus() {
  const collections = [
    'users', 'segments', 'categories', 'buyers', 'suppliers', 'inventoryItems',
    'transactions', 'loans', 'tasks', 'inventoryEvents', 'animals', 'harvests',
    'breedingRecords', 'cropActivities', 'schedules', 'monthlySummaries', 'yearlySummaries',
  ];
  for (const name of collections) {
    const count = (await db.collection(name).count().get()).data().count;
    console.log(`  ${name.padEnd(18)} ${count}`);
  }
  const tagsDoc = await db.doc('meta/tags').get();
  const tagCount = tagsDoc.exists ? (tagsDoc.data().all || []).length : 0;
  console.log(`  ${'meta/tags'.padEnd(18)} ${tagCount} tags`);
}

// ── Main Execution ─────────────────────────────────────────

async function run() {
  console.log('');
  console.log('=== FARM TRACKER - DATABASE CLEANUP ===');
  console.log('');

  switch (command) {
    case 'all': {
      console.log('This will delete: transactions, loans+repayments, tasks, inventory events,');
      console.log('animals, harvests, breeding records, crop activities, schedules,');
      console.log('monthly & yearly summaries.');
      console.log('Kept (with counters reset): users, segments, categories, buyers, suppliers,');
      console.log('inventoryItems, meta/tags.');
      const ok = await confirm('Proceed?');
      if (!ok) {
        console.log('Cancelled.');
        process.exit(0);
      }
      console.log('');
      console.log('Deleting all data...');
      await deleteCollection('transactions');
      await deleteCollectionWithSubcollections('loans', 'repayments');
      await deleteCollection('tasks');
      await deleteCollection('inventoryEvents');
      await deleteCollection('animals');
      await deleteCollection('harvests');
      await deleteCollection('breedingRecords');
      await deleteCollection('cropActivities');
      await deleteCollection('schedules');
      await deleteCollection('monthlySummaries');
      await deleteCollection('yearlySummaries');
      console.log('');
      console.log('Resetting reference-data counters...');
      await resetSegmentStock();
      await resetBuyerStats();
      await resetSupplierStats();
      await resetInventoryItems();
      await resetTags();
      console.log('');
      console.log('Done. Users, segments, categories, buyers, suppliers and inventoryItems are preserved.');
      break;
    }

    case 'transactions': {
      const ok = await confirm('Delete all transactions and monthly/yearly summaries?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting transactions and summaries...');
      await deleteCollection('transactions');
      await deleteCollection('monthlySummaries');
      await deleteCollection('yearlySummaries');
      console.log('Done.');
      break;
    }

    case 'loans': {
      const ok = await confirm('Delete all loans and repayments?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting loans and repayments...');
      await deleteCollectionWithSubcollections('loans', 'repayments');
      console.log('Done.');
      break;
    }

    case 'tasks': {
      const ok = await confirm('Delete all tasks?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting tasks...');
      await deleteCollection('tasks');
      console.log('Done.');
      break;
    }

    case 'inventory': {
      const ok = await confirm('Delete all inventory events and reset stock counts?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting inventory events and resetting stock...');
      await deleteCollection('inventoryEvents');
      await resetSegmentStock();
      console.log('Done.');
      break;
    }

    case 'summaries': {
      const ok = await confirm('Delete all monthly & yearly summaries?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting summaries...');
      await deleteCollection('monthlySummaries');
      await deleteCollection('yearlySummaries');
      console.log('Done.');
      break;
    }

    case 'status': {
      console.log('Document counts:');
      await printStatus();
      break;
    }

  }

  console.log('');
  process.exit(0);
}

run();
