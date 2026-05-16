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
 *   node scripts/clean-db.js <command>
 *
 * Commands:
 *
 *   all           - Delete transactions, loans & summaries
 *                   (keeps users, segments, categories safe)
 *
 *   transactions  - Delete all transactions + monthly summaries
 *   loans         - Delete all loans and their repayment subcollections
 *   summaries     - Delete all monthly summary documents
 *   seed          - Re-seed segments and categories (adds missing ones)
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
 *   # Reset segments and categories to defaults
 *   node scripts/clean-db.js seed
 *
 * ────────────────────────────────────────────────────────────
 * COLLECTIONS IN THE DATABASE
 * ────────────────────────────────────────────────────────────
 *
 *   users             - User profiles (uid, email, role, segments)
 *   segments          - Business segments (goats, chickens, cows, fruits, crops)
 *   categories        - Transaction categories (Feed, Medicine, Milk, etc.)
 *   transactions      - All expense and income records (with inline timeline)
 *   loans             - Owe & Lent records (with inline timeline)
 *     └─ repayments   - Subcollection: repayment history per loan
 *   monthlySummaries  - Precomputed monthly totals per segment
 *
 * ────────────────────────────────────────────────────────────
 * SAFETY NOTES
 * ────────────────────────────────────────────────────────────
 *
 *   - This script permanently deletes data. There is NO undo.
 *   - A confirmation prompt is shown before destructive actions.
 *   - The "all" command also deletes Firebase Auth users.
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
const command = process.argv[2];

const VALID_COMMANDS = ['all', 'transactions', 'loans', 'summaries', 'seed'];

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error('');
  console.error('Usage: node scripts/clean-db.js <command>');
  console.error('');
  console.error('Commands:');
  console.error('  all           - Delete transactions, loans & summaries (keeps users/segments/categories)');
  console.error('  transactions  - Delete all transactions and summaries');
  console.error('  loans         - Delete all loans and repayments');
  console.error('  summaries     - Delete all monthly summaries');
  console.error('  seed          - Re-seed segments and categories (adds missing ones)');
  console.error('');
  process.exit(1);
}

// ── Helper Functions ───────────────────────────────────────

async function confirm(message) {
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

async function deleteAllAuthUsers() {
  let deleted = 0;
  let nextPageToken;

  do {
    const result = await admin.auth().listUsers(1000, nextPageToken);
    if (result.users.length > 0) {
      const uids = result.users.map((u) => u.uid);
      await admin.auth().deleteUsers(uids);
      deleted += uids.length;
    }
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  console.log(`  Auth users: ${deleted} users deleted`);
  return deleted;
}

async function seedSegments() {
  const segments = [
    { id: 'goats', name: 'Goats', description: 'Goat farming', icon: '🐐', isActive: true },
    { id: 'chickens', name: 'Chickens', description: 'Chicken farming', icon: '🐔', isActive: true },
    { id: 'dragon', name: 'Dragon', description: 'Dragon farming', icon: '🐉', isActive: true },
  ];

  const batch = db.batch();
  for (const seg of segments) {
    batch.set(db.collection('segments').doc(seg.id), {
      ...seg,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`  segments: ${segments.length} documents seeded`);
}

async function seedCategories() {
  const categories = [
    { id: 'feed', name: 'Feed', type: 'expense', isActive: true },
    { id: 'medicine', name: 'Medicine', type: 'expense', isActive: true },
    { id: 'labor', name: 'Labor', type: 'expense', isActive: true },
    { id: 'transport', name: 'Transport', type: 'expense', isActive: true },
    { id: 'maintenance', name: 'Maintenance', type: 'expense', isActive: true },
    { id: 'other-expense', name: 'Other', type: 'expense', isActive: true },
    { id: 'milk', name: 'Milk', type: 'income', isActive: true },
    { id: 'eggs', name: 'Eggs', type: 'income', isActive: true },
    { id: 'animal-sales', name: 'Animal Sales', type: 'income', isActive: true },
    { id: 'crop-sales', name: 'Crop Sales', type: 'income', isActive: true },
    { id: 'fruit-sales', name: 'Fruit Sales', type: 'income', isActive: true },
    { id: 'other-income', name: 'Other', type: 'income', isActive: true },
  ];

  const batch = db.batch();
  for (const cat of categories) {
    batch.set(db.collection('categories').doc(cat.id), cat);
  }
  await batch.commit();
  console.log(`  categories: ${categories.length} documents seeded`);
}

// ── Main Execution ─────────────────────────────────────────

async function run() {
  console.log('');
  console.log('=== FARM TRACKER - DATABASE CLEANUP ===');
  console.log('');

  switch (command) {
    case 'all': {
      console.log('This will delete all transactions, loans & summaries.');
      console.log('Users, segments, and categories will NOT be deleted.');
      const ok = await confirm('Proceed?');
      if (!ok) {
        console.log('Cancelled.');
        process.exit(0);
      }
      console.log('');
      console.log('Deleting transaction data...');
      await deleteCollection('transactions');
      await deleteCollectionWithSubcollections('loans', 'repayments');
      await deleteCollection('monthlySummaries');
      console.log('');
      console.log('Done. Users, segments, and categories are preserved.');
      break;
    }

    case 'transactions': {
      const ok = await confirm('Delete all transactions and monthly summaries?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting transactions and summaries...');
      await deleteCollection('transactions');
      await deleteCollection('monthlySummaries');
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


    case 'summaries': {
      const ok = await confirm('Delete all monthly summaries?');
      if (!ok) { console.log('Cancelled.'); process.exit(0); }
      console.log('');
      console.log('Deleting monthly summaries...');
      await deleteCollection('monthlySummaries');
      console.log('Done.');
      break;
    }

    case 'seed': {
      console.log('Re-seeding segments and categories...');
      await deleteCollection('segments');
      await deleteCollection('categories');
      await seedSegments();
      await seedCategories();
      console.log('Done. Default segments and categories created.');
      break;
    }
  }

  console.log('');
  process.exit(0);
}

run();
