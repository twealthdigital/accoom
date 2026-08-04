/* ==========================================================================
   ACCOOM — DOM Utilities
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Query selector with error handling
   */
  Accoom.$ = function (selector, context) {
    context = context || document;
    return context.querySelector(selector);
  };

  /**
   * Query selector all with error handling
   */
  Accoom.$$ = function (selector, context) {
    context = context || document;
    return Array.prototype.slice.call(context.querySelectorAll(selector));
  };

  /**
   * Check if element exists
   */
  Accoom.exists = function (selector, context) {
    return !!Accoom.$(selector, context);
  };

  /**
   * Add class with validation
   */
  Accoom.addClass = function (el, className) {
    if (!el) return;
    el.classList.add(className);
  };

  /**
   * Remove class with validation
   */
  Accoom.removeClass = function (el, className) {
    if (!el) return;
    el.classList.remove(className);
  };

  /**
   * Toggle class with validation
   */
  Accoom.toggleClass = function (el, className) {
    if (!el) return;
    el.classList.toggle(className);
  };

  /**
   * Check if element has class
   */
  Accoom.hasClass = function (el, className) {
    if (!el) return false;
    return el.classList.contains(className);
  };

  /**
   * Set attribute with validation
   */
  Accoom.setAttr = function (el, attr, value) {
    if (!el) return;
    el.setAttribute(attr, value);
  };

  /**
   * Get attribute with validation
   */
  Accoom.getAttr = function (el, attr) {
    if (!el) return null;
    return el.getAttribute(attr);
  };

  /**
   * Add event listener with validation
   */
  Accoom.on = function (el, event, handler, options) {
    if (!el) return;
    el.addEventListener(event, handler, options || false);
  };

  /**
   * Remove event listener with validation
   */
  Accoom.off = function (el, event, handler, options) {
    if (!el) return;
    el.removeEventListener(event, handler, options || false);
  };

  /**
   * Delegate event
   */
  Accoom.delegate = function (el, event, selector, handler) {
    Accoom.on(el, event, function (e) {
      var target = e.target.closest(selector);
      if (target) {
        handler.call(target, e);
      }
    });
  };

  /**
   * Check if element is in viewport
   */
  Accoom.isInViewport = function (el, offset) {
    if (!el) return false;
    offset = offset || 0;
    var rect = el.getBoundingClientRect();
    return rect.top <= (window.innerHeight + offset) &&
           rect.bottom >= 0 - offset &&
           rect.left <= (window.innerWidth + offset) &&
           rect.right >= 0 - offset;
  };

})(window.Accoom);