/* ==========================================================================
   ACCOOM — Load Page
   ========================================================================== */

(function () {
  'use strict';

  var loadPage = document.getElementById('load-page');

  if (loadPage) {
    // Hide load page after 3 seconds
    setTimeout(function () {
      loadPage.classList.add('is-hidden');

      // Remove from DOM after transition
      setTimeout(function () {
        loadPage.style.display = 'none';
        document.documentElement.classList.remove('is-loading');
      }, 500);
    }, 3000);

    // Fallback: hide if user interacts early
    document.addEventListener('click', function () {
      if (!loadPage.classList.contains('is-hidden')) {
        loadPage.classList.add('is-hidden');
        setTimeout(function () {
          loadPage.style.display = 'none';
          document.documentElement.classList.remove('is-loading');
        }, 500);
      }
    }, { once: true });
  }

})();