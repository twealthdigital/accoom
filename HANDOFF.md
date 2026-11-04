# HANDOFF: performance + guest/user fixes (for the next AI/dev)

Owner rule: **do not change the design or the owner's workflow.** Source files stay readable; speed work happens in the build (`npm run build` -> `dist/`, deployed by Vercel via `vercel.json`).
Goal: only the PNG images and MP4 videos should be slowing the site down.

## DONE (pushed)
1. **No more guest flash** - every page `<head>` now has an `auth-state` inline script that adds `is-guest` / `is-auth` / `is-agent-done` to `<html>` before paint. `assets/css/utilities/states.css` hides balance, messages and notifications for guests, and hides the property CTA for completed agents. The property-business card and its "Add a Property" signup CTA remain available to guests; signed-in users are routed through agent onboarding. `main.js` guest gate still runs as a safety net.
   - **If you add a new page:** copy BOTH head scripts (theme + `auth-state`) and the `early-partials` script from any other page.
2. **Fake "Guest User" session removed** - `contact-agent.js` used to silently create a persisted `accoom-user` (name "Guest User") for signed-out visitors, which made them look logged in site-wide. Guests now go to `auth.html?mode=signup`. The Contact Agent buttons in `property.js`, `home.js` (suggested cards) and `agent-profile.js` also send guests to signup and store nothing.
3. **skeleton.js** - `scanBackgrounds()` used `getComputedStyle` on every element of the page, repeatedly (page load + every partial). Now it reads stylesheets once, and only checks elements that match a selector with a `url()` background. Same behaviour, far less main-thread work (this was a cause of freezing on phones).
4. **Script bundling in `build.mjs`** - each page's consecutive `<script src>` tags are merged into hashed files in `dist/assets/bundles/` (321 requests -> ~35 across 21 pages). Order preserved, inline `<script>` blocks (e.g. `Accoom.loadPartials()`) stay in place and split the bundles, each file is wrapped in try/catch. The build **throws** if any inline script would change. Bundles are cached `immutable` (see `vercel.json`, `_headers`).
5. Verified with jsdom (source vs dist, guest/customer/agent): same cards rendered, partials all injected, same errors (only jsdom limitations).

10. **Dead header icons after reload (FIXED)** - hamburger, messages and notification icons did nothing on a reload when logged in. Cause: `Accoom.loadPartials()` is an inline script placed BEFORE `main.js`; with header/footer in the session cache every promise was already resolved, so `partials:ready` fired before `main.js` had registered its listener. Fix in `assets/js/core/partials.js`: `loadPartials()` waits for DOMContentLoaded when the document is still loading. Verified with jsdom (cached and uncached, logged in).

11. **listing-actions observer narrowed** - `boot()` in `assets/js/modules/listing-actions.js` now observes `<main>` (falls back to `<body>`) instead of the whole body, so header/footer/toast changes no longer wake it on my-listings.
12. **Guest guard added** to `payment.html` and `report-agent.html` (they had none; guests could open them by URL). Same inline bounce-to-`auth.html` script the other signed-in-only pages use.

13. **Content Guard lazy-loaded** - `addlistings.html` and `contact-agent.html` no longer load `vendor/obscenity.bundle.js` (51 KB), `blocked-terms.js` and `content-guard.js` before first paint. New `assets/js/modules/content-guard-loader.js` injects them in the same order once the browser is idle (or on the first touch/focus/typing). Callers already check `Accoom.ContentGuard` exists. Verified in jsdom on addlistings (guard loads, blocks \"whatsapp\" wording, passes clean text). contact-agent not verified in jsdom (jsdom crashed on that page) - check in a real browser.

14. **Decision: big scripts NOT split (measured).** Gzipped sizes in dist: contact-agent 15 KB, listing-actions 17 KB, my-listings 11 KB, home 11 KB, agent-dashboard 9 KB. Each loads only on its own page (listing-actions only on my-listings), so splitting would save almost nothing and risks breaking load order and the inline `ListingActions.configure(...)` call. Do not split unless a real-browser profile shows script parse time is the bottleneck. Menu scroll/resize listeners in listing-actions are added on open and removed on close (checked, fine).

15. **Guest guard on contact-agent.html** - inline head script sends guests to `auth.html?mode=signup` before paint (JS check kept as backup).
16. **Role audit done (code read).** Agent pages (addlistings, agent-dashboard, my-listings, agent-details) all block guests, customers and unfinished agents; onboarding and auth redirect by role; profile.html sends agents to the dashboard. saved-properties, purchases, purchase-details, payment, account-settings, notifications, report-agent are signed-in only and open to both roles (left as is: owner's choice).
17. **Renamed** `filter-accomodation` -> `filter-accommodation` (html, css, js, header links) with a permanent redirect for the old URL in `vercel.json`.

18. **Owner's local edits merged (report-agent + notifications).** From the owner's unpushed VS Code work: report-agent page now has a gold "Write a report" button (picks "Other"), click-again-to-unselect for categories, a custom property-type dropdown (Bedroom flat / Self con / Single room / Land / Custom / None) with a free-text Custom box, and the toast is shown above the confirmation dialog. Notifications can no longer be deleted by the user (dismiss buttons removed in `main.js` and `pages/notifications.js`, `NotificationService.dismiss` is a no-op). Files: `report-agent.html/.css/.js`, `assets/js/main.js`, `assets/js/data/notifications.js`, `assets/js/pages/notifications.js`. Owner's versions replaced the repo ones (they were untouched in the repo since the owner's last pull); `report-agent.html` was merged by hand to keep the speed/guest-guard head.

## NOT DONE yet (suggested next steps, in order)
- Compress/resize PNGs to WebP/AVIF (37 MB of images; hero PNGs ~1.8 MB each; logos ~0.9 MB). Add `width`/`height`, keep `loading="lazy"` below the fold. Videos: `preload="none"` + poster, compress mp4 (~9 MB).
- Listing-card videos in `home.js` (~line 460) use `autoplay preload="metadata"` on every card.
- (Script splitting: decided against, see 14.) Old note: NOTE: `listing-actions.js` is only loaded on my-listings.html and is configured by an inline script right after it, so it was left alone (risky). Page JS files are already loaded only by their own page; real gains need splitting inside the files.
- (observer narrowed to `<main>`, see 11) re-check in a real browser that my-listings no longer stutters; `skeleton.js` and `media-store.js` still observe `document.documentElement` (attributes + subtree) - next suspects if anything still freezes.
- Not yet verified in a real browser (no Chrome in the sandbox): run Lighthouse / DevTools Performance on home, property, my-listings as guest AND logged in.

- Audit remaining pages for wrong-user-type content: only payment/report-agent were found unguarded so far; still check `contact-agent.html`, `onboarding.html` and customer vs agent views in a real browser.

## How to verify
```
npm install && npm run build     # prints "Bundled scripts on N pages: X -> Y"
npm start                        # serves source for quick local checks
```

## Stage 2 - property documents + listing approval (frontend only)
- New: `data/document-requirements.js` (rent vs sale sets, "who is listing" question, sale needs at least ONE title document, admin overrides), `data/listing-review.js` (approval state machine + `isPubliclyVisible` / `filterPublic`), `modules/document-upload.js`, `modules/document-preview.js`, `css/pages/property-documents.css`.
- A listing now has two axes: `status` (lifecycle; new value `in_review`) and `approval.state` (draft, pending_review, ai_review, manual_review, changes_required, approved, rejected, legacy_unreviewed). PUBLIC = `status==='available' && approval.state==='approved' && approval.published`. **Every public page must filter through `Accoom.ListingReview.filterPublic`.** Today no public page reads `accoom-agent-listings` (a test enforces this).
- Listing form: new "Property Documentation" card, "Save as draft" + "Submit for review" buttons, Day billing period. New listings save as `in_review`, never `available`.
- Dashboard: new "In Review" tab; Make Available is blocked for unapproved listings.
- No admin screen yet (Stage 3). Until then approve/reject only exist as API calls (`Accoom.ListingReview.approve(id, {role:'admin'})`); "admin" is a demo role, not authentication.
- `npm test` runs Stage 1, Stage 2 module tests and a real-page test (jsdom, image decoding stubbed).

## Stage 3 - document intelligence + admin review (frontend only, DEMO analysis)
- New: `data/document-verification.js` (provider abstraction, demo analyzer, cross-document comparison, admin document decisions), `modules/admin-demo.js` (local demo-admin switch), `admin-review.html` + `pages/admin-review.js` + `css/pages/admin-review.css`. Admin page is deliberately NOT linked from any other page (a test enforces it). Open it by address and type `DEMO ADMIN`.
- Providers: `Accoom.DocVerification.registerProvider(kind, impl)` for `ocr`, `documentAI`, `authenticity`, `external`. Built-ins are DEMO (`kind: 'demo'`). A real service must be `kind: 'remote'`, run on a secure backend, and needs the owner's consent. No API keys in browser code.
- What is REAL in a report (tagged "Real check"): file opens, PDF page count, file-name hint, same file used on another listing. SIMULATED: type identification, text, extracted values, signature/stamp, missing pages, alterations (sample values; trigger words in a file name raise flags: mismatch-name, mismatch-address, mismatch-cert, blurry, missing-page, altered, nostamp, nosig). NOT PERFORMED: issuer/registry confirmation.
- Analysis can never set VERIFIED. VERIFIED = administrator decision (`admin_manual`, shown as "not confirmed with the issuer") or a REMOTE external provider that really confirmed (`independent_issuer`).
- Flow: Pending Review -> (Run analysis) AI Review -> Manual Review -> admin Approve / Request changes / Reject. Approve publishes (status `available`).
- No authenticity percentage anywhere. Risk level = count of warnings/failures, with an on-screen explanation.
- Still needs a backend: real OCR/AI, issuer and registry checks, real admin accounts, server-side audit, consent and privacy handling for sending documents to any external service.
