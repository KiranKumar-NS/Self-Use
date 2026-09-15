# Farm Tracker - Scripts

Admin scripts for managing users and database.

---

## Setup (One-time)

```bash
cd scripts
npm install firebase-admin
```

Then download the **service account key**:
1. Go to [Firebase Console](https://console.firebase.google.com/) > Your Project
2. Project Settings (gear icon) > **Service Accounts**
3. Click **"Generate New Private Key"**
4. Save the downloaded file as `scripts/service-account-key.json`

> **IMPORTANT:** Never commit `service-account-key.json` to git. It is in `.gitignore`.

---

## Scripts

### 1. `setup-collections.js` — Initialize System Collections

Creates all default segments and categories in Firestore. Safe to re-run — skips documents that already exist.

```bash
node scripts/setup-collections.js
```

**What it creates:**

| Collection | Documents |
|------------|-----------|
| `segments` | Goats, Chickens, Cows, Fruits, Crops |
| `categories` | Feed, Medicine, Labor, Transport, Maintenance, Other (expense) |
| | Milk, Eggs, Animal Sales, Crop Sales, Fruit Sales, Other (income) |

> Run this **once** after creating your Firebase project.

---

### 2. `clean-db.js` — Clean / Reset Database

Deletes data from Firestore collections. Useful for development/testing.

```bash
node scripts/clean-db.js <command>
```

**Commands:**

| Command | What it deletes |
|---------|----------------|
| `all` | **EVERYTHING** — all collections + auth users (full reset) |
| `transactions` | All transactions + monthly summaries |
| `loans` | All loans + repayment subcollections |
| `audit` | All audit log entries |
| `summaries` | All monthly summary documents |
| `seed` | Deletes & re-creates default segments and categories |

**Examples:**
```bash
# Full reset (deletes everything including users!)
node scripts/clean-db.js all

# Clear only transactions
node scripts/clean-db.js transactions

# Clear loans and their repayments
node scripts/clean-db.js loans

# Reset segments and categories to defaults
node scripts/clean-db.js seed
```

> All destructive commands ask for confirmation before proceeding.

---

### 3. `import-backup.js` — Restore from Excel Backup

Restores data from a dashboard Excel backup or a per-loan detail export. Auto-detects the file type by its sheets. Writes are upserts keyed on the `ID` column (chunked batches, safe for any size).

```bash
# Full backup (v2, exported from the dashboard download button)
node import-backup.js farm-backup-all-time-2026-07-17.xlsx

# Older transaction backup (v1) — still supported
node import-backup.js farm-backup-July-2026.xlsx

# Per-loan detail export
node import-backup.js loan-SBI-detail.xlsx

# Preview without writing
node import-backup.js farm-backup.xlsx --dry-run

# Skip automatic monthly/yearly summary rebuild
node import-backup.js farm-backup.xlsx --skip-summaries
```

**Full backup (v2) covers every persisted collection:** transactions (Expenses/Income), loans + formal-loan detail (deductions/collateral/rate changes/documents) + repayment subcollections, inventory events, animals + cost/vaccination/medical/weight detail, buyers, suppliers, categories, segments, users, tasks, schedules, harvests + sales, breeding records, crop activities, consumables (inventoryItems) + stock movements, and tags. The `Meta` sheet records the format version and per-sheet counts; import verifies its counts against what it wrote.

After a (non-dry-run) import, `monthlySummaries`/`yearlySummaries` are rebuilt automatically from the imported transactions.

**Not covered (by design):** soft-deleted docs and per-doc `timeline` audit arrays are not in the backup; Firebase Auth accounts are not restored (the Users sheet restores Firestore profile docs only — re-run set-custom-claims for roles).

---

### 4. `verify-backup.js` — Verify Backup vs Firestore

Read-only round-trip check: compares every sheet row/column of a backup file against the live Firestore data (and Meta counts vs live collection counts). Exits non-zero on any difference.

```bash
node verify-backup.js farm-backup-all-time-2026-07-17.xlsx

# Against the local emulator (Git Bash)
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node verify-backup.js farm-backup.xlsx
```

Typical wipe-and-restore validation:
```bash
firebase emulators:start --only firestore --project <project-id>
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node import-backup.js farm-backup.xlsx
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node verify-backup.js farm-backup.xlsx
```

---

### 5. `set-custom-claims.js` (in the repo-root `/firebase` folder)

Sets the `role` custom claim on an existing Firebase Auth user. **Required after
every user created in Admin > Add User** — the app and `firestore.rules` read the
role from this claim, not from the Firestore profile, so until it is set the
account behaves as a viewer on every device and its writes are rejected.

```bash
# run from the repo root; uses scripts/node_modules and scripts/service-account-key.json
node firebase/set-custom-claims.js <uid> <role>
```

```bash
# The UID is shown in the app after creating the user, or in Firebase Console > Authentication
node firebase/set-custom-claims.js abc123def456 manager
```

The user then logs out and back in (the app also retries the claim once on its own).

---

## Automatic Daily Backup to Google Drive

Besides the manual dashboard export, a Google Apps Script backs up the entire
Firestore database to Google Drive **every evening at 6 PM IST** (JSON + Excel,
30-day retention, email alerts on failure). It lives in
[`../backup-script/`](../backup-script/) — see
[`backup-script/SETUP.md`](../backup-script/SETUP.md) for the one-time setup.

Unlike the dashboard export, the Drive backup includes soft-deleted docs, and
its JSON file preserves exact Firestore types for disaster recovery.

---

## Typical Workflow

### First-time setup:
```bash
# 1. Create all system collections (segments & categories)
node scripts/setup-collections.js

# 2. Create users via the Admin panel in the app (Admin > Add User)
#    Or use set-custom-claims.js to assign roles to existing Firebase Auth users
```

### Reset during development:
```bash
# Clear all transaction data but keep users
node scripts/clean-db.js transactions
node scripts/clean-db.js loans
node scripts/clean-db.js audit

# Or full reset
node scripts/clean-db.js all
node scripts/clean-db.js seed
```

---

## Database Collections Reference

| Collection | Description |
|------------|-------------|
| `users` | User profiles (uid, email, role, assigned segments) |
| `segments` | Business segments: Goats, Chickens, Cows, Fruits, Crops |
| `categories` | Expense categories (Feed, Medicine...) & Income sources (Milk, Eggs...) |
| `transactions` | All expense and income records |
| `loans` | Loan records (given/received) with repayment status |
| `loans/{id}/repayments` | Repayment history for each loan |
| `monthlySummaries` / `yearlySummaries` | Precomputed totals per segment (auto-updated; rebuilt on import) |
| `inventoryEvents` | Animal stock change events (birth/death/purchase/sale) |
| `animals` | Animal/batch registry with embedded cost & health detail |
| `buyers` / `suppliers` | Buyer and supplier registries with denormalized stats |
| `tasks` / `schedules` | Task board and recurring schedules/reminders |
| `harvests` / `breedingRecords` / `cropActivities` | Crop & breeding operations |
| `inventoryItems` | Consumables (feed/medicine/...) with embedded stock movements |
| `meta/tags` | Single doc holding all freeform transaction tags |
