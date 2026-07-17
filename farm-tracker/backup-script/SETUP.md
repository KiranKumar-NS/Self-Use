# Automatic Daily Backup to Google Drive — Setup Guide

Every evening between **6 and 7 PM IST**, a Google Apps Script running in your own
Google account reads the entire Firestore database and saves two files into a
**"FarmTracker Backups"** folder in your Google Drive:

| File | Purpose |
|---|---|
| `farm-backup-YYYY-MM-DD.json` | Lossless backup — the one used for a real restore |
| `farm-backup-YYYY-MM-DD.xlsx` | Human-readable workbook, one tab per collection |

It runs even when nobody opens the app, keeps the last **30 days** of backups,
and **emails you** if a backup fails, document counts drop suspiciously, or no
backup has run for 48 hours. Total cost: ₹0 (Apps Script free tier; Firestore
reads stay well inside the free quota).

One-time setup takes about 10 minutes.

---

## Step 1 — Create a read-only service account

The script authenticates to Firestore with its own dedicated identity that can
**only read** data.

> Do **not** reuse `scripts/service-account-key.json` — that key belongs to the
> Firebase admin SDK account, which can write and delete everything.

1. Open the [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=farm-tracker-tn70)
   (project **farm-tracker-tn70**, sign in with the Google account that owns the Firebase project).
2. **IAM & Admin → Service Accounts → + Create Service Account**
   - Name: `backup-reader`
   - Role: **Cloud Datastore Viewer** (this is the Firestore read-only role) — nothing else.
   - Finish.
3. Open the new service account → **Keys** tab → **Add Key → Create new key → JSON** → download.
   You'll paste this file's contents in Step 3, then delete it.

## Step 2 — Create the Apps Script project

Use the **personal Google account whose Drive should hold the backups**
(it does not have to be the Firebase owner account).

1. Go to [script.google.com](https://script.google.com) → **+ New project**.
2. Name it `FarmTracker Backup`.
3. Replace the default `Code.gs` contents with this folder's **`Code.gs`**.
4. **Project Settings** (⚙️ icon) → tick **"Show `appsscript.json` manifest file in editor"**
   → back in the editor, replace `appsscript.json` with this folder's **`appsscript.json`**.
   (This sets the timezone to Asia/Kolkata and declares the needed permissions.)

## Step 3 — Store the service account key

1. **Project Settings → Script Properties → Add script property**
   - Property: `SERVICE_ACCOUNT_KEY`
   - Value: the **entire contents** of the JSON key file downloaded in Step 1
     (open it in Notepad, select all, copy, paste).
2. Optional second property: `NOTIFY_EMAIL` = the address that should receive
   alert emails (defaults to the Google account running the script).
3. **Delete the downloaded key file from your computer** — it is no longer needed.

## Step 4 — Test run

1. In the editor, select the function **`testBackup`** in the toolbar dropdown → **Run**.
2. Google will ask for authorization the first time — review and **Allow**
   (external requests to Firestore, Drive files, Sheets, sending mail as you).
3. When it finishes, open Google Drive → **FarmTracker Backups** — today's
   `.json` and `.xlsx` should be there. Open the xlsx and spot-check a few tabs;
   the **Meta** tab lists a document count per collection.

If the run fails, check **Executions** (left sidebar ▶ icon) for the error —
almost always a malformed `SERVICE_ACCOUNT_KEY` paste or a missing role from Step 1.

## Step 5 — Install the schedule

1. Select the function **`installTrigger`** → **Run** (once).
2. Check the **Triggers** page (alarm-clock icon): you should see
   - `runDailyBackup` — Time-driven, Day timer, 6pm–7pm
   - `checkBackupFreshness` — Time-driven, Week timer, Monday 9am–10am

Done. Backups now run automatically every evening.

---

## How you'll know it's working (or not)

- **Success is silent** — no email spam. Just check the Drive folder occasionally.
- **Failure** → email "FarmTracker backup FAILED".
- **Partial failure** (one collection errored, rest backed up) → email "completed WITH WARNINGS".
- **Suspicious data drop** (any collection shrank >20% and >20 docs since the
  previous run — possible accidental mass deletion) → same warnings email.
- **Silent death** (trigger stopped firing entirely) → the Monday freshness
  check emails "backup is STALE" if the newest file is older than 48 hours.

## Restoring from a backup

The `.json` file preserves document IDs, subcollection paths, and Firestore
types (timestamps as `{"_ts": "ISO"}`, references as `{"_ref": "path"}`), so it
can be written back exactly as it was.

- **A few documents / one collection**: open the JSON, find the docs (each has
  `_id` and `_path`), and re-enter or script them back.
- **Excel-based restore**: `scripts/import-backup.js` restores the app's own
  full-backup xlsx (the dashboard export). The Drive xlsx has a similar layout
  but is a convenience copy — for disaster recovery prefer the JSON.
- **Full disaster recovery**: write the JSON back with a firebase-admin script
  (see `scripts/README.md` for the pattern) — revive `_ts` → `Timestamp`,
  `_ref` → `DocumentReference`, write each doc to its `_path` in batches of ≤500,
  then rebuild summaries (or restore `monthlySummaries`/`yearlySummaries`
  directly — they are included in the backup).
- **Drill**: once in a while, restore a backup into the Firestore emulator and
  spot-check totals. A backup you've never restored is a hope, not a backup.

## Notes & limits

- The backup **includes soft-deleted documents** (`isDeleted: true`) — the raw
  database is backed up, unlike the in-app export which mirrors what the app shows.
- New collections added to the app later are **backed up automatically**
  (collections are auto-discovered on every run). New *subcollections* are not —
  add them to `SUBCOLLECTION_GROUPS` in `Code.gs` (currently only `repayments`).
- Apps Script free-tier quotas (90 min trigger runtime/day, 6 min per execution,
  20MB per URL fetch) are orders of magnitude above this workload. If the
  database ever grows past ~50 MB of JSON, revisit (split the run or lower page size).
- Rerunning `testBackup()` on the same day replaces that day's files (no duplicates).
- The service account key grants **read** access to your farm data — keep the
  Apps Script project unshared, and delete/rotate the key in GCP if you ever
  suspect it leaked (IAM → Service Accounts → backup-reader → Keys).
