/* ==========================================================================
   ACCOOM — Event Utilities
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Debounce function for performance
   */
  Accoom.debounce = function (fn, delay) {
    var timeout;
    return function () {
      var args = arguments;
      var context = this;
      clearTimeout(timeout);
      timeout = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  };

  /**
   * Throttle function for performance
   */
  Accoom.throttle = function (fn, limit) {
    var inThrottle;
    return function () {
      var args = arguments;
      var context = this;
      if (!inThrottle) {
        fn.apply(context, args);
        inThrottle = true;
        setTimeout(function () {
          inThrottle = false;
        }, limit);
      }
    };
  };

  /**
   * Dispatch custom event
   */
  Accoom.dispatch = function (el, eventName, detail) {
    if (!el) return;
    var event = new CustomEvent(eventName, {
      bubbles: true,
      cancelable: true,
      detail: detail || {}
    });
    el.dispatchEvent(event);
  };

  /**
   * Trigger once
   */
  Accoom.once = function (el, event, handler) {
    if (!el) return;
    var wrapper = function (e) {
      handler(e);
      Accoom.off(el, event, wrapper);
    };
    Accoom.on(el, event, wrapper);
  };

  /**
   * DOM ready
   */
  Accoom.ready = function (fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  };

})(window.Accoom);