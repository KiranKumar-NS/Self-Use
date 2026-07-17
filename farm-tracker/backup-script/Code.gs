/**
 * ============================================================
 * FARM TRACKER — DAILY FIRESTORE BACKUP TO GOOGLE DRIVE
 * ============================================================
 *
 * Runs entirely in Google Apps Script (free tier, no Firebase
 * Blaze plan needed). Every evening it:
 *   1. Reads EVERY root collection from Firestore (auto-discovered)
 *      plus the loans/{id}/repayments subcollection (collection group)
 *   2. Saves two files into the "FarmTracker Backups" Drive folder:
 *        farm-backup-YYYY-MM-DD.json   — lossless restore format
 *        farm-backup-YYYY-MM-DD.xlsx   — human-readable workbook
 *   3. Deletes backups older than RETENTION_DAYS
 *   4. Emails you if anything fails or document counts drop suspiciously
 *
 * Unlike the in-app export, this backup includes soft-deleted docs
 * (isDeleted: true) — it reads raw Firestore. The JSON "_ts"/"_ref"
 * sentinels preserve Firestore types for a lossless restore.
 *
 * SETUP: see SETUP.md in this folder. Quick version:
 *   - Script Property SERVICE_ACCOUNT_KEY = service account JSON key
 *     (role: Cloud Datastore Viewer only)
 *   - Run testBackup() once to authorize + verify
 *   - Run installTrigger() once to schedule daily 6–7 PM IST
 * ============================================================
 */

var PROJECT_ID = 'farm-tracker-tn70';
var FOLDER_NAME = 'FarmTracker Backups';
var BACKUP_EVERY_DAYS = 1; // 1 = daily; e.g. 10 or 15 for less often (re-run installTrigger after changing)
var RETENTION_DAYS = 30;
var PAGE_SIZE = 300;
var TZ = 'Asia/Kolkata';
var SUBCOLLECTION_GROUPS = ['repayments']; // loans/{id}/repayments
var FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents';

// ==================== Entry points ====================

/** Daily trigger target. */
function runDailyBackup() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    Logger.log('Another backup run is in progress — skipping.');
    return;
  }
  try {
    var result = performBackup_();
    Logger.log('Backup OK: ' + JSON.stringify(result.counts));
  } catch (err) {
    notify_(
      'FarmTracker backup FAILED — ' + todayStr_(),
      'The daily Firestore backup failed.\n\nError: ' + err + '\n\nStack:\n' + (err && err.stack ? err.stack : 'n/a')
    );
    throw err; // surface in Apps Script executions log
  } finally {
    lock.releaseLock();
  }
}

/** Run this manually once: authorizes scopes and verifies the whole pipeline. */
function testBackup() {
  runDailyBackup();
}

/** Run this manually once to (re)install the schedule. Idempotent. */
function installTrigger() {
  var handlers = ['runDailyBackup', 'checkBackupFreshness'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  // Fires between 6 and 7 PM IST (script timezone is Asia/Kolkata)
  ScriptApp.newTrigger('runDailyBackup').timeBased().everyDays(BACKUP_EVERY_DAYS).atHour(18).create();
  // Weekly safety net: email if the newest backup is overdue
  ScriptApp.newTrigger('checkBackupFreshness').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  Logger.log('Triggers installed: backup every ' + BACKUP_EVERY_DAYS + ' day(s) at 6 PM IST + Monday 9 AM freshness check.');
}

/** Weekly trigger target: alert if backups silently stopped running. */
function checkBackupFreshness() {
  var folder = getBackupFolder_();
  var newest = null;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var m = files.next().getName().match(/^farm-backup-(\d{4}-\d{2}-\d{2})\./);
    if (m && (!newest || m[1] > newest)) newest = m[1];
  }
  var ageDays = newest
    ? (Date.now() - new Date(newest + 'T00:00:00+05:30').getTime()) / 86400000
    : Infinity;
  if (ageDays > BACKUP_EVERY_DAYS + 2) {
    notify_(
      'FarmTracker backup is STALE',
      'The newest backup in Drive folder "' + FOLDER_NAME + '" is ' +
        (newest ? 'from ' + newest : 'MISSING — no backup files found') +
        '.\n\nThe daily trigger may have stopped. Open the Apps Script project, check the Executions log, and re-run installTrigger() if needed.'
    );
  }
}

// ==================== Main pipeline ====================

function performBackup_() {
  var token = getAccessToken_();
  var errors = [];

  // 1. Auto-discover and fetch every root collection
  var collectionIds = listCollectionIds_(token);
  var collections = {};
  collectionIds.forEach(function (name) {
    try {
      collections[name] = fetchCollection_(name, token);
    } catch (err) {
      errors.push('Collection "' + name + '": ' + err);
      collections[name] = [];
    }
  });

  // 2. Subcollections via collection-group queries
  var subcollections = {};
  SUBCOLLECTION_GROUPS.forEach(function (groupId) {
    try {
      subcollections[groupId] = fetchCollectionGroup_(groupId, token);
    } catch (err) {
      errors.push('Collection group "' + groupId + '": ' + err);
      subcollections[groupId] = [];
    }
  });

  // 3. Build counts + backup object
  var counts = {};
  Object.keys(collections).forEach(function (k) { counts[k] = collections[k].length; });
  Object.keys(subcollections).forEach(function (k) { counts[k + ' (subcollection)'] = subcollections[k].length; });

  var backup = {
    meta: {
      format: 1,
      projectId: PROJECT_ID,
      exportedAt: new Date().toISOString(),
      includesSoftDeleted: true,
      counts: counts,
      errors: errors,
    },
    collections: collections,
    subcollections: subcollections,
  };

  // 4. Write files to Drive (JSON first — it is the one that matters for restore)
  var folder = getBackupFolder_();
  var dateStr = todayStr_();
  trashExisting_(folder, ['farm-backup-' + dateStr + '.json', 'farm-backup-' + dateStr + '.xlsx']);

  folder.createFile('farm-backup-' + dateStr + '.json', JSON.stringify(backup), 'application/json');

  try {
    var xlsxBlob = buildXlsxBlob_(backup, dateStr);
    folder.createFile(xlsxBlob).setName('farm-backup-' + dateStr + '.xlsx');
  } catch (err) {
    errors.push('Excel generation: ' + err + ' (JSON backup was still saved)');
  }

  // 5. Retention + sanity checks + error email
  cleanupOldBackups_(folder);
  var warnings = checkCountsSanity_(counts);

  if (errors.length || warnings.length) {
    notify_(
      'FarmTracker backup completed WITH WARNINGS — ' + dateStr,
      (errors.length ? 'Errors:\n- ' + errors.join('\n- ') + '\n\n' : '') +
        (warnings.length ? 'Count warnings (possible mass deletion or partial export):\n- ' + warnings.join('\n- ') + '\n\n' : '') +
        'Counts: ' + JSON.stringify(counts, null, 2)
    );
  }

  return { counts: counts, errors: errors, warnings: warnings };
}

// ==================== Service-account auth ====================

function getServiceAccount_() {
  var raw = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT_KEY');
  if (!raw) throw new Error('Script Property SERVICE_ACCOUNT_KEY is not set — see SETUP.md');
  return JSON.parse(raw);
}

/** OAuth2 access token for Firestore, via signed JWT. Cached ~50 minutes. */
function getAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('fs_access_token');
  if (cached) return cached;

  var sa = getServiceAccount_();
  var now = Math.floor(Date.now() / 1000);
  var header = base64url_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claims = base64url_(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  var input = header + '.' + claims;
  var signature = Utilities.computeRsaSha256Signature(input, sa.private_key);
  var jwt = input + '.' + base64url_(signature);

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Token exchange failed (' + res.getResponseCode() + '): ' + res.getContentText());
  }
  var tokenData = JSON.parse(res.getContentText());
  cache.put('fs_access_token', tokenData.access_token, 3000); // 50 min
  return tokenData.access_token;
}

function base64url_(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}

// ==================== Firestore REST fetch ====================

function firestoreRequest_(url, token, postBody) {
  var options = {
    method: postBody ? 'post' : 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };
  if (postBody) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(postBody);
  }
  // Retry transient errors (429/5xx) twice with backoff
  for (var attempt = 0; ; attempt++) {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code === 200) return JSON.parse(res.getContentText());
    if (attempt < 2 && (code === 429 || code >= 500)) {
      Utilities.sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error('Firestore request failed (' + code + '): ' + res.getContentText().slice(0, 500));
  }
}

/** All root collection IDs — new collections are backed up automatically. */
function listCollectionIds_(token) {
  var ids = [];
  var pageToken = null;
  do {
    var body = { pageSize: 100 };
    if (pageToken) body.pageToken = pageToken;
    var res = firestoreRequest_(FIRESTORE_BASE + ':listCollectionIds', token, body);
    ids = ids.concat(res.collectionIds || []);
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return ids;
}

/** All documents of one root collection, paginated. */
function fetchCollection_(name, token) {
  var docs = [];
  var pageToken = null;
  do {
    var url = FIRESTORE_BASE + '/' + encodeURIComponent(name) + '?pageSize=' + PAGE_SIZE +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    var res = firestoreRequest_(url, token);
    (res.documents || []).forEach(function (d) { docs.push(decodeDocument_(d)); });
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return docs;
}

/** All documents of a collection group (e.g. every loans/{id}/repayments doc). */
function fetchCollectionGroup_(collectionId, token) {
  var docs = [];
  var lastName = null;
  while (true) {
    var q = {
      from: [{ collectionId: collectionId, allDescendants: true }],
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: PAGE_SIZE,
    };
    if (lastName) q.startAt = { values: [{ referenceValue: lastName }], before: false };
    var res = firestoreRequest_(FIRESTORE_BASE + ':runQuery', token, { structuredQuery: q });
    var batch = (res || []).filter(function (r) { return r.document; });
    batch.forEach(function (r) { docs.push(decodeDocument_(r.document)); });
    if (batch.length < PAGE_SIZE) break;
    lastName = batch[batch.length - 1].document.name;
  }
  return docs;
}

/** Firestore REST document -> plain JSON with _id/_path, type sentinels preserved. */
function decodeDocument_(doc) {
  var out = {};
  var fields = doc.fields || {};
  Object.keys(fields).forEach(function (k) { out[k] = decodeValue_(fields[k]); });
  var relPath = doc.name.split('/documents/')[1];
  out._id = relPath.split('/').pop();
  out._path = relPath;
  return out;
}

function decodeValue_(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('integerValue' in v) {
    var n = Number(v.integerValue);
    return Number.isSafeInteger(n) ? n : v.integerValue; // huge ints stay strings
  }
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return { _ts: v.timestampValue };
  if ('referenceValue' in v) {
    var parts = String(v.referenceValue).split('/documents/');
    return { _ref: parts.length > 1 ? parts[1] : v.referenceValue };
  }
  if ('geoPointValue' in v) return { _geo: v.geoPointValue };
  if ('bytesValue' in v) return { _bytes: v.bytesValue };
  if ('mapValue' in v) {
    var obj = {};
    var f = v.mapValue.fields || {};
    Object.keys(f).forEach(function (k) { obj[k] = decodeValue_(f[k]); });
    return obj;
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue_);
  return null;
}

// ==================== Excel via temporary Google Sheet ====================

/**
 * Apps Script cannot author .xlsx directly, so: build a temporary Google
 * Spreadsheet (one tab per collection), export it as .xlsx via the Drive
 * API, then trash the temp spreadsheet.
 */
function buildXlsxBlob_(backup, dateStr) {
  var ss = SpreadsheetApp.create('tmp-farm-backup-' + dateStr);
  try {
    // Summary tab first ("Backup Info", not "Meta" — the app has a Firestore
    // collection literally named "meta", and Sheets tab names are case-insensitive)
    var metaRows = [['Field', 'Value'],
      ['Format Version', backup.meta.format],
      ['Project', backup.meta.projectId],
      ['Exported At', backup.meta.exportedAt],
      ['Includes Soft-Deleted', 'yes']];
    Object.keys(backup.meta.counts).forEach(function (k) {
      metaRows.push(['Count: ' + k, backup.meta.counts[k]]);
    });
    var metaSheet = ss.getSheets()[0];
    metaSheet.setName('Backup Info');
    metaSheet.getRange(1, 1, metaRows.length, 2).setValues(metaRows);

    var usedNames = { 'backup info': true };
    var addTab = function (name, docs) {
      if (!docs.length) return;
      writeCollectionSheet_(ss, uniqueSheetName_(name, usedNames), docs);
    };
    Object.keys(backup.collections).forEach(function (name) { addTab(name, backup.collections[name]); });
    Object.keys(backup.subcollections).forEach(function (name) { addTab(name, backup.subcollections[name]); });

    SpreadsheetApp.flush();
    return exportSpreadsheetAsXlsx_(ss.getId());
  } finally {
    DriveApp.getFileById(ss.getId()).setTrashed(true);
  }
}

/** Download a spreadsheet as .xlsx. Tries the docs.google.com export URL first
 *  (works on all accounts), then the Drive v3 API as fallback. */
function exportSpreadsheetAsXlsx_(spreadsheetId) {
  var urls = [
    'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx',
    'https://www.googleapis.com/drive/v3/files/' + spreadsheetId +
      '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  ];
  var lastError = '';
  for (var i = 0; i < urls.length; i++) {
    var res = UrlFetchApp.fetch(urls[i], {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) return res.getBlob();
    lastError = 'HTTP ' + res.getResponseCode() + ' from ' + urls[i].split('?')[0] +
      ': ' + res.getContentText().slice(0, 300);
    Logger.log('xlsx export attempt ' + (i + 1) + ' failed — ' + lastError);
  }
  throw new Error('xlsx export failed — ' + lastError);
}

function writeCollectionSheet_(ss, sheetName, docs) {
  // Header = union of keys across docs, _id first, _path last
  var keySet = {};
  docs.forEach(function (d) { Object.keys(d).forEach(function (k) { keySet[k] = true; }); });
  delete keySet._id;
  delete keySet._path;
  var keys = ['_id'].concat(Object.keys(keySet).sort()).concat(['_path']);

  var rows = [keys];
  docs.forEach(function (d) {
    rows.push(keys.map(function (k) { return cellValue_(d[k]); }));
  });

  var sheet = ss.insertSheet(sheetName);
  sheet.getRange(1, 1, rows.length, keys.length).setValues(rows);
}

function cellValue_(v) {
  if (v == null) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  var s;
  if (typeof v === 'object') {
    if (v._ts) {
      s = Utilities.formatDate(new Date(v._ts), TZ, 'yyyy-MM-dd HH:mm:ss');
    } else {
      s = JSON.stringify(v);
    }
  } else {
    s = String(v);
  }
  if (s.length > 40000) s = s.slice(0, 40000) + '…[truncated]'; // Sheets 50k cell cap
  if (/^[=+]/.test(s)) s = "'" + s; // don't let cell content become a formula
  return s;
}

/** Excel tab names: ≤31 chars, unique (case-insensitive — Sheets treats "meta" and "Meta" as the same). */
function uniqueSheetName_(name, used) {
  var base = name.slice(0, 31);
  var candidate = base;
  var i = 2;
  while (used[candidate.toLowerCase()]) candidate = base.slice(0, 28) + '_' + i++;
  used[candidate.toLowerCase()] = true;
  return candidate;
}

// ==================== Drive folder, retention, alerts ====================

function getBackupFolder_() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

/** Rerun-safe: a manual rerun replaces (not duplicates) today's files. */
function trashExisting_(folder, names) {
  names.forEach(function (name) {
    var it = folder.getFilesByName(name);
    while (it.hasNext()) it.next().setTrashed(true);
  });
}

/** Delete backups older than RETENTION_DAYS, judging age by the FILENAME date. */
function cleanupOldBackups_(folder) {
  var cutoff = Utilities.formatDate(
    new Date(Date.now() - RETENTION_DAYS * 86400000), TZ, 'yyyy-MM-dd');
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var m = file.getName().match(/^farm-backup-(\d{4}-\d{2}-\d{2})\.(json|xlsx)$/);
    if (m && m[1] < cutoff) file.setTrashed(true);
  }
}

/** Compare counts to the previous run; big drops usually mean trouble. */
function checkCountsSanity_(counts) {
  var props = PropertiesService.getScriptProperties();
  var prev = {};
  try { prev = JSON.parse(props.getProperty('LAST_BACKUP_COUNTS') || '{}'); } catch (e) {}
  var warnings = [];
  Object.keys(prev).forEach(function (k) {
    var before = prev[k], after = counts[k] || 0;
    var drop = before - after;
    if (before > 0 && drop > 20 && drop / before > 0.2) {
      warnings.push(k + ': ' + before + ' → ' + after + ' documents');
    }
  });
  props.setProperty('LAST_BACKUP_COUNTS', JSON.stringify(counts));
  return warnings;
}

function notify_(subject, body) {
  var email = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') ||
    Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(email, subject, body);
}

function todayStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}
