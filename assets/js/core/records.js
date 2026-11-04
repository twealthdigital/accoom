/* ==========================================================================
   ACCOOM — Records repository (Stage 1)
   --------------------------------------------------------------------------
   Small structured records (documents metadata, transactions, ACTDs,
   receipts, tenancies, notifications, audit events ...) live here.
   Large files live in Accoom.DocumentStore (IndexedDB), never in here.

   Every method returns a Promise so a future backend can replace the
   storage adapter (Accoom.Records.setAdapter) without touching any page.

   Accoom.Records.collection(name) -> { all, get, where, create, put, createUnique }
   Accoom.Records.audit(event)     -> append-only audit trail
   Accoom.Records.init()           -> runs migrations once (safe to call often)
   Accoom.Records.newId(prefix)    -> unique id (random, not just a timestamp)

   Honest limits: browser storage is per device and per browser, can be
   cleared by the user, and is not legally secure evidence retention.
   Two open tabs writing at the same moment can overwrite each other; a
   backend is needed to fix that.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var PREFIX = 'accoom-rec-';
  var META_KEY = 'accoom-rec-meta';
  var LISTINGS_KEY = 'accoom-agent-listings';

  // immutable: an existing record can never be replaced (new version = new record)
  // uniqueKey: field that must be unique (idempotency / duplicate prevention)
  var COLLECTIONS = {
    documents: {},
    analysisReports: {},
    verifications: {},
    transactions: { uniqueKey: 'idempotencyKey' },
    actds: { immutable: true },
    receipts: { immutable: true },
    agreements: {},
    tenancies: {},
    renewals: {},
    extensions: {},
    deliveryAcks: {},
    notifications: { uniqueKey: 'dedupeKey' },
    auditEvents: { immutable: true }
  };

  function fail(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  /* ---------------------------------------------------------------- ids */

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    var c = window.crypto || window.msCrypto;
    if (c && c.getRandomValues) c.getRandomValues(arr);
    else for (var i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    var out = '';
    for (var j = 0; j < arr.length; j++) out += ('0' + arr[j].toString(16)).slice(-2);
    return out;
  }

  // e.g. "txn_k2f9x3_9a1c04e7b2d65f81" : time part for sorting + 64 random bits
  function newId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + randomHex(8);
  }

  /* ---------------------------------------------------- storage adapter */

  function isQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 || e.code === 1014);
  }

  var localAdapter = {
    read: function (name) {
      return new Promise(function (resolve, reject) {
        var raw;
        try { raw = window.localStorage.getItem(PREFIX + name); }
        catch (e) { reject(fail('unavailable', 'Browser storage is not available.')); return; }
        if (raw === null || raw === '') { resolve([]); return; }
        try {
          var list = JSON.parse(raw);
          if (!Array.isArray(list)) throw new Error('not an array');
          resolve(list);
        } catch (e) {
          // Never treat corrupted data as "empty": the next write would erase it.
          reject(fail('corrupt', 'Stored "' + name + '" records could not be read.'));
        }
      });
    },
    write: function (name, list) {
      return new Promise(function (resolve, reject) {
        try { window.localStorage.setItem(PREFIX + name, JSON.stringify(list)); resolve(); }
        catch (e) {
          reject(isQuota(e) ? fail('quota', 'Browser storage is full. Free some space and try again.')
            : fail('unavailable', 'Could not save to browser storage.'));
        }
      });
    }
  };

  var adapter = localAdapter;
  function setAdapter(a) {
    if (!a || typeof a.read !== 'function' || typeof a.write !== 'function') throw fail('bad_adapter');
    adapter = a;
  }

  /* ------------------------------------------------------- collections */

  // Writes to one collection run one after another (read-modify-write safety
  // inside this tab).
  var queues = {};
  function enqueue(name, task) {
    var prev = queues[name] || Promise.resolve();
    var next = prev.then(task, task);
    queues[name] = next.then(function () {}, function () {});
    return next;
  }

  function collection(name) {
    var cfg = COLLECTIONS[name];
    if (!cfg) throw fail('unknown_collection', 'Unknown collection: ' + name);
    var prefix = (Accoom.Schemas && Accoom.Schemas.ID_PREFIX[name]) || name;

    function stamp(rec, isNew) {
      var now = new Date().toISOString();
      if (isNew && !rec.createdAt) rec.createdAt = now;
      rec.updatedAt = now;
      return rec;
    }

    return {
      all: function () { return adapter.read(name).then(clone); },

      get: function (id) {
        return adapter.read(name).then(function (list) {
          for (var i = 0; i < list.length; i++) if (list[i].id === id) return clone(list[i]);
          return null;
        });
      },

      where: function (predicate) {
        return adapter.read(name).then(function (list) { return clone(list.filter(predicate)); });
      },

      // New record only. Fails if the id already exists or a unique key clashes.
      create: function (record) {
        return enqueue(name, function () {
          return adapter.read(name).then(function (list) {
            var rec = stamp(clone(record), true);
            if (!rec.id) rec.id = newId(prefix);
            for (var i = 0; i < list.length; i++) {
              if (list[i].id === rec.id) throw fail('exists', 'A record with this id already exists.');
              if (cfg.uniqueKey && rec[cfg.uniqueKey] && list[i][cfg.uniqueKey] === rec[cfg.uniqueKey]) {
                throw fail('duplicate', 'A record with this ' + cfg.uniqueKey + ' already exists.');
              }
            }
            list.push(rec);
            return adapter.write(name, list).then(function () { return clone(rec); });
          });
        });
      },

      // Insert-or-return-existing, keyed by the collection's uniqueKey.
      // This is the idempotency primitive: repeating the same event twice
      // returns the first record instead of creating a second one.
      createUnique: function (record) {
        var key = cfg.uniqueKey;
        if (!key || !record[key]) return Promise.reject(fail('no_unique_key', 'This record has no ' + (key || 'unique key') + '.'));
        return enqueue(name, function () {
          return adapter.read(name).then(function (list) {
            for (var i = 0; i < list.length; i++) {
              if (list[i][key] === record[key]) return { created: false, record: clone(list[i]) };
            }
            var rec = stamp(clone(record), true);
            if (!rec.id) rec.id = newId(prefix);
            list.push(rec);
            return adapter.write(name, list).then(function () { return { created: true, record: clone(rec) }; });
          });
        });
      },

      // Insert or replace. Immutable collections refuse to replace.
      put: function (record) {
        if (!record || !record.id) return Promise.reject(fail('no_id', 'put() needs a record with an id.'));
        return enqueue(name, function () {
          return adapter.read(name).then(function (list) {
            var rec = clone(record);
            for (var i = 0; i < list.length; i++) {
              if (list[i].id === rec.id) {
                if (cfg.immutable) throw fail('immutable', 'Issued records cannot be changed. Create a new version instead.');
                rec.createdAt = list[i].createdAt || rec.createdAt;
                list[i] = stamp(rec, false);
                return adapter.write(name, list).then(function () { return clone(list[i]); });
              }
            }
            list.push(stamp(rec, true));
            return adapter.write(name, list).then(function () { return clone(rec); });
          });
        });
      }
    };
  }

  /* -------------------------------------------------------------- audit */

  // Append-only. Any action that changes a document, transaction, status
  // or delivery state should leave an event here.
  function audit(event) {
    var rec = Accoom.Schemas ? Accoom.Schemas.make.auditEvent(event) : Object.assign({ at: new Date().toISOString() }, event);
    return collection('auditEvents').create(rec);
  }

  /* --------------------------------------------------------- migrations */

  function readMeta() {
    try {
      var raw = window.localStorage.getItem(META_KEY);
      var m = raw ? JSON.parse(raw) : null;
      return m && typeof m === 'object' ? m : { schemaVersion: 0 };
    } catch (e) { return { schemaVersion: 0 }; }
  }

  function writeMeta(meta) {
    try { window.localStorage.setItem(META_KEY, JSON.stringify(meta)); return true; }
    catch (e) { return false; }
  }

  // True when every field of the original is still present and unchanged.
  function onlyAdds(before, after) {
    return Object.keys(before).every(function (k) {
      return JSON.stringify(before[k]) === JSON.stringify(after[k]);
    });
  }

  // v1: give every existing listing the new (additive) fields. Existing
  // fields, photos ("idb:" references) and statuses are never touched.
  function migrateListings() {
    var result = { migrated: 0, skipped: 0 };
    var raw;
    try { raw = window.localStorage.getItem(LISTINGS_KEY); } catch (e) { return result; }
    if (!raw || !Accoom.Schemas) return result;
    var list;
    try { list = JSON.parse(raw); } catch (e) { throw fail('corrupt', 'Saved listings could not be read; migration skipped.'); }
    if (!Array.isArray(list)) return result;

    var changed = false;
    var upgraded = list.map(function (rec) {
      var next = Accoom.Schemas.normalizeListing(rec);
      if (next === rec) { result.skipped++; return rec; }
      if (!onlyAdds(rec, next)) { result.skipped++; return rec; } // safety: abort for this record
      result.migrated++;
      changed = true;
      return next;
    });

    if (changed) {
      try { window.localStorage.setItem(LISTINGS_KEY, JSON.stringify(upgraded)); }
      catch (e) { throw isQuota(e) ? fail('quota', 'Not enough storage to upgrade saved listings.') : e; }
    }
    return result;
  }

  var MIGRATIONS = [
    { version: 1, name: 'listing-schema-v2', run: migrateListings }
  ];

  var initPromise = null;
  function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve, reject) {
      var meta = readMeta();
      var report = [];
      try {
        MIGRATIONS.forEach(function (m) {
          if (meta.schemaVersion >= m.version) return;
          var r = m.run();
          report.push({ name: m.name, result: r });
          meta.schemaVersion = m.version;
        });
      } catch (e) { initPromise = null; reject(e); return; }
      if (report.length) {
        meta.migratedAt = new Date().toISOString();
        writeMeta(meta);
        audit({ action: 'storage.migrated', entityType: 'storage', entityId: 'records', detail: { report: report, schemaVersion: meta.schemaVersion } })
          .then(function () { resolve({ schemaVersion: meta.schemaVersion, report: report }); },
            function () { resolve({ schemaVersion: meta.schemaVersion, report: report }); });
      } else {
        resolve({ schemaVersion: meta.schemaVersion, report: [] });
      }
    });
    return initPromise;
  }

  Accoom.Records = {
    COLLECTIONS: COLLECTIONS,
    newId: newId,
    collection: collection,
    audit: audit,
    init: init,
    setAdapter: setAdapter,
    _migrateListings: migrateListings // exposed for tests
  };
})(window.Accoom);
