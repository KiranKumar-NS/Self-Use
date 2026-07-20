/**
 * ============================================================
 * DELETE NON-ADMIN USERS
 * ============================================================
 *
 * Deletes every user EXCEPT admins, from BOTH:
 *   - the Firestore `users` collection
 *   - Firebase Authentication (login accounts)
 *
 * A user is KEPT if role === 'admin' in the Firestore user doc
 * OR in the Auth custom claims (union — safest, never deletes
 * anyone either side considers an admin).
 *
 * Usage:
 *   node scripts/delete-non-admin-users.js [--yes] [--dry-run]
 *
 * Flags:
 *   --yes      Skip the confirmation prompt
 *   --dry-run  Only print the KEEP/DELETE table, delete nothing
 *
 * Prerequisites:
 *   - scripts/service-account-key.json (same as clean-db.js)
 *
 * SAFETY: This permanently deletes users. There is NO undo.
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

const args = process.argv.slice(2);
const skipConfirm = args.includes('--yes');
const dryRun = args.includes('--dry-run');

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

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function main() {
  console.log('');
  console.log('Loading users from Firestore and Firebase Auth...');

  const [usersSnap, authUsers] = await Promise.all([
    db.collection('users').get(),
    listAllAuthUsers(),
  ]);

  // Merge both sides by uid so orphans on either side are covered.
  const byUid = new Map();
  for (const doc of usersSnap.docs) {
    byUid.set(doc.id, { uid: doc.id, docRole: doc.data().role, email: doc.data().email, hasDoc: true, hasAuth: false, claimRole: undefined });
  }
  for (const u of authUsers) {
    const entry = byUid.get(u.uid) || { uid: u.uid, docRole: undefined, email: u.email, hasDoc: false };
    entry.hasAuth = true;
    entry.claimRole = (u.customClaims || {}).role;
    entry.email = entry.email || u.email || '(no email)';
    byUid.set(u.uid, entry);
  }

  const all = [...byUid.values()];
  const isAdmin = (e) => e.docRole === 'admin' || e.claimRole === 'admin';
  const toKeep = all.filter(isAdmin);
  const toDelete = all.filter((e) => !isAdmin(e));

  console.log('');
  console.log('UID                            EMAIL                            DOC ROLE   CLAIM ROLE  ACTION');
  console.log('─'.repeat(105));
  for (const e of all) {
    console.log(
      `${e.uid.padEnd(30)} ${String(e.email || '(no email)').padEnd(32)} ${String(e.docRole || '-').padEnd(10)} ${String(e.claimRole || '-').padEnd(11)} ${isAdmin(e) ? 'KEEP' : 'DELETE'}`
    );
  }
  console.log('─'.repeat(105));
  console.log(`Keep: ${toKeep.length} admin(s)   Delete: ${toDelete.length} user(s)`);
  console.log('');

  if (toKeep.length === 0) {
    console.error('ABORT: No admin user found — refusing to delete everyone.');
    process.exit(1);
  }
  if (toDelete.length === 0) {
    console.log('Nothing to delete. Done.');
    process.exit(0);
  }
  if (dryRun) {
    console.log('Dry run — nothing deleted.');
    process.exit(0);
  }

  const ok = await confirm(`PERMANENTLY delete ${toDelete.length} non-admin user(s) from Auth + Firestore?`);
  if (!ok) {
    console.log('Cancelled. Nothing deleted.');
    process.exit(0);
  }

  console.log('');
  for (const e of toDelete) {
    if (e.hasAuth) {
      try {
        await admin.auth().deleteUser(e.uid);
        console.log(`  Auth account deleted:  ${e.uid} (${e.email})`);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          console.log(`  Auth account missing:  ${e.uid} (already gone)`);
        } else {
          throw err;
        }
      }
    }
    if (e.hasDoc) {
      await db.collection('users').doc(e.uid).delete();
      console.log(`  Firestore doc deleted: users/${e.uid}`);
    }
  }

  console.log('');
  console.log(`Done. Deleted ${toDelete.length} user(s). Remaining admins:`);
  for (const e of toKeep) {
    console.log(`  ${e.uid}  ${e.email}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
