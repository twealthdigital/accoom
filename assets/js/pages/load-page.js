/* ==========================================================================
   ACCOOM — Load Page (Splash Screen)

   Short branded splash, then straight to home.html.
   - Shows for MIN_MS only (was a fixed 3s + 0.5s fade).
   - Tap/click anywhere skips it immediately.
   - Shown once per browser session; repeat visits go straight to home.
   - Uses location.replace so the Back button never lands on the splash again.
   ========================================================================== */

(function () {
  'use strict';

  var loadPage = document.getElementById('load-page');
  if (!loadPage) return;

  var HOME_URL = 'home.html';
  var SEEN_KEY = 'accoom-splash-seen';
  var MIN_MS = 900;   // how long the splash stays visible
  var FADE_MS = 300;  // must match the fade-out time in load-page.css
  var left = false;

  function goHome() {
    window.location.replace(HOME_URL);
  }

  // Already saw the splash in this session: skip it completely.
  try {
    if (window.sessionStorage.getItem(SEEN_KEY)) {
      goHome();
      return;
    }
  } catch (e) { /* storage blocked: just show the splash */ }

  function leave() {
    if (left) return;
    left = true;

    try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* ignore */ }

    loadPage.classList.add('is-hidden');
    setTimeout(goHome, FADE_MS);
  }

  setTimeout(leave, MIN_MS);
  document.addEventListener('click', leave, { once: true });
  document.addEventListener('touchstart', leave, { once: true, passive: true });
})();
