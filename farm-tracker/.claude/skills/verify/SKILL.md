---
name: verify
description: Build, serve, and drive the farm-tracker PWA headlessly to verify UI changes at multiple viewports.
---

# Verifying farm-tracker UI changes

## Build & serve
1. `rm -rf dist && npm run build` (from repo root). Output lands in `dist/farm-tracker/browser` (index.html is there; `prerendered-routes.json` is empty).
2. `npx http-server` does NOT do SPA fallback and the `-P http://localhost:PORT?` self-proxy trick crashes. Use a tiny Node server that falls back to `index.html` for unknown paths instead.

## Drive headlessly
- No Playwright/puppeteer in the repo. Install `puppeteer-core` in a scratch dir and point `executablePath` at `C:\Program Files\Google\Chrome\Application\chrome.exe` (Edge also available at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`).
- Overflow check per route/viewport: `document.documentElement.scrollWidth > clientWidth`.

## Routes & auth boundary
- Auth pages: `/auth/login`, `/auth/forgot-password` (no register route). All other routes are guarded and redirect to `/auth/login` without a Firebase session — there is no local emulator (Java 8 machine), so authenticated pages (tables, dialogs, dashboard) cannot be driven headlessly. Verify those via computed-style probes on public pages + grepping the compiled `dist/.../styles-*.css` for the global rules.
- The Angular 404 component renders for unknown paths ("404 Page not found") — useful as an unauthenticated shell-rendering check.

## Visual iteration without auth (page-mock harness)
To SEE authenticated-style pages (filters, tables, cards) without logging in:
load `/auth/login` headless, clone a rendered `mat-form-field.outerHTML`, remove
`app-root`, and inject a mock page (page-header + filter-card + data-table +
cards) into the live DOM — the app's compiled CSS and Material tokens apply for
pixel-accurate screenshots. CRITICAL: `page.setViewport({hasTouch})` RELOADS the
page in Puppeteer — re-navigate and re-inject per viewport. A working script
lives in past session scratchpads as `page-mock.js`.

## Gotchas
- The firebase.json CSP (`script-src` without `unsafe-inline`) blocks Angular's
  critical-CSS trick (`<link media="print" onload="this.media='all'">`), which
  silently drops ALL global styles.css rules in production while localhost looks
  fine. `inlineCritical: false` is set in angular.json production optimization —
  never re-enable it while the CSP stands. After deploys, curl the live index
  and confirm the stylesheet `<link>` has NO `media="print"` attribute.
- Local serving of dist does NOT send the firebase.json headers (CSP etc.) —
  production-only breakage like the above is invisible in local verification;
  spot-check the live site after deploying header or index-structure changes.
- Mobile styling uses a single 768px cutoff (matches bottom nav) — don't
  introduce narrower sub-breakpoints (640px/600px) for mobile treatments.
- Angular Material 21 M3 theme tokens are named `--mat-card-*` (NOT `--mdc-*`);
  the theme tints card surfaces lavender (#f8f2f6) — styles.scss forces white.
- All components use inline templates/styles; global CSS is the single `src/styles.scss` → compiled to `styles-*.css` in dist.
- `angular.json` anyComponentStyle budget: warn 4kB / error 8kB. Pre-existing warn-level offenders: loan-detail, animal-analytics, data-setup, user-guide-dialog, analytics-tab.
- Pre-existing build warnings: CommonJS (canvg/jspdf/xlsx) and NG8113 unused-import warnings — not caused by style changes.
