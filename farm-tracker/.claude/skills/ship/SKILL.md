---
name: ship
description: Commit all pending changes and/or deploy farm-tracker to Firebase Hosting with a mandatory clean rebuild (rm -rf dist) — use whenever asked to commit, deploy, ship, or push the app live.
---

# Ship — commit all + clean rebuild + deploy

## Usage

- `/ship` (no args) — commit everything, then deploy.
- `/ship commit` — commit only.
- `/ship deploy` — deploy only.

Always commit **before** deploying so the code that goes live is always in git history.

## Commit procedure

1. Review what's pending: `git status` and `git diff` (plus `git diff --stat` for a quick overview).
2. Stage **all** files — no partial staging:
   ```bash
   git add -A
   ```
3. Write the message in repo style: single imperative subject line, capitalized, no type prefix, no trailing period. Use `:` or `+` to join area and detail when the subject gets long. Examples from history:
   - `Scope reads to assigned segments for all non-admin users`
   - `Fix production styles: CSP-safe stylesheet loading, 768px breakpoint unification, filter label clip`
   - `Link selling expenses to sale income + centralize buyer counter sync`
4. Commit with the standard trailer:
   ```bash
   git commit -m "Subject line here

   Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
   ```
5. Do **not** push unless the user explicitly asks.

## Deploy procedure

Use the Bash tool (commands are POSIX). Run each step only if the previous one succeeded — a failed build means **stop, do not deploy**.

```bash
cd /d/kk/self-use-repo/farm-tracker
rm -rf dist                              # MANDATORY: never deploy a stale build
npx ng build --configuration production  # output: dist/farm-tracker/browser
firebase deploy                          # hosting + firestore rules + indexes (project farm-tracker-tn70)
```

`firebase deploy` publishes hosting **and** Firestore rules + indexes together (both are configured in `firebase.json`). Live site: `https://farm-tracker-tn70.web.app`.

## Post-deploy verification

```bash
curl -s https://farm-tracker-tn70.web.app/index.html | grep stylesheet
curl -s -o /dev/null -w "%{http_code}" https://farm-tracker-tn70.web.app/ngsw.json
```

- The stylesheet `<link>` must **not** carry `media="print"` (CSP gotcha — see the `verify` skill).
- `ngsw.json` must return `200` so the service worker can pick up the new version.

## Gotchas

- **Never** remove the no-cache headers on `ngsw.json` / `ngsw-worker.js` / `index.html` in `firebase.json` — stale service workers brick PWA updates.
- Spark (free) plan: deploy is hosting + firestore only — never functions.
- `dist/` is gitignored, so deleting it never affects the commit step.
- `npm run build` also works (angular.json defaults to production), but the canonical command above is explicit on purpose.
- If the build fails on budgets (initial 2MB warn / 3MB error), fix the size problem — don't raise the budget to force a deploy.
