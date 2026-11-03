/* ==========================================================================
   ACCOOM — Content Guard loader
   Loads the blocked-terms list, the Obscenity library (~51 KB) and the
   Content Guard AFTER the page is up, instead of blocking first paint.
   Order is kept (obscenity -> blocked-terms -> content-guard). It starts as
   soon as the browser is idle, or at once if the person touches the page
   first, so it is ready long before anyone can type and send. Callers
   already check `Accoom.ContentGuard` exists before using it.
   ========================================================================== */
(function () {
  'use strict';
  var started = false;
  var FILES = [
    'assets/js/vendor/obscenity.bundle.js',
    'assets/js/data/blocked-terms.js',
    'assets/js/modules/content-guard.js'
  ];

  function start() {
    if (started) return;
    started = true;
    ['focusin', 'input', 'pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
      document.removeEventListener(ev, start, true);
    });
    FILES.forEach(function (src) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false; // keep execution order
      document.head.appendChild(s);
    });
  }

  ['focusin', 'input', 'pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, start, { capture: true, passive: true });
  });

  function whenIdle() {
    if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1500 });
    else window.setTimeout(start, 600);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle);
})();
