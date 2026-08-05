/* ==========================================================================
   ACCOOM — Load Page
   ========================================================================== */

(function () {
  'use strict';

  var loadPage = document.getElementById('load-page');

if (loadPage) {
    function goHome() {
      window.location.href = 'home.html';
    }

    // Hide load page after 3 seconds, then move to home.html
    setTimeout(function () {
      loadPage.classList.add('is-hidden');

      // Navigate after the fade-out transition finishes
      setTimeout(function () {
        goHome();
      }, 500);
    }, 3000);

    // Fallback: skip ahead if user interacts early
    document.addEventListener('click', function () {
      if (!loadPage.classList.contains('is-hidden')) {
        loadPage.classList.add('is-hidden');
        setTimeout(goHome, 500);
      }
    }, { once: true });
  }
})();