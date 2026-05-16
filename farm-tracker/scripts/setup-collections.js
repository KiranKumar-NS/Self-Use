/**
 * ============================================================
 * SETUP COLLECTIONS SCRIPT
 * Farm Tracker - Multi-User Farming Financial Management System
 * ============================================================
 *
 * Creates all system collections in Firestore with default data:
 *   - segments    (Goats, Chickens, Cows, Fruits, Crops)
 *   - categories  (Feed, Medicine, Labor... / Milk, Eggs, Animal Sales...)
 *
 * Run this ONCE after creating your Firebase project to initialize
 * the database with all required reference data.
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
 *      - Firebase Console > Project Settings > Service Accounts
 *      - Click "Generate New Private Key"
 *      - Save as: scripts/service-account-key.json
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   node scripts/setup-collections.js
 *
 * That's it. No arguments needed. It will:
 *   1. Create 5 segment documents
 *   2. Create 12 category documents (6 expense + 6 income)
 *   3. Skip any documents that already exist (safe to re-run)
 *
 * ────────────────────────────────────────────────────────────
 * WHAT GETS CREATED
 * ────────────────────────────────────────────────────────────
 *
 * SEGMENTS (collection: "segments")
 * ┌──────────┬──────────┬───────────────────────┬──────┐
 * │ ID       │ Name     │ Description           │ Icon │
 * ├──────────┼──────────┼───────────────────────┼──────┤
 * │ goats    │ Goats    │ Goat farming          │  🐐  │
 * │ chickens │ Chickens │ Chicken farming       │  🐔  │
 * │ cows     │ Cows     │ Cow farming           │  🐄  │
 * │ fruits   │ Fruits   │ Fruit cultivation     │  🍎  │
 * │ crops    │ Crops    │ Crop cultivation      │  🌾  │
 * └──────────┴──────────┴───────────────────────┴──────┘
 *
 * EXPENSE CATEGORIES (collection: "categories", type: "expense")
 * ┌────────────────┬──────────────┐
 * │ ID             │ Name         │
 * ├────────────────┼──────────────┤
 * │ feed           │ Feed         │
 * │ medicine       │ Medicine     │
 * │ labor          │ Labor        │
 * │ transport      │ Transport    │
 * │ maintenance    │ Maintenance  │
 * │ other-expense  │ Other        │
 * └────────────────┴──────────────┘
 *
 * INCOME CATEGORIES (collection: "categories", type: "income")
 * ┌────────────────┬──────────────┐
 * │ ID             │ Name         │
 * ├────────────────┼──────────────┤
 * │ milk           │ Milk         │
 * │ eggs           │ Eggs         │
 * │ animal-sales   │ Animal Sales │
 * │ crop-sales     │ Crop Sales   │
 * │ fruit-sales    │ Fruit Sales  │
 * │ other-income   │ Other        │
 * └────────────────┴──────────────┘
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
  { id: 'goats',    name: 'Goats',    description: 'Goat farming',    icon: '🐐' },
  { id: 'chickens', name: 'Chickens', description: 'Chicken farming', icon: '🐔' },
  { id: 'dragon',   name: 'Dragon',   description: 'Dragon farming',  icon: '🐉' },
];

const CATEGORIES = [
  // Expense categories
  { id: 'feed',          name: 'Feed',         type: 'expense' },
  { id: 'medicine',      name: 'Medicine',     type: 'expense' },
  { id: 'labor',         name: 'Labor',        type: 'expense' },
  { id: 'transport',     name: 'Transport',    type: 'expense' },
  { id: 'maintenance',   name: 'Maintenance',  type: 'expense' },
  { id: 'other-expense', name: 'Other',        type: 'expense' },
  // Income categories
  { id: 'milk',          name: 'Milk',         type: 'income' },
  { id: 'eggs',          name: 'Eggs',         type: 'income' },
  { id: 'animal-sales',  name: 'Animal Sales', type: 'income' },
  { id: 'crop-sales',    name: 'Crop Sales',   type: 'income' },
  { id: 'fruit-sales',   name: 'Fruit Sales',  type: 'income' },
  { id: 'other-income',  name: 'Other',        type: 'income' },
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

  // ── Summary ──────────────────────────────────────────────
  console.log('');
  console.log('=== SETUP COMPLETE ===');
  console.log('');
  console.log('Collections created in Firestore:');
  console.log(`  segments:   ${SEGMENTS.length} documents (${segCreated} new, ${segSkipped} existing)`);
  console.log(`  categories: ${CATEGORIES.length} documents (${catCreated} new, ${catSkipped} existing)`);
  console.log('');

  if (segCreated + catCreated === 0) {
    console.log('All documents already existed. No changes made.');
  } else {
    console.log('Your database is ready! Next steps:');
    console.log('  1. Create an admin user:');
    console.log('     node scripts/create-user.js admin@email.com Pass123! "Admin" admin');
    console.log('  2. Open the app and login');
  }

  console.log('');
  process.exit(0);
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
