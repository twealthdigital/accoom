# HANDOFF: performance + guest/user fixes (for the next AI/dev)

Owner rule: **do not change the design or the owner's workflow.** Source files stay readable; speed work happens in the build (`npm run build` -> `dist/`, deployed by Vercel via `vercel.json`).
Goal: only the PNG images and MP4 videos should be slowing the site down.

## DONE (pushed)
1. **No more guest flash** - every page `<head>` now has an `auth-state` inline script that adds `is-guest` / `is-auth` / `is-agent-done` to `<html>` before paint. `assets/css/utilities/states.css` hides balance, messages, notifications and the "Become an Agent" CTA for guests (and the CTA for completed agents) immediately. `main.js` guest gate still runs as a safety net.
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
