/* ==========================================================================
   ACCOOM — Theme Module
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize theme toggle
   */
  Accoom.initThemeToggle = function (toggleEls, options) {
    var storageKey = (options && options.storageKey) || 'accoom-theme';
    var themeClass = (options && options.themeClass) || 'dark-mode';
    var defaultTheme = (options && options.defaultTheme) || 'light';

    var els = !toggleEls ? [] :
      (toggleEls.length !== undefined ? Array.prototype.slice.call(toggleEls) : [toggleEls]);

    function apply(theme) {
      var isDark = theme === 'dark';
      var root = document.documentElement;

      root.classList.add('theme-switching');
      root.classList.toggle(themeClass, isDark);
      els.forEach(function (el) {
        if (el.type === 'checkbox') {
          el.checked = isDark;
        } else {
          el.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        }
      });
      Accoom.dispatch(document, 'theme:change', { theme: theme });

      // Let the instant flip actually paint, then hand transitions
      // back so hovers, button ripples, etc. keep animating normally.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.remove('theme-switching');
        });
      });
    }

    function toggle() {
      var current = Accoom.getStorage(storageKey, defaultTheme);
      var next = current === 'dark' ? 'light' : 'dark';
      Accoom.setStorage(storageKey, next);
      apply(next);
    }

    // Get saved theme
    var saved = Accoom.getStorage(storageKey, defaultTheme);
    apply(saved);

    // Setup toggles
    els.forEach(function (el) {
      if (el.type === 'checkbox') {
        Accoom.on(el, 'change', function () {
          var theme = el.checked ? 'dark' : 'light';
          Accoom.setStorage(storageKey, theme);
          apply(theme);
        });
      } else {
        Accoom.on(el, 'click', function () {
          toggle();
        });
      }
    });

    return {
      apply: apply,
      toggle: toggle,
      get: function () {
        return Accoom.getStorage(storageKey, defaultTheme);
      }
    };
  };

})(window.Accoom);