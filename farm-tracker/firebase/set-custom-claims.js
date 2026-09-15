/**
 * Set Custom Claims for Firebase Auth Users
 *
 * Usage:
 *   node firebase/set-custom-claims.js <user-uid> <role>
 *
 * Example:
 *   node firebase/set-custom-claims.js abc123 manager
 *
 * Why this exists:
 *   The app (and firestore.rules) read a user's role from the Auth custom
 *   claim `role`, NOT from the users/{uid} Firestore doc. Creating a user in
 *   Admin > Add User writes the Firestore profile only (Spark plan, no Cloud
 *   Functions), so until this script is run the account is treated as a
 *   viewer everywhere and its writes are rejected by the rules.
 *
 * Prerequisites:
 *   1. firebase-admin — already installed under scripts/node_modules
 *      (or `npm install firebase-admin` at the repo root)
 *   2. Service account key from Firebase Console
 *      -> Project Settings -> Service Accounts -> Generate New Private Key
 *      saved as scripts/service-account-key.json (or firebase/service-account-key.json)
 *
 * Roles: admin, manager, viewer
 */

const path = require('path');
const fs = require('fs');

function loadFirebaseAdmin() {
  try {
    return require('firebase-admin');
  } catch {
    return require(path.join(__dirname, '..', 'scripts', 'node_modules', 'firebase-admin'));
  }
}

function loadServiceAccount() {
  const candidates = [
    path.join(__dirname, '..', 'scripts', 'service-account-key.json'),
    path.join(__dirname, 'service-account-key.json'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    console.error('Service account key not found. Looked in:');
    candidates.forEach((p) => console.error(`  ${p}`));
    process.exit(1);
  }
  return require(found);
}

const admin = loadFirebaseAdmin();
admin.initializeApp({
  credential: admin.credential.cert(loadServiceAccount()),
});

const uid = process.argv[2];
const role = process.argv[3];

if (!uid || !role) {
  console.error('Usage: node firebase/set-custom-claims.js <uid> <role>');
  console.error('Roles: admin, manager, viewer');
  process.exit(1);
}

if (!['admin', 'manager', 'viewer'].includes(role)) {
  console.error('Invalid role. Must be: admin, manager, or viewer');
  process.exit(1);
}

(async () => {
  const user = await admin.auth().getUser(uid);
  const before = (user.customClaims || {}).role || 'none';
  await admin.auth().setCustomUserClaims(uid, { ...(user.customClaims || {}), role });
  console.log(`Set role "${role}" for ${user.email || uid} (was: ${before})`);
  console.log('The user must log out and log back in (or wait up to 1 hour) for the new role to apply.');
  process.exit(0);
})().catch((error) => {
  console.error('Error setting custom claims:', error.message || error);
  process.exit(1);
});
