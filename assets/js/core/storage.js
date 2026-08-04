/* ==========================================================================
   ACCOOM — Storage Utilities
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Set item in localStorage with validation
   */
  Accoom.setStorage = function (key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage set failed:', e);
      return false;
    }
  };

  /**
   * Get item from localStorage with validation
   */
  Accoom.getStorage = function (key, fallback) {
    try {
      var value = localStorage.getItem(key);
      if (value === null) return fallback;
      return JSON.parse(value);
    } catch (e) {
      console.warn('Storage get failed:', e);
      return fallback;
    }
  };

  /**
   * Remove item from localStorage
   */
  Accoom.removeStorage = function (key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Storage remove failed:', e);
      return false;
    }
  };

  /**
   * Clear all localStorage
   */
  Accoom.clearStorage = function () {
    try {
      localStorage.clear();
      return true;
    } catch (e) {
      console.warn('Storage clear failed:', e);
      return false;
    }
  };

})(window.Accoom);