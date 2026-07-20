---
name: schema
description: Load the farm-tracker project purpose, zero-cost (Spark plan) constraints, full data schema, entity links, write-path flow, and change-ripple checklist BEFORE adding or modifying any feature, field, collection, or link.
---

# Farm-tracker data schema & flow

Read this before implementing any "add X" / "change X" request. Deep per-field schema lives in `DOCUMENTATION.md` ("Firestore Schema" section) — read the relevant collection's section there; this skill covers what that doc doesn't: linking, write sequencing, and the ripple a schema change causes.

## What this project is & why
Personal multi-user farm financial management PWA for the family farm. It tracks **money** (transactions, loans, dues, distributions), **livestock & crops** (animals, breeding, harvests, crop activities), **people** (buyers, suppliers, users with admin/manager/viewer roles), and **operations** (tasks, schedules/reminders, consumable inventory) across three segments: Goats 🐐, Chickens 🐔, Dragon Fruit 🌵. All money is INR. The goal is a single trustworthy ledger the family can use from phones (768px bottom-nav layout) with per-animal/per-person/per-segment profit visibility.

## Zero-cost constraint (everything runs on free tiers)
- Firebase **Spark plan**: no Cloud Functions, no scheduled functions, no extensions → ALL aggregation, counter maintenance, and scheduling are client-side. "Client-side cron" = `ScheduleService.processOverdueSchedules()` on app startup.
- Hosting = Firebase Hosting free tier. Daily Drive backup = free **Google Apps Script** (`backup-script/Code.gs`), not a paid service.
- No local emulator possible (machine is stuck on Java 8) — testing is Vitest + headless verification against built dist (see the `verify` skill).
- Rule for new features: never propose anything that needs the Blaze plan, a paid API, or any server component.

## Sources of truth (read first)
- `DOCUMENTATION.md` — authoritative per-collection field lists, features, routes, services.
- `firestore.rules` — validation + access. Role comes from the Auth **custom claim** `request.auth.token.role` (NOT the `users` doc; the doc only supplies `isActive` + `assignedSegments`). Managers need segment access; pseudo-segment `'personal'` exists. Rules enforce: txn `amount > 0`, `createdBy == uid`, summary doc-ID format, `timeline` ≤ 100 entries.
- `firestore.indexes.json` — composite indexes. Nearly every list query leads with `isDeleted` + a date field DESC, so any new queryable/filterable field needs a new composite index (+ `firebase deploy` pushes rules & indexes).
- Spark-plan consequence (see "Zero-cost constraint" above): every write path below is client-side — there is no server to fix drift or run triggers.

## Collections → model → owning service
All models in `src/app/core/models/`, services in `src/app/core/services/`.

| Collection | Model | Service |
|---|---|---|
| `transactions` | transaction.model.ts | transaction.service.ts |
| `loans` + subcoll. `loans/{id}/repayments` | loan.model.ts | loan.service.ts, loan-payments.service.ts |
| `animals` | animal.model.ts | animal.service.ts |
| `buyers` / `suppliers` | buyer/supplier.model.ts | buyer/supplier.service.ts |
| `harvests` | harvest.model.ts | harvest.service.ts |
| `breedingRecords` | breeding.model.ts | breeding.service.ts |
| `cropActivities` | crop-activity.model.ts | crop-activity.service.ts |
| `inventoryEvents` | inventory.model.ts | inventory.service.ts (also writes `segments.currentStock`) |
| `inventoryItems` (consumables) | inventory-item.model.ts | inventory-item.service.ts |
| `schedules` | schedule.model.ts | schedule.service.ts |
| `tasks` | task.model.ts | task.service.ts |
| `categories` / `segments` / `users` | category/segment/user.model.ts | category/segment/user.service.ts |
| `monthlySummaries` / `yearlySummaries` | monthly-summary.model.ts | summary.service.ts (read), written by txn/loan services |
| `meta/tags` (single doc `{all: string[]}`) | — | tag.service.ts |

NOT persisted (computed live, keep it that way): **notifications** (notification.service.ts, in-memory, dismissals in localStorage) and **dues** (dues.service.ts — receivables/payables computed from pending transactions via `pendingRemaining()` in transaction.model.ts; deliberately no dues collection/counters to avoid drift).

## Entity link graph
Convention: every ID link stores a denormalized `*Name` display copy. Every doc carries `segment`+`segmentName`, `month` (`YYYY-MM`) + `year` query keys, audit fields (`createdBy`/`createdByName`/`createdAt`), and `isDeleted` soft-delete (queries filter on it; hard delete is admin-only for most collections).

- **Transaction →** `linkedLoanId` · `linkedAnimalIds[]` + `linkedAnimalNames[]` + `animalCostSplit{animalId: amt}` · `linkedBuyerId` · `linkedSupplierId` · `linkedHarvestId` · `linkedSaleTransactionId` (selling-cost expense → its sale income txn) · `tags[]` · `distributions[{uid,name,amount}]` (uid may be `'reinvestment'`)
- **Animal →** `buyerId`, `saleTransactionId`, `saleInventoryEventId`, `originInventoryEventId`; embedded `costEntries[].transactionId`, `vaccinationHistory[]`/`medicalHistory[]` `.linkedTransactionId`
- **Loan →** loan-to-loan: `renewedFromLoanId`/`renewedByLoanId`, `replacesLoanId`/`replacedByLoanId`, `parentFormalLoanId`; users: `heldByUid`, `personUid`. **Repayment →** `transactionId`
- **Harvest →** `linkedCropActivityId`; embedded `sales[].buyerId` + `.linkedTransactionId`
- **CropActivity / BreedingRecord →** `linkedTransactionId`; Breeding also `sireId`/`damId`/`offspringAnimalIds[]`
- **InventoryEvent →** `linkedAnimalIds[]`; **StockMovement** (embedded in inventoryItems) → `linkedTransactionId`, `supplierId`
- **Schedule.reminderConfig →** `linkedAnimalIds[]`, `linkedSegment`
- Embedded arrays instead of subcollections everywhere except `loans/{id}/repayments`. `timeline[]` on txns/loans replaced an old `auditLogs` collection.

## Write-path rules (the flow)
- **`writeBatch` for creates** (no reads needed); **`runTransaction` whenever the old doc must be read** (update / softDelete / restore / status changes — needed to compute reversal deltas).
- Every money mutation atomically bumps BOTH `monthlySummaries/{YYYY-MM-segment}` and `yearlySummaries/{year-segment}` in the same batch/transaction via `set(..., {merge:true})` + `increment()` deltas. Doc-ID format is rules-enforced. Updates write ONE combined delta (`new − old`); segment/period moves decrement the old summary ref and increment the new one.
- Summary fields: `totalExpense`/`totalIncome`/`netProfit`, `expenseByCategory` (name-keyed, legacy) AND `expenseByCategoryId` (id-keyed, preferred — keep writing both), `*ByPerson`, `pendingIncome`/`pendingExpense`, `totalDistributed`/`distributionByPerson`. After any summary write: `summaryService.clearCache()`.
- **Buyer stats sync is post-commit best-effort**: after the main batch commits, `BuyerService.updateStats()` runs its own `runTransaction` with `increment()` (deltas can be negative for edits/deletes), wrapped in try/catch that only logs. Never put it inside the main batch.
- **Supplier stats** are updated ONLY by inventory/consumable purchase paths — TransactionService stores `linkedSupplierId` but never touches supplier docs.
- Loan-linked transactions (`linkedLoanId`) are blocked from direct edit — loan services own them.
- Cross-service flows: `HarvestService.recordSale()` → creates income txn via TransactionService + buyer stats + embedded `sales[]`. Animal sale dialog → txn + inventoryEvent + buyer stats. `ScheduleService.processOverdueSchedules()` runs on app startup (client-side cron; max 12 missed occurrences).
- Drift repair: `summary-reconciliation.service.ts` (`reconcileAll()`, `reconcileCounterparties()`) + `scripts/reconcile-summaries.js` rebuild summaries and buyer/supplier counters from raw transactions. **If a new field feeds summary math, reconciliation must learn it too or it will "heal" it away.**

## Ripple checklist — every place an "add X" touches
1. Model interface + `*FormData` DTO in `src/app/core/models/` (new fields OPTIONAL — no migration framework; compat is inline).
2. Owning service (+ summary deltas in apply/reversal builders if money-related — `buildApplyFields`/`buildReversalFields` in transaction.service.ts).
3. `firestore.rules` — validation + role/segment access for any new collection/field constraint.
4. `firestore.indexes.json` — if the field is queried/filtered.
5. `backup.service.ts` `collectFullBackup()` — add to the v2 Excel backup (28 sheets + `Meta` counts).
6. `scripts/import-backup.js` + `scripts/verify-backup.js` — round-trip the new field/sheet (import auto-detects v1/v2 via Meta `Format Version`).
7. `export.service.ts` — PDF/CSV/Excel/WhatsApp outputs if user-visible (all INR).
8. `summary-reconciliation.service.ts` (+ `scripts/reconcile-summaries.js`) if it affects summary math.
9. `backup-script/Code.gs` (Drive JSON backup) is schema-agnostic — no change needed.
10. `DOCUMENTATION.md` — update the schema/feature/service sections.
11. UI: feature component under `src/app/features/`, route + guard in routes table, notification type if it alerts.

## Gotchas
- Soft-deleted docs: excluded from Excel backup/export, INCLUDED in the nightly Drive JSON backup.
- `timeline[]` capped at 100 by rules — append, don't grow unbounded; not backed up.
- Changing a user's role = re-set the custom claim (`node firebase/set-custom-claims.js <uid> <role>`) + user re-login.
- Reference-data services (segments, categories, buyers, suppliers, summaries) have 5-min in-memory caches — clear them after writes.
- Only admin can delete summary docs (reconciliation tool path).
