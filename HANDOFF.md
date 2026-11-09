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

## Stage 4 - ACTD (ACCOOM Certificate Transaction Document) + transactions (frontend only)
- New: `core/identity.js`, `data/tenancy-dates.js` (month/year-end safe expiry maths, reused by Stage 6), `data/transactions.js`, `data/actd.js`, `modules/pdf-writer.js` (dependency-free PDF), `modules/actd-generator.js`, `vendor/qrcode-generator.js` (MIT, unmodified), pages `document-centre.html` and `verify-document.html` (+ css/js). Profile menu has a "My Documents" link.
- Every SUCCEEDED transaction gets exactly one ACTD (unique key transactionId+version, so double clicks / repeated events cannot create two). Issued records are immutable; a later confirmation creates a new VERSION (addendum, reason required). Money fields, parties and dates can never change; only sections 3/4/5 details can. All versions stay downloadable and re-render byte-for-byte.
- PAYMENT HONESTY: no gateway exists. `Transactions.recordDemoPayment` is an explicit DEMO event; every ACTD from it says "DEMONSTRATION RECORD - NO REAL PAYMENT WAS MADE". `Transactions.handleGatewayWebhook` always refuses (needs a server that verifies the gateway signature). Stage 8 should listen for the `accoom:transaction-succeeded` event to move listings to rented/sold. Stage 4 does NOT change listing status.
- SEAL: SHA-256 fingerprint of the issued record. Detects change; it is NOT a digital signature. QR + verify page only work against records in THIS browser (no server). Verify page shows no personal data.
- ACTD never stores customer phone/email. Agents see the client's name only.
- Access: customer = own ACTDs, agent = ACTDs of own transactions (listing.ownerId, now saved by the listing form), admin = all only while demo admin mode is on. Identity is a stand-in (`local-agent` / `local-customer`) until real accounts exist.
- Receipt: the ACTD carries a reserved receipt reference (ACR-...). The receipt DOCUMENT itself is Stage 5 and must use `transaction.receiptRef`. Section 5 delivery/acknowledgement and Section 4 signing will be filled by Stage 5 through `ACTD.addendum`. Occupancy Extension (Stage 7) is read from `listing.occupancyExtension.days`; receipt delivery from `listing.receiptDelivery`.
- PDF uses "NGN" (standard fonts have no Naira sign). Times are shown in WAT (UTC+1).
- Verified outside the test suite: `qpdf --check`, `pdftotext`, page rasterised and inspected, QR decoded with OpenCV to the exact verification URL (v1 and v2), and the minified `dist` bundle passes the page tests.

## Inclusive pricing (customers never see base price or fee amounts)
- `assets/js/data/pricing.js` -> `Accoom.Pricing.finalPrice(listing)` = accommodation + service charge + legal fee + agency fee. Fee fields stay on the listing record (agent records / platform maths); a record with no fee fields (catalogue, card price) is already final and is returned unchanged.
- Customer screens use the final price only: property page (rent row, total, fees shown as "Included"), listing-actions view/share preview, `transactions.js` (payment amount = final price x periods, agencyFee/legalFee in the transaction are 0 so ACTD/receipts no longer print fee lines), purchase-details ("Service Fee: Included"), chat sample text.
- Agent-only screens (addlistings form + preview, my-listings edit) still show the four inputs; the preview total is labelled "Price customers see (all fees included)".
- **Never add fees on top of a final price.** Rent is now charged as the inclusive price per billing period (fees are inside each period's price).
- `npm test` includes `tests/pricing.test.mjs`.

## Inclusive pricing, part 2 (agent listings in the shared catalogue)
- Agent listings were NOT reaching the homepage before: every grid reads `Accoom.PropertyService` (data/properties.js), which only held the 25 mock items. It now appends approved + published agent listings (`ListingReview.filterPublic`) with `price = Accoom.Pricing.finalPrice(listing)`, `priceLabel`/`period` from the listing, and NO fee fields (so nothing can add them again). Home, filter-accommodation, about, header search and the property page (getById) all get them from this one place. Mock items are untouched (no invented fees).
- Agent items sort after mocks by `order` (text ids); 'newest' lists them first.
- Price filters: the slider end stops (N100,000 / N1,000,000) mean "no limit" in `fetchPage`, so an inclusive price above the slider is not hidden by default.
- Home card suffix uses the listing's period (/day /wk /mo /yr, or "For Sale"); mock cards keep "/yr".
- `pricing.js` + `listing-review.js` are loaded on every page that loads `properties.js`.
- Tests: `tests/pricing.page.test.mjs` (real home + property + document-centre pages).

## Auto-approve for testing (agent listings go live at once)
- `assets/js/data/listing-review.js` -> `Accoom.ListingReview.AUTO_APPROVE = { enabled: true, actorId: 'auto-approve-testing' }`. After an agent's successful submit (documents complete), `autoReviewForTesting()` runs the normal steps (pending_review -> manual_review -> approved) as a labelled automatic actor, sets `approval.verified = true` (+ `verifiedAt/By`), `published = true`, `status = 'available'`. History and audit show each step.
- Same catalogue as before: `PropertyService` (data/properties.js) -> home, Browse filters, search, header search, property page. It also exposes `verified` (listing) and `agent.verified` so the "verified only" filter includes it. Unapproved, draft, rejected or unpublished listings stay private (`filterPublic`).
- **To switch to real admin review:** set `AUTO_APPROVE.enabled = false`. Admins then approve in `admin-review.html`; `approve(id, admin, { verified: true })` marks a listing verified.
- Tests that cover the manual workflow (stage2-7 module/page tests) set `enabled = false`; `tests/autoapprove.page.test.mjs` covers the auto flow end to end.

## Real agents show no dummy details (new listings only)
- Rule: the 25 hardcoded properties/agents (and `David O.` fallbacks) stay as guidelines and will be deleted later. Agents who list through ACCOOM are "real" (`agent.real = true`, `ownerId` set in `data/properties.js`).
- Home card: real agent shows "No reviews yet" instead of a fake `0 (0)` / rating.
- Property page (`property.js`): real agent never falls back to the sample agent's 4.8 / 120 reviews / AL5; the sample "Suggested Agents" carousel is removed on real listings; Contact Agent request carries real values (0 reviews, offline, AL1).
- Agent profile (`agent-profile.js`, `applyRealAgent`): stats = real property count, "No reviews yet", bio / languages only from the agent's own registration (`accoom-user`), specialization + areas derived from their listings, availability row hidden, sample reviews removed, tabs show the agent's real listings (In Progress / Sold show empty messages).
- `main.js`, `home.js`, `contact-agent.js` pass `real` + `ownerId` into `accoom-active-agent`.
- Test: `tests/real-agent.page.test.mjs` (in `npm test`).
- Not verified in a real browser (jsdom only). Level "AL1" is kept for new agents as the starting level.

## Agent profile polish + customer reviews
- Profile header: Contact Agent button now sits UNDER the agent's description (`.ap-header-main` wraps `.ap-about` + `.ap-actions`).
- Profile tabs: **In Progress removed**, only Available + Sold remain. Real agents' Available cards show EVERY photo and video with the same arrows/dots/swipe as the home cards (`videosAll` is now carried on catalogue items in `data/properties.js`).
- Reviews: new `assets/js/data/reviews.js` (`Accoom.Reviews`, localStorage `accoom-agent-reviews`, one review per customer per property, editing replaces). Loaded before `properties.js` on every page that loads it.
- Chat (`contact-agent.js`): after the customer approves OR declines a payment, a stars + text dialog opens. If they close it, a "Rate this agent / Write a review" strip stays under the property card (shows "You rated this agent" + Edit after). Only for real agents (sample agents keep fixed ratings).
- Ratings flow: agent profile shows the average + review list, home card and property page show `avg (count)`, "No reviews yet" when none.
- Chat property card photo now reads the live catalogue photo (saved conversations held dead blob: addresses).
- Test: `tests/real-agent.page.test.mjs` extended. Chat page itself not covered (jsdom crashes on contact-agent); check approve/decline -> dialog in a real browser.

## Rate-this-seller bar + CSS cache fix
- Chat "Rate this seller": a SMALL box on the left under the tabs (gold title on top, 5 stars below, fit-content width, rounded border). Owner rejected a full-width bar twice: never make it span the chat. Tapping a star opens the review dialog with that star selected.
- **Build now versions every stylesheet link (`?v=<hash of all css>`)** in `build.mjs` (`versionCss`). Before, CSS was cached for a day, so visitors saw NEW html with OLD css (the strip appeared unstyled). Do not remove.


## Messages page (step 1: chat only)
- `contact-agent.html/.js/.css` was cut out. The chat now lives on its own page: `messages.html` + `assets/css/pages/messages.css` + `assets/js/pages/messages.js`. Old URL redirects to it (`vercel.json`). The old files are in git history (commit before this one) if any removed feature needs to be brought back.
- Every "Contact Agent" / "View all messages" / report-agent / payment link now points to `messages.html`.
- Step 1 has ONLY: conversation list, chat view (header, day dividers, bubbles with time), composer (Enter sends on desktop, send button on mobile), mobile back button. Data key `accoom-conversations` is unchanged, so the header messages dropdown still works. `accoom-contact-request` opens or creates the conversation for that agent; `?open=<propertyId>` reopens one.
- No dummy conversations are seeded any more: the list is empty until someone contacts an agent.
- NOT in yet (to add step by step, as the owner asks): property card, payment/approve/decline, offers, report, block, mute, search, tabs, saved messages, reply, photos/files, ratings strip.

## Laptop server + agent reply screen (test database)
- `server/server.js` (`npm run dev`, no packages): serves the site AND a small API; data in `server/data/` (git-ignored; delete to reset). Not part of `dist`/deploy. Testing only: no auth, anyone on the network can read it.
- `assets/js/core/sync.js` (loaded on every page that has properties.js or media-store.js): `Accoom.Sync`. Person id = hash of their email (`userKey()`), so it survives the account object being rewritten. All calls fail quietly when there is no server.
  - Agent's PUBLIC listings (`filterPublic`) are pushed on every save of `accoom-agent-listings` and on page load: final price only (fee fields, documentation and approval history are stripped), `ownerId`/`agentKey` = the agent's key (locally everyone was `local-agent`), photos/videos uploaded once to `/uploads/<sha1>` (cache in `accoom-sync-media`).
  - Other agents' listings are pulled into `accoom-remote-listings`; `data/properties.js` appends them to the catalogue (own copy wins). Page scripts wait for the first pull (`Accoom.ready` wrapper).
- Chats: `messages.js`. A listing with `agentKey` (real agent) makes a server conversation `c-<propertyId>-<customerKey>` when the customer sends the first message. Both people see it on `messages.html` (the same list/chat screen: the agent's list shows customers, status line shows the property, composer says "Type a reply..."). Server decides the sender side from `senderKey`; names are stripped of `<>&"'`. Polling every 3 s while the tab is visible. Local copy lives in `accoom-conversations` seen from my side (`remote:true`); sample (hardcoded) agents stay local only. Messages not delivered stay `pending` and are retried.
- Not in yet: header badge only updates while messages.html is open (no background polling on other pages); one agent per browser (two browsers with the same email would overwrite each other's listing list on the server); no property card / payment in chat.
- Test: `tests/sync.e2e.test.mjs` (real server + two jsdom browsers).
- Follow-up: the listing is sent to the server at once and again after each photo/video finishes uploading (max 3 uploads at a time), so a big video cannot hold the listing back and a page change cannot lose it. If the server is not reachable when a page opens, the page keeps retrying every 5 s (up to 5 min) and then sends the agent's listings. `http://localhost:3000/_status` shows what the server holds; its terminal prints every listing share, upload and chat message. Test: `tests/sync.flow.test.mjs` (real submit flow with an IndexedDB photo, then a customer browser).
- Chat pages (final): customers use `contact-agent.html` (+ `contact-agent.js/.css`, the full chat: saved chats, payment, approve / decline, restored from before commit 9095235); agents use `messages.html` (+ `messages.js`), the inbox for replying. Each page sends the other kind of user to the right one; header links use `chatPage()` in main.js. A listing from a real agent (has `agentKey`) is bridged in contact-agent.js (`markRealAgent`, `postToAgent`, `pullAgentReplies`): the customer's text messages go to the server and the agent's replies come back as incoming messages. Payment requests / approve / decline are still local to the customer's browser (not yet exchanged with a real agent).
- Agent inbox design (final): `messages.html` is the same screen as `contact-agent.html` (same markup, `contact-agent.css`, `contact-agent.js`), switched to an agent view by role (`agentView` in contact-agent.js, `body.is-agent-chat` hides payment / report / block / properties parts). Conversations = customers who wrote to this agent (from the server, merged with local flags; chats the agent deletes stay hidden until the customer writes again: `accoom-hidden-chats`). The earlier separate `messages.js` / `messages.css` were removed. Customers opening messages.html and agents opening contact-agent.html are redirected by a small inline script in each page.


## Agent Contact & Payment Permission System (7 stages, one at a time, owner authorises each)
Rules: inspect first, reuse existing systems, no redesign, no fake permission checks, backend dependencies must be named not pretended, never claim an untested test passed.

### Stage 1 - listing ownership detection (DONE)
- New `assets/js/core/ownership.js` -> `Accoom.Ownership` (loaded right after `core/sync.js` on every page that loads sync.js). Use it for EVERY later permission check; never compare ids by hand.
  - `check(subject)` -> `{ state, isOwn, isOther, isGuest, isUnknown, reason }`. subject = listing, catalogue card item, agent object or an owner id string. States: `own` (signed-in agent owns it), `other`, `guest`, `unknown` (real listing with no owner info, or viewer id unknown: NOT own, and later stages must not show payment on it).
  - `checkListingId(id)` looks the id up in `Accoom.PropertyService`; `isOwn(subject)`, `isOwnListingId(id)`, `viewer()`.
- How identity works today: viewer = `accoom-user` (id = `Sync.userKey()`, a hash of the email; older records may have id/userId/agentId; agents with none used the stand-in `local-agent`). Listings made in this browser carry `ownerId = user.id||agentId||'local-agent'`; the copy shared by the laptop server carries `ownerId = agentKey = userKey()`. Sample (hardcoded) items have no owner -> `other`. The check accepts all of these ids; `local-agent` only counts for agents.
- Wired in (no visible change): `agent-profile.js` `isMe` now uses the central check; `property.js` sets `Accoom.currentProperty.ownership` for later stages.
- Contact / payment UI NOT touched yet (Stage 2+).
- Backend dependency: the test server has no authentication. A real backend must repeat the same comparison (authenticated user id vs listing owner id) before creating a conversation or payment. Stage 2 "enforced beyond hiding buttons" can only be frontend guards until then.
- Test: `tests/ownership.test.mjs` (in `npm test`).

### Stage 2 - prevent self-contact (DONE)
- `ownership.js` additions: `canContact(subject)`, `contactRequestOk(req)`, `gateContact(els, subject)` (hides + disables, restores when not own), `onChange(fn)` (re-runs on account change in another tab and on back/forward-cache restore), `CONTACT_SELECTOR`. Contact controls use `[data-pd-contact-agent]`, `[data-ap-contact]`, `[data-contact-agent]`, `[data-message-agent]`, `[data-chat-agent]`: use one of these on any NEW contact button and it is covered automatically.
- Property page: Contact Agent hidden on the agent's own listing; click handler re-checks; request now carries `ownerId` / `agentKey`. Agent profile: hidden on own profile, same re-check, request carries owner ids. Home suggested-card Contact Agent refuses own listings.
- Chat page (`contact-agent.js`): a stored `accoom-contact-request` that names the signed-in agent (by owner ids OR by listing id) is discarded; `isSelfConversation()` blocks sending and `postToAgent`. NOTE: in the agent inbox the listing is the agent's own by design, so the check there is "customerKey === me" only (an earlier version blocked agent replies; `sync.e2e` caught it).
- Server (`server/server.js`): message POST refuses a conversation whose two sides are the same key (400 "You cannot message yourself"), also for a stored conversation.
- Limits: (1) listings saved in this browser before real ids carry the shared stand-in `local-agent`, so two different agents signing in one after the other in the SAME browser both see those local listings as their own (only a real account backend fixes this). (2) Agent-to-agent contact still lands on the agent inbox without creating a chat: that is Stage 3. (3) Server has no authentication; keys come from the client.
- Tests: `tests/selfcontact.page.test.mjs` (real server + real pages, in `npm test`).

### Stage 3 - agent-to-agent messaging (DONE)
- Before: an agent opening the chat page got the inbox only: a stored `accoom-contact-request` was ignored (`!agentView`) and only chats where the agent is the RECIPIENT were listed, so Agent A could not start or even see a chat with Agent B.
- Model (unchanged server shape): the person writing first is the conversation's `customerKey`, the recipient is `agentKey`, whether the starter is a customer or an agent. Conversation id stays `c-<propertyId>-<starterKey>`, so contacting the same listing again REUSES the chat (history kept; the agent branch never clears messages).
- Agent screen (`contact-agent.js`, same page as `messages.html`) now shows two kinds of chat: INCOMING (`outgoing` falsy: I am `agentKey`; the other side is a customer or an agent) and OUTGOING (`outgoing:true`: I started it, I am `customerKey`, the other side is the recipient agent). `mySideOf(rc)` decides the side; `agentConvFromServer` maps message ownership (`from === mySide` -> mine), unread (`rc.unread[mySide]`), name and role ("Customer" / "Agent" / "Real Estate Agent"). Chat header status uses the role.
- Contact request for an agent: new branch in the boot code (`aReq`/`aConv`). Recipient comes from the shared catalogue via `markRealAgent` (not from the stored request). A request that resolves to the agent themselves creates nothing.
- Self-chat: `isSelfConversation` now knows incoming vs outgoing. Self chats found in saved browser storage are dropped on load. Server refuses both sides equal (Stage 2).
- Server (`server/server.js`) on creating a conversation: stores `customerRole` ('agent'|'customer', display only); the recipient must currently share a listing and, if `propertyId` is given, THAT listing; the conversation id must end with the starter's own key (nobody can pre-register an id another person's chat will use). Rejections are 400. Existing-conversation posts still use the 403 "not part of this conversation" rule.
- Tests changed because of the stricter server: `selfcontact.page` (`c-ok` -> `c-lst_e2e-u-someoneelse`), `sync.e2e` (sanitising test now uses the real agent/listing). New: `tests/agentchat.page.test.mjs` (24 checks, real server + real pages, in `npm test`).
- NOT done (Stage 4+): payment. `body.is-agent-chat` still hides ALL payment/report/block/property parts for every agent chat, including chats the agent started. Stage 4 must show the payment feature to the starter (`conv.outgoing`) only, and never to the recipient.
- Limits: no authentication on the test server (keys come from the client; `customerRole` is self-declared). Chats with sample (hardcoded) agents stay browser-local, as for customers. If the server is not reachable when the chat is opened, the chat stays local until a later load. A message the server refuses (e.g. the recipient stopped sharing the listing) stays `pending` and is retried every 3 s. Not verified in a real browser or on mobile layouts (jsdom only); Stage 7 covers that.

### Stage 4 - sender-side payment visibility (DONE)
- Rule: whoever STARTS a contact that needs payment sees the payment feature; the agent who RECEIVES it never does. Customers are unchanged (they always start and pay).
- Central rule (`core/ownership.js`): `Accoom.Ownership.canInitiatePayment(subject)` / `canInitiatePaymentForListingId(id)` = true only for state `other` (signed in, listing provably someone else's). False for guests, `own` and `unknown` (also a listing missing from the catalogue). Stage 5/6 must reuse these for property pages, cards and dashboards.
- Chat rule (`contact-agent.js` `canPayInChat(conv)`): not a self chat; customer screen -> true; agent screen -> only when `conv.outgoing` (the agent started it) AND the listing passes the central rule.
- Visibility: `renderPaymentState` toggles `body.is-agent-payer` for exactly that chat; `contact-agent.css` now hides the payment parts (Make Payment / Approve / Decline, composer Pay Now, property status, rate strip) with `.is-agent-chat:not(.is-agent-payer)`. Report / Block / View profile / properties dropdown stay hidden for every agent chat (they are not payment parts).
- Enforced in script on EVERY payment path, not just by hiding: `goToCheckout`, the payment dialog Proceed/Deposit, Approve, Decline, `applyBlockedState`, the `?paid=` return (`justPaidConv`) and `reconcilePaidProperties` (stale `accoom-paid-properties`). A forced/edited button on the recipient's page opens nothing; `messages.html?paid=<listing>` creates nothing.
- Transactions: purchase-log records (`accoom-purchases-log`) now also carry `payerKey` (the initiating user), `convId` (chat id, `c-<listing>-<starter>`) and `recipientKey`. Existing fields untouched. Payment state still lives only in the payer's browser, so nothing about it reaches the server conversation or the recipient (a test checks this).
- Bug found + fixed: pay / approve / decline changed the status in memory but never saved the conversation, so closing the page soon afterwards lost the status. Now `saveConversations()` runs after each. This also applies to customers (the fix is the same code path).
- Test: `tests/agentpay.page.test.mjs` (16 checks, real server + real pages, in `npm test`).
- NOT done: Stage 5 (own-listing payment on property pages / `payment.html?id=<own listing>` is not blocked yet), Stage 6 audit. Rate-this-seller strip is shown to the paying agent like a paying customer; reviews are keyed by the reviewer's account id, so an agent reviewer works, but check that this is wanted.
- Limits: still no real payment gateway or server-side payment state (demo wallet in the browser); the server has no authentication. Not verified in a real browser or on mobile layouts (jsdom only).

### Stage 5A - no payment UI on an agent's own listing (DONE)
- `assets/js/pages/property.js` (`gateOwnListingPayment`, right after `initPayment`): when `Accoom.Ownership.check(listing).isOwn`, the whole Price Details card (Total + Make Payment) is hidden/disabled through the existing `Ownership.gateContact`, the payment dialog is closed, and a capture-phase click guard stops the existing Make Payment / dialog confirm handlers if the button is revealed by editing the page. Re-runs through `Ownership.onChange`. Existing payment logic is untouched; `other`, `guest` and `unknown` states are unchanged.
- NOT done (Stage 5B): `payment.html?id=<own listing>` is not blocked yet; other own-listing payment surfaces (cards, dashboards) not audited.
- Test: `tests/stage5a.page.test.mjs` (10 checks, real server + real pages, in `npm test`). jsdom only; not checked in a real browser.
