/**
 * ============================================================
 * CREATE USER SCRIPT
 * Farm Tracker - Multi-User Farming Financial Management System
 * ============================================================
 *
 * Creates a new user in Firebase Auth + Firestore with proper role and segment assignments.
 * Also sets custom claims for role-based security rules.
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
 *    WARNING: Never commit service-account-key.json to git!
 *             It is already in .gitignore.
 *
 * ────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────
 *
 *   node scripts/create-user.js <email> <password> <displayName> <role> [segment1 segment2 ...]
 *
 * Parameters:
 *   email        - User's email address
 *   password     - Password (minimum 6 characters)
 *   displayName  - User's display name (use quotes if contains spaces)
 *   role         - One of: admin, manager, viewer
 *   segment1...  - (Optional) Space-separated segment IDs for managers
 *                  Available: goats chickens cows fruits crops
 *                  Admin gets all segments automatically.
 *                  Viewer does not need segments.
 *
 * ────────────────────────────────────────────────────────────
 * EXAMPLES
 * ────────────────────────────────────────────────────────────
 *
 *   # Create an admin (gets all segments automatically)
 *   node scripts/create-user.js admin@farm.com Pass123! "Kiran Kumar" admin
 *
 *   # Create a manager with specific segments
 *   node scripts/create-user.js ravi@farm.com Pass123! "Ravi S" manager goats cows
 *
 *   # Create a manager with all segments
 *   node scripts/create-user.js suresh@farm.com Pass123! "Suresh M" manager goats chickens cows fruits crops
 *
 *   # Create a viewer (read-only access)
 *   node scripts/create-user.js viewer@farm.com Pass123! "Priya N" viewer
 *
 * ────────────────────────────────────────────────────────────
 * WHAT THIS SCRIPT DOES
 * ────────────────────────────────────────────────────────────
 *
 *   1. Creates the user in Firebase Authentication (email/password)
 *   2. Sets custom claims { role: "admin"|"manager"|"viewer" } on the auth token
 *   3. Creates a user document in Firestore /users/{uid} with:
 *      - uid, email, displayName, role
 *      - assignedSegments (array of segment IDs)
 *      - isActive: true
 *      - createdAt, updatedAt timestamps
 *      - createdBy: "script"
 *
 * ────────────────────────────────────────────────────────────
 * ROLES EXPLAINED
 * ────────────────────────────────────────────────────────────
 *
 *   admin    - Full access to everything. Can manage users, view audit logs,
 *              add/edit/delete transactions and loans across ALL segments.
 *
 *   manager  - Can add/edit transactions and loans but ONLY in assigned segments.
 *              Cannot access admin panel or audit logs.
 *
 *   viewer   - Read-only access. Can view dashboard and reports but cannot
 *              add, edit, or delete any data.
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

// ── Parse Arguments ────────────────────────────────────────
const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4];
const role = process.argv[5];
const segmentsArgs = process.argv.slice(6);

const ALL_SEGMENTS = ['goats', 'chickens', 'cows', 'fruits', 'crops'];
const VALID_ROLES = ['admin', 'manager', 'viewer'];

if (!email || !password || !displayName || !role) {
  console.error('');
  console.error('Usage: node scripts/create-user.js <email> <password> <displayName> <role> [segment1 segment2 ...]');
  console.error('');
  console.error('Roles: admin, manager, viewer');
  console.error('Segments: goats chickens cows fruits crops (space-separated, for managers)');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/create-user.js admin@farm.com Pass123! "Kiran Kumar" admin');
  console.error('  node scripts/create-user.js ravi@farm.com Pass123! "Ravi S" manager goats cows');
  console.error('  node scripts/create-user.js suresh@farm.com Pass123! "Suresh M" manager goats chickens cows fruits crops');
  console.error('  node scripts/create-user.js viewer@farm.com Pass123! "Priya N" viewer');
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`ERROR: Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

if (password.length < 6) {
  console.error('ERROR: Password must be at least 6 characters.');
  process.exit(1);
}

// Determine segments
let assignedSegments;
if (role === 'admin') {
  assignedSegments = ALL_SEGMENTS;
} else if (role === 'manager') {
  if (segmentsArgs.length === 0) {
    console.error('ERROR: Managers must have assigned segments.');
    console.error('  Use: node scripts/create-user.js ... manager goats cows');
    console.error(`  Available segments: ${ALL_SEGMENTS.join(', ')}`);
    process.exit(1);
  }
  assignedSegments = segmentsArgs.map((s) => s.trim().toLowerCase());
  const invalid = assignedSegments.filter((s) => !ALL_SEGMENTS.includes(s));
  if (invalid.length > 0) {
    console.error(`ERROR: Invalid segment(s): ${invalid.join(', ')}`);
    console.error(`  Available segments: ${ALL_SEGMENTS.join(', ')}`);
    process.exit(1);
  }
} else {
  assignedSegments = [];
}

// ── Create User ────────────────────────────────────────────
async function createUser() {
  console.log('');
  console.log('Creating user...');
  console.log(`  Email:    ${email}`);
  console.log(`  Name:     ${displayName}`);
  console.log(`  Role:     ${role}`);
  console.log(`  Segments: ${assignedSegments.length > 0 ? assignedSegments.join(', ') : '(none)'}`);
  console.log('');

  try {
    // Step 1: Create in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName,
    });
    console.log(`[1/3] Auth user created. UID: ${userRecord.uid}`);

    // Step 2: Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });
    console.log(`[2/3] Custom claims set. Role: ${role}`);

    // Step 3: Create Firestore document
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role,
      assignedSegments,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'script',
    });
    console.log(`[3/3] Firestore user document created.`);

    console.log('');
    console.log('=== USER CREATED SUCCESSFULLY ===');
    console.log(`  UID:      ${userRecord.uid}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Name:     ${displayName}`);
    console.log(`  Role:     ${role}`);
    console.log(`  Segments: ${assignedSegments.join(', ') || '(none)'}`);
    console.log('');
    console.log('The user can now login at your app URL.');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('ERROR creating user:', error.message);
    if (error.code === 'auth/email-already-exists') {
      console.error('This email is already registered. Use a different email.');
    }
    process.exit(1);
  }
}

createUser();
