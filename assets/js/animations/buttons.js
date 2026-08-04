/* ==========================================================================
   ACCOOM — Button Animations
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize button hover animations
   */
  Accoom.initButtonAnimations = function (selector) {
    selector = selector || '.btn';

    var buttons = Accoom.$$(selector);

    buttons.forEach(function (btn) {
      // Ripple effect on click
      Accoom.on(btn, 'click', function (e) {
        var ripple = document.createElement('span');
        ripple.className = 'btn-ripple';
        var rect = this.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        var x = e.clientX - rect.left - size / 2;
        var y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';

        this.appendChild(ripple);

        // Remove after animation
        setTimeout(function () {
          ripple.remove();
        }, 600);
      });
    });
  };

})(window.Accoom);