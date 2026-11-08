# Accoom

Accommodation marketplace for Nigeria. Static frontend (HTML, CSS, vanilla JS). No framework, no backend yet.

## Run locally
Open the folder in VS Code and use **Live Server** on `index.html`, or:
```
npm start
```

## Test with several browsers (laptop = database)
```
npm run dev
```
Opens the site at `http://localhost:3000` and prints a Wi-Fi address for phones. The same server keeps the agents' public listings (+ photos/videos) and the customer <-> agent chats in `server/data/`, so an agent in one browser and a customer in another can talk. Use one address per browser (localhost and the Wi-Fi address keep separate logins). Testing only: no real accounts. Without it (Live Server / Vercel) the site works as before, chats with real agents just stay in one browser.

## Build for production (optional)
Makes a minified copy of the site in `dist/` (JS + CSS ~35% smaller, `main.css` bundled into one file instead of 16 chained `@import`s, and each page's ~17 script files merged into 2 hashed bundles). Source files are never changed.
```
npm install
npm run build
```
Deploy the `dist/` folder. The HTML does not change.

## Hosting config included
| File | Host |
|---|---|
| `_headers` | Netlify, Cloudflare Pages |
| `vercel.json` | Vercel |
| `.htaccess` | Apache / cPanel |

They add caching (HTML always revalidates, so deploys show up right away) and compression.

## Structure
- `assets/css/` base, components, utilities, pages
- `assets/js/` core, modules, pages, data, animations, vendor
- `partials/` shared header/footer. Each page has a small inline "early-partials" script in its `<head>`
  that paints them right away; `core/partials.js` finishes the wiring once scripts load. Cached per session.
  If you add a new page, copy that `<script>` block (marked `early-partials`) from any other page's `<head>`.

See `HANDOFF.md` for the latest performance/guest-state work and what is left.

## Still to do
- Compress images and videos (WebP/AVIF, correct sizes, lazy-load, `preload="none"` on videos)
- Real backend/API (replace mock data in `assets/js/data/`)
- Real auth and a payment gateway (Paystack or Flutterwave)
- Split the very large JS files (`listing-actions.js`, `home.js`, `my-listings.js`)
