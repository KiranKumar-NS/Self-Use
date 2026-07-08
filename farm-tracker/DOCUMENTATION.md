# Farm Tracker

Angular 21 + Firebase (Firestore + Auth) + Angular Material + Chart.js PWA for multi-user farm financial management. Tracks animals, transactions, loans, buyers, tasks. Firebase Spark (free) plan.

## Segments & Roles

Segments: Goats (🐐), Chickens (🐔), Dragon Fruit (🌵). Users assigned to specific segments.

| Role | Transactions/Loans/Stock/Buyers | Tasks | Admin |
|------|---------------------------------|-------|-------|
| Admin | Full | Full | Full |
| Manager | Full (assigned segments) | Full | No |
| Viewer | No | Full | Dashboard read-only |

## Features

**Dashboard** `/dashboard` — Summary cards (income/expense/profit), stock widget, budget vs actual, loan summary with EMIs, segment breakdown chart, monthly trend chart, person investment cards (expenses paid, income received, holdings, loan hold/owed), filter chips (person + segment + tag), tag productivity cards (income/expense/net per tag for crop tracking), export (Excel/PDF/WhatsApp).

**Transactions** `/transactions` — Expense & income CRUD. Fields: amount, category, segment, paymentMethod (cash/upi), paidBy, quantity/unit/rate (for sales). Payment status tracking (received/pending, paid/credit). Cost attribution to animals. Buyer linkage. Income distribution among partners. Tags for ad-hoc grouping (e.g., harvest cycles, plot blocks) with autocomplete and crop-specific suggestions. Tag filter in list view. Tag-based search. Timeline audit trail.

**Loans** `/loans` — Simple (owe/lent between people) and Formal (bank/finance/gold loan). Formal: sanctioned amount, disbursement, deductions, EMI/interest-only repayment, fixed/floating interest, collateral (gold/property/vehicle/FD), documents, pre-closure, renewal, balance transfer, government subsidy, utilization tracking, loan holder. Repayment subcollection with principal/interest split.

**Stock** `/stock` — Animal tracking (individual with tag/name/breed/gender OR batch with label/size). Origin: birth/purchase. Status: active→sold/dead. Per-animal cost tracking via costEntries linked to transactions. Profit = salePrice - totalInvested. Sale dialog creates transaction + inventory event + updates buyer. Animal analytics.

**Inventory Events** — Birth/death/purchase/sale/adjustment events that update segment.currentStock atomically.

**Buyers** `/buyers` — Name, phone, location. Denormalized stats: totalPurchases, totalAmountPaid, averageRate, lastPurchaseDate, purchasesBySegment.

**Tasks** `/tasks` — Kanban (backlog/todo/in_progress/done). Priority, assignee, subtasks, due dates, shared/personal visibility, drag-drop.

**Admin** `/admin` — User CRUD, role/segment assignment, data setup (seed categories/segments/budgets).

**Notifications** — In-memory (not Firestore). Loan overdue (>30d), task overdue, budget warning (≥80%), budget exceeded (≥100%). Dismissals in localStorage.

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
id, type (`expense|income`), date, amount, quantity?, unit? (`kg|head|dozen|litre|pieces|bag|bundle`), ratePerUnit?, category (ID), categoryName, segment (ID), segmentName, description, paymentMethod (`cash|upi`), paidBy (uid|"other"|null), paidByName, paymentStatus? (`received|pending`), expensePaymentStatus? (`paid|pending`), distributions? [{uid, name, amount}], linkedLoanId?, linkedAnimalIds[]?, linkedAnimalNames[]?, animalCostSplit? {animalId: amount}, linkedBuyerId?, linkedBuyerName?, tags[]?, timeline [{action, by, byName, at, changes?}], createdBy, createdByName, createdAt, isDeleted, month (`YYYY-MM`), year

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
id, segment, segmentName, trackingMode (`individual|batch`), tag?, name?, breed?, gender? (`male|female|unknown`), batchLabel?, batchSize, currentCount, origin (`birth|purchase`), originDate, originInventoryEventId?, purchasePrice?, purchasePricePerHead?, status (`active|sold|dead`), exitDate?, exitType? (`sale|death`), saleTransactionId?, saleInventoryEventId?, salePrice?, salePricePerHead?, buyerId?, buyerName?, totalCosts, costEntries [{transactionId, date, category, categoryName, amount, description?}], totalInvested, profit?, profitMargin?, createdBy, createdByName, createdAt, isDeleted, month, year, note?

### `buyers/{id}`
id, name, phone?, location?, note?, totalPurchases, totalAmountPaid, averageRate?, lastPurchaseDate?, purchasesBySegment? {segmentId: count}, amountBySegment? {segmentId: amount}, createdBy, createdByName, createdAt, isDeleted

### `inventoryEvents/{id}`
id, segment, segmentName, eventType (`birth|death|purchase|sale|adjustment`), count (+add/-remove), breed?, note, date, createdBy, createdByName, createdAt, month, year, isDeleted?, linkedAnimalIds[]?, estimatedValue?

### `tasks/{id}`
id, title, description, priority (`low|medium|high|urgent`), status (`backlog|todo|in_progress|done`), visibility (`shared|personal`), assignee (uid|null), assigneeName, dueDate (Timestamp|null), subtasks [{id, title, done, dueDate (YYYY-MM-DD|null)}], tags[], kanbanOrder, createdBy, createdByName, createdAt, updatedAt, completedAt, isDeleted?

### `monthlySummaries/{YYYY-MM-segmentId}`
month, year, segment, totalExpense, totalIncome, netProfit, expenseByCategory {name: amt}, incomeBySource {name: amt}, expenseByCategoryId? {id: amt}, incomeBySourceId? {id: amt}, expenseByPerson? {uid: amt}, incomeByPerson? {uid: amt}, pendingIncome?, pendingExpense?, totalDistributed?, distributionByPerson? {uid: amt}, updatedAt

### `yearlySummaries/{year-segmentId}`
Same fields as monthlySummaries, aggregated annually.

## Key Relationships

- Transaction → Category, Segment, Loan?, Animal[]?, Buyer?, User (distributions)
- Animal → Segment, Transaction (costEntries + sale), Buyer?, InventoryEvent (origin + sale)
- Loan → Segment, Repayment[] (subcollection), Loan (renewal/transfer/parent)
- InventoryEvent → Segment, Animal[]?
- Buyer ← Animal (sale), Transaction (sale)
- User → Segment[] (assigned), Task (assignee)
- Transaction writes auto-update → MonthlySummary + YearlySummary

## Design Patterns

- **Soft deletes** (`isDeleted`) on most collections
- **Denormalized names** (segmentName, categoryName, buyerName, etc.) to avoid joins
- **Month/year indexing** (`month: "YYYY-MM"`, `year`) for period queries
- **Embedded arrays** (costEntries, timeline, distributions, deductions, collaterals)
- **Precomputed summaries** (monthlySummaries updated atomically via `increment()`)
- **In-memory caching** for reference data (segments, categories, users)
- **Client-side aggregation** (no Cloud Functions — Spark plan constraint)
- **Atomic batch writes** for all mutations

## Routes

| Path | Access |
|------|--------|
| `/dashboard` | All authenticated |
| `/transactions`, `/loans`, `/stock`, `/buyers` | Admin, Manager |
| `/stock/new`, `/stock/analytics`, `/stock/:id` | Admin, Manager |
| `/tasks` | All authenticated |
| `/admin`, `/admin/register`, `/admin/data-setup` | Admin only |
| `/auth/login`, `/auth/forgot-password` | Public |
| `/animals`, `/inventory`, `/analytics` | Redirect to `/stock` or `/dashboard` |

Guards: `authGuard` (login + active check), `roleGuard(roles)`, `unsavedChangesGuard`
