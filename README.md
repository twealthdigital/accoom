# Accoom

Accommodation marketplace for Nigeria. Static frontend (HTML, CSS, vanilla JS). No framework, no backend yet.

## Run locally
Open the folder in VS Code and use **Live Server** on `index.html`, or:
```
npm start
```

## Build for production (optional)
Makes a minified copy of the site in `dist/` (JS + CSS are ~40% smaller). Source files are never changed.
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
- `partials/` shared header/footer (cached per session by `core/partials.js`)

## Still to do
- Compress images and videos (WebP/AVIF, correct sizes, lazy-load, `preload="none"` on videos)
- Real backend/API (replace mock data in `assets/js/data/`)
- Real auth and a payment gateway (Paystack or Flutterwave)
- Rename `filter-accomodation.html` to `filter-accommodation.html` and update links
- Split the very large JS files (`contact-agent.js`, `listing-actions.js`, `home.js`, `my-listings.js`)
