/* ==========================================================================
   ACCOOM — Media Store (photos + videos)
   --------------------------------------------------------------------------
   localStorage only holds about 5MB in total — far too small for listing
   photos and videos. Every photo and video is kept in the browser's
   IndexedDB instead (hundreds of MB available). A listing only stores a
   tiny reference to each file: "idb:<key>".

   Pages never see those references. Before a page starts, the files that
   the saved listings use are loaded and any reference read from
   'accoom-agent-listings' / 'accoom-active-listing' is handed over as a
   normal, playable/displayable address. When something is saved back, the
   addresses are turned into references again. So dashboards, the property
   popup, the buyer property page and the edit form all just work.

   Accoom.MediaStore.newKey()            -> new unique key
   Accoom.MediaStore.put(key, blob)      -> Promise (saves the file as-is)
   Accoom.MediaStore.get(key)            -> Promise<Blob>
   Accoom.MediaStore.remove(key)         -> Promise
   Accoom.MediaStore.refOf(key)          -> "idb:<key>"
   Accoom.MediaStore.isRef(value)        -> true for "idb:..." strings
   Accoom.MediaStore.urlFor(ref)         -> Promise<blob: URL>
   Accoom.MediaStore.fromDataUrl(data)   -> Promise<ref> (moves an old base64 file over)
   Accoom.MediaStore.migrateLegacy()     -> Promise (moves old base64 photos/videos
                                            of saved listings out of localStorage)
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var DB_NAME = 'accoom-media';
  var STORE = 'videos';           // holds photos too; name kept so existing videos still work
  var PREFIX = 'idb:';
  var LISTINGS_KEY = 'accoom-agent-listings';
  var WATCHED = [LISTINGS_KEY, 'accoom-active-listing'];
  var REF_RE = /idb:[A-Za-z0-9_-]+/g;
  var BLOB_RE = /blob:[^"\\\s]+/g;

  var dbPromise = null;
  var urlCache = {};   // key -> blob: URL
  var refToUrl = {};   // "idb:key" -> blob: URL
  var urlToRef = {};   // blob: URL -> "idb:key"

  function isRef(v) { return typeof v === 'string' && v.indexOf(PREFIX) === 0; }
  function keyOf(ref) { return isRef(ref) ? ref.slice(PREFIX.length) : String(ref || ''); }
  function refOf(key) { return PREFIX + key; }

  /* ---------------------------------------------------------------- IndexedDB */

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
      if (!blob) throw new Error('File not found');
      return blob;
    });
  }

  function register(key, blob) {
    if (urlCache[key]) return urlCache[key];
    var url = URL.createObjectURL(blob);
    urlCache[key] = url;
    refToUrl[refOf(key)] = url;
    urlToRef[url] = refOf(key);
    return url;
  }

  function remove(key) {
    var cached = urlCache[key];
    if (cached) {
      try { URL.revokeObjectURL(cached); } catch (e) { /* ignore */ }
      delete urlToRef[cached];
      delete refToUrl[refOf(key)];
      delete urlCache[key];
    }
    return run('readwrite', function (s) { return s.delete(key); });
  }

  function urlFor(ref) {
    var key = keyOf(ref);
    if (urlCache[key]) return Promise.resolve(urlCache[key]);
    return get(key).then(function (blob) { return register(key, blob); });
  }

  /* --------------------------------------------- old base64 files -> IndexedDB */

  function dataUrlToBlob(d) {
    var comma = d.indexOf(',');
    var meta = d.slice(5, comma);
    var body = d.slice(comma + 1);
    var mime = meta.split(';')[0] || 'application/octet-stream';
    var bin = /;base64$/.test(meta) ? atob(body) : decodeURIComponent(body);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function fromDataUrl(d) {
    var key = newKey();
    return put(key, dataUrlToBlob(d)).then(function () { return refOf(key); });
  }

  function isDataMedia(v) {
    return typeof v === 'string' && (v.indexOf('data:image/') === 0 || v.indexOf('data:video/') === 0);
  }

  var storageGet = window.Storage && window.Storage.prototype ? window.Storage.prototype.getItem : null;
  var storageSet = window.Storage && window.Storage.prototype ? window.Storage.prototype.setItem : null;

  // Old listings kept their photos inside localStorage as base64 text. That is
  // what filled the 5MB and caused "too big to save". Move them out once.
  function migrateLegacy() {
    var raw;
    try { raw = storageGet.call(window.localStorage, LISTINGS_KEY); } catch (e) { return Promise.resolve(false); }
    if (!raw || raw.indexOf('"data:') === -1) return Promise.resolve(false);
    var list;
    try { list = JSON.parse(raw); } catch (e) { return Promise.resolve(false); }
    if (!Array.isArray(list)) return Promise.resolve(false);

    var cache = {};
    function conv(v) {
      if (!isDataMedia(v)) return Promise.resolve(v);
      if (!cache[v]) cache[v] = fromDataUrl(v);
      return cache[v].then(null, function () { return v; }); // if one fails, keep it as it was
    }
    var jobs = [];
    list.forEach(function (rec) {
      if (!rec || typeof rec !== 'object') return;
      ['cover', 'video'].forEach(function (f) {
        if (typeof rec[f] === 'string') jobs.push(conv(rec[f]).then(function (r) { rec[f] = r; }));
      });
      ['images', 'videosAll', 'extraVideos'].forEach(function (f) {
        if (Array.isArray(rec[f])) rec[f].forEach(function (v, i) {
          jobs.push(conv(v).then(function (r) { rec[f][i] = r; }));
        });
      });
    });
    return Promise.all(jobs).then(function () {
      storageSet.call(window.localStorage, LISTINGS_KEY, JSON.stringify(list));
      return true;
    });
  }

  /* ------------------------ hand pages real addresses, keep references stored */

  if (storageGet && storageSet) {
    window.Storage.prototype.getItem = function (k) {
      var v = storageGet.apply(this, arguments);
      if (typeof v === 'string' && WATCHED.indexOf(k) !== -1 && v.indexOf(PREFIX) !== -1) {
        v = v.replace(REF_RE, function (m) { return refToUrl[m] || m; });
      }
      return v;
    };
    window.Storage.prototype.setItem = function (k, v) {
      if (typeof v === 'string' && WATCHED.indexOf(k) !== -1 && v.indexOf('blob:') !== -1) {
        v = v.replace(BLOB_RE, function (m) { return urlToRef[m] || m; });
      }
      return storageSet.call(this, k, v);
    };
  }

  function referencedKeys() {
    var found = {};
    WATCHED.forEach(function (k) {
      var raw;
      try { raw = storageGet.call(window.localStorage, k); } catch (e) { raw = null; }
      var m = raw && raw.match(REF_RE);
      if (m) m.forEach(function (r) { found[r] = true; });
    });
    return Object.keys(found);
  }

  var hydrated = false;
  var hydration = Promise.resolve();
  var pending = storageGet ? referencedKeys() : [];

  if (!pending.length) {
    hydrated = true;                         // nothing stored in IndexedDB: nothing to wait for
  } else {
    hydration = Promise.race([
      open().then(function (db) {
        return new Promise(function (resolve) {
          var tx = db.transaction(STORE, 'readonly');
          var store = tx.objectStore(STORE);
          pending.forEach(function (ref) {
            var req = store.get(keyOf(ref));
            req.onsuccess = function () { if (req.result) register(keyOf(ref), req.result); };
          });
          tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
        });
      }),
      new Promise(function (resolve) { window.setTimeout(resolve, 2500); })  // never hold a page hostage
    ]).then(null, function () { /* carry on without */ }).then(function () { hydrated = true; });
  }

  // Page scripts start after the files above are ready.
  var nativeReady = Accoom.ready;
  if (typeof nativeReady === 'function') {
    Accoom.ready = function (fn) {
      if (hydrated) return nativeReady.call(Accoom, fn);
      return nativeReady.call(Accoom, function () { hydration.then(function () { fn(); }); });
    };
  }

  /* --------------------------------- <video src="idb:..."> safety net (older data) */

  function resolveEl(el) {
    var ref = el.getAttribute('src') || '';
    if (!isRef(ref)) return Promise.resolve();
    return urlFor(ref).then(function (url) {
      if (el.getAttribute('src') === ref) el.setAttribute('src', url);
    }, function () { /* file missing: leave as is */ });
  }

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
    if ((root.tagName === 'VIDEO' || root.tagName === 'IMG') && isRef(root.getAttribute('src'))) resolveEl(root);
    if (root.querySelectorAll) {
      var list = root.querySelectorAll('video[src^="idb:"], img[src^="idb:"]');
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
    refOf: refOf, isRef: isRef, urlFor: urlFor,
    fromDataUrl: fromDataUrl, migrateLegacy: migrateLegacy
  };
})(window.Accoom);