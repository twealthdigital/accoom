/* ==========================================================================
   ACCOOM — Hero Animations
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize hero animations
   */
  Accoom.initHeroAnimations = function (options) {
    var hero = document.querySelector('.hero');
    if (!hero) return;

    var elements = hero.querySelectorAll('[data-animate]');

    function animateElements() {
      var offset = (options && options.offset) || 100;

      elements.forEach(function (el) {
        if (Accoom.isInViewport(el, offset)) {
          var delay = parseInt(el.getAttribute('data-delay')) || 0;
          var duration = parseInt(el.getAttribute('data-duration')) || 400;

          setTimeout(function () {
            el.classList.add('is-visible');
          }, delay);
        }
      });
    }

    // Set initial state
    elements.forEach(function (el) {
      el.classList.add('is-hidden');
    });

    // Animate on load and scroll
    Accoom.ready(function () {
      setTimeout(animateElements, 100);
    });

    var scrollHandler = Accoom.throttle(animateElements, 100);
    Accoom.on(window, 'scroll', scrollHandler);
    Accoom.on(window, 'resize', scrollHandler);

    return {
      animate: animateElements
    };
  };

})(window.Accoom);