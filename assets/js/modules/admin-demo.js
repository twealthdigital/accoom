/* ==========================================================================
   ACCOOM — Local demonstration admin mode (Stage 3)
   --------------------------------------------------------------------------
   ACCOOM has no backend, so there is NO real administrator login. This switch
   only reveals the review screen in this browser tab so the workflow can be
   demonstrated. It is not security:
     - anyone who knows the page address and the phrase can turn it on;
     - nothing here is checked by a server.
   The review screen is not linked from any agent or customer page. Real
   access control (accounts, roles, audit by a server) must come with a backend.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var KEY = 'accoom-demo-admin';
  var PHRASE = 'DEMO ADMIN';

  function isActive() {
    try { return window.sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function enter(phrase) {
    if (String(phrase || '').trim().toUpperCase() !== PHRASE) return false;
    try { window.sessionStorage.setItem(KEY, '1'); } catch (e) { return false; }
    return true;
  }
  function exit() { try { window.sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function actor() { return isActive() ? { role: 'admin', id: 'demo-admin' } : null; }

  Accoom.AdminDemo = { PHRASE: PHRASE, isActive: isActive, enter: enter, exit: exit, actor: actor };
})(window.Accoom);
