# Farm Tracker - Multi-User Farming Expense, Income & Loan Tracking System

## Overview

A web application for managing a small farming business involving multiple users. The system tracks income, expenses, and loans with full transparency on who did what, where, and why.

**Tech Stack:** Angular 21 + Firebase (Free Spark Plan) + Angular Material + Chart.js

---

## Business Segments

- Goats
- Chickens
- Cows
- Fruits
- Crops

---

## User Roles & Permissions

| Role | Access |
|------|--------|
| **Admin** | Full access to all data, manage users, view all reports and audit logs |
| **Manager** | Add income/expense/loan entries, limited to assigned segments |
| **Viewer** | Read-only access to dashboards and reports |

---

## Features

### 1. Authentication
- Email/password login via Firebase Auth
- Role-based access using custom claims
- Password reset via email
- Admin can register new users

### 2. Dashboard
- Total income, expense, net profit/loss cards
- Segment-wise breakdown chart (bar)
- Monthly trend chart (line, last 6 months)
- Recent transactions list
- Loan summary widget

### 3. Transactions (Expense & Income)
- Add/edit/delete (soft) transactions
- Filter by type, segment, month
- Pagination (20 per page)
- Amount, category, segment, description, paid-by tracking

### 4. Loans
- Loan given / received tracking
- Person name, purpose, segment
- Repayment tracking (pending/partial/completed)
- Repayment history with notes
- Progress bar showing repayment percentage

### 5. Reports
- Monthly income vs expense summary
- Segment breakdown table
- Transaction detail list
- Loan summary
- **Export to PDF** (jsPDF + jspdf-autotable)
- **Export to CSV**

### 6. Audit Log (Admin only)
- Track who created/edited/deleted entries
- Field-level change tracking
- Filter by entity type
- Immutable records

### 7. User Management (Admin only)
- View all users
- Add new users
- Edit roles and segment assignments
- Activate/deactivate users

---

## Database Schema (Firestore)

### Collection: `users`
```
/users/{userId}
├── uid: string (Firebase Auth UID)
├── email: string
├── displayName: string
├── role: "admin" | "manager" | "viewer"
├── assignedSegments: string[] (e.g., ["goats", "chickens"])
├── isActive: boolean
├── createdAt: Timestamp
├── updatedAt: Timestamp
└── createdBy: string
```

### Collection: `segments`
```
/segments/{segmentId}
├── id: string ("goats" | "chickens" | "cows" | "fruits" | "crops")
├── name: string
├── description: string
├── icon: string
├── isActive: boolean
└── createdAt: Timestamp
```

### Collection: `categories`
```
/categories/{categoryId}
├── id: string
├── name: string
├── type: "expense" | "income"
└── isActive: boolean
```

**Expense categories:** Feed, Medicine, Labor, Transport, Maintenance, Other
**Income sources:** Milk, Eggs, Animal Sales, Crop Sales, Fruit Sales, Other

### Collection: `transactions`
```
/transactions/{transactionId}
├── id: string
├── type: "expense" | "income"
├── date: Timestamp
├── amount: number
├── category: string
├── categoryName: string (denormalized)
├── segment: string
├── segmentName: string (denormalized)
├── description: string
├── paidBy: string | null (userId, expense only)
├── paidByName: string | null
├── recordedBy: string | null (userId, income only)
├── recordedByName: string | null
├── createdBy: string
├── createdByName: string
├── createdAt: Timestamp
├── updatedBy: string | null
├── updatedByName: string | null
├── updatedAt: Timestamp | null
├── isDeleted: boolean (soft delete)
├── deletedBy: string | null
├── deletedAt: Timestamp | null
├── month: string ("2026-05")
└── year: number
```

### Collection: `loans`
```
/loans/{loanId}
├── id: string
├── date: Timestamp
├── amount: number
├── type: "given" | "received"
├── personName: string
├── purpose: string
├── segment: string
├── segmentName: string
├── repaymentStatus: "pending" | "partial" | "completed"
├── totalRepaid: number
├── balanceRemaining: number
├── recordedBy: string
├── recordedByName: string
├── createdAt: Timestamp
├── updatedBy: string | null
├── updatedAt: Timestamp | null
├── isDeleted: boolean
├── deletedBy: string | null
├── deletedAt: Timestamp | null
├── month: string
└── year: number
```

### Subcollection: `loans/{loanId}/repayments`
```
/loans/{loanId}/repayments/{repaymentId}
├── id: string
├── date: Timestamp
├── amount: number
├── note: string
├── recordedBy: string
├── recordedByName: string
└── createdAt: Timestamp
```

### Collection: `auditLogs`
```
/auditLogs/{logId}
├── id: string
├── entityType: "transaction" | "loan" | "repayment" | "user"
├── entityId: string
├── action: "create" | "update" | "delete"
├── userId: string
├── userName: string
├── timestamp: Timestamp
├── changes: [{ field, oldValue, newValue }]
├── month: string
└── year: number
```

### Collection: `monthlySummaries` (precomputed aggregations)
```
/monthlySummaries/{year-month-segment}
├── month: string ("2026-05")
├── year: number
├── segment: string
├── totalExpense: number
├── totalIncome: number
├── netProfit: number
├── expenseByCategory: { feed: number, medicine: number, ... }
├── incomeBySource: { milk: number, eggs: number, ... }
└── updatedAt: Timestamp
```

**Document ID format:** `"2026-05-goats"` — deterministic for direct reads.

---

## Project Structure

```
farm-tracker/
├── src/app/
│   ├── core/
│   │   ├── guards/          (auth.guard.ts, role.guard.ts)
│   │   ├── services/        (auth, user, transaction, loan, audit-log, summary, export, segment, category)
│   │   ├── models/          (TypeScript interfaces for all entities)
│   │   └── utils/           (date & firestore helper functions)
│   ├── shared/
│   │   ├── components/      (loading-spinner, empty-state, confirm-dialog)
│   │   ├── pipes/           (currency-inr, relative-time)
│   │   └── directives/      (has-role)
│   ├── layout/
│   │   ├── shell/           (main layout with sidebar + header + content)
│   │   ├── sidebar/         (navigation with role-based visibility)
│   │   ├── header/          (user info, logout menu)
│   │   └── not-found/       (404 page)
│   ├── features/
│   │   ├── auth/            (login, register, forgot-password)
│   │   ├── dashboard/       (summary cards, charts, recent txns, loan widget)
│   │   ├── transactions/    (list, form, detail)
│   │   ├── loans/           (list, form, detail with repayments)
│   │   ├── reports/         (monthly reports with PDF/CSV export)
│   │   ├── audit-log/       (audit trail viewer)
│   │   └── admin/           (user management)
│   ├── environments/        (Firebase config)
│   ├── app.config.ts        (providers: Firebase, Material, Charts, Router)
│   └── app.routes.ts        (lazy-loaded routes with guards)
├── firebase/
│   └── set-custom-claims.js (Node script for setting user roles)
├── scripts/
│   ├── create-user.js        (Create users with role & segments via CLI)
│   ├── clean-db.js           (Clean/reset database collections)
│   └── README.md             (Detailed script documentation)
├── firestore.rules           (Security rules with role-based access)
├── firestore.indexes.json    (Composite indexes for efficient queries)
└── DOCUMENTATION.md          (this file)
```

---

## Setup Instructions

### 1. Firebase Project Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (free Spark plan)
3. Enable **Authentication** → Email/Password sign-in method
4. Enable **Firestore Database** → Start in test mode, then deploy rules
5. Go to Project Settings → Your apps → Add web app
6. Copy the Firebase config object

### 2. Configure Environment
Edit `src/app/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID',
  },
};
```

### 3. Install & Run
```bash
cd farm-tracker
npm install
ng serve
```
App runs at http://localhost:4200

### 4. Setup Scripts
```bash
cd scripts
npm install firebase-admin
```
Download service account key from Firebase Console:
- Project Settings → Service Accounts → Generate New Private Key
- Save as `scripts/service-account-key.json`

### 5. Seed Database & Create Admin
```bash
# Seed default segments and categories
node scripts/clean-db.js seed

# Create your first admin user
node scripts/create-user.js yourname@email.com YourPass123! "Your Name" admin

# Create team members
node scripts/create-user.js friend1@email.com Pass123! "Friend 1" manager goats,cows
node scripts/create-user.js friend2@email.com Pass123! "Friend 2" viewer
```

See `scripts/README.md` for full documentation on all scripts.

### 6. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 7. Deploy to Firebase Hosting (Free)
```bash
ng build --configuration production
firebase deploy --only hosting
```

---

## Key Design Decisions

### Why single `transactions` collection (not separate expense/income)?
- Simplifies dashboard queries and reporting
- One set of security rules
- Same audit trail mechanism

### Why separate `loans` from `transactions`?
- Loans have lifecycle state (repayment tracking)
- Require Firestore transactions for atomic repayment updates
- Different UI flow

### Why precomputed `monthlySummaries`?
- Avoids reading ALL transactions on every dashboard load
- Critical for Spark plan's 50K reads/day limit
- Updated atomically via `increment()` in batch writes

### Why denormalized names in documents?
- Firestore charges per read
- Avoids N+1 queries for display names
- Acceptable trade-off for a small team where names rarely change

### Why soft deletes?
- Preserves audit trail
- Can be "undeleted" if needed
- Filtered out in queries via `isDeleted == false`

### Why client-side aggregation (no Cloud Functions)?
- Cloud Functions require Blaze (paid) plan
- Batch writes with `increment()` are atomic
- Acceptable for a small team (5 users, ~50 transactions/day)

---

## Spark Plan Limits & Feasibility

| Resource | Limit | Our Usage (5 users, ~50 txns/day) |
|----------|-------|-----------------------------------|
| Firestore reads | 50K/day | ~3,000/day |
| Firestore writes | 20K/day | ~150/day (50 × 3 docs per batch) |
| Firestore storage | 1 GB | ~18 MB/year |
| Auth users | Unlimited | No issue |
| Hosting storage | 10 GB | ~5 MB (Angular app) |
| Hosting bandwidth | 360 MB/day | Fine for small team |

---

## Security

- Firebase Auth custom claims enforce roles at the database level
- Firestore security rules validate:
  - User authentication
  - Role-based access (admin/manager/viewer)
  - Segment-based access for managers
  - createdBy/updatedBy must match authenticated user
- Audit logs are immutable (no update/delete allowed)
- Soft deletes prevent data loss
- All mutations use atomic batch writes

---

## Firestore Indexes

Defined in `firestore.indexes.json`. Required for:
- Transactions filtered by isDeleted + type/segment/month/createdBy + ordered by date
- Loans filtered by isDeleted + type/status/segment + ordered by date
- Audit logs filtered by entityType + ordered by timestamp

Deploy with: `firebase deploy --only firestore:indexes`

---

## Libraries Used

| Library | Purpose | License |
|---------|---------|---------|
| @angular/fire | Firebase SDK for Angular | MIT |
| @angular/material | UI components (forms, tables, dialogs) | MIT |
| chart.js + ng2-charts | Dashboard charts | MIT |
| jspdf + jspdf-autotable | PDF export | MIT |

All free and open-source.
