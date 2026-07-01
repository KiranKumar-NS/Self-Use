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

### 3. `set-custom-claims.js` (in `/firebase` folder)

Sets role custom claims on an existing Firebase Auth user.

```bash
node firebase/set-custom-claims.js <uid> <role>
```

Use this if you created a user through the app UI and need to set their role:
```bash
# Get the UID from Firebase Console > Authentication
node firebase/set-custom-claims.js abc123def456 admin
```

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
| `monthlySummaries` | Precomputed monthly totals per segment (auto-updated) |
