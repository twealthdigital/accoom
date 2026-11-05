/* ==========================================================================
   ACCOOM — Agreements and signing (Stage 5)
   --------------------------------------------------------------------------
   Workflow
     1. The agent PREPARES an agreement (typed terms) or UPLOADS one
        (PDF / JPG / PNG) for a successful transaction.
     2. The client gets a signing request.
     3. The client REVIEWS it (the review is recorded) and SIGNS.
     4. The agent (for the landlord / seller) COUNTERSIGNS where required.
     5. ACCOOM records every step with a timestamp. Nothing is overwritten.
     6. Both parties can download the agreement and the signing record.

   WHAT A SIGNATURE HERE IS (and is not)
     visual_signature   : a typed and/or drawn name shown on the record.
     electronic_record  : ACCOOM's timestamped log of who did what, tied to a
                          fingerprint (SHA-256) of the agreement text or file.
     legally_validated  : NOT available in this frontend. This module never
                          sets it. A typed or drawn name does not by itself
                          satisfy every legal requirement (for example
                          witnessing, stamp duty or registration).
   ACCOOM has not verified the signer's identity beyond the signed-in account.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var KINDS = { tenancy_agreement: 'Tenancy agreement', purchase_agreement: 'Purchase agreement', renewal_agreement: 'Renewal agreement' };
  var STATUS_LABEL = {
    awaiting_client: 'Waiting for the client to sign', client_signed: 'Signed by the client. Waiting for the agent to countersign',
    completed: 'Signed by all parties', declined: 'Declined by the client', cancelled: 'Cancelled by the agent'
  };
  var LEVEL_TEXT = {
    visual_signature: 'Visual signature: a typed or drawn name shown on the record.',
    electronic_record: 'Electronic signing record: ACCOOM\u2019s timestamped log of who reviewed and signed, tied to a fingerprint of the agreement.',
    legally_validated: 'Legally validated signing: NOT available in this version of ACCOOM.'
  };
  var DISCLAIMER = 'A typed or drawn name is a visual signature. ACCOOM keeps a timestamped electronic signing record. ACCOOM has not verified the signer\u2019s identity beyond their signed-in account, and does not claim this satisfies every legal requirement for signing or executing an agreement (for example witnessing, stamp duty or registration). Ask a lawyer if you need legally validated execution.';
  var MAX_DRAWN = 60000; // characters of image data kept per drawn signature

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function rec() { return Accoom.Records.collection('agreements'); }
  function adminOk(a) { return a && a.role === 'admin' && Accoom.AdminDemo && Accoom.AdminDemo.isActive(); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function dateText(iso) { return String(iso).slice(0, 10); }

  function notify(n) { return Accoom.Receipts ? Accoom.Receipts.notify(Object.assign({ category: 'agreement', link: 'transaction-documents.html#agreements' }, n)) : Promise.resolve(null); }

  function contentHashOf(text) { return Accoom.ACTD.sha256Hex(String(text)); }

  function sealOf(a) {
    var sigs = (a.signatures || []).map(function (s) { return { role: s.role, typedName: s.typedName, at: s.at, level: s.level, contentSha256: s.contentSha256 }; });
    return Accoom.ACTD.sha256Hex(Accoom.ACTD.canonical({ id: a.id, transactionId: a.transactionId, contentSha256: a.contentSha256, signatures: sigs, events: (a.events || []).map(function (e) { return { type: e.type, at: e.at, role: e.role }; }) }));
  }

  /* --------------------------------------------------------------- access */
  function canSee(actor, a) {
    if (!actor) return false;
    if (actor.role === 'admin') return !!adminOk(actor);
    if (actor.role === 'agent') return !!actor.id && a.agentId === actor.id;
    return actor.role === 'customer' && !!actor.id && a.customerId === actor.id;
  }
  function listFor(actor) {
    return rec().all().then(function (all) { return all.filter(function (a) { return canSee(actor, a); }).sort(function (x, y) { return x.createdAt < y.createdAt ? 1 : -1; }); });
  }
  function getFor(actor, id) {
    return rec().get(id).then(function (a) { if (!a || !canSee(actor, a)) throw fail('not_found', 'Agreement not found.'); return a; });
  }

  /* ------------------------------------------------------------- ACTD link */
  function updateActd(actor, a, reason) {
    if (!Accoom.ACTD) return Promise.resolve();
    return Accoom.ACTD.latestOf(a.transactionId).then(function (prev) {
      if (!prev) return null;
      var cur = prev.content.s4, s4 = {}; // only the fields an ACTD may change after issue
      var refs = (cur.agreementRefs || []).filter(function (r) { return r.id !== a.id; });
      refs.push({ id: a.id, kind: KINDS[a.kind], title: a.title, status: STATUS_LABEL[a.status], contentSha256: a.contentSha256 });
      s4.agreementRefs = clone(refs);
      s4.signingRecords = clone(cur.signingRecords || []).filter(function (r) { return r.agreementId !== a.id; })
        .concat((a.signatures || []).map(function (s) { return { agreementId: a.id, party: s.role === 'client' ? 'Client' : 'Agent', name: s.typedName, at: s.at, level: s.level, text: LEVEL_TEXT[s.level] }; }));
      var tenant = a.kind === 'purchase_agreement' ? 'Buyer' : 'Tenant', other = a.kind === 'purchase_agreement' ? 'Seller' : 'Landlord / agent';
      var cs = (a.signatures || []).filter(function (s) { return s.role === 'client'; })[0], as = (a.signatures || []).filter(function (s) { return s.role === 'agent'; })[0];
      s4.confirmations = [{ party: tenant, state: cs ? 'Signed (visual signature and electronic record) on ' + dateText(cs.at) : 'Not signed yet' },
        { party: other, state: as ? 'Countersigned (visual signature and electronic record) on ' + dateText(as.at) : 'Not countersigned yet' }];
      return Accoom.ACTD.addendum(actor, a.transactionId, { reason: reason, changes: { s4: s4 } });
    }).catch(function () { return null; });
  }

  function save(a, event, actor, extra) {
    var next = Object.assign({}, a, extra || {}, { events: a.events.concat([Object.assign({ at: nowIso(), by: actor.id, role: actor.role }, event)]) });
    return rec().put(next).then(function (saved) {
      return Accoom.Records.audit({ actorId: actor.id, actorRole: actor.role, action: 'agreement.' + event.type, entityType: 'agreement', entityId: a.id, detail: { status: saved.status } })
        .catch(function () {}).then(function () { return saved; });
    });
  }

  /* --------------------------------------------------------------- prepare */
  // input: { kind, title, text } or { kind, title, file }
  function create(actor, txId, input) {
    input = input || {};
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can prepare an agreement.'));
    if (!KINDS[input.kind]) return Promise.reject(fail('bad_kind', 'Choose the type of agreement.'));
    var title = String(input.title || '').trim();
    if (title.length < 3) return Promise.reject(fail('title_required', 'Give the agreement a title.'));
    var text = String(input.text || '').trim(), file = input.file || null;
    if (!file && text.length < 40) return Promise.reject(fail('content_required', 'Type the agreement terms (at least a few sentences) or upload the agreement file.'));
    if (file && text) return Promise.reject(fail('one_source', 'Use either typed terms or an uploaded file, not both.'));
    return Accoom.Records.collection('transactions').get(txId).then(function (tx) {
      if (!tx || tx.status !== 'succeeded') throw fail('not_paid', 'An agreement can only be prepared for a successful transaction.');
      if (tx.agentId !== actor.id) throw fail('forbidden', 'You can only prepare agreements for your own transactions.');
      var id = Accoom.Records.newId('agr');
      var source = file
        ? Accoom.DocumentStore.add({ file: file, listingId: 'agreement:' + id, propertyId: tx.propertyId, ownerId: actor.id, docType: 'additional_supporting' })
            .then(function (d) { return { documentId: d.id, fileName: d.originalName, contentSha256: d.sha256 || '', mimeType: d.mimeType }; })
        : contentHashOf(text).then(function (h) { return { documentId: '', fileName: '', contentSha256: h, mimeType: '' }; });
      return source.then(function (s) {
        var base = Accoom.Schemas.make.agreement({ id: id, transactionId: txId, propertyId: tx.propertyId, kind: KINDS[input.kind], documentId: s.documentId, status: 'awaiting_client' });
        var a = Object.assign(base, {
          kindId: input.kind, title: title, body: text, fileName: s.fileName, mimeType: s.mimeType, contentSha256: s.contentSha256,
          requireCountersign: input.requireCountersign !== false, listingName: tx.listingName || '',
          customerId: tx.customerId, customerName: tx.customerName || '', agentId: tx.agentId, agentName: tx.agentName || '',
          events: [{ type: 'prepared', at: nowIso(), by: actor.id, role: 'agent' }, { type: 'signing_requested', at: nowIso(), by: 'system', role: 'system' }]
        });
        a.kind = input.kind; // keep the machine id in `kind`; label comes from KINDS
        return rec().create(a);
      }).then(function (saved) {
        return Accoom.Records.audit({ actorId: actor.id, actorRole: 'agent', action: 'agreement.prepared', entityType: 'agreement', entityId: saved.id, detail: { kind: input.kind } }).catch(function () {})
          .then(function () { return notify({ dedupeKey: 'agr:' + saved.id + ':request', recipientId: saved.customerId, recipientRole: 'customer', title: 'Agreement ready to sign',
            message: 'Your agent prepared \u201C' + saved.title + '\u201D for \u201C' + saved.listingName + '\u201D. Please read it and sign if you agree.' }); })
          .then(function () { return updateActd(actor, saved, 'Agreement prepared and sent for signing'); })
          .then(function () { return saved; });
      });
    });
  }

  /* ---------------------------------------------------------------- review */
  function markViewed(actor, id) {
    if (!actor || actor.role !== 'customer') return Promise.resolve(null);
    return rec().get(id).then(function (a) {
      if (!a || a.customerId !== actor.id) throw fail('forbidden', 'This agreement is not yours.');
      if (a.events.some(function (e) { return e.type === 'client_reviewed' && e.by === actor.id; })) return a;
      return save(a, { type: 'client_reviewed' }, actor);
    });
  }

  function drawnOk(img) { return typeof img === 'string' && /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(img) && img.length <= MAX_DRAWN; }

  /* ------------------------------------------------------------------ sign */
  // input: { typedName, agreedRead: true, drawnImage? }
  function sign(actor, id, input) {
    input = input || {};
    if (!actor || (actor.role !== 'customer' && actor.role !== 'agent')) return Promise.reject(fail('forbidden', 'Sign in to sign an agreement.'));
    var name = String(input.typedName || '').trim();
    if (name.length < 3) return Promise.reject(fail('name_required', 'Type your full name to sign.'));
    if (input.agreedRead !== true) return Promise.reject(fail('confirm_required', 'Tick the box to confirm you have read the agreement.'));
    return rec().get(id).then(function (a) {
      if (!a) throw fail('not_found', 'Agreement not found.');
      var isClient = actor.role === 'customer';
      if (isClient && a.customerId !== actor.id) throw fail('forbidden', 'This agreement is not yours to sign.');
      if (!isClient && a.agentId !== actor.id) throw fail('forbidden', 'You can only countersign agreements for your own transactions.');
      if (isClient) {
        if (a.status !== 'awaiting_client') throw fail('bad_state', 'This agreement is not waiting for your signature.');
        if (!a.events.some(function (e) { return e.type === 'client_reviewed' && e.by === actor.id; })) throw fail('review_first', 'Open and read the agreement before you sign it.');
      } else if (a.status !== 'client_signed') throw fail('bad_state', a.status === 'awaiting_client' ? 'The client has not signed yet.' : 'This agreement is not waiting for your countersignature.');
      var drawn = drawnOk(input.drawnImage) ? input.drawnImage : '';
      var sig = { role: isClient ? 'client' : 'agent', partyId: actor.id, typedName: name, drawnImage: drawn, method: drawn ? 'drawn_and_typed' : 'typed',
        level: 'visual_signature', electronicRecord: true, at: nowIso(), contentSha256: a.contentSha256, statement: DISCLAIMER };
      var status = isClient ? (a.requireCountersign ? 'client_signed' : 'completed') : 'completed';
      return save(a, { type: isClient ? 'client_signed' : 'agent_countersigned' }, actor, { signatures: a.signatures.concat([sig]), status: status }).then(function (saved) {
        var done = status === 'completed';
        var next = isClient
          ? (done ? Promise.resolve() : notify({ dedupeKey: 'agr:' + id + ':countersign', recipientId: a.agentId, recipientRole: 'agent', title: 'Client signed the agreement', message: 'The client signed \u201C' + a.title + '\u201D. Please countersign.' }))
          : notify({ dedupeKey: 'agr:' + id + ':done', recipientId: a.customerId, recipientRole: 'customer', title: 'Agreement fully signed', message: '\u201C' + a.title + '\u201D is signed by everyone. You can download it.' });
        var seal = done ? sealOf(saved).then(function (s) { return rec().put(Object.assign({}, saved, { finalSeal: s })); }) : Promise.resolve(saved);
        return next.then(function () { return seal; }).then(function (fin) {
          return updateActd(actor, fin, isClient ? 'Client signed the agreement' : 'Agent countersigned the agreement').then(function () { return fin; });
        });
      });
    });
  }

  function decline(actor, id, reason) {
    reason = String(reason || '').trim();
    if (!actor || actor.role !== 'customer') return Promise.reject(fail('forbidden', 'Only the client can decline to sign.'));
    if (reason.length < 5) return Promise.reject(fail('reason_required', 'Say why you are not signing.'));
    return rec().get(id).then(function (a) {
      if (!a || a.customerId !== actor.id) throw fail('forbidden', 'This agreement is not yours.');
      if (a.status !== 'awaiting_client') throw fail('bad_state', 'This agreement is not waiting for your signature.');
      return save(a, { type: 'client_declined', note: reason }, actor, { status: 'declined' }).then(function (saved) {
        return notify({ dedupeKey: 'agr:' + id + ':declined', recipientId: a.agentId, recipientRole: 'agent', title: 'Client declined to sign', message: 'The client declined \u201C' + a.title + '\u201D: ' + reason }).then(function () { return saved; });
      });
    });
  }

  function cancel(actor, id, reason) {
    reason = String(reason || '').trim();
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can cancel an agreement.'));
    if (reason.length < 5) return Promise.reject(fail('reason_required', 'Say why it is cancelled.'));
    return rec().get(id).then(function (a) {
      if (!a || a.agentId !== actor.id) throw fail('forbidden', 'This agreement is not yours.');
      if (a.status === 'completed' || a.status === 'declined' || a.status === 'cancelled') throw fail('bad_state', 'This agreement is already closed.');
      return save(a, { type: 'cancelled', note: reason }, actor, { status: 'cancelled' });
    });
  }

  // The original file (uploaded agreements only). Both parties may download it.
  function getFile(actor, id) {
    return getFor(actor, id).then(function (a) {
      if (!a.documentId) throw fail('no_file', 'This agreement was typed in ACCOOM. Download the PDF instead.');
      return Accoom.DocumentStore.getFile(a.documentId).then(function (blob) { return { blob: blob, fileName: a.fileName }; });
    });
  }

  Accoom.Agreements = {
    KINDS: KINDS, STATUS_LABEL: STATUS_LABEL, LEVEL_TEXT: LEVEL_TEXT, DISCLAIMER: DISCLAIMER,
    create: create, markViewed: markViewed, sign: sign, decline: decline, cancel: cancel,
    listFor: listFor, getFor: getFor, getFile: getFile, canSee: canSee, sealOf: sealOf
  };
})(window.Accoom);
