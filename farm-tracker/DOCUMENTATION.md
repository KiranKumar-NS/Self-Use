# Farm Tracker - Multi-User Farming Expense, Income & Loan Tracking System

## Overview

A web application for managing a small farming business involving multiple users. The system tracks income, expenses, loans, and tasks with full transparency on who did what, where, and why.

**Tech Stack:** Angular 21 + Firebase (Free Spark Plan) + Angular Material + Chart.js

---

## Business Segments

- Goats
- Chickens
- Dragon

---

## User Roles & Permissions

| Role | Access |
|------|--------|
| **Admin** | Full access to all data, manage users, seed data, view all reports |
| **Manager** | Add income/expense/loan entries, limited to assigned segments |
| **Viewer** | Read-only access to dashboards, analytics, and reports |

---

## Features

### 1. Authentication
- Email/password login via Firebase Auth
- Role-based access using custom claims
- Password reset via email
- Admin can register new users (without logging out)

### 2. Dashboard (Unified Single Page)
Dashboard and Analytics are merged into one scrollable page. No separate Analytics route.

- **Shared date range filter** with 3 view modes:
  - **Monthly** — prev/next arrows and "Today" button
  - **Custom** — year + month dropdowns for From/To range
  - **All Time** — aggregates all historical data (default)
- **Export buttons** in page header (always visible):
  - **Excel backup** (.xlsx) — 3 sheets: Expenses, Income, Stock (full data for backup/import)
  - **PDF report** — summary + transaction details
  - **WhatsApp share** — selectable sections via dialog
- Total income, expense, net profit/loss summary cards
- Distributed / Undistributed income cards
- **Current Stock** widget — animal counts per segment from inventory
- Income vs Expense by Segment (grouped bar chart) with person breakdown tooltip
- Monthly trend chart (line, adapts to selected date range)
- **Budget vs Actual** widget — progress bars per segment (green/yellow/red) (monthly mode only)
- Loan summary widget (given/received totals)
- **Filter chips** — horizontal scrollable chip rows for quick filtering:
  - **Person row:** `[All] [Karthik] [Ravi] [Priya]` — tap to filter by person
  - **Segment row:** `[All] [Goats] [Chickens] [Dragon]` — tap to filter by segment
  - Both filters can be active simultaneously (combined filtering)
  - Tap active chip again to deselect
- Summary stats (total expense, income, net profit/loss) — reacts to active filters
- **Person Investment cards** — per-person breakdown:
  - Net investment (expenses paid − income received)
  - Visual progress bar
  - Expenses paid (red), Income received (green)
  - **Holding** (amber) — undistributed income the person received but hasn't distributed yet
- Charts: Expense by Person (bar), Expense by Category (doughnut)
- Segment stat cards with transaction counts
- Charts: Expense by Segment (doughnut), Monthly Expense Trend (bar)
- **Transaction details table** — sortable, paginated (10/20/50 rows per page)

### 3. Transactions (Expense & Income)
- Add/edit/delete (soft) transactions
- **Shared date range filter** — same Monthly/Custom/All Time selector as dashboard
- **Search** by description, person, category, segment, amount (client-side, zero extra reads)
- Filter by type, segment, paid by, payment status
- **Payment status filters:** Received, Pending (income), Paid, Credit/Unpaid (expense)
- Pagination (20 per page)
- Amount, category, segment, description, payment method (cash/UPI), paid-by tracking
- **Pending Expenses (Credit Purchases):**
  - Mark expense as "Paid" or "Pending (Credit)" when creating
  - "Credit" chip shown on pending expense rows in transaction list
  - "Mark as Paid" button on transaction detail page
  - `pendingExpense` tracked in monthly summaries
- Inline timeline for audit trail (created/updated/deleted/distributed events)
- **Income Distribution:** Admin/Manager can distribute income among partners
  - Distribute from transaction detail page via dialog
  - Track per-person amounts (e.g., "Kiran: 5000, Ravi: 3000")
  - Reinvestment tracking (undistributed amount kept for business)
  - Distribution status shown in transaction list (Distributed/Partial/Undistributed)
  - Can edit distributions at any time
  - Distributions cleared if transaction amount changes

### 4. Loans (Owe & Lent)
- Loan given / received tracking
- Person name, purpose, segment (or personal)
- **Add More Amount** — give additional money to same person, loan total increases, tracked in history
  - Always available (even on completed loans — reopens the loan)
  - Recorded as negative entry in repayments subcollection (disbursement)
  - Timeline tracks: "added more: +₹5,000 (total: ₹15,000)"
- Repayment tracking (pending/partial/completed)
- **Transaction History** — shows both repayments (green) and disbursements (yellow) in one view
- Progress bar showing repayment percentage
- **Hard delete** on completed loans (admin/manager, with confirmation dialog)
- Inline timeline for audit trail

### 5. Tasks (Kanban Board)
- Kanban board with 4 columns: Backlog, To Do, In Progress, Done
- **Drag & drop** cards between columns to change status
- **View filter:** "All Tasks" / "My Tasks" toggle (assigned to me or created by me)
- Task priority levels: low, medium, high, urgent
- Visibility: shared (visible to all) or personal (only creator)
- Assignee support
- Subtasks with individual due dates
- Tags for organization

### 6. Analytics (merged into Dashboard)
- Analytics is no longer a separate page — it's part of the unified Dashboard
- `/analytics` route redirects to `/dashboard`
- See Dashboard section above for full feature list

### 7. Reports & Export
- Monthly income vs expense summary
- Segment breakdown table
- Transaction detail list
- **Distributions tab** — person-wise totals, per-transaction breakdown
- Loan summary
- **Export to PDF** (jsPDF + jspdf-autotable) — includes distribution summary page
- **Export to Excel** (.xlsx, 3 sheets):
  - **Expenses** — Date, Month, Segment, Category, Amount, Quantity, Unit, Rate Per Unit, Paid By, Payment Method, Payment Status, Description, Created By, Created At
  - **Income** — Date, Month, Segment, Category, Amount, Quantity, Unit, Rate Per Unit, Received By, Payment Method, Payment Status, Description, Distribution, Created By, Created At
  - **Stock** — Segment, Icon, Type, Unit, Current Stock, Breeds, Monthly Expense Budget, Monthly Income Target
- **WhatsApp share** — customizable sections (summary, segments, categories, persons, income, stock, transactions)

### 8. Inventory Tracking
- Track animal stock per segment (e.g., 10 goats, 50 chickens)
- Record events: birth, death, purchase, sale, adjustment
- Current stock displayed on dashboard and dedicated inventory page
- Event history table with segment filter
- Stock updated atomically via batch writes (event + segment.currentStock)
- Accessible to admin and managers

### 9. Notifications/Reminders (client-side)
- Notification bell in header with badge count
- **Loan overdue** — loans pending > 30 days
- **Task overdue** — tasks with dueDate past and not done
- **Budget warning** — expense >= 80% of segment budget
- **Budget exceeded** — expense >= 100% of segment budget
- Dismiss individually or "Clear All"
- Dismissed IDs persisted in localStorage
- Computed on app init from existing data (zero extra Firestore collections)

### 10. Budget/Target per Segment
- Admin sets monthly expense limit and income target per segment
- Configured in Data Setup > Budgets tab
- Dashboard shows budget vs actual with color-coded progress bars
  - Green: < 80% spent
  - Yellow: 80-99% spent
  - Red: >= 100% (exceeded)
- Stored on segment document (zero extra reads — uses cached segments)

### 11. User Management (Admin only)
- View all users
- Add new users (register without logging out current admin)
- Edit roles and segment assignments
- Activate/deactivate users

### 12. Data Setup (Admin only)
- Seed default segments and categories from the UI
- Reset or reinitialize reference data
- **Budgets tab** — set monthly expense limits and income targets per segment

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
├── id: string ("goats" | "chickens" | "dragon")
├── name: string
├── description: string
├── icon: string (emoji)
├── isActive: boolean
├── currentStock?: number (denormalized animal count)
├── budgets?: { monthlyExpenseLimit?: number, monthlyIncomeTarget?: number }
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
├── paymentMethod: "cash" | "upi"
├── paidBy: string | null (userId)
├── paidByName: string | null
├── createdBy: string
├── createdByName: string
├── createdAt: Timestamp
├── isDeleted: boolean (soft delete)
├── distributions?: DistributionEntry[] (income only)
├── paymentStatus?: "received" | "pending" (income only)
├── expensePaymentStatus?: "paid" | "pending" (expense only — credit purchases)
├── timeline: TimelineEntry[] (inline audit trail)
├── month: string ("2026-05")
└── year: number
```

**DistributionEntry:**
```
├── uid: string (user UID or "reinvestment")
├── name: string (display name or "Reinvestment")
└── amount: number
```

**TimelineEntry:**
```
├── action: "created" | "updated" | "deleted" | "distributed" | "payment_received" | "payment_paid"
├── by: string (userId)
├── byName: string
├── at: Timestamp
└── changes?: string (e.g., "amount: 5000→4500, category: Feed→Medicine")
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
├── segment: string (or "personal")
├── segmentName: string
├── repaymentStatus: "pending" | "partial" | "completed"
├── totalRepaid: number
├── balanceRemaining: number
├── recordedBy: string
├── recordedByName: string
├── createdAt: Timestamp
├── isDeleted: boolean
├── timeline: TimelineEntry[] (inline audit trail)
├── month: string
└── year: number
```

### Subcollection: `loans/{loanId}/repayments`
```
/loans/{loanId}/repayments/{repaymentId}
├── id: string
├── date: Timestamp
├── amount: number (positive = repayment, negative = additional disbursement)
├── note: string
├── paidBy?: string (userId)
├── paidByName?: string
├── recordedBy: string
├── recordedByName: string
└── createdAt: Timestamp
```

### Collection: `tasks`
```
/tasks/{taskId}
├── id: string
├── title: string
├── description: string
├── priority: "low" | "medium" | "high" | "urgent"
├── status: "backlog" | "todo" | "in_progress" | "done"
├── visibility: "shared" | "personal"
├── assignee: string | null (userId)
├── assigneeName: string | null
├── dueDate: Timestamp | null
├── subtasks: Subtask[]
├── tags: string[]
├── kanbanOrder: number
├── createdBy: string
├── createdByName: string
├── createdAt: Timestamp
├── updatedAt: Timestamp
└── completedAt: Timestamp | null
```

**Subtask:**
```
├── id: string
├── title: string
├── done: boolean
└── dueDate: string | null ("YYYY-MM-DD")
```

### Collection: `inventoryEvents`
```
/inventoryEvents/{eventId}
├── id: string
├── segment: string
├── segmentName: string
├── eventType: "birth" | "death" | "purchase" | "sale" | "adjustment"
├── count: number (positive = add, negative = remove)
├── note: string
├── date: Timestamp
├── createdBy: string
├── createdByName: string
├── createdAt: Timestamp
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
├── expenseByPerson?: { uid: amount, ... }
├── incomeByPerson?: { uid: amount, ... }
├── pendingIncome?: number
├── pendingExpense?: number
├── totalDistributed?: number
├── distributionByPerson?: { uid: amount, ... }
└── updatedAt: Timestamp
```

**Document ID format:** `"2026-05-goats"` — deterministic for direct reads.

---

## Project Structure

```
farm-tracker/
├── src/app/
│   ├── app.ts                  (root component with <router-outlet />)
│   ├── app.config.ts           (providers: Firebase, Material, Charts, Router)
│   ├── app.routes.ts           (lazy-loaded routes with guards)
│   ├── core/
│   │   ├── guards/             (auth.guard.ts, role.guard.ts)
│   │   ├── services/           (auth, user, transaction, loan, task, summary, export, segment, category, inventory, notification)
│   │   ├── models/             (TypeScript interfaces: transaction, loan, task, segment, category, inventory, notification, user, monthly-summary)
│   │   └── utils/              (date.utils.ts, firestore.utils.ts, name.utils.ts, table.utils.ts)
│   ├── shared/
│   │   ├── components/         (loading-spinner, empty-state, confirm-dialog, date-range-filter)
│   │   ├── pipes/              (currency-inr, relative-time)
│   │   └── directives/         (has-role)
│   ├── layout/
│   │   ├── shell/              (main layout, triggers notification refresh)
│   │   ├── sidebar/            (navigation with role-based visibility)
│   │   ├── header/             (user info, notification bell, logout menu)
│   │   ├── notification-bell/  (bell icon with badge + dropdown)
│   │   └── not-found/          (404 page)
│   ├── features/
│   │   ├── auth/               (login, register, forgot-password)
│   │   ├── dashboard/          (summary cards, charts, loan widget, budget widget, stock widget, analytics-tab with filter chips)
│   │   ├── transactions/       (list, form, detail, distribution-dialog)
│   │   ├── loans/              (list, form, detail with repayments + add-more)
│   │   ├── inventory/          (inventory-page, inventory-event-dialog)
│   │   ├── tasks/              (kanban-board, form, detail)
│   │   ├── reports/            (monthly reports with PDF/Excel export)
│   │   └── admin/              (user management, user form, data setup + budgets)
│   └── environments/           (Firebase config for dev and prod)
├── scripts/
│   ├── setup-collections.js    (Seed default segments & categories)
│   ├── create-user.js          (Create users with role & segments via CLI)
│   ├── clean-db.js             (Clean/reset database collections)
│   ├── import-expenses.js      (Bulk import transactions from Excel)
│   └── README.md               (Detailed script documentation)
├── firebase/
│   └── set-custom-claims.js    (Node script for setting user roles)
├── firestore.rules             (Security rules with role-based access)
├── firestore.indexes.json      (Composite indexes for efficient queries)
└── DOCUMENTATION.md            (this file)
```

---

## Routes

| Path | Feature | Guard | Access |
|------|---------|-------|--------|
| `/dashboard` | Dashboard (overview + analytics + filters + charts + table) | authGuard | All authenticated |
| `/analytics` | Redirects to `/dashboard` | authGuard | All authenticated |
| `/transactions` | Transaction list/form/detail | authGuard + roleGuard | Admin, Manager |
| `/loans` | Loan list/form/detail | authGuard + roleGuard | Admin, Manager |
| `/inventory` | Inventory stock + events | authGuard + roleGuard | Admin, Manager |
| `/tasks` | Kanban board/form/detail | authGuard | All authenticated |
| `/reports` | Reports with export | authGuard | All authenticated |
| `/admin` | User management | authGuard + roleGuard | Admin only |
| `/admin/register` | Register new user | authGuard + roleGuard | Admin only |
| `/admin/data-setup` | Seed reference data | authGuard + roleGuard | Admin only |
| `/auth/login` | Login page | — | Public |
| `/auth/forgot-password` | Password reset | — | Public |

---

## Sidebar Navigation

| Item | Icon | Visible To |
|------|------|------------|
| Dashboard | dashboard | All |
| Transactions | receipt_long | Admin, Manager |
| Owe & Lent | account_balance | Admin, Manager |
| Inventory | inventory_2 | Admin, Manager |
| Tasks | view_kanban | All |
| Admin | admin_panel_settings | Admin |
| Data Setup | dataset | Admin |

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
Edit `src/app/environments/environment.ts` and `environment.prod.ts`:
```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.firebasestorage.app',
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
npm install
```
Download service account key from Firebase Console:
- Project Settings → Service Accounts → Generate New Private Key
- Save as `scripts/service-account-key.json`

### 5. Seed Database & Create Admin
```bash
# Seed default segments and categories
node scripts/setup-collections.js

# Create your first admin user
node scripts/create-user.js yourname@email.com YourPass123! "Your Name" admin

# Create team members
node scripts/create-user.js friend1@email.com Pass123! "Friend 1" manager goats chickens
node scripts/create-user.js friend2@email.com Pass123! "Friend 2" viewer
```

### 6. Clean Database (if needed)
```bash
node scripts/clean-db.js all           # Delete transactions, loans, tasks, summaries
node scripts/clean-db.js transactions   # Delete transactions + summaries only
node scripts/clean-db.js loans          # Delete loans + repayments
node scripts/clean-db.js tasks          # Delete all tasks
node scripts/clean-db.js summaries      # Delete monthly summaries
```

### 7. Import Transactions from Excel
```bash
node scripts/import-expenses.js
```
Reads `scripts/Details.xlsx` (Expenses sheet) and creates transaction documents with monthly summaries.

### 8. Deploy Firestore Rules & Indexes
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 9. Deploy to Firebase Hosting (Free)
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

### Why inline `timeline` instead of separate `auditLogs` collection?
- Reduces Firestore reads (no extra collection query)
- Timeline is always available with the document
- Simpler security rules — no separate audit collection to manage

### Why client-side aggregation (no Cloud Functions)?
- Cloud Functions require Blaze (paid) plan
- Batch writes with `increment()` are atomic
- Acceptable for a small team (5 users, ~50 transactions/day)

### Why in-memory caching on reference data?
- Segments, categories, and users rarely change but are needed on every page
- Cached after first fetch, reused across navigations (zero extra reads)
- Cache cleared automatically on writes (seed, update, toggleActive)
- Reduces daily Firestore reads by ~70-80%

### Why client-side notifications (no Cloud Functions)?
- Spark plan doesn't support Cloud Functions
- Notifications computed from existing data (loans, tasks, summaries, budgets)
- Dismissed state stored in localStorage (zero Firestore writes)
- Refreshed once on app init

### Why custom paidBy uses sanitized name as summary key?
- When a non-registered person pays (e.g., "Raju"), paidBy is stored as `"other"` with paidByName = `"Raju"`
- In monthlySummaries, each external person gets their own key (e.g., `expenseByPerson.Raju`) instead of all pooling under `expenseByPerson.other`
- Dashboard person breakdown can then distinguish between different external people
- Names are sanitized (dots/special chars replaced with `_`) to avoid Firestore nested path issues

### Why `paymentMethod` field?
- Tracks whether transaction was paid via cash or UPI
- Useful for reconciliation and person-wise expense tracking

### Why name normalization for custom "Paid By" names?
- Custom names (e.g., "raju", "Raju", " RAJU ") are auto-normalized to title case ("Raju")
- Prevents duplicate person entries in analytics and monthly summary aggregations
- Transaction form warns "Did you mean Raju?" when typing a similar existing name
- Utility functions: `normalizeName()` for title-case, `nameKey()` for lowercase dedup key

### Why "Holding" in Person Investment?
Income is received in two stages:
1. A person receives the total income (e.g., from a sale) — stored as `paidByName` on the income transaction
2. The income is later distributed to beneficiaries via `distributions[]`

Until distribution, the received amount is "held" by the receiver — it's not their income. The Person Investment card shows:
- **Expenses paid** — what the person spent (from expense transactions)
- **Income received** — only from `distributions[]` entries (not from `paidByName`)
- **Holding** — undistributed income (`transaction.amount - sum of all distributions including reinvestment`)
- **Net** = Expenses paid − Income received (holding is not included in net)

Reinvestment (`uid === 'reinvestment'`) is treated as allocated (not held), but not as personal income.

### Why merged Dashboard + Analytics?
- Previously two separate pages with overlapping summary cards and date filters
- Users found it confusing navigating between Dashboard and Analytics
- Merged into one scrollable page with filter chips instead of tabs
- Filter chips allow quick person/segment filtering without dropdown menus
- Both filters can be combined (e.g., "Karthik" + "Goats")

### Why shared DateRangeFilterComponent?
- Same date filter UI across Dashboard, Transactions pages
- 3 modes: Monthly (prev/next), Custom (year+month dropdowns), All Time
- Default mode: All Time — shows complete financial picture
- Year dropdown prevents scrolling through long month lists
- Firestore `in` query 30-item limit handled via `getForMonthsBatched()` batching

---

## Spark Plan Limits & Feasibility

| Resource | Limit | Our Usage (5 users, ~50 txns/day) |
|----------|-------|-----------------------------------|
| Firestore reads | 50K/day | ~1,000-2,000/day (with caching) |
| Firestore writes | 20K/day | ~150/day (50 x 3 docs per batch) |
| Firestore storage | 1 GB | ~18 MB/year |
| Auth users | Unlimited | No issue |
| Hosting storage | 10 GB | ~5 MB (Angular app) |
| Hosting bandwidth | 360 MB/day | Fine for small team |

---

## Security

### Firestore Rules

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| `users` | Authenticated | Self or Admin | Self or Admin | Admin |
| `segments` | Authenticated | Manager/Admin | Manager/Admin | Manager/Admin |
| `categories` | Authenticated | Admin | Admin | Admin |
| `transactions` | Authenticated | Manager/Admin (segment check) | Manager/Admin (segment check) | Admin |
| `loans` | Authenticated | Manager/Admin (segment or personal) | Manager/Admin (segment or personal) | Manager/Admin |
| `loans/repayments` | Authenticated | Manager/Admin | Manager/Admin | Manager/Admin |
| `inventoryEvents` | Authenticated | Manager/Admin (segment check) | Admin | Admin |
| `monthlySummaries` | Authenticated | Manager/Admin | Manager/Admin | — |
| `tasks` | Authenticated | Authenticated | Authenticated | Authenticated |

### Key Security Features
- Firebase Auth custom claims enforce roles at the database level
- Segment-based access control for managers
- `createdBy` must match authenticated user on transaction creation
- Transactions must be created with `isDeleted == false`
- Soft deletes prevent data loss
- All mutations use atomic batch writes

---

## Firestore Indexes

Defined in `firestore.indexes.json`. Required for:

**Transactions (5 indexes):**
- `(isDeleted, date)` — base query
- `(isDeleted, type, date)` — filter by transaction type
- `(isDeleted, segment, date)` — filter by segment
- `(isDeleted, month, date)` — filter by month
- `(isDeleted, createdBy, date)` — filter by creator

**Loans (4 indexes):**
- `(isDeleted, date)` — base query
- `(isDeleted, type, date)` — filter by loan type
- `(isDeleted, repaymentStatus, date)` — filter by repayment status
- `(isDeleted, segment, date)` — filter by segment

**Audit Logs (2 indexes, legacy):**
- `(entityType, timestamp)` — base audit query
- `(entityType, entityId, timestamp)` — entity-specific audit

Deploy with: `firebase deploy --only firestore:indexes`

---

## Libraries Used

| Library | Version | Purpose | License |
|---------|---------|---------|---------|
| @angular/fire | 20.0.1 | Firebase SDK for Angular | MIT |
| @angular/material | 21.2.10 | UI components (forms, tables, dialogs, icons) | MIT |
| chart.js + ng2-charts | 4.5.1 / 10.0.0 | Dashboard & analytics charts | MIT |
| jspdf + jspdf-autotable | 4.2.1 / 5.0.7 | PDF export | MIT |
| xlsx | latest | Multi-sheet Excel export (.xlsx) for backup | Apache-2.0 |
| firebase | 12.13.0 | Firebase client SDK | Apache-2.0 |
| rxjs | 7.8.0 | Reactive programming | Apache-2.0 |

**Scripts Dependencies** (in `scripts/package.json`):
| Library | Purpose |
|---------|---------|
| firebase-admin | Server-side Firebase access for CLI scripts |
| xlsx | Excel file parsing for import-expenses script |

All free and open-source.
