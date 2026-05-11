/**
 * Set Custom Claims for Firebase Auth Users
 *
 * Usage:
 *   node firebase/set-custom-claims.js <user-uid> <role>
 *
 * Example:
 *   node firebase/set-custom-claims.js abc123 admin
 *
 * Prerequisites:
 *   1. npm install firebase-admin
 *   2. Download service account key from Firebase Console
 *      -> Project Settings -> Service Accounts -> Generate New Private Key
 *   3. Save as firebase/service-account-key.json
 *
 * Roles: admin, manager, viewer
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = process.argv[2];
const role = process.argv[3];

if (!uid || !role) {
  console.error('Usage: node set-custom-claims.js <uid> <role>');
  console.error('Roles: admin, manager, viewer');
  process.exit(1);
}

if (!['admin', 'manager', 'viewer'].includes(role)) {
  console.error('Invalid role. Must be: admin, manager, or viewer');
  process.exit(1);
}

admin
  .auth()
  .setCustomUserClaims(uid, { role })
  .then(() => {
    console.log(`Successfully set role "${role}" for user ${uid}`);
    console.log('Note: User must log out and log back in for changes to take effect.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error setting custom claims:', error);
    process.exit(1);
  });
