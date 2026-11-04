/* ==========================================================================
   ACCOOM — Document Store (Stage 1)
   --------------------------------------------------------------------------
   Files (PDF / JPG / PNG) are kept in their OWN IndexedDB database
   ("accoom-documents"). The existing "accoom-media" database used by
   MediaStore is never opened, changed or migrated here.

   Small metadata about each file lives in Accoom.Records ("documents").
   A document record keeps only a reference: "doc:<key>".

   Accoom.DocumentStore.validateFile(file)          -> { ok, code, message }
   Accoom.DocumentStore.add(input)                  -> Promise<record>
   Accoom.DocumentStore.replace(id, file, opts)     -> Promise<record>  (new version, old one kept)
   Accoom.DocumentStore.getFile(id)                 -> Promise<Blob>    (rejects code "missing_file")
   Accoom.DocumentStore.urlFor(id)                  -> Promise<blob: URL> (created lazily)
   Accoom.DocumentStore.listForListing(listingId, { includeHistory })
   Accoom.DocumentStore.history(groupId)
   Accoom.DocumentStore.setReviewStatus(id, status, opts)
   Accoom.DocumentStore.checkIntegrity(listingId)   -> finds records whose file is gone

   Errors carry .code: invalid_type, too_large, empty_file, type_mismatch,
   duplicate, quota, missing_file, not_found, bad_status, verification_required,
   unavailable.

   Honest limits: browser storage is per device and per browser, can be
   cleared, and is not legally secure evidence retention. Files are never
   deleted by this module, so history is preserved.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var DB_NAME = 'accoom-documents';
  var STORE = 'files';
  var REF_PREFIX = 'doc:';

  var MAX_SIZE = 10 * 1024 * 1024; // 10 MB per file
  var ALLOWED = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png']
  };
  var ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

  function fail(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function records() { return Accoom.Records.collection('documents'); }

  /* ---------------------------------------------------------- IndexedDB */

  var dbPromise = null;
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(fail('unavailable', 'This browser cannot store documents (IndexedDB unavailable).')); return; }
      var req;
      try { req = window.indexedDB.open(DB_NAME, 1); } catch (e) { reject(fail('unavailable', 'Document storage could not be opened.')); return; }
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(fail('unavailable', 'Document storage could not be opened.')); };
    });
    dbPromise.catch(function () { dbPromise = null; });
    return dbPromise;
  }

  function isQuota(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
  }

  function run(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx, req;
        try {
          tx = d.transaction(STORE, mode);
          req = fn(tx.objectStore(STORE));
        } catch (e) { reject(isQuota(e) ? fail('quota', 'Browser storage is full.') : fail('unavailable', 'Document storage failed.')); return; }
        tx.oncomplete = function () { resolve(req ? req.result : undefined); };
        tx.onabort = tx.onerror = function () {
          var err = tx.error;
          reject(isQuota(err) ? fail('quota', 'Browser storage is full. Remove old files or free space and try again.')
            : fail('unavailable', 'Document storage failed.'));
        };
      });
    });
  }

  function putFile(key, blob) { return run('readwrite', function (s) { return s.put(blob, key); }); }
  function getFileByKey(key) { return run('readonly', function (s) { return s.get(key); }); }
  function removeFile(key) { return run('readwrite', function (s) { return s.delete(key); }); } // internal rollback only

  function newKey() { return 'f' + Accoom.Records.newId('k').slice(2); }
  function keyOfRef(ref) { return String(ref || '').indexOf(REF_PREFIX) === 0 ? String(ref).slice(REF_PREFIX.length) : ''; }

  /* --------------------------------------------------------- validation */

  function extOf(name) {
    var m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // Fast checks that need no file reading.
  function validateFile(file) {
    if (!file || typeof file.size !== 'number') return { ok: false, code: 'empty_file', message: 'No file was selected.' };
    if (file.size === 0) return { ok: false, code: 'empty_file', message: 'This file is empty. Choose a different file.' };
    if (file.size > MAX_SIZE) {
      return { ok: false, code: 'too_large', message: 'This file is ' + formatSize(file.size) + '. The maximum is ' + formatSize(MAX_SIZE) + '.' };
    }
    var types = Object.keys(ALLOWED);
    var ext = extOf(file.name);
    var okType = types.indexOf(file.type) !== -1;
    var okExt = types.some(function (t) { return ALLOWED[t].indexOf(ext) !== -1; });
    if (!okType || !okExt) {
      return { ok: false, code: 'invalid_type', message: 'Only PDF, JPG, JPEG and PNG files are accepted.' };
    }
    if (ALLOWED[file.type].indexOf(ext) === -1) {
      return { ok: false, code: 'type_mismatch', message: 'The file name ends in .' + ext + ' but the file is ' + file.type + '. Re-save it in the correct format.' };
    }
    return { ok: true };
  }

  function formatSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function readBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(fail('unavailable', 'The file could not be read.')); };
      r.readAsArrayBuffer(blob);
    });
  }

  // Checks the first bytes so a renamed file (e.g. .exe renamed .pdf) is refused.
  function sniff(file) {
    return readBuffer(file.slice(0, 8)).then(function (buf) {
      var b = new Uint8Array(buf);
      var pdf = b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
      var png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
      var jpg = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
      var real = pdf ? 'application/pdf' : png ? 'image/png' : jpg ? 'image/jpeg' : '';
      if (real !== file.type) throw fail('type_mismatch', 'The contents of this file do not match its type. Upload the original PDF, JPG or PNG.');
    });
  }

  // SHA-256 fingerprint, used only to spot exact duplicate uploads.
  function fingerprint(file) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.resolve('');
    return readBuffer(file).then(function (buf) { return subtle.digest('SHA-256', buf); }).then(function (h) {
      var a = new Uint8Array(h), s = '';
      for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
      return s;
    }, function () { return ''; });
  }

  /* ---------------------------------------------------------- operations */

  function auditSafe(evt) { return Accoom.Records.audit(evt).catch(function () { /* audit failure must not hide the result */ }); }

  function prepare(file) {
    var v = validateFile(file);
    if (!v.ok) return Promise.reject(fail(v.code, v.message));
    return sniff(file).then(function () { return fingerprint(file); });
  }

  // Saves the file first, then its record. If the record cannot be saved the
  // file is removed again, so no orphan is left behind.
  function store(file, recordFields) {
    var key = newKey();
    return putFile(key, file).then(function () {
      var rec = Accoom.Schemas.make.document(Object.assign({}, recordFields, {
        originalName: file.name, mimeType: file.type, size: file.size,
        storageRef: REF_PREFIX + key
      }));
      return records().create(rec).catch(function (err) {
        return removeFile(key).then(function () { throw err; }, function () { throw err; });
      });
    });
  }

  function add(input) {
    input = input || {};
    var file = input.file;
    if (!input.listingId || !input.docType) return Promise.reject(fail('bad_input', 'A listing and a document type are required.'));
    return prepare(file).then(function (hash) {
      return records().all().then(function (list) {
        if (hash && !input.allowDuplicate) {
          var dup = list.filter(function (d) {
            return d.isCurrent && d.listingId === input.listingId && d.sha256 === hash;
          })[0];
          if (dup) throw fail('duplicate', 'This exact file was already uploaded for this listing as "' + dup.originalName + '".');
        }
        // Same document type again = a new version of the same group, not a clash.
        var sameType = list.filter(function (d) { return d.isCurrent && d.listingId === input.listingId && d.docType === input.docType && input.docType !== 'additional_supporting'; })[0];
        var version = sameType ? sameType.version + 1 : 1;
        var groupId = sameType ? sameType.groupId : Accoom.Records.newId('grp');
        return store(file, {
          groupId: groupId, version: version, isCurrent: true,
          propertyId: input.propertyId || input.listingId, listingId: input.listingId, ownerId: input.ownerId || '',
          docType: input.docType, sha256: hash, supersedes: sameType ? sameType.id : ''
        }).then(function (rec) {
          if (!sameType) return rec;
          return markSuperseded(sameType, rec, input.reason || 'Replaced by a newer upload').then(function () { return rec; });
        });
      });
    }).then(function (rec) {
      return auditSafe({ actorId: input.ownerId, actorRole: 'agent', action: 'document.uploaded', entityType: 'document', entityId: rec.id,
        detail: { listingId: rec.listingId, docType: rec.docType, version: rec.version, name: rec.originalName } })
        .then(function () { return rec; });
    });
  }

  function markSuperseded(oldRec, newRec, reason) {
    var updated = Object.assign({}, oldRec, {
      isCurrent: false, reviewStatus: 'superseded', supersededBy: newRec.id, replacedReason: reason || ''
    });
    return records().put(updated);
  }

  function replace(id, file, opts) {
    opts = opts || {};
    return records().get(id).then(function (old) {
      if (!old) throw fail('not_found', 'The document to replace was not found.');
      if (!old.isCurrent) throw fail('bad_status', 'Only the current version of a document can be replaced.');
      return prepare(file).then(function (hash) {
        if (hash && hash === old.sha256) throw fail('duplicate', 'This is the same file as the current version.');
        return store(file, {
          groupId: old.groupId, version: old.version + 1, isCurrent: true,
          propertyId: old.propertyId, listingId: old.listingId, ownerId: old.ownerId,
          docType: old.docType, sha256: hash, supersedes: old.id
        });
      }).then(function (rec) {
        return markSuperseded(old, rec, opts.reason || 'Replaced by the agent').then(function () {
          return auditSafe({ actorId: old.ownerId, actorRole: 'agent', action: 'document.replaced', entityType: 'document', entityId: rec.id,
            detail: { previousId: old.id, version: rec.version, reason: opts.reason || '' } });
        }).then(function () { return rec; });
      });
    });
  }

  function getFile(id) {
    return records().get(id).then(function (rec) {
      if (!rec) throw fail('not_found', 'Document record not found.');
      var key = keyOfRef(rec.storageRef);
      if (!key) throw fail('missing_file', 'This document has no stored file.');
      return getFileByKey(key).then(function (blob) {
        if (!blob) throw fail('missing_file', 'The file for "' + rec.originalName + '" is no longer stored in this browser. It may have been cleared. Please upload it again.');
        return blob;
      });
    });
  }

  // Object URLs are created only when asked for (lazy) and cached per document.
  var urlCache = {};
  function urlFor(id) {
    if (urlCache[id]) return Promise.resolve(urlCache[id]);
    return getFile(id).then(function (blob) {
      urlCache[id] = URL.createObjectURL(blob);
      return urlCache[id];
    });
  }
  function releaseUrl(id) {
    if (urlCache[id]) { try { URL.revokeObjectURL(urlCache[id]); } catch (e) { /* ignore */ } delete urlCache[id]; }
  }

  function listForListing(listingId, opts) {
    var all = opts && opts.includeHistory;
    return records().where(function (d) {
      return d.listingId === String(listingId) && (all || d.isCurrent);
    }).then(function (list) { return list.sort(function (a, b) { return a.uploadedAt < b.uploadedAt ? -1 : 1; }); });
  }

  function history(groupId) {
    return records().where(function (d) { return d.groupId === groupId; })
      .then(function (list) { return list.sort(function (a, b) { return a.version - b.version; }); });
  }

  // "verified" can only be set with evidence from an independent issuer check
  // or an administrator. Demo / local analysis can never produce it.
  function setReviewStatus(id, status, opts) {
    opts = opts || {};
    var S = Accoom.Schemas.ENUM;
    if (S.documentStatus.indexOf(status) === -1) return Promise.reject(fail('bad_status', 'Unknown document status: ' + status));
    if (status === 'superseded') return Promise.reject(fail('bad_status', '"superseded" is set automatically when a document is replaced.'));
    return records().get(id).then(function (rec) {
      if (!rec) throw fail('not_found', 'Document record not found.');
      var verification = rec.verification;
      if (status === 'verified') {
        var v = opts.verification || {};
        if (['independent_issuer', 'admin_manual'].indexOf(v.source) === -1 || !v.verifiedBy) {
          throw fail('verification_required', 'A document can only be marked VERIFIED after independent issuer confirmation or an administrator decision.');
        }
        verification = { source: v.source, verifiedBy: v.verifiedBy, verifiedAt: new Date().toISOString() };
      }
      if (status === 'rejected' && !opts.reason) throw fail('bad_status', 'A rejection needs a reason the agent can read.');
      var next = Object.assign({}, rec, {
        reviewStatus: status, verification: verification,
        rejectionReason: status === 'rejected' ? opts.reason : (status === 'needs_review' ? (opts.reason || rec.rejectionReason) : '')
      });
      return records().put(next).then(function (saved) {
        return auditSafe({ actorId: opts.actorId, actorRole: opts.actorRole || 'system', action: 'document.status', entityType: 'document', entityId: id,
          detail: { from: rec.reviewStatus, to: status, reason: opts.reason || '' } }).then(function () { return saved; });
      });
    });
  }

  // Looks for records whose file is gone (e.g. browser data cleared).
  function checkIntegrity(listingId) {
    return listForListing(listingId, { includeHistory: true }).then(function (list) {
      return Promise.all(list.map(function (rec) {
        var key = keyOfRef(rec.storageRef);
        return (key ? getFileByKey(key) : Promise.resolve(null)).then(function (blob) {
          return { id: rec.id, name: rec.originalName, present: !!blob };
        }, function () { return { id: rec.id, name: rec.originalName, present: false }; });
      }));
    });
  }

  function estimate() {
    if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate().then(function (e) { return { usage: e.usage || 0, quota: e.quota || 0 }; }, function () { return null; });
    return Promise.resolve(null);
  }

  Accoom.DocumentStore = {
    MAX_SIZE: MAX_SIZE,
    ACCEPT: ACCEPT_ATTR,
    formatSize: formatSize,
    validateFile: validateFile,
    add: add,
    replace: replace,
    getFile: getFile,
    urlFor: urlFor,
    releaseUrl: releaseUrl,
    listForListing: listForListing,
    history: history,
    setReviewStatus: setReviewStatus,
    checkIntegrity: checkIntegrity,
    estimate: estimate,
    _removeFileForTest: function (id) {
      return records().get(id).then(function (r) { return removeFile(keyOfRef(r.storageRef)); });
    }
  };
})(window.Accoom);
