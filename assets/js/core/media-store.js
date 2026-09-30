/* ==========================================================================
   ACCOOM — Media Store (large videos)
   --------------------------------------------------------------------------
   localStorage only holds about 5MB, far too small for a video. Videos are
   kept in the browser's IndexedDB instead (hundreds of MB available), and a
   listing only stores a tiny reference to them: "idb:<key>".

   Any <video src="idb:..."> on the page is swapped for the real file
   automatically, so pages that show a listing's video need no extra code —
   they only have to load this file.

   Accoom.MediaStore.newKey()          -> new unique key
   Accoom.MediaStore.put(key, blob)    -> Promise (saves the file as-is, fast)
   Accoom.MediaStore.get(key)          -> Promise<Blob>
   Accoom.MediaStore.remove(key)       -> Promise
   Accoom.MediaStore.refOf(key)        -> "idb:<key>"
   Accoom.MediaStore.isRef(value)      -> true for "idb:..." strings
   Accoom.MediaStore.urlFor(ref)       -> Promise<blob: URL> to play it
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var DB_NAME = 'accoom-media';
  var STORE = 'videos';
  var PREFIX = 'idb:';
  var dbPromise = null;
  var urlCache = {};

  function isRef(v) { return typeof v === 'string' && v.indexOf(PREFIX) === 0; }
  function keyOf(ref) { return isRef(ref) ? ref.slice(PREFIX.length) : String(ref || ''); }
  function refOf(key) { return PREFIX + key; }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
      var req;
      try { req = window.indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Could not open media storage')); };
    });
    // A failed open shouldn't poison every later try.
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('Media storage failed')); };
      });
    });
  }

  function newKey() {
    return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function put(key, blob) { return run('readwrite', function (s) { return s.put(blob, key); }); }

  function get(key) {
    return run('readonly', function (s) { return s.get(key); }).then(function (blob) {
      if (!blob) throw new Error('Video not found');
      return blob;
    });
  }

  function remove(key) {
    var cached = urlCache[key];
    if (cached) { try { URL.revokeObjectURL(cached); } catch (e) { /* ignore */ } delete urlCache[key]; }
    return run('readwrite', function (s) { return s.delete(key); });
  }

  function urlFor(ref) {
    var key = keyOf(ref);
    if (urlCache[key]) return Promise.resolve(urlCache[key]);
    return get(key).then(function (blob) {
      if (!urlCache[key]) urlCache[key] = URL.createObjectURL(blob);
      return urlCache[key];
    });
  }

  // Swap a <video src="idb:..."> for the playable file.
  function resolveEl(el) {
    var ref = el.getAttribute('src') || '';
    if (!isRef(ref)) return Promise.resolve();
    return urlFor(ref).then(function (url) {
      if (el.getAttribute('src') === ref) el.setAttribute('src', url);
    }, function () { /* file missing: leave the element as it is */ });
  }

  // A page may call video.play() right after setting an idb: source —
  // hold the play until the real file is in place.
  if (window.HTMLMediaElement && window.HTMLMediaElement.prototype) {
    var nativePlay = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function () {
      var el = this;
      if (isRef(el.getAttribute && el.getAttribute('src'))) {
        return resolveEl(el).then(function () { return nativePlay.call(el); });
      }
      return nativePlay.call(el);
    };
  }

  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'VIDEO' && isRef(root.getAttribute('src'))) resolveEl(root);
    if (root.querySelectorAll) {
      var list = root.querySelectorAll('video[src^="idb:"]');
      for (var i = 0; i < list.length; i++) resolveEl(list[i]);
    }
  }

  function watch() {
    scan(document.documentElement);
    if (!window.MutationObserver) return;
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'attributes') scan(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) scan(r.addedNodes[j]);
      }
    }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['src']
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();

  Accoom.MediaStore = {
    newKey: newKey, put: put, get: get, remove: remove,
    refOf: refOf, isRef: isRef, urlFor: urlFor
  };
})(window.Accoom);