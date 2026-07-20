/**
 * Disable / Enable a Firebase Auth User Account
 *
 * Usage:
 *   node firebase/disable-auth-user.js <user-uid> <disable|enable>
 *
 * Example:
 *   node firebase/disable-auth-user.js abc123 disable
 *
 * Prerequisites:
 *   1. npm install firebase-admin
 *   2. Download service account key from Firebase Console
 *      -> Project Settings -> Service Accounts -> Generate New Private Key
 *   3. Save as firebase/service-account-key.json
 *
 * "disable" blocks all new sign-ins (auth/user-disabled) and revokes
 * refresh tokens so existing sessions die within ~1 hour. This is the
 * server-side counterpart of the in-app isActive toggle, which only
 * enforces client-side.
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uid = process.argv[2];
const action = process.argv[3];

if (!uid || !action || !['disable', 'enable'].includes(action)) {
  console.error('Usage: node disable-auth-user.js <uid> <disable|enable>');
  process.exit(1);
}

const disabled = action === 'disable';

admin
  .auth()
  .updateUser(uid, { disabled })
  .then(() => (disabled ? admin.auth().revokeRefreshTokens(uid) : Promise.resolve()))
  .then(() => {
    if (disabled) {
      console.log(`Auth account disabled and refresh tokens revoked for user ${uid}.`);
      console.log('Note: Also toggle the user off in the app (isActive) for immediate client-side sign-out.');
    } else {
      console.log(`Auth account enabled for user ${uid}.`);
      console.log('Note: Also toggle the user on in the app (isActive) so the client lets them in.');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error(`Error ${disabled ? 'disabling' : 'enabling'} user:`, error);
    process.exit(1);
  });
