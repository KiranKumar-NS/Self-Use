# Farm Tracker

Angular 21 + Firebase (Firestore + Auth) + Angular Material + Chart.js PWA for multi-user farm financial management. Tracks animals, transactions, loans, buyers, tasks, breeding, crops, harvests, consumable inventory, suppliers, and scheduled reminders. Firebase Spark (free) plan — no Cloud Functions, all aggregation is client-side.

**Tech Stack:** Angular 21 (standalone components), Firebase Firestore, Firebase Auth, Angular Material, Chart.js (ng2-charts), Angular CDK (drag-drop), jsPDF + jspdf-autotable, Angular Service Worker, Vitest, SCSS.

## Segments & Roles

Segments: Goats (🐐), Chickens (🐔), Dragon Fruit (🌵). Users assigned to specific segments. Segment types: `animal` or `crop`. Units: `head|kg|trees|litres`.

| Role | Transactions/Loans/Stock/Buyers | Tasks | Admin |
|------|---------------------------------|-------|-------|
| Admin | Full | Full | Full |
| Manager | Full (assigned segments) | Full | No |
| Viewer | No | Full | Dashboard read-only |

## Features

### Dashboard `/dashboard`

Summary cards (income/expense/profit), stock widget, budget vs actual (monthly mode), loan summary with EMI alerts, segment breakdown chart (hidden on mobile), monthly trend chart (hidden on mobile), person investment cards (expenses paid, income received, holdings, loan hold/owed), filter chips (person + segment + tag), tag productivity cards (income/expense/net per tag for crop tracking), undistributed income card, pending amounts tracking. Export: Excel/PDF/WhatsApp.

**Analytics Tab:** Advanced analytics with person/segment/tag filters. Person investment summary with net investment, expense vs income breakdown, income undistributed amounts, loan holds in custody with per-loan detail. Tag productivity analysis when tag filter is active. Charts: expense by person (bar), expense by category (doughnut), expense by segment (doughnut), monthly expense trend (bar).

**Date Range:** Monthly selection or custom period. Default: All Time view. Shared date range filter across all pages with year/month selection.

### Transactions `/transactions`

Expense & income CRUD with pagination, sorting, filtering. Fields: amount, date, category, segment, description, paymentMethod (cash/upi), paidBy (user or "other" with custom name), quantity/unit/rate (for sales). Units: `kg|head|dozen|litre|pieces|bag|bundle`.

**Payment Status:** Income: received/pending. Expense: paid/credit (pending).

**Cost Attribution:** Link transactions to multiple animals. Split costs across animals via cost attribution dialog. Creates costEntries on animal records.

**Buyer Linkage:** Link income transactions to buyers. Auto-updates buyer denormalized stats.

**Supplier Linkage:** Link expense transactions to suppliers via optional supplier selector. Fields: linkedSupplierId, linkedSupplierName.

**Income Distribution:** Split income among multiple partners with amount allocation. Reinvestment option (separate tracking). Remaining/over-allocation validation.

**Tags:** Freeform tags for ad-hoc grouping (harvest cycles, plot blocks). Tag autocomplete with crop-specific suggestions. Tag filter in list view. Tag-based search.

**Auto-Tag Generation:** Smart context-aware tags generated automatically:
- Category-based: `{category}-{month-short}-{year}` (e.g., `feed-jul-2026`)
- Segment-based: `{segment}-{month-short}-{year}` (e.g., `goats-jul-2026`)
- Animal-linked: from linked animal names/batch labels
- Seasonal: `monsoon-{year}` (May-Aug), `summer-{year}` (Feb-Apr), `winter-{year}` (Nov-Jan)
- Merge strategy: manual tags first, then auto-tags (deduplicated)

**Timeline:** Audit trail on each transaction showing all modifications with user, timestamp, and change details.

**Paid By Filter:** Filter transactions by who paid.

### Loans `/loans`

**Simple Loans:** Owe/lent between people. Fields: date, amount, type (given/received), personName, purpose, segment. Repayment tracking with status (pending/partial/completed).

**Formal Loans:** Bank/finance/gold loan lifecycle management.
- Source: bank, finance_company, individual, gold_loan
- Disbursement: sanctioned amount, net disbursed, deductions (processing fees, insurance, stamps, etc.)
- Deductions: type, amount, paidTo, paymentReference, isFinanced flag
- Repayment types: EMI (reducing-balance) or interest-only
- Interest: fixed/floating rate, annual/monthly/weekly frequency
- EMI: tenure, emiAmount, totalEMIs, emisPaid, moratoriumMonths, emiStartDate, schedule preview
- Interest-only: payment frequency, amount per period, total payments made
- Rate changes: history with old/new rate, new EMI, notes (for floating rate)
- Collateral: gold, property, vehicle, fixed_deposit, other. Per-item tracking with weight/purity/value for gold.
- Gold loan specifics: LTV ratio, RBI calculations, pledge receipt, per-item gold tracking (gross/net weight, purity, rate per gram, value)
- Documents: sanction_letter, agreement, insurance_policy, noc, other with reference numbers and dates
- Pre-closure: charges, early repayment handling
- Renewal: link renewed-from/renewed-by loans
- Balance transfer: link replaced-by/replaces loans
- Government subsidy: subsidyDetails, effectiveRate
- Utilization tracking: total, remaining
- Loan holder: heldByUid/Name
- Multi-segment: segments[], segmentNames[]
- Part-payment and penalty tracking
- Next payment due date with alerts
- Closure: fully_paid, pre_closed, balance_transfer, renewed
- **Payment segment override:** All payment forms (EMI, interest, part-payment, penalty, pre-close, close principal) include an "Expense Segment" dropdown defaulting to loan's primary segment, overridable by user. Ensures multi-segment loans attribute expenses to the correct segment.

**Repayment Subcollection** `loans/{id}/repayments/{id}`: Individual payments with principal/interest split, EMI number, scheduled due date, payment reference, pre-closure flag, penalty amount.

### Stock `/stock`

Unified page (merged Animals + Inventory) with stock summary cards at top and two tabs: **Animals** (records list with filters, search, stats, pagination) and **Stock Log** (inventory event history). Actions: "Record Event" dialog, "Register Animal" form page, "Analytics" link, "Mortality" link.

**Auto Animal Record Creation:** When recording a purchase/birth event via the "Record Event" dialog, an "Also create animal record" toggle (default: on) auto-creates a batch animal record (count > 1) or individual record (count = 1) with breed, purchase price, and batch label.

**Individual Animals:** tag/ID, name, breed, gender (male/female/unknown). Origin: birth (with breed info) or purchase (with price). Status: active → sold/dead with exit tracking.

**Batch Animals:** batchLabel, batchSize, currentCount. Same origin/status tracking.

**Cost Tracking:** costEntries array linked to transactions. Each entry: transactionId, date, category, categoryName, amount, description. totalInvested = purchasePrice + sum(costEntries). profit = salePrice - totalInvested. profitMargin percentage.

**Sale:** Sale dialog creates transaction + inventory event + updates buyer stats. Fields: salePrice, salePricePerHead, buyerId/Name, saleDate.

**Vaccination History:** Embedded array on Animal. Fields: vaccineName, date, dosage, administeredBy, nextDueDate, batchNumber, cost. Add via dialog from animal detail page.

**Medical Records:** Embedded array on Animal. Fields: type (treatment/checkup/surgery/emergency), date, disease, symptoms, medicine, dosage, doctor, temperature, weight, cost. Add via dialog from animal detail page.

**Weight History:** Embedded array on Animal. Fields: date, weight (kg), remarks. Weight chart (Chart.js line graph) on animal detail page. Add via dialog.

**Death Recording:** Record death with cause (disease/accident/old_age/unknown). Auto-computes ageAtDeathDays from originDate. Fields: deathCause, deathNote, ageAtDeathDays.

**Mortality Analysis** `/stock/mortality`: Dashboard with mortality rate %, cause breakdown (doughnut chart), estimated financial loss, average age at death, monthly trend (bar chart), per-segment statistics.

**Animal Analytics** `/stock/analytics`: Profitability analysis per animal, cost breakdown, ROI.

### Breeding `/breeding`

Track mating, pregnancy, and delivery for animals. Fields: segment, dam (female), sire (male, optional), matingDate, matingMethod (natural/artificial), status (mated/confirmed_pregnant/delivered/failed), expectedDeliveryDate, gestationDays, actualDeliveryDate, offspringCount, offspringMale, offspringFemale, complications, veterinaryCost, note.

Animal pickers filter by gender within selected segment. Status badges with color coding. Upcoming deliveries tracked via notification alerts.

### Crop Activities `/crops`

Track farming activities for crop segments (Dragon Fruit). Activity types: irrigation, fertilizer, pruning, spraying, weeding, flowering, harvest, planting, mulching, soil_testing, other. Fields: segment, activityType, date, description, productUsed, quantity, unit, area, duration (hours), laborCount, cost, weather, temperature, note.

Timeline/table view filtered by segment. Activity type colored badges. Linked to transactions for cost tracking.

### Harvests `/harvests`

Harvest → Storage → Sale pipeline with wastage tracking. Status pipeline: harvested → in_storage → partially_sold → fully_sold.

**Harvest Record:** segment, cropName, variety, harvestDate, totalQuantity, unit, grade, storageLocation, harvestCost, linkedCropActivityId.

**Sale Recording:** Records sale from harvest with quantity, ratePerUnit, buyer selection. Auto-creates income transaction via TransactionService. Auto-updates buyer stats via BuyerService. Embedded sales[] array with per-sale tracking.

**Wastage:** Record wastage quantity and reason. Updates remainingQuantity. Auto-transitions status when remaining reaches zero.

**Computed Fields:** totalSold, totalRevenue, wastageQuantity, remainingQuantity = totalQuantity - totalSold - wastageQuantity, averageRate.

**Detail Page:** Pipeline progress visualization, summary cards, sales history table, transaction links.

### Consumable Inventory `/consumables`

Track consumable stock items: feed, medicine, fertilizer, seeds, fuel, diesel, packaging, tools, other.

**Item Fields:** name, category, unit (kg/liters/bags/bottles/pieces), currentStock, minimumStock (reorder alert threshold), segments[] (which segments use this item).

**Stock Movements:** Embedded array tracking all stock changes. Types: opening, purchase, used, adjustment, wastage. Each movement: date, type, quantity (+/-), unitCost, totalCost, supplierId, supplierName, note, recordedBy.

**Operations:**
- `recordPurchase(qty, unitCost, supplier?)` — Adds stock, updates totalPurchased, totalSpent, lastPurchaseRate, averagePurchaseRate
- `recordUsage(qty, note?)` — Reduces stock, updates totalUsed. Validates stock availability.
- `recordWastage(qty, reason?)` — Reduces stock, updates totalWastage.

**Low Stock Alerts:** Items with currentStock ≤ minimumStock highlighted in UI. Notification integration for low_stock alerts.

**Card-based UI:** Grid layout with stock level progress bars, action buttons (Purchase, Use, Wastage), category badges.

### Suppliers `/suppliers`

Supplier management (mirrors Buyer model). Fields: name, phone, location, gstNumber, itemCategories[], note.

**Denormalized Stats:** totalOrders, totalAmountPaid, pendingAmount, averageRate, lastOrderDate, ordersBySegment, amountBySegment. Auto-updated on purchase operations.

**Pending Amount:** Track unpaid invoices per supplier via `updatePendingAmount(delta)`.

### Schedules & Reminders `/schedules`

Unified scheduling engine for recurring transactions and scheduled reminders. Shared `schedules` collection with `type: 'recurring_transaction' | 'reminder'`.

**Recurring Transactions:** Auto-create transactions on a schedule. Template: type (expense/income), amount, category, segment, paymentMethod, paidBy, tags. Frequency: daily/weekly/biweekly/monthly/quarterly/yearly. Start/end dates.

**Reminders:** Scheduled alerts with optional auto-task creation. Reminder types: vaccination, deworming, spraying, fertilizer, insurance, loan_emi, breeding_checkup, harvest, custom. Linked to animals and/or segments. Configurable notify-before days.

**Client-Side Processing:** Since no Cloud Functions (Spark plan), `ScheduleService.processOverdueSchedules()` runs on app startup via ShellComponent.ngOnInit(). Processes all overdue schedules: creates transactions for recurring type, creates tasks for reminders with autoCreateTask. Safety limit: max 12 missed occurrences per schedule. Advances nextDueDate after processing.

**Dashboard Integration:** Upcoming reminders widget. Pending recurring indicator. NotificationService alerts for overdue/upcoming reminders.

### Inventory Events

Birth/death/purchase/sale/adjustment events. Count: positive (add) or negative (remove). Auto-updates segment.currentStock atomically via batch writes. Breed tracking. Estimated value for mortality/loss analysis. Linked to animals via linkedAnimalIds.

### Buyers `/buyers`

Name, phone, location, note. Denormalized stats auto-updated on sales: totalPurchases, totalAmountPaid, averageRate, lastPurchaseDate, purchasesBySegment (count), amountBySegment (amount). Buyer detail page with purchase history.

### Tasks `/tasks`

Kanban board: backlog → todo → in_progress → done. Priority: low/medium/high/urgent. Assignee, due dates, subtasks (with individual completion and optional due dates). Tags. Visibility: shared (all users) or personal (creator only). Drag-drop via Angular CDK. Desktop: Kanban columns. Mobile: tab view. Filter: All Tasks vs My Tasks. kanbanOrder for column sorting.

### Admin `/admin`

**User Management:** CRUD users, role assignment (admin/manager/viewer), segment assignment per user, active/inactive toggle.

**Data Setup** `/admin/data-setup`: Seed default segments (Goats/Chickens/Dragon Fruit) and categories. Segment budget management (monthly expense limit, income target). Category creation.

### Authentication

Email/password login. Registration (admin-creates-user flow via `/admin/register`). Forgot password with reset email. Auth guard checks login + active user flag.

### Notifications

In-memory (not Firestore). Types:
- Loan overdue: >30 days past due (error severity)
- Loan payment due: <5 days until next payment (warning severity)
- Task overdue: past due date (warning severity)
- Budget warning: ≥80% of monthly limit (warning severity)
- Budget exceeded: ≥100% of monthly limit (error severity)
- Recurring due: pending recurring transactions to process (warning severity)
- Reminder due: overdue reminders (error severity)
- Reminder upcoming: reminders due within 7 days (warning severity)
- Low stock: consumable items below minimum threshold (warning severity)
- Delivery expected: breeding deliveries approaching (warning severity)

Dismissals stored in localStorage.

## Export & Import

### Export Formats

**PDF Reports:**
- `exportTransactionsPdf()` — Full farm financial report: summaries, segment breakdown, category breakdown, paid-by summary, transaction details, income distribution
- `exportLoansPdf()` — Loan summary reports by month
- `exportLoanDetailPdf()` — Individual loan detail: deductions, collateral, personal withdrawals

**CSV Exports:**
- `exportTransactionsCsv()` — All fields including quantity, unit, rate, payment status, distributions
- `exportLoansCsv()` — Comprehensive loan data with formal loan fields

**Excel Backup:**
- `exportBackupExcel()` — Full all-time backup (v2) from the dashboard download button: every persisted collection across 28 sheets (transactions, loans + repayments/deductions/collateral/rate changes/documents, animals + cost/health detail, buyers, suppliers, harvests + sales, breeding, crop activities, consumables + stock movements, tasks, schedules, categories, segments, users, tags) plus a `Meta` sheet with format version and per-sheet counts. Data fetched uncapped via `BackupService.collectFullBackup()`; excludes soft-deleted docs and timeline audit arrays.
- `exportLoanDetailExcel()` — Single loan detail with 9 sheets: Overview, Deductions, Repayments, Utilization, Personal Withdrawals, Collateral, Rate Changes, Documents

**WhatsApp:** Formatted summary sharing via WhatsApp share dialog.

All exports use Indian Rupees (₹) formatting.

### Automatic Daily Drive Backup

**`backup-script/`** — Google Apps Script (runs in the owner's Google account, free tier) that backs up the entire Firestore database to a "FarmTracker Backups" Google Drive folder every evening at 6 PM IST: `farm-backup-YYYY-MM-DD.json` (lossless, includes soft-deleted docs, Firestore types preserved via `_ts`/`_ref` sentinels) + `.xlsx` (one tab per collection). 30-day retention, email alerts on failure/count drops/staleness. Setup: `backup-script/SETUP.md`.

### Import

**`scripts/import-backup.js`** — Restores data from Excel backups. Auto-detects file type (full backup v2 via `Meta` sheet, transaction backup v1, or loan detail). Supports `--dry-run` and `--skip-summaries` flags; rebuilds monthly/yearly summaries after import.
**`scripts/verify-backup.js`** — Read-only round-trip check of a full backup file against live Firestore (or the emulator).

## Firestore Schema

### `users/{uid}`
uid, email, displayName, role (`admin|manager|viewer`), assignedSegments[], isActive, createdAt, updatedAt, createdBy

### `segments/{id}`
id, name, description, icon, isActive, segmentType (`animal|crop`), unit (`head|kg|trees|litres`), currentStock?, breeds[]?, budgets? {monthlyExpenseLimit?, monthlyIncomeTarget?}, createdAt

### `categories/{id}`
id, name, type (`expense|income`), isActive
Expense: feed, medicine, labor, transport, maintenance, loan-repayment, other-expense
Income: milk, eggs, animal-sales, crop-sales, fruit-sales, other-income

### `transactions/{id}`
id, type (`expense|income`), date, amount, quantity?, unit? (`kg|head|dozen|litre|pieces|bag|bundle`), ratePerUnit?, category (ID), categoryName, segment (ID), segmentName, description, paymentMethod (`cash|upi`), paidBy (uid|"other"|null), paidByName, paymentStatus? (`received|pending`), expensePaymentStatus? (`paid|pending`), distributions? [{uid, name, amount}], linkedLoanId?, linkedAnimalIds[]?, linkedAnimalNames[]?, animalCostSplit? {animalId: amount}, linkedBuyerId?, linkedBuyerName?, linkedSupplierId?, linkedSupplierName?, tags[]?, timeline [{action, by, byName, at, changes?}], createdBy, createdByName, createdAt, isDeleted, month (`YYYY-MM`), year

### `loans/{id}`
**Base:** id, date, amount, type (`given|received`), personName, purpose, segment, segmentName, repaymentStatus (`pending|partial|completed`), totalRepaid, balanceRemaining, recordedBy, recordedByName, createdAt, isDeleted, timeline[], month, year
**Formal (optional):** loanCategory (`simple|formal`), loanSource (`bank|finance_company|individual|gold_loan`), loanSourceName, accountNumber, sanctionedAmount, netDisbursedAmount, totalDeductions, deductions [{id, type, customLabel?, amount, paidTo, date, paymentReference?, isFinanced, note?}], disbursementDate
**Repayment:** repaymentType (`emi|interest_only`), interestType (`fixed|floating`), interestFrequency (`annual|monthly|weekly`), interestRateInput, interestRate (annual%)
**EMI:** tenure, emiAmount, totalEMIs, emisPaid, moratoriumMonths, emiStartDate
**Interest-only:** interestPaymentFrequency, interestAmountPerPeriod, totalInterestPaymentsMade
**Tracking:** totalInterestPaid, totalPrincipalPaid, outstandingBalance, rateChanges [{id, date, oldRate, newRate, newEMI?, note?, recordedBy, recordedByName}], totalPartPayments, totalPenaltyPaid, nextPaymentDueDate, nextPaymentNumber
**Collateral:** collaterals [{id, type (`gold|property|vehicle|fixed_deposit|other`), description, estimatedValue, weight?, purity?, documentReference?, isReleased?, releasedDate?, itemName?, quantity?, grossWeight?, netWeight?, goldRatePerGram?, goldValue?, note?}], totalCollateralValue
**Gold:** pledgeReceiptNumber, ltvRatio, totalGoldWeight, totalGoldValue, eligibleLoanAmount
**Linking:** renewedFromLoanId, renewedByLoanId, isRenewal, replacedByLoanId, replacesLoanId, isBalanceTransfer, parentFormalLoanId
**Documents:** documents [{id, type (`sanction_letter|agreement|insurance_policy|noc|other`), customLabel?, referenceNumber?, date?, note?}]
**Other:** isSubsidized, subsidyDetails, effectiveRate, preClosureCharges, loanClosureDate, closureReason (`fully_paid|pre_closed|balance_transfer|renewed`), utilizationTotal, utilizationRemaining, heldByUid, heldByName, segments[], segmentNames[], personUid

### `loans/{id}/repayments/{id}`
id, date, amount (+repay/-disburse), note, paidBy?, paidByName?, recordedBy, recordedByName, createdAt, scheduledDueDate?, isEMIPayment?, emiNumber?, principalPortion?, interestPortion?, paymentReference?, transactionId?, isPreClosure?, preClosureCharges?, isPartPayment?, penaltyAmount?

### `animals/{id}`
id, segment, segmentName, trackingMode (`individual|batch`), tag?, name?, breed?, gender? (`male|female|unknown`), batchLabel?, batchSize, currentCount, origin (`birth|purchase`), originDate, originInventoryEventId?, purchasePrice?, purchasePricePerHead?, status (`active|sold|dead`), exitDate?, exitType? (`sale|death`), saleTransactionId?, saleInventoryEventId?, salePrice?, salePricePerHead?, buyerId?, buyerName?, totalCosts, costEntries [{transactionId, date, category, categoryName, amount, description?}], totalInvested, profit?, profitMargin?, vaccinationHistory? [{id, date, vaccineName, dosage?, administeredBy?, nextDueDate?, batchNumber?, cost?, linkedTransactionId?, note?}], medicalHistory? [{id, date, type (`treatment|checkup|surgery|emergency`), disease?, symptoms?, medicine?, dosage?, doctor?, temperature?, weight?, cost?, linkedTransactionId?, note?}], weightLogs? [{id, date, weight, remarks?}], deathCause?, deathNote?, ageAtDeathDays?, createdBy, createdByName, createdAt, isDeleted, month, year, note?

### `buyers/{id}`
id, name, phone?, location?, note?, totalPurchases, totalAmountPaid, averageRate?, lastPurchaseDate?, purchasesBySegment? {segmentId: count}, amountBySegment? {segmentId: amount}, createdBy, createdByName, createdAt, isDeleted

### `suppliers/{id}`
id, name, phone?, location?, gstNumber?, itemCategories?[], totalOrders, totalAmountPaid, pendingAmount, averageRate?, lastOrderDate?, ordersBySegment? {segmentId: count}, amountBySegment? {segmentId: amount}, note?, createdBy, createdByName, createdAt, isDeleted

### `inventoryEvents/{id}`
id, segment, segmentName, eventType (`birth|death|purchase|sale|adjustment`), count (+add/-remove), breed?, note, date, createdBy, createdByName, createdAt, month, year, isDeleted?, linkedAnimalIds[]?, estimatedValue?

### `inventoryItems/{id}`
id, name, category (`feed|medicine|fertilizer|seeds|fuel|diesel|packaging|tools|other`), unit, currentStock, minimumStock?, segments[], segmentNames[], movements [{id, date, type (`opening|purchase|used|adjustment|wastage`), quantity (+/-), unitCost?, totalCost?, linkedTransactionId?, supplierId?, supplierName?, note?, recordedBy, recordedByName}], totalPurchased, totalUsed, totalWastage, totalSpent, lastPurchaseRate?, averagePurchaseRate?, note?, createdBy, createdByName, createdAt, isDeleted

### `schedules/{id}`
id, type (`recurring_transaction|reminder`), title, description, frequency (`daily|weekly|biweekly|monthly|quarterly|yearly`), startDate, endDate?, nextDueDate, lastProcessedDate?, transactionTemplate? {type, amount, category, categoryName, segment, segmentName, description, paymentMethod, paidBy?, paidByName?, tags?[]}, reminderConfig? {reminderType (`vaccination|deworming|spraying|fertilizer|insurance|loan_emi|breeding_checkup|harvest|custom`), linkedAnimalIds?[], linkedAnimalNames?[], linkedSegment?, linkedSegmentName?, autoCreateTask, taskPriority?, notifyDaysBefore}, isActive, isDeleted, processedCount, createdBy, createdByName, createdAt

### `breedingRecords/{id}`
id, segment, segmentName, sireId?, sireName?, damId, damName, matingDate, matingMethod? (`natural|artificial`), status (`mated|confirmed_pregnant|delivered|failed`), expectedDeliveryDate?, gestationDays?, actualDeliveryDate?, offspringCount?, offspringMale?, offspringFemale?, offspringAnimalIds?[], complications?, veterinaryCost?, linkedTransactionId?, note?, createdBy, createdByName, createdAt, isDeleted, month, year

### `cropActivities/{id}`
id, segment, segmentName, activityType (`irrigation|fertilizer|pruning|spraying|weeding|flowering|harvest|planting|mulching|soil_testing|other`), date, description, productUsed?, quantity?, unit?, area?, duration?, laborCount?, cost?, linkedTransactionId?, weather?, temperature?, note?, createdBy, createdByName, createdAt, isDeleted, month, year

### `harvests/{id}`
id, segment, segmentName, status (`harvested|in_storage|partially_sold|fully_sold`), harvestDate, cropName, variety?, totalQuantity, unit, grade?, storageLocation?, storageDate?, sales [{id, date, quantity, unit, ratePerUnit, totalAmount, buyerId?, buyerName?, linkedTransactionId?, note?}], totalSold, totalRevenue, wastageQuantity, wastageReason?, wastageDate?, remainingQuantity, averageRate?, harvestCost?, linkedCropActivityId?, note?, createdBy, createdByName, createdAt, isDeleted, month, year

### `tasks/{id}`
id, title, description, priority (`low|medium|high|urgent`), status (`backlog|todo|in_progress|done`), visibility (`shared|personal`), assignee (uid|null), assigneeName, dueDate (Timestamp|null), subtasks [{id, title, done, dueDate (YYYY-MM-DD|null)}], tags[], kanbanOrder, createdBy, createdByName, createdAt, updatedAt, completedAt, isDeleted?

### `monthlySummaries/{YYYY-MM-segmentId}`
month, year, segment, totalExpense, totalIncome, netProfit, expenseByCategory {name: amt}, incomeBySource {name: amt}, expenseByCategoryId? {id: amt}, incomeBySourceId? {id: amt}, expenseByPerson? {uid: amt}, incomeByPerson? {uid: amt}, pendingIncome?, pendingExpense?, totalDistributed?, distributionByPerson? {uid: amt}, updatedAt

### `yearlySummaries/{year-segmentId}`
Same fields as monthlySummaries, aggregated annually.

## Key Relationships

- Transaction → Category, Segment, Loan?, Animal[]?, Buyer?, Supplier?, User (distributions)
- Animal → Segment, Transaction (costEntries + sale), Buyer?, InventoryEvent (origin + sale)
- Animal.vaccinationHistory/medicalHistory/weightLogs → embedded health records
- Loan → Segment, Repayment[] (subcollection), Loan (renewal/transfer/parent)
- InventoryEvent → Segment, Animal[]?
- Buyer ← Animal (sale), Transaction (sale), Harvest (sale)
- Supplier ← InventoryItem (purchase movements), Transaction (expense linkage)
- InventoryItem.movements → StockMovement[] (embedded), Supplier?
- Harvest → Segment, CropActivity?, Transaction (auto-created on sale), Buyer (sale linkage)
- Harvest.sales → HarvestSaleEntry[] (embedded), Transaction (per-sale)
- CropActivity → Segment, Transaction? (cost linkage)
- BreedingRecord → Segment, Animal (sire + dam), Animal[] (offspring)
- Schedule → Transaction (recurring template), Task (auto-created reminder), Animal[]? (reminder linkage)
- User → Segment[] (assigned), Task (assignee)
- Transaction writes auto-update → MonthlySummary + YearlySummary (via atomic increment())

## Design Patterns

- **Soft deletes** (`isDeleted`) on most collections
- **Denormalized names** (segmentName, categoryName, buyerName, supplierName, etc.) to avoid joins
- **Month/year indexing** (`month: "YYYY-MM"`, `year`) for period queries
- **Embedded arrays** (costEntries, timeline, distributions, deductions, collaterals, vaccinationHistory, medicalHistory, weightLogs, movements, sales)
- **Precomputed summaries** (monthlySummaries/yearlySummaries updated atomically via `increment()`)
- **In-memory caching** for reference data (segments, categories, users)
- **Client-side aggregation** (no Cloud Functions — Spark plan constraint)
- **Client-side scheduling** (processOverdueSchedules on app startup — no Cloud Functions)
- **Atomic batch writes** for all mutations (transaction + summary + related updates)
- **Standalone components** throughout (no NgModules)
- **Signal-based state** with Angular computed signals for derived state (isAdmin, isManager, etc.)
- **Backward-compatible extensions** — all new fields on existing models are optional, no migration needed

## Routes

| Path | Access |
|------|--------|
| `/dashboard` | All authenticated |
| `/transactions`, `/loans`, `/stock`, `/buyers` | Admin, Manager |
| `/stock/new`, `/stock/analytics`, `/stock/mortality`, `/stock/:id` | Admin, Manager |
| `/schedules` | Admin, Manager |
| `/breeding` | Admin, Manager |
| `/crops` | Admin, Manager |
| `/harvests`, `/harvests/:id` | Admin, Manager |
| `/consumables` | Admin, Manager |
| `/suppliers` | Admin, Manager |
| `/tasks` | All authenticated |
| `/admin`, `/admin/register`, `/admin/data-setup` | Admin only |
| `/auth/login`, `/auth/forgot-password` | Public |
| `/animals`, `/inventory`, `/analytics` | Redirect to `/stock` or `/dashboard` |

Guards: `authGuard` (login + active check), `roleGuard(roles)`, `unsavedChangesGuard` (form dirty check).

## Services

**AuthService** — Firebase Auth. Login, logout, password reset. User profile from Firestore. Computed signals: isAdmin, isManager, isViewer, isLoggedIn, assignedSegments.

**TransactionService** — CRUD with atomic batch writes. Auto-updates monthly/yearly summaries. Distribution, tag, animal linkage, supplier linkage support. Person name normalization. Pagination with cursor. Soft delete with summary rollback.

**LoanService** — Simple + formal loan management. EMI schedule generation (reducing-balance). Repayment tracking with principal/interest split. Gold loan calculations (purity, LTV, RBI rates). Rate change history. Balance transfer/renewal linking. Closure/pre-closure handling. All payment methods accept optional segment override for correct multi-segment expense attribution.

**AnimalService** — Individual + batch animal CRUD. Cost attribution from transactions. Profit calculation. Status transitions with inventory events. Batch count management. Vaccination/medical record CRUD (addVaccination, addMedicalRecord, removeVaccination, removeMedicalRecord). Weight log CRUD (addWeightLog, removeWeightLog). Death recording with cause and age-at-death computation.

**BuyerService** — CRUD with auto-updated denormalized stats on sales. Per-segment purchase tracking. Average rate calculation.

**SupplierService** — CRUD mirroring BuyerService. Denormalized stats (totalOrders, totalAmountPaid, pendingAmount). Per-segment tracking. Pending amount management.

**ScheduleService** — CRUD for recurring transactions and reminders. `processOverdueSchedules()` runs on app startup: creates transactions from templates, creates tasks from reminders. Date advancement (calculateNextDueDate). Safety limit: max 12 missed occurrences per schedule. Queries: getActive, getUpcomingReminders(daysAhead), getPendingRecurring.

**BreedingService** — CRUD for breeding records. Queries: getByAnimal, getUpcomingDeliveries. Segment-filtered.

**CropActivityService** — CRUD for crop activities. Queries: getAll with segment/activityType filters.

**HarvestService** — CRUD for harvests. `recordSale()` creates income transaction + updates buyer + updates harvest sales/totals/status. `recordWastage()` updates wastage and remainingQuantity. Status auto-transitions.

**InventoryItemService** — CRUD for consumable items. `recordPurchase(qty, unitCost, supplier?)`, `recordUsage(qty)`, `recordWastage(qty, reason)`. Low stock detection via `getLowStockItems()`. Average purchase rate calculation.

**MortalityService** — Pure computation service (no new collection). Queries dead animals and computes: mortality rate %, cause breakdown, estimated financial loss, average age at death, monthly trend, per-segment statistics.

**CategoryService** — Cached getAll/getByType. Seed defaults. Type filtering (expense/income).

**SegmentService** — Cached segment list. Budget update. Seed defaults. Migration support.

**TaskService** — Kanban operations. Visibility filter (personal/shared). Status grouping. Subtask management. Drag-drop reorder.

**InventoryService** — Record events. Atomic segment stock updates. Breed tracking.

**NotificationService** — In-memory alerts. Loan overdue/due-soon, task overdue, budget warning/exceeded, recurring due, reminder due/upcoming, low stock, delivery expected. localStorage dismissals.

**SummaryService** — Query monthly/yearly summaries. Aggregation helpers. Batched multi-month queries.

**ExportService** — PDF (transactions report, loan summary, loan detail). CSV (transactions, loans). Excel (multi-sheet backup, loan detail with 9 sheets). WhatsApp formatting. All INR.

**UserService** — User CRUD. Role/segment assignment. Active toggle.

## Shared Components

**UI Components:** LoadingSpinnerComponent, LoadingSkeletonComponent, ConfirmDialogComponent (with optional text/number input), EmptyStateComponent, DateRangeFilterComponent, NotificationBellComponent.

**Dialogs:** SaleDialogComponent (animal sale with buyer/price), CostAttributionDialogComponent (split costs across animals), DistributionDialogComponent (split income among partners), BuyerFormDialogComponent (inline buyer creation), InventoryEventDialogComponent (stock movement), WhatsappShareDialogComponent (formatted sharing), VaccinationDialogComponent (animal vaccination record), MedicalDialogComponent (animal medical record), WeightLogDialogComponent (animal weight log), RecurringSetupDialogComponent (recurring transaction schedule), ReminderFormDialogComponent (scheduled reminder), BreedingFormDialogComponent (breeding record), CropActivityFormDialogComponent (crop activity), HarvestFormDialogComponent (harvest record), HarvestSaleDialogComponent (harvest sale), SupplierFormDialogComponent (supplier CRUD), ConsumableFormDialogComponent (consumable item), StockMovementDialogComponent (consumable purchase/use/wastage).

**Chart Components:** WeightChartComponent (line chart for animal weight history).

**Pipes:** CurrencyInrPipe (₹X,XXX.XX), RelativeTimePipe ("2 days ago").

**Directives:** HasRoleDirective (*hasRole="admin") — conditional UI rendering by role using Angular effect.

## Utilities

**date.utils.ts** — getMonthString, getYear, getMonthName, getMonthRange, getDateRange, getLast6MonthsFrom, formatDateForFirestore, parseFirestoreDate.

**name.utils.ts** — normalizeName (trim, title-case), nameKey (safe object keys from names).

**firestore.utils.ts** — formatCurrency (INR), FirestoreDateAdapter (Material DatePicker).

**table.utils.ts** — sortData (generic), toggleSortState, paginate (client-side), totalPages, pageStart, pageEnd.

**route-animations.ts** — Reusable animation triggers for route transitions.

## PWA & Hosting

**Service Worker** (ngsw-config.json): Register on stable (30s). Asset groups: app (prefetch HTML/CSS/JS), images+fonts (lazy). Data groups: Google Fonts CSS (30d cache), Google Fonts files (1y cache).

**Firebase Hosting** (firebase.json): SPA rewrite (all routes → index.html). No-cache headers on `ngsw.json`, `ngsw-worker.js`, `index.html`. Security headers: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy deny geo/mic/camera.

## Scripts

**`scripts/setup-collections.js`** — Initialize Firestore with default segments + categories. Idempotent, safe to re-run.

**`scripts/clean-db.js`** — Database cleanup/reset. Commands: `all` (full reset), `transactions`, `loans`, `audit`, `summaries`, `seed`. Includes confirmation prompts.

**`scripts/import-backup.js`** — Restore from Excel exports. Auto-detects transaction backup vs loan detail. `--dry-run` flag supported.

## Testing

184 tests across 14 spec files using Vitest. Covers services, utilities, and component logic.

## Build Config

Angular builder: `@angular/build:application`. Inline styles: SCSS. Service worker enabled. Production budgets: initial bundle 2MB warn / 3MB error, component styles 4kB warn / 8kB error. Output hashing on all assets. Package manager: npm.
