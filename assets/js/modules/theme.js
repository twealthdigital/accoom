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
    var defaultTheme = (options && options.defaultTheme) || 'dark';

    var els = !toggleEls ? [] :
      (toggleEls.length !== undefined ? Array.prototype.slice.call(toggleEls) : [toggleEls]);

    function apply(theme) {
      var isDark = theme === 'dark';
      document.documentElement.classList.toggle(themeClass, isDark);
      els.forEach(function (el) {
        if (el.type === 'checkbox') {
          el.checked = isDark;
        }
      });
      Accoom.dispatch(document, 'theme:change', { theme: theme });
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
      Accoom.on(el, 'change', function () {
        var theme = el.checked ? 'dark' : 'light';
        Accoom.setStorage(storageKey, theme);
        apply(theme);
      });
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