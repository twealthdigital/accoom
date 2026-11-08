/* ==========================================================================
   ACCOOM — Sync with the test server (server/server.js, `npm run dev`)
   --------------------------------------------------------------------------
   Browsers keep everything in their own localStorage, so a customer in one
   browser can never see an agent's listing or answer from another. When the
   site is served by the test server (your laptop), this file shares:

     - the agent's PUBLIC listings (+ their photos/videos)  -> every browser
     - customer <-> agent chats (used by messages.js)

   When there is no server (Live Server, Vercel) every call fails quietly and
   the site behaves exactly as before.

   Accoom.Sync.available      true / false / null (not known yet)
   Accoom.Sync.userKey()      stable id of the signed-in person (from their email)
   Accoom.Sync.userName()     their display name
   Accoom.Sync.api(method, path, body)   -> Promise<json>
   Accoom.Sync.ready          Promise (first listings pull done; page scripts wait for it)
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var LISTINGS_KEY = 'accoom-agent-listings';
  var REMOTE_KEY = 'accoom-remote-listings';
  var MEDIA_KEY = 'accoom-sync-media';
  var instance = '';

  var Sync = Accoom.Sync = { available: null };

  /* ---------------------------------------------------------------- identity */
  function readUser() {
    try { return JSON.parse(window.localStorage.getItem('accoom-user')); } catch (e) { return null; }
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }

  // Derived from the email, so the same person gets the same id after the
  // account object is rewritten (onboarding, agent details...).
  Sync.userKey = function () {
    var u = readUser();
    if (!u) return '';
    var basis = String(u.email || u.name || u.fullName || '').trim().toLowerCase();
    return basis ? 'u-' + hash(basis) + hash(basis.split('').reverse().join('')) : '';
  };

  Sync.userName = function () {
    var u = readUser();
    if (!u) return '';
    return String(u.fullName || u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || '').replace(/[<>&"'`]/g, '').trim();
  };

  Sync.isAgent = function () { var u = readUser(); return !!(u && u.role === 'agent'); };

  /* --------------------------------------------------------------------- api */
  Sync.api = function (method, path, body, timeoutMs) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? window.setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    return fetch(path, {
      method: method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
      cache: 'no-store'
    }).then(function (res) {
      if (timer) window.clearTimeout(timer);
      var type = res.headers.get('content-type') || '';
      if (!res.ok || type.indexOf('application/json') === -1) throw new Error('Server answered ' + res.status);
      return res.json();
    }, function (err) {
      if (timer) window.clearTimeout(timer);
      throw err;
    });
  };

  /* ------------------------------------------------ listings: server -> here */
  function pullListings() {
    return Sync.api('GET', '/api/ping', undefined, 1500).then(function (ping) {
      instance = ping.instance || '';
      Sync.available = true;
      return Sync.api('GET', '/api/listings', undefined, 4000);
    }).then(function (r) {
      var json = JSON.stringify(Array.isArray(r.listings) ? r.listings : []);
      try { if (window.localStorage.getItem(REMOTE_KEY) !== json) window.localStorage.setItem(REMOTE_KEY, json); } catch (e) { /* full */ }
    }).catch(function () {
      if (Sync.available === null) Sync.available = false;
    });
  }

  Sync.ready = pullListings();

  // Page scripts start after the first pull, so the catalogue is complete on first paint.
  var nativeReady = Accoom.ready;
  if (typeof nativeReady === 'function') {
    Accoom.ready = function (fn) {
      return nativeReady.call(Accoom, function () { Sync.ready.then(function () { fn(); }); });
    };
  }

  /* ------------------------------------------------ listings: here -> server */
  var memo = {};   // blob:/idb: address -> uploaded address (this page)

  function mediaMap() {
    var m = null;
    try { m = JSON.parse(window.localStorage.getItem(MEDIA_KEY)); } catch (e) { /* none */ }
    if (!m || m.instance !== instance || !m.files) m = { instance: instance, files: {} };
    return m;
  }

  function sample(blob, start, len) {
    return blob.slice(start, Math.min(blob.size, start + len)).arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), h = 2166136261;
      for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619) >>> 0; }
      return h.toString(36);
    });
  }

  // Cheap fingerprint (size + type + start/middle/end bytes) so the same file is uploaded once.
  function fingerprint(blob) {
    return Promise.all([sample(blob, 0, 32768), sample(blob, Math.floor(blob.size / 2), 32768), sample(blob, Math.max(0, blob.size - 32768), 32768)])
      .then(function (p) { return blob.type + ':' + blob.size + ':' + p.join('-'); });
  }

  function upload(value) {
    if (typeof value !== 'string') return Promise.resolve(value);
    var isIdb = value.indexOf('idb:') === 0;
    if (!isIdb && value.indexOf('blob:') !== 0 && value.indexOf('data:') !== 0) return Promise.resolve(value);   // already a normal address
    if (memo[value]) return memo[value];

    var getBlob = (isIdb && Accoom.MediaStore)
      ? Accoom.MediaStore.get(value.slice(4))
      : fetch(value).then(function (r) { return r.blob(); });

    memo[value] = getBlob.then(function (blob) {
      return fingerprint(blob).then(function (fp) {
        var map = mediaMap();
        if (map.files[fp]) return map.files[fp];
        return fetch('/api/media?type=' + encodeURIComponent(blob.type || ''), { method: 'POST', body: blob })
          .then(function (res) { if (!res.ok) throw new Error('upload failed'); return res.json(); })
          .then(function (r) {
            var fresh = mediaMap();
            fresh.files[fp] = r.url;
            try { window.localStorage.setItem(MEDIA_KEY, JSON.stringify(fresh)); } catch (e) { /* full */ }
            return r.url;
          });
      });
    }).catch(function () { delete memo[value]; return null; });
    return memo[value];
  }

  // What customers get: final inclusive price only, no fee fields, no review history.
  function publicCopy(rec) {
    var copy = JSON.parse(JSON.stringify(rec));
    var finalPrice = Accoom.Pricing.finalPrice(rec);
    copy.price = finalPrice;
    copy.priceValue = finalPrice;
    copy.totalPayable = finalPrice;
    delete copy.serviceCharge; delete copy.agencyFee; delete copy.legalFee;
    delete copy.documentation; delete copy.documents;
    copy.approval = { state: 'approved', published: true, verified: !!(rec.approval && rec.approval.verified) };
    // Every agent used to share the stand-in id "local-agent"; on the server each agent's id is their own.
    copy.ownerId = Sync.userKey();
    copy.agentKey = Sync.userKey();
    return copy;
  }

  function withUploadedMedia(copy) {
    var jobs = [];
    ['cover', 'video'].forEach(function (f) {
      if (typeof copy[f] === 'string') jobs.push(upload(copy[f]).then(function (u) { copy[f] = u || ''; }));
    });
    ['images', 'videosAll', 'extraVideos'].forEach(function (f) {
      if (!Array.isArray(copy[f])) return;
      copy[f].forEach(function (v, i) { jobs.push(upload(v).then(function (u) { copy[f][i] = u || ''; })); });
    });
    return Promise.all(jobs).then(function () {
      ['images', 'videosAll', 'extraVideos'].forEach(function (f) {
        if (Array.isArray(copy[f])) copy[f] = copy[f].filter(Boolean);
      });
      return copy;
    });
  }

  var pushTimer = null, pushing = false, pushAgain = false;

  function pushListings() {
    var key = Sync.userKey();
    if (!key || !Sync.isAgent() || Sync.available === false) return Promise.resolve();
    if (!Accoom.ListingReview || !Accoom.Pricing) return Promise.resolve();
    if (pushing) { pushAgain = true; return Promise.resolve(); }
    pushing = true;

    var raw;
    try { raw = JSON.parse(window.localStorage.getItem(LISTINGS_KEY)); } catch (e) { raw = null; }
    var mine = Accoom.ListingReview.filterPublic(Array.isArray(raw) ? raw : []);

    return Promise.all(mine.map(function (rec) { return withUploadedMedia(publicCopy(rec)); }))
      .then(function (items) { return Sync.api('PUT', '/api/listings/' + encodeURIComponent(key), { listings: items }, 20000); })
      .catch(function () { /* server away: the next change tries again */ })
      .then(function () {
        pushing = false;
        if (pushAgain) { pushAgain = false; schedulePush(); }
      });
  }

  function schedulePush() {
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(pushListings, 1200);
  }

  // Any save of the agent's listings (status change, edit, new listing) goes to the server too.
  if (window.Storage && window.Storage.prototype) {
    var setItem = window.Storage.prototype.setItem;
    window.Storage.prototype.setItem = function (k) {
      var out = setItem.apply(this, arguments);
      if (k === LISTINGS_KEY && this === window.localStorage) schedulePush();
      return out;
    };
  }

  // Also when an agent opens any page (the server may have been started after they saved).
  Sync.ready.then(function () {
    if (Sync.available && Sync.isAgent()) {
      var raw; try { raw = window.localStorage.getItem(LISTINGS_KEY); } catch (e) { raw = null; }
      if (raw && raw.length > 2) schedulePush();
    }
  });
})(window.Accoom);
