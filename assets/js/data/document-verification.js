/* ==========================================================================
   ACCOOM — Document Intelligence (Stage 3)
   --------------------------------------------------------------------------
   Analyses the documents of a listing and prepares them for a human reviewer.

   HONESTY RULES (enforced in code, covered by tests):
   - ACCOOM has no backend yet, so the built-in providers are a DEMO. They do
     not read the document. Extracted values are SAMPLE values, every one of
     them is labelled "simulated", and the report says "DEMO ANALYSIS".
   - Demo analysis can NEVER set a document to VERIFIED. VERIFIED needs
     independent issuer confirmation (a remote provider that really did it) or
     a decision by an administrator.
   - Checks are tagged by where they came from:
       local          really performed in this browser (file readable, PDF
                      page count, duplicate file across listings, file-name hint)
       simulated      demo placeholder, not a real result
       not_performed  needs a backend / issuer (registry lookup etc.)
   - There is no authenticity percentage. "Risk level" is a plain count of
     warnings and failures, and says so.

   PROVIDERS (swap in real services without touching any page)
     Accoom.DocVerification.registerProvider(kind, impl)
       kind 'ocr'          impl.extract({doc, blob, listing})      -> Promise<extraction>
       kind 'documentAI'   impl.identify({doc, blob, extraction})  -> Promise<{identifiedType, layoutNotes}>
       kind 'authenticity' impl.assess({doc, blob, extraction})    -> Promise<{findings:[{id,label,result,detail}]}>
       kind 'external'     impl.verify({doc, extraction})          -> Promise<{performed, outcome, source, detail}>
     impl = { id, label, kind: 'demo' | 'remote', ... }
     A remote provider must run on a secure backend (never put API keys in
     browser code) and only after the owner has consented to the processing.

   DEMO TRIGGER WORDS (so reviewers can see how flags look): put one in a file
   name, e.g. "survey-mismatch-name.pdf".
     mismatch-name, mismatch-address, mismatch-cert, blurry, missing-page,
     altered, nostamp, nosig
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var LISTINGS_KEY = 'accoom-agent-listings';

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function esc(v) { return String(v == null ? '' : v); }
  function records(name) { return Accoom.Records.collection(name); }

  function readListing(id) {
    try {
      var l = JSON.parse(window.localStorage.getItem(LISTINGS_KEY));
      return Array.isArray(l) ? (l.filter(function (x) { return String(x.id) === String(id); })[0] || null) : null;
    } catch (e) { return null; }
  }
  function notify(title, text) {
    try { if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: title, text: text, link: 'my-listings.html?tab=in_review' }); }
    catch (e) { /* never blocks analysis */ }
  }

  function hashText(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  function has(name, word) { return String(name || '').toLowerCase().indexOf(word) !== -1; }

  /* ------------------------------------------------------- demo providers */
  var demoOCR = {
    id: 'demo-ocr', label: 'ACCOOM demo extractor', kind: 'demo',
    extract: function (input) {
      var doc = input.doc, listing = input.listing || {}, n = doc.originalName;
      var base = hashText(String(doc.listingId));
      var f = {
        ownerName: 'Sample Owner', address: listing.address || 'Sample address',
        certificateNumber: 'DEMO-' + base.slice(0, 6).toUpperCase(), landSize: '450 sqm',
        issueDate: '2019-01-15', issuingAuthority: 'Sample Authority'
      };
      if (has(n, 'mismatch-name')) f.ownerName = 'Different Person';
      if (has(n, 'mismatch-address')) f.address = '99 Another Road, Elsewhere';
      if (has(n, 'mismatch-cert')) f.certificateNumber = 'DEMO-' + hashText(n).slice(0, 6).toUpperCase();
      var unreadable = has(n, 'blurry') || has(n, 'unreadable');
      if (unreadable) { f.ownerName = ''; f.certificateNumber = ''; f.issueDate = ''; }
      return Promise.resolve({
        simulated: true, providerId: 'demo-ocr',
        text: 'DEMO PLACEHOLDER TEXT.\nACCOOM has no OCR service connected, so this document was NOT read.\nThe values below are sample data used to demonstrate the review screen.',
        fields: f, unreadable: unreadable,
        pageCount: null,
        hasSignature: !has(n, 'nosig'), hasStamp: !has(n, 'nostamp'),
        missingPages: has(n, 'missing-page'), altered: has(n, 'altered')
      });
    }
  };

  var demoDocumentAI = {
    id: 'demo-document-ai', label: 'ACCOOM demo classifier', kind: 'demo',
    identify: function (input) {
      // The demo "identifies" the document as whatever the agent said it was.
      return Promise.resolve({ simulated: true, providerId: 'demo-document-ai', identifiedType: input.doc.docType,
        layoutNotes: 'Demo only: the layout was not analysed.' });
    }
  };

  var demoAuthenticity = {
    id: 'demo-authenticity', label: 'ACCOOM demo authenticity checks', kind: 'demo',
    assess: function (input) {
      var x = input.extraction || {};
      return Promise.resolve({ simulated: true, providerId: 'demo-authenticity', findings: [
        { id: 'text_alterations', label: 'Suspicious text alterations', result: x.altered ? 'warn' : 'pass',
          detail: x.altered ? 'Demo trigger word "altered" in the file name. A real service would point to the exact area.' : 'No alteration flagged (demo, nothing was inspected).' },
        { id: 'font_layout', label: 'Font and layout consistency', result: x.altered ? 'warn' : 'pass',
          detail: x.altered ? 'Demo trigger word "altered" in the file name.' : 'Not inspected (demo).' }
      ] });
    }
  };

  var demoExternal = {
    id: 'demo-external', label: 'No external verification connected', kind: 'demo',
    verify: function () {
      return Promise.resolve({ performed: false, outcome: 'unavailable', source: '',
        detail: 'ACCOOM has not contacted the issuing authority or any land registry. This needs a backend and an approved verification partner.' });
    }
  };

  var providers = { ocr: demoOCR, documentAI: demoDocumentAI, authenticity: demoAuthenticity, external: demoExternal };
  var DEFAULTS = { ocr: demoOCR, documentAI: demoDocumentAI, authenticity: demoAuthenticity, external: demoExternal };

  function registerProvider(kind, impl) {
    if (!providers.hasOwnProperty(kind)) throw fail('bad_kind', 'Unknown provider kind: ' + kind);
    if (!impl || !impl.id || ['demo', 'remote'].indexOf(impl.kind) === -1) throw fail('bad_provider', 'A provider needs an id and kind "demo" or "remote".');
    var method = { ocr: 'extract', documentAI: 'identify', authenticity: 'assess', external: 'verify' }[kind];
    if (typeof impl[method] !== 'function') throw fail('bad_provider', 'A ' + kind + ' provider needs a ' + method + '() function.');
    providers[kind] = impl;
  }
  function resetProviders() { providers = Object.assign({}, DEFAULTS); }

  /* ------------------------------------------------------------ local checks */
  var TYPE_HINTS = [
    ['receipt', 'rent_receipt'], ['survey', 'survey_plan'], ['deed', 'deed_of_assignment'],
    ['consent', 'governors_consent'], ['power-of-attorney', 'power_of_attorney'], ['attorney', 'power_of_attorney'],
    ['c-of-o', 'certificate_of_occupancy'], ['occupancy', 'certificate_of_occupancy']
  ];

  function countPdfPages(blob) {
    if (!blob || typeof blob.slice !== 'function') return Promise.resolve(null);
    return blob.slice(0, 6 * 1024 * 1024).text().then(function (t) {
      var m = t.match(/\/Type\s*\/Page[^s]/g);
      return m ? m.length : 0;
    }, function () { return null; });
  }

  function findDuplicates(doc) {
    return records('documents').where(function (d) {
      return d.sha256 && d.sha256 === doc.sha256 && d.listingId !== doc.listingId && d.isCurrent !== false;
    });
  }

  function chk(id, label, result, source, detail) { return { id: id, label: label, result: result, source: source, detail: detail || '' }; }

  function buildChecks(doc, blob, blobError, extraction, ident, auth, ext, pages, dups) {
    var checks = [];
    // ---- really performed here
    checks.push(blob ? chk('file_readable', 'Stored file can be opened', 'pass', 'local')
      : chk('file_readable', 'Stored file can be opened', 'fail', 'local', blobError || 'The file is no longer stored in this browser.'));
    checks.push(chk('file_format', 'File type and size accepted', 'pass', 'local', doc.mimeType + ', ' + Accoom.DocumentStore.formatSize(doc.size)));
    if (doc.mimeType === 'application/pdf') {
      if (pages === null) checks.push(chk('page_count', 'PDF page count', 'warn', 'local', 'The pages could not be counted.'));
      else if (pages === 0) checks.push(chk('page_count', 'PDF page count', 'warn', 'local', 'No pages were found. The file may be damaged.'));
      else checks.push(chk('page_count', 'PDF page count', 'pass', 'local', pages + (pages === 1 ? ' page' : ' pages') + ' found.'));
    }
    var name = String(doc.originalName || '').toLowerCase();
    var hint = TYPE_HINTS.filter(function (h) { return name.indexOf(h[0]) !== -1; })[0];
    if (hint && hint[1] !== doc.docType && doc.docType !== Accoom.DocRequirements.ADDITIONAL) {
      checks.push(chk('filename_hint', 'File name matches the document type', 'warn', 'local',
        'The file name suggests "' + Accoom.DocRequirements.labelFor('sale', hint[1]) + '" but it was uploaded as "' + Accoom.DocRequirements.labelFor('sale', doc.docType) + '". This is only a hint from the name.'));
    } else {
      checks.push(chk('filename_hint', 'File name matches the document type', 'pass', 'local', 'Only the file name was compared.'));
    }
    checks.push(dups.length
      ? chk('duplicate_file', 'Same file used on another listing', 'warn', 'local', 'This exact file was also uploaded for ' + dups.length + ' other listing' + (dups.length > 1 ? 's' : '') + '. It may be legitimate (for example a landlord with several flats) but a reviewer should confirm.')
      : chk('duplicate_file', 'Same file used on another listing', 'pass', 'local', 'No identical file found on other listings in this browser.'));

    // ---- simulated by the demo providers (or real, if a remote provider is registered)
    var sim = extraction && extraction.simulated ? 'simulated' : 'provider';
    var f = (extraction && extraction.fields) || {};
    checks.push(chk('type_identification', 'Document type identified', ident && ident.identifiedType === doc.docType ? 'pass' : 'warn', ident && ident.simulated ? 'simulated' : 'provider',
      ident && ident.simulated ? 'Demo: assumed to be what the agent selected.' : 'Identified as ' + (ident && ident.identifiedType)));
    checks.push(chk('text_readable', 'Text could be read', extraction && extraction.unreadable ? 'warn' : 'pass', sim,
      extraction && extraction.unreadable ? 'The key details could not be read (demo trigger word in the file name).' : (extraction && extraction.simulated ? 'Demo: no text was read.' : 'Text extracted.')));
    ['ownerName', 'address', 'certificateNumber', 'issueDate'].forEach(function (k) {
      var labels = { ownerName: 'Name found', address: 'Property address found', certificateNumber: 'Certificate or reference number found', issueDate: 'Issue date found' };
      checks.push(chk('field_' + k, labels[k], f[k] ? 'pass' : 'warn', sim, f[k] ? '' : 'Missing or unreadable.'));
    });
    checks.push(chk('signature', 'Signature present', extraction && extraction.hasSignature === false ? 'warn' : 'pass', sim,
      extraction && extraction.hasSignature === false ? 'No signature found (demo trigger word).' : (extraction && extraction.simulated ? 'Demo: not inspected.' : '')));
    checks.push(chk('stamp', 'Stamp or seal present', extraction && extraction.hasStamp === false ? 'warn' : 'pass', sim,
      extraction && extraction.hasStamp === false ? 'No stamp found (demo trigger word).' : (extraction && extraction.simulated ? 'Demo: not inspected.' : '')));
    checks.push(chk('missing_pages', 'No pages missing', extraction && extraction.missingPages ? 'warn' : 'pass', sim,
      extraction && extraction.missingPages ? 'A page may be missing (demo trigger word).' : (extraction && extraction.simulated ? 'Demo: not inspected.' : '')));
    ((auth && auth.findings) || []).forEach(function (x) { checks.push(chk(x.id, x.label, x.result, auth.simulated ? 'simulated' : 'provider', x.detail)); });

    // ---- needs an issuer / registry: never claimed
    if (ext && ext.performed) {
      checks.push(chk('issuer_confirmation', 'Confirmed with the issuing authority', ext.outcome === 'confirmed' ? 'pass' : (ext.outcome === 'not_confirmed' ? 'fail' : 'warn'), 'provider',
        (ext.source ? ext.source + ': ' : '') + (ext.detail || ext.outcome)));
    } else {
      checks.push(chk('issuer_confirmation', 'Confirmed with the issuing authority', 'not_performed', 'not_performed', (ext && ext.detail) || 'Not performed.'));
    }
    return checks;
  }

  function riskFrom(checks, mode) {
    var warns = checks.filter(function (c) { return c.result === 'warn'; }).length;
    var fails = checks.filter(function (c) { return c.result === 'fail'; }).length;
    var level = fails ? 'high' : warns >= 3 ? 'high' : warns >= 1 ? 'medium' : 'low';
    return { level: level, warnings: warns, failures: fails,
      explanation: 'Risk level is a simple count of warnings (' + warns + ') and failed checks (' + fails + ') in this report. It is NOT an authenticity score and does not mean the document is genuine or fake.' +
        (mode === 'demo' ? ' This is a demo analysis: most checks are simulated, so a "low" level says nothing about the document.' : '') };
  }

  /* ----------------------------------------------------- analyse a document */
  function analyzeDocument(docId, ctx) {
    ctx = ctx || {};
    var DS = Accoom.DocumentStore, doc, listing, blob = null, blobError = '', setProcessing = false, priorStatus = '';
    return records('documents').get(docId).then(function (d) {
      if (!d) throw fail('not_found', 'Document not found.');
      if (d.isCurrent === false) throw fail('superseded', 'Only the current version of a document can be analysed.');
      doc = d; listing = ctx.listing || readListing(d.listingId) || {};
      var keepStatus = d.reviewStatus === 'verified' || d.reviewStatus === 'rejected';
      priorStatus = d.reviewStatus;
      if (keepStatus) return Promise.resolve();
      setProcessing = true;
      return DS.setReviewStatus(d.id, 'processing', { actorRole: 'system' });
    }).then(function () {
      return DS.getFile(docId).then(function (b) { blob = b; }, function (e) { blobError = e && e.message; });
    }).then(function () {
      return Promise.all([
        providers.ocr.extract({ doc: doc, blob: blob, listing: listing }),
        doc.mimeType === 'application/pdf' && blob ? countPdfPages(blob) : Promise.resolve(null),
        findDuplicates(doc)
      ]);
    }).then(function (r) {
      var extraction = r[0], pages = r[1], dups = r[2];
      if (extraction && pages !== null && extraction.pageCount == null) extraction.pageCount = pages;
      return Promise.all([
        providers.documentAI.identify({ doc: doc, blob: blob, extraction: extraction }),
        providers.authenticity.assess({ doc: doc, blob: blob, extraction: extraction }),
        providers.external.verify({ doc: doc, extraction: extraction })
      ]).then(function (x) {
        var ident = x[0], auth = x[1], ext = x[2];
        var used = [providers.ocr, providers.documentAI, providers.authenticity, providers.external];
        var anyDemo = used.some(function (p) { return p.kind === 'demo'; });
        var issuer = !!(ext && ext.performed && ext.outcome === 'confirmed' && providers.external.kind === 'remote');
        var mode = issuer ? 'issuer' : (anyDemo ? 'demo' : 'ai');
        var checks = buildChecks(doc, blob, blobError, extraction, ident, auth, ext, pages, dups);
        var risk = riskFrom(checks, mode);
        var warnings = checks.filter(function (c) { return c.result === 'warn' || c.result === 'fail'; })
          .map(function (c) { return c.label + (c.detail ? ': ' + c.detail : ''); });
        var rec = {
          documentId: doc.id, listingId: doc.listingId, docVersion: doc.version, mode: mode,
          providers: used.map(function (p) { return { id: p.id, label: p.label, kind: p.kind }; }),
          identifiedType: (ident && ident.identifiedType) || '', layoutNotes: (ident && ident.layoutNotes) || '',
          extracted: Object.assign({ simulated: !!(extraction && extraction.simulated), pageCount: extraction ? extraction.pageCount : null,
            hasSignature: extraction ? extraction.hasSignature : null, hasStamp: extraction ? extraction.hasStamp : null }, (extraction && extraction.fields) || {}),
          text: (extraction && extraction.text) || '',
          checks: checks, warnings: warnings, crossDocument: [], risk: risk,
          aiRecommendation: mode === 'demo'
            ? 'Demo recommendation: send this document to a human reviewer. No real AI has read it.' + (warnings.length ? ' Look at the flagged items first.' : '')
            : (warnings.length ? 'Recommend human review of the flagged items.' : 'No issues flagged. Human review is still required before approval.'),
          adminDecision: { decision: '', by: '', at: '', notes: '' },
          verificationSource: issuer ? 'independent_issuer' : (mode === 'demo' ? 'demo_analysis' : 'ai_analysis'),
          createdAt: nowIso()
        };
        return records('analysisReports').create(Accoom.Schemas.make.analysisReport(Object.assign({}, rec))).then(function (saved) {
          // keep the extra fields the schema factory does not know about
          return records('analysisReports').put(Object.assign({}, saved, { listingId: rec.listingId, docVersion: rec.docVersion, providers: rec.providers,
            layoutNotes: rec.layoutNotes, text: rec.text }));
        }).then(function (saved) {
          var keep = doc.reviewStatus === 'verified' || doc.reviewStatus === 'rejected';
          var step;
          if (issuer) step = DS.setReviewStatus(doc.id, 'verified', { actorRole: 'system', verification: { source: 'independent_issuer', verifiedBy: providers.external.id } });
          else if (keep) step = Promise.resolve();
          else step = DS.setReviewStatus(doc.id, 'analysis_complete', { actorRole: 'system' });
          return step.then(function () { return Accoom.Records.audit({ actorRole: 'system', action: 'document.analysed', entityType: 'document', entityId: doc.id,
            detail: { mode: mode, warnings: warnings.length, reportId: saved.id } }).catch(function () {}); }).then(function () { return saved; });
        });
      });
    }).catch(function (err) {
      // never leave a document stuck in "processing"
      if (!setProcessing) return Promise.reject(err);
      return DS.setReviewStatus(docId, priorStatus === 'processing' ? 'uploaded' : priorStatus, { actorRole: 'system' }).catch(function () {}).then(function () { throw err; });
    });
  }

  /* ------------------------------------------------- cross-document checks */
  function norm(v) { return String(v || '').toLowerCase().replace(/\(demo\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  var COMPARE = [
    { key: 'ownerName', label: 'Owner name' },
    { key: 'address', label: 'Property address' },
    { key: 'certificateNumber', label: 'Certificate / reference number' },
    { key: 'landSize', label: 'Land size' }
  ];

  // reports: latest report for each current document; docs: the document records
  function compareDocuments(listing, reports, docs) {
    var out = [];
    var byDoc = {}; (docs || []).forEach(function (d) { byDoc[d.id] = d; });
    COMPARE.forEach(function (c) {
      var vals = reports.map(function (r) { return { documentId: r.documentId, docType: (byDoc[r.documentId] || {}).docType, value: (r.extracted || {})[c.key] || '' }; })
        .filter(function (v) { return v.value; });
      if (vals.length < 2) {
        out.push({ field: c.key, label: c.label, status: 'insufficient', values: vals, explanation: 'Fewer than two documents contain this detail, so it could not be compared.' });
        return;
      }
      var distinct = {}; vals.forEach(function (v) { distinct[norm(v.value)] = true; });
      var consistent = Object.keys(distinct).length === 1;
      out.push({ field: c.key, label: c.label, status: consistent ? 'consistent' : 'inconsistent', values: vals,
        explanation: consistent ? 'The same value appears in every document that contains it.'
          : 'Documents show different values for this detail. Ask the agent which is correct, or check the originals.' });
    });
    // does the property address in the documents match what the agent typed on the listing?
    var declared = norm(listing && listing.address);
    var addrVals = reports.map(function (r) { return { documentId: r.documentId, docType: (byDoc[r.documentId] || {}).docType, value: (r.extracted || {}).address || '' }; })
      .filter(function (v) { return v.value; });
    if (declared && addrVals.length) {
      var bad = addrVals.filter(function (v) { return norm(v.value) !== declared && norm(v.value).indexOf(declared) === -1 && declared.indexOf(norm(v.value)) === -1; });
      out.push({ field: 'listing_address', label: 'Documents match the listing address', status: bad.length ? 'inconsistent' : 'consistent',
        values: [{ documentId: '', docType: 'listing', value: listing.address }].concat(addrVals),
        explanation: bad.length ? 'At least one document shows a different address from the one entered on the listing.' : 'The addresses match the listing.' });
    }
    return out;
  }

  /* --------------------------------------------------- analyse whole listing */
  function latestReports(listingId) {
    return Promise.all([Accoom.DocumentStore.listForListing(listingId), records('analysisReports').where(function (r) { return r.listingId === listingId; })])
      .then(function (x) {
        var docs = x[0], reps = x[1], latest = {};
        reps.forEach(function (r) { if (!latest[r.documentId] || r.createdAt >= latest[r.documentId].createdAt) latest[r.documentId] = r; });
        return { docs: docs, reports: docs.map(function (d) { return latest[d.id]; }).filter(Boolean) };
      });
  }

  function analyzeListing(listingId, actor) {
    actor = actor || { role: 'system' };
    var RV = Accoom.ListingReview, listing = readListing(listingId);
    if (!listing) return Promise.reject(fail('not_found', 'Listing not found.'));
    var state = (listing.approval && listing.approval.state) || '';
    var start = state === 'pending_review' ? RV.transition(listingId, 'ai_review', { role: 'system' }) : Promise.resolve();
    return start.then(function (rec) {
      if (rec) notify('Document review started', 'ACCOOM started reviewing the documents for \u201C' + listing.name + '\u201D.');
      return Accoom.DocumentStore.listForListing(listingId);
    }).then(function (docs) {
      var chain = Promise.resolve();
      docs.forEach(function (d) { chain = chain.then(function () { return analyzeDocument(d.id, { listing: listing }); }); });
      return chain;
    }).then(function () { return latestReports(listingId); }).then(function (lr) {
      var cross = compareDocuments(listing, lr.reports, lr.docs);
      var mismatches = cross.filter(function (c) { return c.status === 'inconsistent'; });
      return Promise.all(lr.reports.map(function (r) { return records('analysisReports').put(Object.assign({}, r, { crossDocument: cross })); }))
        .then(function () {
          return records('verifications').create({ listingId: listingId, createdAt: nowIso(), mode: lr.reports.some(function (r) { return r.mode === 'demo'; }) ? 'demo' : 'ai',
            reportIds: lr.reports.map(function (r) { return r.id; }), crossDocument: cross, inconsistencies: mismatches.length,
            summary: mismatches.length ? mismatches.length + ' inconsistenc' + (mismatches.length === 1 ? 'y' : 'ies') + ' found between documents.' : 'No inconsistencies found between documents that could be compared.' });
        }).then(function (ver) {
          var cur = readListing(listingId), st = cur && cur.approval && cur.approval.state;
          var done = st === 'ai_review' ? RV.transition(listingId, 'manual_review', { role: 'system' }) : Promise.resolve();
          return done.then(function () {
            if (st === 'ai_review') notify('Document review completed', 'The automatic checks for \u201C' + listing.name + '\u201D are finished. A person will review the documents next.');
            return { verification: ver, crossDocument: cross, reports: lr.reports.length };
          });
        });
    });
  }

  /* ---------------------------------------------------- admin decisions */
  var DECISIONS = {
    verify: { status: 'verified' }, needs_review: { status: 'needs_review' }, reject: { status: 'rejected' },
    issuer_pending: { status: 'issuer_confirmation_pending' }, ownership_pending: { status: 'ownership_verification_pending' },
    human_review: { status: 'human_review_required' }
  };

  function decideDocument(actor, docId, decision, opts) {
    opts = opts || {};
    if (!actor || actor.role !== 'admin') return Promise.reject(fail('forbidden', 'Only an administrator can decide on a document.'));
    var d = DECISIONS[decision];
    if (!d) return Promise.reject(fail('bad_decision', 'Unknown decision.'));
    if ((decision === 'reject' || decision === 'needs_review') && !String(opts.notes || '').trim()) {
      return Promise.reject(fail('reason_required', 'Write a reason the agent can read.'));
    }
    return records('documents').get(docId).then(function (doc) {
      if (!doc) throw fail('not_found', 'Document not found.');
      if (doc.isCurrent === false) throw fail('superseded', 'This version was replaced. Decide on the current version.');
      var so = { actorId: actor.id, actorRole: 'admin', reason: opts.notes };
      if (decision === 'verify') so.verification = { source: 'admin_manual', verifiedBy: actor.id || 'admin' };
      return Accoom.DocumentStore.setReviewStatus(docId, d.status, so);
    }).then(function (saved) {
      return latestReportFor(docId).then(function (rep) {
        if (!rep) return saved;
        var upd = Object.assign({}, rep, { adminDecision: { decision: decision, by: actor.id || 'admin', at: nowIso(), notes: opts.notes || '' } });
        if (decision === 'verify') upd.verificationSource = 'admin_manual';
        return records('analysisReports').put(upd).then(function () { return saved; });
      });
    });
  }

  function latestReportFor(docId) {
    return records('analysisReports').where(function (r) { return r.documentId === docId; }).then(function (l) {
      return l.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })[0] || null;
    });
  }

  // How a document should be described on screen.
  function displayStatus(doc) {
    var s = doc.reviewStatus;
    if (s === 'verified') {
      var src = doc.verification && doc.verification.source;
      return { headline: 'VERIFIED', tone: 'ok', stage: src === 'independent_issuer' ? 'Confirmed by the issuing authority' : 'Approved by an ACCOOM administrator (not confirmed with the issuer)' };
    }
    if (s === 'rejected') return { headline: 'REJECTED', tone: 'bad', stage: 'Rejected after review' };
    var stages = { uploaded: 'Uploaded, not yet analysed', processing: 'Processing', analysis_complete: 'Analysis complete (not independently verified)',
      issuer_confirmation_pending: 'Issuer confirmation pending', ownership_verification_pending: 'Ownership verification pending',
      human_review_required: 'Human review required', needs_review: 'Flagged for review', superseded: 'Replaced by a newer version' };
    return { headline: 'NEEDS REVIEW', tone: 'warn', stage: stages[s] || s };
  }

  var MODE_LABEL = { demo: 'DEMO ANALYSIS (simulated, nothing was really read)', ai: 'AI ANALYSIS (not independently verified)', issuer: 'ISSUER CONFIRMED' };
  var SOURCE_LABEL = { none: 'No verification yet', demo_analysis: 'Demo analysis only', ai_analysis: 'AI analysis only', independent_issuer: 'Independent issuer confirmation', admin_manual: 'Administrator decision' };

  Accoom.DocVerification = {
    registerProvider: registerProvider,
    resetProviders: resetProviders,
    getProviders: function () { return Object.assign({}, providers); },
    analyzeDocument: analyzeDocument,
    analyzeListing: analyzeListing,
    compareDocuments: compareDocuments,
    latestReports: latestReports,
    latestReportFor: latestReportFor,
    decideDocument: decideDocument,
    displayStatus: displayStatus,
    MODE_LABEL: MODE_LABEL,
    SOURCE_LABEL: SOURCE_LABEL,
    TRIGGER_WORDS: ['mismatch-name', 'mismatch-address', 'mismatch-cert', 'blurry', 'missing-page', 'altered', 'nostamp', 'nosig']
  };
})(window.Accoom);
