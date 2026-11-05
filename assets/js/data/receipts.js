/* ==========================================================================
   ACCOOM — Payment receipts and receipt delivery (Stage 5)
   --------------------------------------------------------------------------
   A receipt is a separate ACCOOM document, issued once for every SUCCESSFUL
   transaction. The ACTD refers to it by its receipt number (tx.receiptRef).

   DELIVERY
     digital  : ACCOOM makes the receipt available in the customer's document
                centre. Nothing else to track.
     physical : the AGENT must hand a paper receipt to the client. ACCOOM
                never says it issued the physical receipt. Workflow:
                  pending_agent -> agent_marked_delivered -> client answers:
                    client_ok | client_problem | client_not_received
                  problems stay open until resolved.
                The agent's "delivered" click is NEVER the client's
                acknowledgement. Only the client (the signed-in customer on
                the transaction) can record one.

   HONESTY
     - Demo payments produce receipts that say so on their face.
     - The seal is a fingerprint of ACCOOM's stored record. It is not a digital
       signature, and the public check only works in the browser that holds
       the record.
     - Notifications here are in-app only. No SMS, WhatsApp or email is sent.
     - Agents never receive a customer's phone number or email address.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var PURPOSE = {
    rent_payment: 'Rental payment', sale_payment: 'Purchase payment', renewal_payment: 'Rental renewal payment',
    agency_payment: 'Agency payment', other: 'Other transaction charge'
  };
  var DELIVERY_TEXT = {
    digital: 'Digital receipt: ACCOOM makes this receipt available in your document centre. You can download it again whenever you need it.',
    physical: 'Physical receipt: the agent is responsible for delivering a paper receipt to you. ACCOOM has not issued a physical receipt. This record is the ACCOOM receipt for your payment.'
  };
  var STATE_LABEL = {
    not_applicable: 'Digital receipt, nothing to deliver',
    pending_agent: 'Waiting for the agent to deliver the physical receipt',
    agent_marked_delivered: 'Agent says it was delivered. Waiting for your confirmation',
    client_ok: 'You confirmed you received it and you are satisfied',
    client_problem: 'You reported a problem. Open until resolved',
    client_not_received: 'You said you have not received it. Open until resolved',
    resolved: 'Resolved'
  };
  var OUTCOME_STATE = { ok: 'client_ok', problem: 'client_problem', not_received: 'client_not_received' };

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function rec(name) { return Accoom.Records.collection(name); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function ngn(n) { return Accoom.ACTD ? Accoom.ACTD.ngn(n) : 'NGN ' + n; }
  function adminOk(actor) { return actor && actor.role === 'admin' && Accoom.AdminDemo && Accoom.AdminDemo.isActive(); }

  function readListing(id) {
    try { var l = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); return (Array.isArray(l) ? l : []).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
    catch (e) { return null; }
  }

  function baseUrl() {
    return String(window.location.href).replace(/[?#].*$/, '').replace(/[^\/]*$/, '') + 'verify-receipt.html';
  }
  function verifyUrlFor(number) { return baseUrl() + '?ref=' + encodeURIComponent(number); }

  /* ----------------------------------------------------- notifications */
  // One in-app notification per (dedupeKey). Addressed to a person; shown when
  // that person next opens ACCOOM in this browser. Never claims external delivery.
  function notify(n) {
    var r = Accoom.Schemas.make.notification({
      dedupeKey: n.dedupeKey, category: n.category || 'receipt', recipientId: n.recipientId, recipientRole: n.recipientRole,
      title: n.title, message: n.message, link: n.link || 'transaction-documents.html',
      channels: [{ channel: 'in_app', state: 'delivered' }, { channel: 'sms', state: 'unavailable' }, { channel: 'whatsapp', state: 'unavailable' }, { channel: 'email', state: 'unavailable' }]
    });
    return rec('notifications').createUnique(r).catch(function () { return null; });
  }

  // Pushes unseen notifications for this person into the existing ACCOOM inbox once.
  function deliverInbox(actor) {
    if (!actor || !actor.id) return Promise.resolve(0);
    return rec('notifications').where(function (n) { return n.recipientId === actor.id && n.recipientRole === actor.role && !n.shownAt && n.category === 'receipt'; }).then(function (list) {
      return Promise.all(list.map(function (n) {
        try { if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: n.title, text: n.message, link: n.link }); } catch (e) { /* ignore */ }
        return rec('notifications').put(Object.assign({}, n, { shownAt: nowIso() }));
      })).then(function () { return list.length; });
    });
  }

  /* -------------------------------------------------------------- content */
  function buildContent(tx, listing, delivery, number) {
    var a = tx.amounts || {}, isRent = tx.type === 'rent_payment' || tx.type === 'renewal_payment';
    var P = { day: 'day', week: 'week', month: 'month', year: 'year' };
    var lines = [];
    lines.push(isRent && tx.billingPeriod
      ? { label: 'Rent (' + tx.periodCount + ' ' + P[tx.billingPeriod] + (tx.periodCount > 1 ? 's' : '') + ' at ' + ngn(a.unitPrice) + ' per ' + P[tx.billingPeriod] + ')', amount: a.price }
      : { label: 'Property price', amount: a.price });
    if (a.agencyFee) lines.push({ label: 'Agency fee', amount: a.agencyFee });
    if (a.legalFee) lines.push({ label: 'Legal fee', amount: a.legalFee });
    if (a.other) lines.push({ label: 'Other charges', amount: a.other });
    var l = listing || {};
    return {
      demo: tx.paymentSource === 'demo',
      receiptNumber: number, purpose: PURPOSE[tx.type] || tx.type,
      client: { name: tx.customerName || 'Not provided' },
      property: { id: tx.propertyId, name: tx.listingName || l.name || '', location: [l.area, l.state].filter(Boolean).join(', ') || l.address || '' },
      agent: { name: tx.agentName || 'Not provided' },
      lines: lines, total: a.total, amountPaid: a.total,
      payment: { reference: tx.paymentReference, method: tx.paymentMethod, provider: tx.provider, paidAt: tx.paidAt,
        status: tx.paymentSource === 'demo' ? 'Confirmed by a DEMONSTRATION payment event. No real money was moved.' : 'Confirmed' },
      transactionId: tx.id, delivery: delivery, deliveryText: DELIVERY_TEXT[delivery],
      verifyUrl: verifyUrlFor(number),
      note: 'This is an ACCOOM payment receipt. It records a payment recorded by ACCOOM. It does not replace your property documents or any agreement.'
    };
  }
  function sealInput(r) { return Accoom.ACTD.canonical({ receiptNumber: r.receiptNumber, transactionId: r.transactionId, issuedAt: r.issuedAt, content: r.content }); }
  function sealOf(r) { return Accoom.ACTD.sha256Hex(sealInput(r)); }

  /* ------------------------------------------------------------- receipts */
  // Idempotent: the receipt id is derived from the transaction, so repeating
  // the payment event can never produce a second receipt.
  function ensureForTransaction(txId) {
    return rec('transactions').get(txId).then(function (tx) {
      if (!tx) throw fail('not_found', 'Transaction not found.');
      if (tx.status !== 'succeeded') throw fail('not_paid', 'A receipt is only issued after a payment is confirmed as successful.');
      return rec('receipts').get('rcp_' + txId).then(function (existing) {
        if (existing) return { receipt: existing, created: false };
        var listing = readListing(tx.listingId);
        var vs = Accoom.ACTD ? Accoom.ACTD.versionsOf(txId) : Promise.resolve([]);
        return vs.then(function (versions) {
          var fromActd = versions[0] && versions[0].content && versions[0].content.s5 && versions[0].content.s5.receiptDelivery;
          var delivery = fromActd || (listing && listing.receiptDelivery === 'physical' ? 'physical' : 'digital');
          var number = tx.receiptRef;
          if (!number) throw fail('no_receipt_ref', 'This transaction has no receipt number.');
          var base = Accoom.Schemas.make.receipt({ id: 'rcp_' + txId, receiptNumber: number, transactionId: txId, purpose: PURPOSE[tx.type] || tx.type, delivery: delivery,
            content: buildContent(tx, listing, delivery, number), issuedAt: nowIso() });
          var r = Object.assign(base, { customerId: tx.customerId, agentId: tx.agentId, listingId: tx.listingId, paymentSource: tx.paymentSource });
          return sealOf(r).then(function (seal) {
            r.seal = seal;
            return rec('receipts').create(r);
          }).then(function (saved) {
            return createDelivery(tx, saved).then(function () { return { receipt: saved, created: true }; });
          }, function (err) {
            if (err && err.code === 'exists') return rec('receipts').get('rcp_' + txId).then(function (x) { return { receipt: x, created: false }; });
            throw err;
          });
        });
      });
    });
  }

  function createDelivery(tx, receipt) {
    var physical = receipt.delivery === 'physical', at = nowIso();
    var ack = Object.assign(Accoom.Schemas.make.deliveryAck({
      id: 'ack_' + tx.id, receiptId: receipt.id, transactionId: tx.id, state: physical ? 'pending_agent' : 'not_applicable',
      history: [{ state: physical ? 'pending_agent' : 'not_applicable', by: 'system', role: 'system', at: at, note: physical ? 'Physical receipt delivery was selected for this listing.' : 'Digital receipt issued.' }]
    }), { customerId: tx.customerId, agentId: tx.agentId, listingName: tx.listingName || '', receiptNumber: receipt.receiptNumber, delivery: receipt.delivery });
    return rec('deliveryAcks').create(ack).catch(function (e) { if (!e || e.code !== 'exists') throw e; }).then(function () {
      var tail = Accoom.Records.audit({ actorId: 'system', actorRole: 'system', action: 'receipt.issued', entityType: 'receipt', entityId: receipt.id, detail: { receiptNumber: receipt.receiptNumber, delivery: receipt.delivery, source: tx.paymentSource } }).catch(function () {});
      var jobs = [tail];
      if (physical) {
        jobs.push(notify({ dedupeKey: 'rcp:' + tx.id + ':client-physical', recipientId: tx.customerId, recipientRole: 'customer', title: 'Physical receipt selected',
          message: 'For \u201C' + (tx.listingName || 'your property') + '\u201D the agent will deliver a paper receipt to you. ACCOOM has not issued a physical receipt. You will be asked to confirm when you get it.' }));
        jobs.push(notify({ dedupeKey: 'rcp:' + tx.id + ':agent-remind', recipientId: tx.agentId, recipientRole: 'agent', title: 'Deliver the physical receipt',
          message: 'Payment received for \u201C' + (tx.listingName || 'a property') + '\u201D. Please deliver the physical receipt (' + receipt.receiptNumber + ') to the client, then mark it as delivered.' }));
      } else {
        jobs.push(notify({ dedupeKey: 'rcp:' + tx.id + ':client-digital', recipientId: tx.customerId, recipientRole: 'customer', title: 'Digital receipt available',
          message: 'Your ACCOOM receipt ' + receipt.receiptNumber + ' is ready. You can download it from your documents.' }));
      }
      return Promise.all(jobs);
    });
  }

  // Receipts for every succeeded transaction the person may see that lack one (older demo payments).
  function backfill(actor) {
    if (!actor) return Promise.resolve(0);
    return Accoom.Transactions.listFor(actor).then(function (txs) {
      var ok = txs.filter(function (t) { return t.status === 'succeeded' && t.receiptRef; });
      return Promise.all(ok.map(function (t) { return ensureForTransaction(t.id).then(function (r) { return r.created ? 1 : 0; }, function () { return 0; }); }));
    }).then(function (n) { return n.reduce(function (a, b) { return a + b; }, 0); });
  }

  function canSee(actor, r) {
    if (!actor) return false;
    if (actor.role === 'admin') return !!adminOk(actor);
    if (actor.role === 'agent') return !!actor.id && r.agentId === actor.id;
    if (actor.role === 'customer') return !!actor.id && r.customerId === actor.id;
    return false;
  }
  function listFor(actor) {
    return rec('receipts').all().then(function (all) { return all.filter(function (r) { return canSee(actor, r); }).sort(function (a, b) { return a.issuedAt < b.issuedAt ? 1 : -1; }); });
  }
  function getFor(actor, receiptId) {
    return rec('receipts').get(receiptId).then(function (r) {
      if (!r || !canSee(actor, r)) throw fail('not_found', 'Receipt not found.');
      return r;
    });
  }

  // Public check. Returns NO personal data.
  function verify(number) {
    number = String(number || '').trim().toUpperCase();
    return rec('receipts').where(function (r) { return r.receiptNumber === number; }).then(function (l) {
      var r = l[0];
      if (!r) return { found: false };
      return sealOf(r).then(function (seal) {
        return { found: true, receiptNumber: r.receiptNumber, issuedAt: r.issuedAt, purpose: r.purpose, demo: !!r.content.demo, delivery: r.delivery, sealMatches: seal === r.seal };
      });
    });
  }

  /* -------------------------------------------------------------- delivery */
  function getAck(txId) { return rec('deliveryAcks').get('ack_' + txId); }

  function save(ack, state, actor, note) {
    var next = Object.assign({}, ack, { state: state, history: ack.history.concat([{ state: state, by: actor.id, role: actor.role, at: nowIso(), note: String(note || '') }]) });
    return rec('deliveryAcks').put(next).then(function (saved) {
      return Accoom.Records.audit({ actorId: actor.id, actorRole: actor.role, action: 'receipt.delivery.' + state, entityType: 'receipt', entityId: ack.receiptId, detail: { from: ack.state, to: state } })
        .catch(function () {}).then(function () { return saved; });
    });
  }

  // Keeps ACTD section 5 in step (new version, original kept). Never blocks the action.
  function updateActd(actor, ack, build, reason) {
    if (!Accoom.ACTD) return Promise.resolve();
    return Accoom.ACTD.latestOf(ack.transactionId).then(function (prev) {
      if (!prev) return null;
      var s5 = clone(prev.content.s5);
      build(s5);
      return Accoom.ACTD.addendum(actor, ack.transactionId, { reason: reason, changes: { s5: s5 } });
    }).catch(function () { return null; });
  }
  function dateText(iso) { return new Date(iso).toISOString().slice(0, 10); }

  function markDelivered(actor, txId, note) {
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can mark a physical receipt as delivered.'));
    return getAck(txId).then(function (ack) {
      if (!ack || ack.delivery !== 'physical') throw fail('not_physical', 'This receipt is digital. There is nothing to deliver.');
      if (ack.agentId !== actor.id) throw fail('forbidden', 'You can only update deliveries for your own transactions.');
      if (['pending_agent', 'client_problem', 'client_not_received'].indexOf(ack.state) === -1) throw fail('bad_state', 'This receipt is not waiting for delivery.');
      return save(ack, 'agent_marked_delivered', actor, note).then(function (saved) {
        var n = saved.history.length;
        return notify({ dedupeKey: 'rcp:' + txId + ':confirm:' + n, recipientId: ack.customerId, recipientRole: 'customer', title: 'Did you receive your receipt?',
          message: 'The agent says they delivered your physical receipt for \u201C' + ack.listingName + '\u201D. Please tell ACCOOM whether you received it.' }).then(function () {
          return updateActd(actor, ack, function (s5) {
            s5.agentConfirmation = 'The agent marked the physical receipt as delivered on ' + dateText(nowIso()) + '. This is the agent\u2019s statement only, not the client\u2019s confirmation.';
            s5.deliveryDates = (s5.deliveryDates || []).concat([{ item: 'Physical receipt (agent says delivered)', at: nowIso() }]);
            s5.outstanding = ['Waiting for the client to confirm they received the physical receipt'];
          }, 'Agent marked the physical receipt as delivered');
        }).then(function () { return saved; });
      });
    });
  }

  function clientRespond(actor, txId, outcome, note) {
    if (!actor || actor.role !== 'customer') return Promise.reject(fail('forbidden', 'Only the client can confirm receipt of a physical receipt.'));
    var state = OUTCOME_STATE[outcome];
    if (!state) return Promise.reject(fail('bad_outcome', 'Choose one of the three answers.'));
    note = String(note || '').trim();
    if (outcome === 'problem' && note.length < 5) return Promise.reject(fail('note_required', 'Please describe the problem so the agent can fix it.'));
    return getAck(txId).then(function (ack) {
      if (!ack || ack.delivery !== 'physical') throw fail('not_physical', 'This receipt is digital. There is nothing to confirm.');
      if (ack.customerId !== actor.id) throw fail('forbidden', 'You can only answer for your own receipts.');
      if (ack.state !== 'agent_marked_delivered') throw fail('bad_state', ack.state === 'pending_agent' ? 'The agent has not marked this receipt as delivered yet.' : 'This delivery has already been answered.');
      return save(ack, state, actor, note).then(function (saved) {
        var text = { ok: 'received the receipt and is satisfied', problem: 'received the receipt but reported a problem: ' + note, not_received: 'has not received the receipt' }[outcome];
        return notify({ dedupeKey: 'rcp:' + txId + ':client-answer:' + saved.history.length, recipientId: ack.agentId, recipientRole: 'agent', title: outcome === 'ok' ? 'Client confirmed the receipt' : 'Receipt delivery needs attention',
          message: 'The client for \u201C' + ack.listingName + '\u201D ' + text + '.' }).then(function () {
          return updateActd(actor, ack, function (s5) {
            s5.clientAcknowledgement = 'On ' + dateText(nowIso()) + ' the client ' + text + '.';
            s5.outstanding = outcome === 'ok' ? [] : ['Physical receipt: ' + (outcome === 'problem' ? 'problem reported by the client' : 'client says it has not been received') + '. Open until resolved'];
            s5.reportedProblems = outcome === 'ok' ? (s5.reportedProblems || []) : (s5.reportedProblems || []).concat([{ at: nowIso(), kind: outcome, note: note }]);
          }, 'Client answered about the physical receipt');
        }).then(function () { return saved; });
      });
    });
  }

  function resolve(actor, txId, note) {
    note = String(note || '').trim();
    if (!actor || (actor.role !== 'customer' && !adminOk(actor))) return Promise.reject(fail('forbidden', 'Only the client or an ACCOOM reviewer can close an open delivery issue.'));
    if (note.length < 5) return Promise.reject(fail('note_required', 'Say how it was resolved.'));
    return getAck(txId).then(function (ack) {
      if (!ack) throw fail('not_found', 'Delivery record not found.');
      if (actor.role === 'customer' && ack.customerId !== actor.id) throw fail('forbidden', 'You can only close your own issues.');
      if (['client_problem', 'client_not_received'].indexOf(ack.state) === -1) throw fail('bad_state', 'There is no open issue to resolve.');
      return save(ack, 'resolved', actor, note).then(function (saved) {
        return notify({ dedupeKey: 'rcp:' + txId + ':resolved:' + saved.history.length, recipientId: ack.agentId, recipientRole: 'agent', title: 'Receipt issue resolved', message: 'The receipt issue for \u201C' + ack.listingName + '\u201D was marked as resolved.' }).then(function () {
          return updateActd(actor, ack, function (s5) {
            s5.outstanding = []; s5.clientAcknowledgement = (s5.clientAcknowledgement || '') + ' Issue resolved on ' + dateText(nowIso()) + '.';
          }, 'Receipt delivery issue resolved');
        }).then(function () { return saved; });
      });
    });
  }

  function canSeeAck(actor, a) {
    if (!actor) return false;
    if (actor.role === 'admin') return !!adminOk(actor);
    if (actor.role === 'agent') return !!actor.id && a.agentId === actor.id;
    return actor.role === 'customer' && !!actor.id && a.customerId === actor.id;
  }
  function deliveriesFor(actor) {
    return rec('deliveryAcks').all().then(function (all) { return all.filter(function (a) { return a.delivery === 'physical' && canSeeAck(actor, a); }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }); });
  }
  // What still needs this person to do something (or is still open). Stays until answered or resolved.
  function outstandingFor(actor) {
    return deliveriesFor(actor).then(function (list) {
      return list.filter(function (a) {
        if (a.state === 'client_ok' || a.state === 'resolved') return false;
        if (actor.role === 'agent') return ['pending_agent', 'client_problem', 'client_not_received'].indexOf(a.state) !== -1;
        if (actor.role === 'customer') return ['agent_marked_delivered', 'client_problem', 'client_not_received'].indexOf(a.state) !== -1;
        return true;
      });
    });
  }

  /* ------------------------------------------- how the client is told first */
  // Text shown BEFORE payment so the client knows what to expect.
  function noticeFor(listing) {
    var d = listing && listing.receiptDelivery === 'physical' ? 'physical' : 'digital';
    return { delivery: d, text: d === 'physical'
      ? 'Receipt: the agent for this property has chosen PHYSICAL receipt delivery. After you pay, the agent must hand you a paper receipt and you will be asked to confirm you received it. ACCOOM does not issue a physical receipt. You will still get ACCOOM\u2019s own payment receipt record.'
      : 'Receipt: you will get a digital ACCOOM receipt in your document centre as soon as payment is confirmed. You can download it again at any time.' };
  }

  // Agent chooses how future clients receive receipts. Payments already made keep their method.
  function setListingDelivery(actor, listingId, method) {
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can choose the receipt delivery method.'));
    if (method !== 'digital' && method !== 'physical') return Promise.reject(fail('bad_method', 'Choose digital or physical.'));
    return new Promise(function (resolve, reject) {
      var list;
      try { list = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); } catch (e) { list = null; }
      if (!Array.isArray(list)) { reject(fail('not_found', 'Listing not found.')); return; }
      var found = false;
      list = list.map(function (l) { if (String(l.id) === String(listingId)) { found = true; return Object.assign({}, l, { receiptDelivery: method }); } return l; });
      if (!found) { reject(fail('not_found', 'Listing not found.')); return; }
      try { window.localStorage.setItem('accoom-agent-listings', JSON.stringify(list)); } catch (e) { reject(fail('quota', 'Could not save. Browser storage is full.')); return; }
      Accoom.Records.audit({ actorId: actor.id, actorRole: 'agent', action: 'listing.receipt_delivery', entityType: 'listing', entityId: String(listingId), detail: { method: method } }).catch(function () {});
      resolve(method);
    });
  }

  // Receipts are created as soon as a payment event is announced on any page that loads this file.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('accoom:transaction-succeeded', function (e) {
      var id = e && e.detail && e.detail.transactionId;
      if (id && Accoom.Records && Accoom.ACTD) ensureForTransaction(id).catch(function () { /* the page backfills on next open */ });
    });
  }

  Accoom.Receipts = {
    PURPOSE: PURPOSE, STATE_LABEL: STATE_LABEL, DELIVERY_TEXT: DELIVERY_TEXT,
    ensureForTransaction: ensureForTransaction, backfill: backfill, listFor: listFor, getFor: getFor, canSee: canSee, verify: verify, verifyUrlFor: verifyUrlFor, sealOf: sealOf,
    getAck: getAck, markDelivered: markDelivered, clientRespond: clientRespond, resolve: resolve, deliveriesFor: deliveriesFor, outstandingFor: outstandingFor,
    noticeFor: noticeFor, setListingDelivery: setListingDelivery,
    notify: notify, deliverInbox: deliverInbox
  };
})(window.Accoom);
