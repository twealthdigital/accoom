/* ==========================================================================
   ACCOOM — Blocked Terms (editable list)
   --------------------------------------------------------------------------
   The list of words and phrases that are not allowed in listings. Nothing
   here is baked into the checking logic (modules/content-guard.js), so an
   admin screen can add or remove entries later without touching code.

   Until someone edits the list, the defaults below are used. The first edit
   copies the defaults into localStorage ('accoom-blocked-terms') and every
   change after that is saved there.

   Entry shape:
     term              the word or phrase (spaces/symbols in it are ignored)
     category          'social' | 'payment' | 'contact' | 'profanity' | 'other'
     wholeWord         true  = only when it stands alone ("pay me" is caught,
                               "payment" is not). Use for short or common
                               words. false = caught even inside other text
                               ("callmeonwhatsapp").
     ignoreNearDigits  true  = skip when a number sits right next to it
                               (so "3 x 3 bedroom" is not read as "X").

   Admin API (for the future admin page):
     Accoom.BlockedTerms.list()
     Accoom.BlockedTerms.add('term', 'social', { wholeWord: false })
     Accoom.BlockedTerms.remove('term')
     Accoom.BlockedTerms.reset()               back to the defaults
     Accoom.BlockedTerms.allowList()           words the foul-word library
     Accoom.BlockedTerms.allow('word')         must NOT flag (false alarms)
     Accoom.BlockedTerms.unallow('word')
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var STORE_KEY = 'accoom-blocked-terms';

  function T(term, category, wholeWord, ignoreNearDigits) {
    return { term: term, category: category, wholeWord: !!wholeWord, ignoreNearDigits: !!ignoreNearDigits };
  }

  var DEFAULT_TERMS = [
    /* ---- Social media & messaging apps (distinctive names: caught anywhere) ---- */
    T('whatsapp', 'social'), T('whatsap', 'social'), T('watsapp', 'social'), T('watsap', 'social'),
    T('facebook', 'social'), T('instagram', 'social'), T('instgram', 'social'),
    T('telegram', 'social'), T('snapchat', 'social'), T('tiktok', 'social'),
    T('twitter', 'social'), T('twiter', 'social'), T('youtube', 'social'),
    T('linkedin', 'social'), T('pinterest', 'social'), T('reddit', 'social'),
    T('twitch', 'social'), T('tumblr', 'social'), T('wechat', 'social'),
    T('messenger', 'social'), T('discord', 'social'), T('skype', 'social'),
    T('viber', 'social'), T('clubhouse', 'social'),
    /* ---- Short or everyday-looking names (only when they stand alone) ---- */
    T('x', 'social', true, true),
    T('ig', 'social', true), T('fb', 'social', true), T('tg', 'social', true),
    T('yt', 'social', true), T('insta', 'social', true), T('snap', 'social', true),
    T('threads', 'social', true), T('signal', 'social', true),
    T('x.com', 'social'),

    /* ---- Asking people to move off the platform ---- */
    T('dm me', 'contact', true), T('inbox me', 'contact', true),
    T('call me', 'contact', true), T('text me', 'contact', true),
    T('hit me up', 'contact', true), T('reach me on', 'contact', true),
    T('contact me on', 'contact', true), T('message me on', 'contact', true),
    T('chat me on', 'contact', true), T('my number', 'contact', true),
    T('my email', 'contact', true), T('my whatsapp', 'contact', true),
    T('off platform', 'contact', true), T('outside the app', 'contact', true),
    T('outside accoom', 'contact', true),

    /* ---- Payment terms (all payments must happen on ACCOOM) ---- */
    T('paypal', 'payment'), T('cashapp', 'payment'), T('venmo', 'payment'),
    T('zelle', 'payment'), T('moneygram', 'payment'), T('western union', 'payment'),
    T('bitcoin', 'payment'), T('ethereum', 'payment'), T('usdt', 'payment'),
    T('crypto', 'payment', true), T('btc', 'payment', true),
    T('opay', 'payment', true), T('palmpay', 'payment'), T('moniepoint', 'payment'),
    T('kuda', 'payment', true),
    T('account number', 'payment'), T('account no', 'payment', true),
    T('acct no', 'payment', true), T('acct number', 'payment'),
    T('bank transfer', 'payment'), T('wire transfer', 'payment'),
    T('transfer the money', 'payment'), T('transfer to my', 'payment'),
    T('send money', 'payment'), T('send the money', 'payment'),
    T('pay directly', 'payment'), T('pay me', 'payment', true),
    T('pay cash', 'payment'), T('pay offline', 'payment'), T('pay outside', 'payment'),
    T('cash only', 'payment'), T('cash payment', 'payment'),
    T('pay into my', 'payment'), T('deposit into', 'payment'),
    T('gtbank', 'payment'), T('gtb', 'payment', true), T('uba', 'payment', true),
    T('zenith bank', 'payment'), T('access bank', 'payment'), T('first bank', 'payment'),
    T('sterling bank', 'payment'), T('fidelity bank', 'payment'), T('stanbic', 'payment')
  ];

  var version = 0;

  function keyOf(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function copy(e) { return { term: e.term, category: e.category, wholeWord: !!e.wholeWord, ignoreNearDigits: !!e.ignoreNearDigits }; }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (d && Array.isArray(d.terms)) return d;
    } catch (e) { /* fall back to defaults */ }
    return null;
  }

  function writeStore(d) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { return false; }
    version++;
    return true;
  }

  // Working copy: the saved list if an admin has edited it, otherwise the defaults.
  function current() {
    var s = readStore();
    if (s) return { terms: s.terms.map(copy), allow: Array.isArray(s.allow) ? s.allow.slice() : [] };
    return { terms: DEFAULT_TERMS.map(copy), allow: [] };
  }

  var api = {
    list: function () { return current().terms; },

    add: function (term, category, opts) {
      var key = keyOf(term);
      if (!key) return false;
      var d = current();
      var entry = {
        term: String(term).trim(),
        category: category || 'other',
        wholeWord: !!(opts && opts.wholeWord),
        ignoreNearDigits: !!(opts && opts.ignoreNearDigits)
      };
      var replaced = false;
      d.terms = d.terms.map(function (t) {
        if (keyOf(t.term) === key) { replaced = true; return entry; }
        return t;
      });
      if (!replaced) d.terms.push(entry);
      return writeStore(d);
    },

    remove: function (term) {
      var key = keyOf(term);
      var d = current();
      d.terms = d.terms.filter(function (t) { return keyOf(t.term) !== key; });
      return writeStore(d);
    },

    reset: function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { return false; }
      version++;
      return true;
    },

    allowList: function () { return current().allow; },

    allow: function (word) {
      var key = keyOf(word);
      if (!key) return false;
      var d = current();
      if (d.allow.map(keyOf).indexOf(key) === -1) d.allow.push(String(word).trim());
      return writeStore(d);
    },

    unallow: function (word) {
      var key = keyOf(word);
      var d = current();
      d.allow = d.allow.filter(function (w) { return keyOf(w) !== key; });
      return writeStore(d);
    },

    // Bumps whenever the list changes, so the checker knows to rebuild.
    version: function () { return version; }
  };

  // An admin editing the list in another tab should apply here immediately.
  window.addEventListener('storage', function (e) { if (e.key === STORE_KEY) version++; });

  Accoom.BlockedTerms = api;
})(window.Accoom);