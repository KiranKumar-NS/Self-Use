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

### 1. `create-user.js` — Create a New User

Creates a user in Firebase Auth + Firestore with role and segment assignments.

```bash
node scripts/create-user.js <email> <password> <displayName> <role> [segment1 segment2 ...]
```

**Roles:**
| Role | Access |
|------|--------|
| `admin` | Full access to everything. Gets all segments automatically. |
| `manager` | Can add/edit transactions & loans in assigned segments only. |
| `viewer` | Read-only access to dashboard and reports. |

**Examples:**
```bash
# Create admin
node scripts/create-user.js admin@farm.com Pass123! "Kiran Kumar" admin

# Create manager with specific segments
node scripts/create-user.js ravi@farm.com Pass123! "Ravi S" manager goats cows

# Create manager with all segments
node scripts/create-user.js suresh@farm.com Pass123! "Suresh M" manager goats chickens cows fruits crops

# Create viewer
node scripts/create-user.js viewer@farm.com Pass123! "Priya N" viewer
```

**Available segments:** `goats`, `chickens`, `cows`, `fruits`, `crops`

---

### 2. `setup-collections.js` — Initialize System Collections

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

### 3. `clean-db.js` — Clean / Reset Database

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

### 4. `set-custom-claims.js` (in `/firebase` folder)

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

# 2. Create your first admin user
node scripts/create-user.js yourname@email.com YourPass123! "Your Name" admin

# 3. Create team members
node scripts/create-user.js friend1@email.com Pass123! "Friend 1" manager goats cows
node scripts/create-user.js friend2@email.com Pass123! "Friend 2" manager chickens fruits
node scripts/create-user.js friend3@email.com Pass123! "Friend 3" viewer
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
node scripts/create-user.js admin@farm.com Pass123! "Admin" admin
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
| `auditLogs` | Immutable audit trail of all create/update/delete actions |
| `monthlySummaries` | Precomputed monthly totals per segment (auto-updated) |
