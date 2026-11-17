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

  /**
   * True once a real user session exists in storage.
   * Every guest-gating check site-wide reads through this one function.
   */
  Accoom.isLoggedIn = function () {
    return !!Accoom.getStorage('accoom-user', null);
  };

})(window.Accoom);
/* ==========================================================================
   Profile photo — one place for every page.
   The photo lives on the signed-in user (accoom-user.avatar). It is shrunk on
   upload so it can travel with an agent's listings and show to other people.
   ========================================================================== */
(function (Accoom) {
  'use strict';

  var DEFAULT = 'assets/images/agent-images/agenticonimg.webp';
  var Avatar = Accoom.Avatar = { DEFAULT: DEFAULT };

  // Read an image file, shrink it to a small square-ish JPEG, hand back a data URL.
  Avatar.fromFile = function (file, done) {
    var reader = new FileReader();
    reader.onerror = function () { done(''); };
    reader.onload = function () {
      var raw = String(reader.result || '');
      var img = new Image();
      img.onerror = function () { done(raw); };
      img.onload = function () {
        try {
          var max = 256, w = img.width, h = img.height;
          var s = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          done(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { done(raw); }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  };

  Avatar.mine = function () {
    var u = Accoom.getStorage('accoom-user', null);
    return (u && u.avatar) || '';
  };

  // The photo to show for a seller: my own photo when it is me, otherwise what came with the listing.
  Avatar.forSeller = function (agentKey, ownerId, carried) {
    var key = Accoom.Sync && Accoom.Sync.userKey ? Accoom.Sync.userKey() : '';
    var mine = Avatar.mine();
    if (mine && ((agentKey && key && String(agentKey) === key) || (ownerId && key && String(ownerId) === key))) return mine;
    return carried || '';
  };

  // Called after the photo is saved: refresh listings the server holds so other people see it too.
  Avatar.changed = function () {
    try { if (Accoom.Sync && Accoom.Sync.pushListingsSoon) Accoom.Sync.pushListingsSoon(); } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent('accoom-avatar-changed')); } catch (e) { /* ignore */ }
  };
})(window.Accoom);
