/* ==========================================================================
   ACCOOM — Page Transitions
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize page transitions
   */
  Accoom.initTransitions = function (options) {
    var duration = (options && options.duration) || 300;

    // Smooth page transitions for internal links
    Accoom.delegate(document, 'click', 'a[href^="/"]', function (e) {
      var href = this.getAttribute('href');
      if (href === window.location.pathname) return;

      e.preventDefault();

      // Fade out
      document.documentElement.classList.add('is-transitioning');

      setTimeout(function () {
        window.location.href = href;
      }, duration);
    });

    // Fade in on page load
    Accoom.ready(function () {
      document.documentElement.classList.remove('is-transitioning');
      document.documentElement.classList.add('is-loaded');
    });
  };

})(window.Accoom);