/* ==========================================================================
   ACCOOM — Transactions (Stage 4)
   --------------------------------------------------------------------------
   A transaction is the record that money moved for a property. Everything
   that follows (ACTD, receipt, tenancy, status change) hangs off a SUCCESSFUL
   transaction.

   HONESTY
   ACCOOM has no payment gateway yet, so there is no way to prove a payment
   from the browser. A button click is never proof of payment. This module
   therefore has exactly two entry points:

   1. Accoom.Transactions.recordDemoPayment(...)
        An explicitly labelled DEMONSTRATION event for testing the flow. The
        transaction is marked paymentSource "demo", and every document made
        from it says so ("No real money was moved").

   2. Accoom.Transactions.handleGatewayWebhook(payload)
        The future entry point for a payment confirmed by the gateway. It is
        NOT available in the frontend: confirming a payment needs a server
        that checks the gateway's signature. It refuses every call here.

   Repeated events are harmless: the idempotency key (the gateway's event id
   in future) makes the second call return the first transaction.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function code(len) {
    var out = '', b = new Uint8Array(len);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b); else for (var i = 0; i < len; i++) b[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < len; j++) out += ALPHABET.charAt(b[j] % ALPHABET.length);
    return out;
  }
  function readListing(id) {
    try { var l = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); return (Array.isArray(l) ? l : []).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
    catch (e) { return null; }
  }
  function money(n) { n = Number(n); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; }

  // Can this listing be paid for right now?
  function eligibility(l) {
    if (!l) return 'This listing no longer exists.';
    if (l.status !== 'available') return 'This property is not available (status: ' + l.status + ').';
    var a = l.approval;
    if (a && a.state !== 'legacy_unreviewed') {
      if (!(Accoom.ListingReview && Accoom.ListingReview.isPubliclyVisible(l))) return 'This listing has not been approved by ACCOOM, so it cannot be paid for.';
    }
    if (!money(l.price)) return 'This listing has no price.';
    return '';
  }

  function recordDemoPayment(input) {
    input = input || {};
    var eventId = String(input.eventId || '').trim();
    if (!eventId) return Promise.reject(fail('event_id_required', 'A payment event needs an id so it can never be counted twice.'));
    if (!input.customerId) return Promise.reject(fail('customer_required', 'Say who is paying.'));
    var l = readListing(input.listingId), why = eligibility(l);
    if (why) return Promise.reject(fail('not_payable', why));
    var isRent = l.category === 'rent', period = l.period, count = Math.max(1, Math.floor(Number(input.periodCount) || 1));
    var start = input.startDate || (Accoom.TenancyDates ? Accoom.TenancyDates.today() : '');
    var expiry = '';
    if (isRent) {
      if (['day', 'week', 'month', 'year'].indexOf(period) === -1) return Promise.reject(fail('bad_period', 'This rental has no billing period.'));
      try { expiry = Accoom.TenancyDates.expiryDate(start, period, count); } catch (e) { return Promise.reject(fail('bad_date', e.message)); }
    }
    var price = isRent ? money(l.price) * count : money(l.price);
    var agency = money(l.agencyFee), legal = money(l.legalFee);
    var tx = Accoom.Schemas.make.transaction({
      idempotencyKey: 'demo:' + eventId,
      type: isRent ? 'rent_payment' : 'sale_payment', status: 'succeeded', paymentSource: 'demo',
      propertyId: String(l.id), listingId: String(l.id), listingName: l.name,
      customerId: String(input.customerId), customerName: String(input.customerName || '').slice(0, 80),
      agentId: String(l.ownerId || 'local-agent'), agentName: String(l.agentName || '').slice(0, 80), landlordId: '',
      amounts: { unitPrice: money(l.price), price: price, agencyFee: agency, legalFee: legal, other: 0, total: price + agency + legal },
      billingPeriod: isRent ? period : '', periodCount: isRent ? count : 1, startDate: isRent ? start : '', expiryDate: expiry,
      paymentReference: 'DEMO-' + code(10), paymentMethod: 'Demonstration payment event', provider: 'ACCOOM demo (no payment gateway connected)',
      paidAt: nowIso(), receiptRef: 'ACR-' + new Date().getUTCFullYear() + '-' + code(10)
    });
    return Accoom.Records.collection('transactions').createUnique(tx).then(function (res) {
      var record = res.record;
      var after = res.created
        ? Accoom.Records.audit({ actorId: record.customerId, actorRole: 'customer', action: 'transaction.succeeded', entityType: 'transaction', entityId: record.id,
            detail: { type: record.type, source: 'demo', total: record.amounts.total } }).catch(function () {}).then(function () {
            try { if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: 'Payment confirmed (demo)', text: 'A demonstration payment for \u201C' + record.listingName + '\u201D was recorded. No real money was moved.', link: 'document-centre.html' }); } catch (e) { /* ignore */ }
            try { window.dispatchEvent(new CustomEvent('accoom:transaction-succeeded', { detail: { transactionId: record.id, type: record.type, listingId: record.listingId } })); } catch (e) { /* ignore */ }
          })
        : Promise.resolve();
      // Always make sure the ACTD exists. It is idempotent, so a repeat cannot create a second one.
      return after.then(function () { return Accoom.ACTD.generateForTransaction(record.id); }).then(function (g) {
        return Accoom.Records.collection('transactions').get(record.id).then(function (fresh) { return { transaction: fresh, actd: g.actd, created: res.created }; });
      });
    });
  }

  function handleGatewayWebhook() {
    return Promise.reject(fail('backend_required', 'A real payment can only be confirmed by a server that verifies the payment gateway\u2019s signature. This frontend cannot confirm payments.'));
  }

  Accoom.Transactions = {
    eligibility: eligibility,
    recordDemoPayment: recordDemoPayment,
    handleGatewayWebhook: handleGatewayWebhook,
    listFor: function (actor) {
      return Accoom.Records.collection('transactions').all().then(function (all) {
        return all.filter(function (t) {
          if (!actor) return false;
          if (actor.role === 'admin') return !!(Accoom.AdminDemo && Accoom.AdminDemo.isActive());
          if (actor.role === 'agent') return t.agentId === actor.id;
          return t.customerId === actor.id;
        }).sort(function (a, b) { return a.paidAt < b.paidAt ? 1 : -1; });
      });
    }
  };
})(window.Accoom);
