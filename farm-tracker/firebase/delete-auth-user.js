/**
 * Delete a single Firebase Auth User Account (orphan recovery)
 *
 * Usage:
 *   node firebase/delete-auth-user.js <email-or-uid>
 *
 * Example:
 *   node firebase/delete-auth-user.js someone@example.com
 *   node firebase/delete-auth-user.js abc123UID
 *
 * Why this exists:
 *   User creation in the app (AuthService.register) makes the Auth login first
 *   and writes the users/{uid} Firestore doc second. If that write ever fails,
 *   the Auth account can be left behind with no Firestore doc — an "orphan".
 *   The app then can't recreate the user (Auth returns email-already-in-use),
 *   yet no user shows in User Management. This script removes that stuck login
 *   so the email can be registered again.
 *
 * Safety:
 *   - Refuses to delete if a matching users/{uid} Firestore doc still exists
 *     (that's a live, non-orphan account — remove it from the app instead, or
 *     use scripts/delete-non-admin-users.js). Pass --force to override.
 *   - Permanently deletes the Auth account. There is NO undo.
 *
 * Prerequisites:
 *   1. npm install firebase-admin
 *   2. Download service account key from Firebase Console
 *      -> Project Settings -> Service Accounts -> Generate New Private Key
 *   3. Save as firebase/service-account-key.json
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, 'service-account-key.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const args = process.argv.slice(2);
const force = args.includes('--force');
const arg = args.find((a) => !a.startsWith('--'));

if (!arg) {
  console.error('Usage: node delete-auth-user.js <email-or-uid> [--force]');
  process.exit(1);
}

const looksLikeEmail = arg.includes('@');

async function main() {
  let user;
  try {
    user = looksLikeEmail
      ? await admin.auth().getUserByEmail(arg)
      : await admin.auth().getUser(arg);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log(`No Auth account found for "${arg}". Nothing to delete.`);
      process.exit(0);
    }
    throw err;
  }

  const uid = user.uid;
  const docSnap = await admin.firestore().collection('users').doc(uid).get();

  console.log('');
  console.log(`  UID:        ${uid}`);
  console.log(`  Email:      ${user.email || '(none)'}`);
  console.log(`  Claim role: ${(user.customClaims || {}).role || '-'}`);
  console.log(`  Firestore users/${uid} doc: ${docSnap.exists ? 'EXISTS' : 'missing (orphan)'}`);
  console.log('');

  if (docSnap.exists && !force) {
    console.error('REFUSING: a live users/' + uid + ' doc still exists — this is NOT an orphan.');
    console.error('Delete the user from the app first, or pass --force to override.');
    process.exit(1);
  }

  await admin.auth().deleteUser(uid);
  console.log(`Auth account deleted: ${uid} (${user.email || 'no email'}).`);
  console.log('The email can now be registered again in the app.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Error deleting user:', error);
  process.exit(1);
});
