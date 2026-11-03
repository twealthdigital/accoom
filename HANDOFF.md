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

## NOT DONE yet (suggested next steps, in order)
- Compress/resize PNGs to WebP/AVIF (37 MB of images; hero PNGs ~1.8 MB each; logos ~0.9 MB). Add `width`/`height`, keep `loading="lazy"` below the fold. Videos: `preload="none"` + poster, compress mp4 (~9 MB).
- Listing-card videos in `home.js` (~line 460) use `autoplay preload="metadata"` on every card.
- Split big JS (`contact-agent.js` 94 KB, `listing-actions.js` 90 KB, `home.js`, `my-listings.js`); load listing-actions only when a menu opens.
- `listing-actions.js` watches the whole `<body>` with a MutationObserver (my-listings, addlistings, agent-dashboard): re-check if those pages still stutter.
- Not yet verified in a real browser (no Chrome in the sandbox): run Lighthouse / DevTools Performance on home, property, my-listings as guest AND logged in.
- Rename `filter-accomodation.html` -> `filter-accommodation.html` (and links).

## How to verify
```
npm install && npm run build     # prints "Bundled scripts on N pages: X -> Y"
npm start                        # serves source for quick local checks
```
