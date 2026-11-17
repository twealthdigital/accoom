/* ==========================================================================
   ACCOOM — Saved properties store
   One small module that every "save" button and every Saved Properties page
   goes through, so they can never disagree.

     Accoom.SavedProperties.list()        -> array of saved property objects
     Accoom.SavedProperties.has(id)       -> true / false
     Accoom.SavedProperties.toggle(prop)  -> true if now saved, false if removed
     Accoom.SavedProperties.remove(id)

   Where it is kept:
     customers  'accoom_saved_properties'            (the key they already use)
     agents     'accoom_agent_saved_properties:<userKey>'
   Agents get their own list, keyed by their account, so an agent's saves never
   show up in a customer's list (or another agent's) in the same browser.
   Swap read()/write() for API calls once there is a backend.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var CUSTOMER_KEY = 'accoom_saved_properties';
  var AGENT_KEY_PREFIX = 'accoom_agent_saved_properties:';

  function currentUser() {
    try { return JSON.parse(window.localStorage.getItem('accoom-user')); } catch (e) { return null; }
  }

  function storageKey() {
    var user = currentUser();
    if (user && user.role === 'agent') {
      var who = (Accoom.Sync && Accoom.Sync.userKey && Accoom.Sync.userKey()) || '';
      return AGENT_KEY_PREFIX + who;
    }
    return CUSTOMER_KEY;
  }

  function read() {
    try {
      var list = JSON.parse(window.localStorage.getItem(storageKey()) || '[]');
      return Array.isArray(list) ? list.filter(function (p) { return p && p.id != null; }) : [];
    } catch (e) { return []; }
  }

  function write(list) {
    try { window.localStorage.setItem(storageKey(), JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  function same(a, b) { return String(a) === String(b); }

  var SavedProperties = Accoom.SavedProperties = {};

  SavedProperties.key = storageKey;
  SavedProperties.list = read;

  SavedProperties.has = function (id) {
    return read().some(function (p) { return same(p.id, id); });
  };

  SavedProperties.remove = function (id) {
    return write(read().filter(function (p) { return !same(p.id, id); }));
  };

  SavedProperties.toggle = function (property) {
    if (!property || property.id == null) return false;
    var list = read();
    var exists = list.some(function (p) { return same(p.id, property.id); });
    if (exists) {
      write(list.filter(function (p) { return !same(p.id, property.id); }));
      return false;
    }
    list.push(property);
    return write(list);
  };

})(window.Accoom);
