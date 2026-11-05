/* ==========================================================================
   ACCOOM — Tenancy lifecycle and renewal management (Stage 6)
   --------------------------------------------------------------------------
   A tenancy record is created for every SUCCESSFUL rental payment. It keeps
   the people, the property, the ACTD, the agreed rent, billing period, start
   and expiry dates, the reminders ACCOOM has sent and the renewal history.

   REMINDERS (70%, 80%, 90%, 100% of the agreed term)
     The share of the tenancy that has passed is worked out from the REAL
     start and expiry instants (midnight Nigerian time), so a 1-day rental, a
     week, a month and a year all work the same way. It is never a fixed
     number of calendar days. Each threshold is sent once: the notification
     has a unique key (tenancy + percentage), so reloading a page, opening two
     tabs or running the check again can never send it twice. If nobody opened
     ACCOOM for a while and several thresholds were passed, only the latest
     one is sent and the earlier ones are recorded as "skipped, too late".

   RENEWAL IS NEVER AUTOMATIC
     tenant decision -> agent offers terms (new amount, period, start) ->
     a renewal agreement is prepared and signed (Stage 5) -> payment ->
     NEW transaction + NEW ACTD + NEW receipt + NEW tenancy record.
     The old tenancy, its transaction and its ACTD are kept exactly as they were.
     The old tenancy is only marked "renewed" and linked to the new one.

   HONEST LIMITS
     - With no server, reminders can only be worked out when someone opens
       ACCOOM in this browser. A backend scheduler is needed for true
       automatic reminders.
     - Payments are DEMONSTRATION events. Nothing here proves real payment.
     - Messages pass through ACCOOM. Phone numbers and email addresses are
       refused, so neither side can read the other's private contact details.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var THRESHOLDS = [70, 80, 90, 100];
  var NG_OFFSET_MS = 3600000; // Nigeria is UTC+1 all year
  var ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  var ACTIVE = ['active', 'occupancy_extension'];

  var REMINDER = {
    70: { category: 'tenancy_70', title: 'Tenancy renewal period', text: 'Your ACCOOM tenancy is approaching its renewal period. You can now review your tenancy details and discuss renewal arrangements.' },
    80: { category: 'tenancy_80', title: 'Tenancy renewal reminder', text: 'Your tenancy is progressing towards its scheduled expiry date. Please review your renewal options.' },
    90: { category: 'tenancy_90', title: 'Tenancy will soon expire', text: 'Your tenancy will soon expire. Please confirm your renewal intentions.' },
    100: { category: 'tenancy_expiry', title: 'Scheduled expiry date reached', text: 'Your scheduled tenancy expiry date has arrived. Please review your tenancy status and any agreed occupancy extension.' }
  };
  var DECISION_TEXT = { renew: 'wants to renew', not_renew: 'does not want to renew', discuss: 'needs to discuss renewal' };

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function rec(name) { return Accoom.Records.collection(name); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function adminOk(a) { return a && a.role === 'admin' && Accoom.AdminDemo && Accoom.AdminDemo.isActive(); }
  function ngn(n) { return Accoom.ACTD.ngn(n); }
  function randomCode(len) {
    var out = '', b = new Uint8Array(len);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b); else for (var i = 0; i < len; i++) b[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < len; j++) out += ALPHABET.charAt(b[j] % ALPHABET.length);
    return out;
  }
  function readListing(id) {
    try { var l = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); return (Array.isArray(l) ? l : []).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
    catch (e) { return null; }
  }

  /* ----------------------------------------------------------- the maths */
  // Midnight (Nigerian time) at the start of a YYYY-MM-DD date, as a timestamp.
  function dayStartMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) throw fail('bad_date', 'Not a valid date: ' + s);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]) - NG_OFFSET_MS;
  }
  function span(t) {
    var a = dayStartMs(t.startDate), b = dayStartMs(t.expiryDate);
    if (!(b > a)) throw fail('bad_term', 'The expiry date must be after the start date.');
    return { start: a, end: b };
  }
  // Whole milliseconds, worked out with integers first so 70% of a day is exactly 16h 48m (no floating-point drift).
  function thresholdMs(t, pct) { var s = span(t); return s.start + Math.round(((s.end - s.start) * pct) / 100); }
  function thresholds(t) { var o = {}; THRESHOLDS.forEach(function (p) { o[p] = thresholdMs(t, p); }); return o; }

  // How much of the agreed term has passed at `now` (a timestamp).
  function progress(t, now) {
    now = now == null ? Date.now() : now;
    var s = span(t), ratio = (now - s.start) / (s.end - s.start);
    var pct = Math.max(0, Math.min(100, ratio * 100));
    return {
      percent: pct, rounded: Math.floor(pct), started: now >= s.start, expiryReached: now >= s.end,
      totalDays: Math.round((s.end - s.start) / 86400000),
      daysLeft: Math.max(0, Math.ceil((s.end - now) / 86400000)),
      renewalWindowOpen: now >= thresholdMs(t, 70)
    };
  }

  /* ----------------------------------------------------------- locks */
  var locks = {};
  function lock(id, fn) {
    var prev = locks[id] || Promise.resolve();
    var next = prev.then(fn, fn);
    locks[id] = next.then(function () {}, function () {});
    return next;
  }

  /* ----------------------------------------------------------- notify */
  function notify(n) {
    return Accoom.Receipts.notify(Object.assign({ link: 'tenancies.html' }, n));
  }
  function deliverInbox(actor) {
    if (!actor || !actor.id) return Promise.resolve(0);
    return rec('notifications').where(function (n) {
      return n.recipientId === actor.id && n.recipientRole === actor.role && !n.shownAt && /^(tenancy|renewal|message)/.test(n.category);
    }).then(function (list) {
      return Promise.all(list.map(function (n) {
        try { if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: n.title, text: n.message, link: n.link }); } catch (e) { /* ignore */ }
        return rec('notifications').put(Object.assign({}, n, { shownAt: nowIso() }));
      })).then(function () { return list.length; });
    });
  }
  function audit(actor, action, id, detail) {
    return Accoom.Records.audit({ actorId: actor && actor.id, actorRole: (actor && actor.role) || 'system', action: action, entityType: 'tenancy', entityId: id, detail: detail || {} }).catch(function () {});
  }

  /* ---------------------------------------------------------- creation */
  function buildTenancy(tx, listing, actd, extra) {
    var days = listing && listing.occupancyExtension && Number(listing.occupancyExtension.days) > 0 ? Math.floor(Number(listing.occupancyExtension.days)) : 0;
    var base = Accoom.Schemas.make.tenancy({
      id: 'ten_' + tx.id, propertyId: tx.propertyId, customerId: tx.customerId, agentId: tx.agentId, landlordId: tx.landlordId || '',
      actdId: actd ? actd.id : '', agreementId: '', rentAmount: tx.amounts.unitPrice, billingPeriod: tx.billingPeriod, periodCount: tx.periodCount,
      startDate: tx.startDate, expiryDate: tx.expiryDate, status: 'active', renewalDecision: 'none',
      occupancyExtension: { mode: days ? 'days' : 'none', days: days }, previousTenancyId: (extra && extra.previousTenancyId) || '',
      paymentHistory: [{ transactionId: tx.id, kind: (extra && extra.kind) || 'initial', amount: tx.amounts.total, paidAt: tx.paidAt, receiptRef: tx.receiptRef, actdNumber: actd ? actd.actdNumber : '', source: tx.paymentSource }],
      notificationHistory: []
    });
    return Object.assign(base, {
      listingId: tx.listingId, listingName: tx.listingName || (listing && listing.name) || '', transactionId: tx.id, actdNumber: actd ? actd.actdNumber : '',
      customerName: tx.customerName || '', agentName: tx.agentName || '', totalPaid: tx.amounts.total, paymentSource: tx.paymentSource,
      reminders: {}, renewalHistory: [], messages: [], renewalId: '', renewedByTenancyId: ''
    });
  }

  // Idempotent: the id is derived from the transaction, so a repeated event never makes a second tenancy.
  function ensureForTransaction(txId) {
    return rec('transactions').get(txId).then(function (tx) {
      if (!tx) throw fail('not_found', 'Transaction not found.');
      if (tx.status !== 'succeeded') throw fail('not_paid', 'A tenancy starts only after a payment is confirmed as successful.');
      if (tx.type !== 'rent_payment') throw fail('not_rental', 'Only a rental payment starts a tenancy.');
      return rec('tenancies').get('ten_' + txId).then(function (existing) {
        if (existing) return { tenancy: existing, created: false };
        return Accoom.ACTD.generateForTransaction(txId).then(function (g) {
          return createFrom(tx, g.actd, null);
        });
      });
    });
  }

  function createFrom(tx, actd, extra) {
    var t = buildTenancy(tx, readListing(tx.listingId), actd, extra);
    try { span(t); } catch (e) { return Promise.reject(e); }
    return rec('tenancies').create(t).then(function (saved) {
      return audit({ id: tx.customerId, role: 'system' }, 'tenancy.created', saved.id, { transactionId: tx.id, start: saved.startDate, expiry: saved.expiryDate, period: saved.billingPeriod }).then(function () {
        var jobs = [];
        if (!extra) {
          jobs.push(notify({ dedupeKey: 'ten:' + saved.id + ':started:c', category: 'tenancy_started', recipientId: saved.customerId, recipientRole: 'customer', title: 'Your tenancy has started',
            message: '\u201C' + saved.listingName + '\u201D: ' + saved.startDate + ' to ' + saved.expiryDate + '. ACCOOM will remind you as the term runs out.' }));
          jobs.push(notify({ dedupeKey: 'ten:' + saved.id + ':started:a', category: 'tenancy_started', recipientId: saved.agentId, recipientRole: 'agent', title: 'New tenancy',
            message: 'A tenancy for \u201C' + saved.listingName + '\u201D was recorded (' + saved.startDate + ' to ' + saved.expiryDate + ').' }));
        }
        return Promise.all(jobs);
      }).then(function () { return { tenancy: saved, created: true }; });
    }, function (err) {
      if (err && err.code === 'exists') return rec('tenancies').get('ten_' + tx.id).then(function (x) { return { tenancy: x, created: false }; });
      throw err;
    });
  }

  function backfill(actor) {
    if (!actor) return Promise.resolve(0);
    return Accoom.Transactions.listFor(actor).then(function (txs) {
      var rentals = txs.filter(function (t) { return t.status === 'succeeded' && t.type === 'rent_payment'; });
      return Promise.all(rentals.map(function (t) { return ensureForTransaction(t.id).then(function (r) { return r.created ? 1 : 0; }, function () { return 0; }); }));
    }).then(function (n) { return n.reduce(function (a, b) { return a + b; }, 0); });
  }

  /* ---------------------------------------------------------- access */
  function canSee(actor, t) {
    if (!actor) return false;
    if (actor.role === 'admin') return !!adminOk(actor);
    if (actor.role === 'agent') return !!actor.id && t.agentId === actor.id;
    return actor.role === 'customer' && !!actor.id && t.customerId === actor.id;
  }
  function listFor(actor) {
    return rec('tenancies').all().then(function (all) { return all.filter(function (t) { return canSee(actor, t); }).sort(function (a, b) { return a.expiryDate < b.expiryDate ? -1 : 1; }); });
  }
  function getFor(actor, id) {
    return rec('tenancies').get(id).then(function (t) { if (!t || !canSee(actor, t)) throw fail('not_found', 'Tenancy not found.'); return t; });
  }
  // The tenancy, the ones before it and the ones after it (oldest first).
  function chain(actor, id) {
    return rec('tenancies').all().then(function (all) {
      var by = {}; all.forEach(function (t) { by[t.id] = t; });
      var cur = by[id]; if (!cur || !canSee(actor, cur)) throw fail('not_found', 'Tenancy not found.');
      var out = [cur];
      while (out[0].previousTenancyId && by[out[0].previousTenancyId]) out.unshift(by[out[0].previousTenancyId]);
      while (out[out.length - 1].renewedByTenancyId && by[out[out.length - 1].renewedByTenancyId]) out.push(by[out[out.length - 1].renewedByTenancyId]);
      return out.filter(function (t) { return canSee(actor, t); });
    });
  }

  /* -------------------------------------------------------- reminders */
  // Looks at one tenancy at time `now` and sends what is due, once.
  function checkOne(id, now) {
    now = now == null ? Date.now() : now;
    return lock(id, function () {
      return rec('tenancies').get(id).then(function (t) {
        if (!t || ACTIVE.indexOf(t.status) === -1) return { sent: [], skipped: [] };
        var due = THRESHOLDS.filter(function (p) { return !t.reminders[p] && now >= thresholdMs(t, p); });
        if (!due.length) return { sent: [], skipped: [] };
        var latest = due[due.length - 1], reminders = clone(t.reminders), history = clone(t.notificationHistory), sent = [], skipped = [];
        var jobs = due.map(function (p) {
          var at = nowIso();
          if (p !== latest) { reminders[p] = { state: 'skipped_late', at: at }; skipped.push(p); return Promise.resolve(); }
          var R = REMINDER[p];
          return notify({ dedupeKey: 'ten:' + id + ':' + p, category: R.category, recipientId: t.customerId, recipientRole: 'customer', title: R.title,
            message: R.text + ' (' + t.listingName + ')', link: 'tenancies.html#' + id }).then(function (res) {
            if (!res) return null; // could not be saved: leave it unset so the next check tries again
            var created = res.created;
            reminders[p] = { state: created ? 'sent' : 'already_sent', at: at, notificationId: res && res.record ? res.record.id : '' };
            if (created) { history.push({ percent: p, at: at, notificationId: res.record.id, to: 'customer' }); sent.push(p); }
            if (p >= 90 && created) return notify({ dedupeKey: 'ten:' + id + ':' + p + ':agent', category: R.category, recipientId: t.agentId, recipientRole: 'agent',
              title: p === 100 ? 'Tenancy reached its scheduled expiry' : 'Tenancy will soon expire', message: '\u201C' + t.listingName + '\u201D (' + t.customerName + '): ' + (p === 100 ? 'the scheduled expiry date has arrived.' : 'the tenant has been asked to confirm renewal intentions.'), link: 'tenancies.html#' + id });
          });
        });
        return Promise.all(jobs).then(function () {
          return rec('tenancies').put(Object.assign({}, t, { reminders: reminders, notificationHistory: history }));
        }).then(function () { return audit({ role: 'system' }, 'tenancy.reminders', id, { sent: sent, skipped: skipped }); }).then(function () { return { sent: sent, skipped: skipped }; });
      });
    });
  }

  function checkAll(now) {
    return rec('tenancies').all().then(function (all) {
      return Promise.all(all.map(function (t) { return checkOne(t.id, now).catch(function () { return { sent: [], skipped: [] }; }); }));
    }).then(function (rs) { return rs.reduce(function (n, r) { return n + r.sent.length; }, 0); });
  }

  /* ---------------------------------------------------- tenant decision */
  function decide(actor, id, decision, note, now) {
    if (!actor || actor.role !== 'customer') return Promise.reject(fail('forbidden', 'Only the tenant can tell ACCOOM their renewal decision.'));
    if (!DECISION_TEXT[decision]) return Promise.reject(fail('bad_decision', 'Choose one of the options.'));
    note = String(note || '').trim().slice(0, 300);
    return lock(id, function () {
      return rec('tenancies').get(id).then(function (t) {
        if (!t || t.customerId !== actor.id) throw fail('forbidden', 'This tenancy is not yours.');
        if (ACTIVE.indexOf(t.status) === -1) throw fail('bad_state', t.status === 'renewed' ? 'This tenancy has already been renewed.' : 'This tenancy is not open for a renewal decision.');
        if (!progress(t, now).renewalWindowOpen) throw fail('too_early', 'The renewal window opens when 70% of the tenancy has passed.');
        var entry = { decision: decision, at: nowIso(), by: actor.id, note: note };
        var next = Object.assign({}, t, { renewalDecision: decision, renewalHistory: t.renewalHistory.concat([entry]) });
        return rec('tenancies').put(next).then(function (saved) {
          var after = Promise.resolve();
          if (decision === 'not_renew' && t.renewalId) after = rec('renewals').get(t.renewalId).then(function (r) { return r && r.status === 'offered' ? rec('renewals').put(Object.assign({}, r, { status: 'declined' })) : null; });
          return after.then(function () {
            return notify({ dedupeKey: 'ten:' + id + ':decision:' + saved.renewalHistory.length, category: 'renewal_requested', recipientId: t.agentId, recipientRole: 'agent', title: 'Renewal decision',
              message: 'The tenant of \u201C' + t.listingName + '\u201D ' + DECISION_TEXT[decision] + '.' + (note ? ' Note: ' + note : '') });
          }).then(function () { return audit(actor, 'tenancy.renewal_decision', id, { decision: decision }); }).then(function () { return saved; });
        });
      });
    });
  }

  /* ------------------------------------------------------------ messages */
  var EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/, PHONE = /(?:\+?\d[\s().-]?){10,}/;
  function sendMessage(actor, id, text) {
    text = String(text || '').trim();
    if (!actor || (actor.role !== 'customer' && actor.role !== 'agent')) return Promise.reject(fail('forbidden', 'Sign in to send a message.'));
    if (text.length < 2) return Promise.reject(fail('empty', 'Type your message.'));
    if (text.length > 500) return Promise.reject(fail('too_long', 'Keep the message under 500 characters.'));
    if (EMAIL.test(text) || PHONE.test(text)) return Promise.reject(fail('contact_details', 'For privacy, do not share phone numbers or email addresses here. ACCOOM passes your message on for you.'));
    return lock(id, function () {
      return rec('tenancies').get(id).then(function (t) {
        if (!t || !canSee(actor, t) || actor.role === 'admin') throw fail('forbidden', 'This tenancy is not yours.');
        var msg = { id: Accoom.Records.newId('msg'), role: actor.role, name: actor.role === 'agent' ? t.agentName : t.customerName, at: nowIso(), text: text };
        return rec('tenancies').put(Object.assign({}, t, { messages: t.messages.concat([msg]).slice(-200) })).then(function (saved) {
          var toAgent = actor.role === 'customer';
          return notify({ dedupeKey: 'ten:' + id + ':msg:' + msg.id, category: 'message_tenancy', recipientId: toAgent ? t.agentId : t.customerId, recipientRole: toAgent ? 'agent' : 'customer',
            title: 'New message about \u201C' + t.listingName + '\u201D', message: (toAgent ? t.customerName : t.agentName) + ' sent you a message.', link: 'tenancies.html#' + id })
            .then(function () { return audit(actor, 'tenancy.message', id, { messageId: msg.id }); }).then(function () { return saved; });
        });
      });
    });
  }

  /* ---------------------------------------------------- renewal offer */
  function termsText(t, o, expiry) {
    var P = { day: 'day', week: 'week', month: 'month', year: 'year' }, n = o.periodCount, w = P[o.billingPeriod] + (n > 1 ? 's' : '');
    return 'RENEWAL AGREEMENT\n\nProperty: ' + t.listingName + '\nTenant: ' + t.customerName + '\nAgent: ' + t.agentName +
      '\n\nThe tenancy that runs from ' + t.startDate + ' to ' + t.expiryDate + ' is renewed on the following terms.\n\nNew rent: ' + ngn(o.amount) + ' per ' + P[o.billingPeriod] +
      '\nRenewal period: ' + n + ' ' + w + '\nNew start date: ' + o.startDate + '\nNew expiry date: ' + expiry + '\nTotal for the renewal period: ' + ngn(o.amount * n) +
      '\n\nAll other terms of the original tenancy agreement stay the same unless they are changed in writing. Renewal is not automatic: it takes effect only when the tenant has signed this agreement and the renewal payment is confirmed through ACCOOM.';
  }

  function offerRenewal(actor, id, input) {
    input = input || {};
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can offer renewal terms.'));
    var amount = Math.round(Number(input.amount) * 100) / 100, count = Number(input.periodCount), period = input.billingPeriod;
    if (!isFinite(amount) || amount <= 0) return Promise.reject(fail('bad_amount', 'Enter the new rent as a number above zero.'));
    if (['day', 'week', 'month', 'year'].indexOf(period) === -1) return Promise.reject(fail('bad_period', 'Choose day, week, month or year.'));
    if (!isFinite(count) || count < 1 || Math.floor(count) !== count || count > 120) return Promise.reject(fail('bad_count', 'The number of periods must be a whole number from 1 to 120.'));
    return lock(id, function () {
      return rec('tenancies').get(id).then(function (t) {
        if (!t || t.agentId !== actor.id) throw fail('forbidden', 'You can only offer renewal for your own tenancies.');
        if (ACTIVE.indexOf(t.status) === -1) throw fail('bad_state', 'This tenancy is not open for renewal.');
        if (t.renewalDecision !== 'renew' && t.renewalDecision !== 'discuss') throw fail('no_request', 'The tenant has not asked to renew or discuss renewal yet.');
        var start = String(input.startDate || t.expiryDate);
        if (!Accoom.TenancyDates.isValid(start)) throw fail('bad_date', 'Enter a valid start date.');
        if (start < t.expiryDate) throw fail('overlap', 'The renewal cannot start before the current tenancy ends (' + t.expiryDate + ').');
        var expiry = Accoom.TenancyDates.expiryDate(start, period, count);
        return (t.renewalId ? rec('renewals').get(t.renewalId) : Promise.resolve(null)).then(function (open) {
          if (open && open.status === 'offered') throw fail('offer_open', 'There is already an open renewal offer. Withdraw it first.');
          var terms = { amount: amount, billingPeriod: period, periodCount: count, startDate: start };
          return Accoom.Agreements.create(actor, t.transactionId, { kind: 'renewal_agreement', title: 'Renewal agreement for ' + t.listingName, text: termsText(t, terms, expiry) }).then(function (agr) {
            var r = Object.assign(Accoom.Schemas.make.renewal({ id: Accoom.Records.newId('ren'), tenancyId: id, decision: 'renew', newAmount: amount, newBillingPeriod: period, newStartDate: start, newExpiryDate: expiry }), {
              status: 'offered', periodCount: count, totalAmount: Math.round(amount * count * 100) / 100, agreementId: agr.id, customerId: t.customerId, agentId: t.agentId, listingId: t.listingId,
              originalTransactionId: t.transactionId, offeredAt: nowIso(), newTenancyId: '', newActdNumber: '' });
            return rec('renewals').create(r).then(function (saved) {
              return rec('tenancies').put(Object.assign({}, t, { renewalId: saved.id, agreementId: t.agreementId || agr.id })).then(function () {
                return notify({ dedupeKey: 'ren:' + saved.id + ':offer', category: 'renewal_requested', recipientId: t.customerId, recipientRole: 'customer', title: 'Renewal offer',
                  message: 'Your agent offered to renew \u201C' + t.listingName + '\u201D at ' + ngn(amount) + ' per ' + period + ' for ' + count + ' ' + period + (count > 1 ? 's' : '') + '. Please read and sign the renewal agreement.' });
              }).then(function () { return audit(actor, 'tenancy.renewal_offered', id, { renewalId: saved.id, expiry: expiry }); }).then(function () { return saved; });
            }, function (err) { return Accoom.Agreements.cancel(actor, agr.id, 'The renewal offer could not be saved').catch(function () {}).then(function () { throw err; }); });
          });
        });
      });
    });
  }

  function withdrawOffer(actor, renewalId, reason) {
    reason = String(reason || '').trim();
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can withdraw an offer.'));
    if (reason.length < 5) return Promise.reject(fail('reason_required', 'Say why the offer is withdrawn.'));
    return rec('renewals').get(renewalId).then(function (r) {
      if (!r || r.agentId !== actor.id) throw fail('forbidden', 'This offer is not yours.');
      if (r.status !== 'offered') throw fail('bad_state', 'This offer is already closed.');
      return Accoom.Agreements.cancel(actor, r.agreementId, reason).catch(function () {}).then(function () {
        return rec('renewals').put(Object.assign({}, r, { status: 'withdrawn', withdrawnReason: reason }));
      });
    });
  }

  function renewalFor(actor, tenancyId) {
    return getFor(actor, tenancyId).then(function (t) { return t.renewalId ? rec('renewals').get(t.renewalId) : null; });
  }

  /* ---------------------------------------------------- renewal payment */
  // DEMONSTRATION payment for a renewal. Proves nothing about real money.
  function payRenewalDemo(actor, renewalId) {
    if (!actor || actor.role !== 'customer') return Promise.reject(fail('forbidden', 'Only the tenant can pay for the renewal.'));
    return rec('renewals').get(renewalId).then(function (r) {
      if (!r || r.customerId !== actor.id) throw fail('forbidden', 'This renewal is not yours.');
      if (r.status === 'completed') return rec('transactions').get(r.newTransactionId).then(function (tx) { return finish(r, tx, false); });
      if (r.status !== 'offered') throw fail('bad_state', 'This renewal offer is no longer open.');
      return Accoom.Agreements.getFor(actor, r.agreementId).then(function (agr) {
        if (['client_signed', 'completed'].indexOf(agr.status) === -1) throw fail('sign_first', 'Sign the renewal agreement before you pay.');
        return rec('tenancies').get(r.tenancyId).then(function (t) {
          var amounts = { unitPrice: r.newAmount, price: r.totalAmount, agencyFee: 0, legalFee: 0, other: 0, total: r.totalAmount };
          var tx = Accoom.Schemas.make.transaction({
            idempotencyKey: 'demo:renewal:' + renewalId, type: 'renewal_payment', status: 'succeeded', paymentSource: 'demo',
            propertyId: t.propertyId, listingId: t.listingId, listingName: t.listingName, customerId: t.customerId, customerName: t.customerName,
            agentId: t.agentId, agentName: t.agentName, landlordId: t.landlordId || '', amounts: amounts, billingPeriod: r.newBillingPeriod, periodCount: r.periodCount,
            startDate: r.newStartDate, expiryDate: r.newExpiryDate, paymentReference: 'DEMO-' + randomCode(10), paymentMethod: 'Demonstration payment event',
            provider: 'ACCOOM demo (no payment gateway connected)', paidAt: nowIso(), receiptRef: 'ACR-' + new Date().getUTCFullYear() + '-' + randomCode(10)
          });
          return rec('transactions').createUnique(tx).then(function (res) {
            var first = res.created;
            return Accoom.Records.audit({ actorId: actor.id, actorRole: 'customer', action: 'transaction.succeeded', entityType: 'transaction', entityId: res.record.id, detail: { type: 'renewal_payment', source: 'demo', total: amounts.total } }).catch(function () {})
              .then(function () { return finish(r, res.record, first); });
          });
        });
      });
    });
  }

  // Everything that follows a successful renewal payment. Safe to run twice.
  function finish(r, tx, first) {
    if (first) { try { window.dispatchEvent(new CustomEvent('accoom:transaction-succeeded', { detail: { transactionId: tx.id, type: tx.type, listingId: tx.listingId } })); } catch (e) { /* ignore */ } }
    return Accoom.ACTD.generateForTransaction(tx.id).then(function (g) {
      return (Accoom.Receipts ? Accoom.Receipts.ensureForTransaction(tx.id).catch(function () {}) : Promise.resolve()).then(function () {
        return rec('tenancies').get(r.tenancyId).then(function (old) {
          return rec('tenancies').get('ten_' + tx.id).then(function (existing) {
            if (existing) return existing;
            var t2 = buildTenancy(tx, readListing(tx.listingId), g.actd, { previousTenancyId: old.id, kind: 'renewal' });
            t2.agreementId = r.agreementId;
            return rec('tenancies').create(t2).catch(function (e) { if (e && e.code === 'exists') return rec('tenancies').get('ten_' + tx.id); throw e; });
          }).then(function (fresh) {
            var jobs = [];
            if (old.status !== 'renewed') {
              jobs.push(rec('tenancies').put(Object.assign({}, old, { status: 'renewed', renewedByTenancyId: fresh.id, renewalHistory: old.renewalHistory.concat([{ decision: 'renewed', at: nowIso(), by: 'system', note: 'Renewed by transaction ' + tx.id }]) })));
            }
            if (r.status !== 'completed') jobs.push(rec('renewals').put(Object.assign({}, r, { status: 'completed', newTransactionId: tx.id, newTenancyId: fresh.id, newActdNumber: g.actd.actdNumber, completedAt: nowIso() })));
            return Promise.all(jobs).then(function () {
              return first ? notify({ dedupeKey: 'ren:' + r.id + ':paid', category: 'renewal_confirmed', recipientId: old.agentId, recipientRole: 'agent', title: 'Renewal confirmed',
                message: 'The tenant renewed \u201C' + old.listingName + '\u201D until ' + fresh.expiryDate + '. A new ACTD was issued (' + g.actd.actdNumber + ').' }) : null;
            }).then(function () { return audit({ role: 'system' }, 'tenancy.renewed', old.id, { newTenancyId: fresh.id, transactionId: tx.id }); })
              .then(function () { return { transaction: tx, actd: g.actd, tenancy: fresh, previousTenancyId: old.id, created: first }; });
          });
        });
      });
    });
  }

  // A rental payment announced on any page that loads this file starts the tenancy.
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('accoom:transaction-succeeded', function (e) {
      var d = e && e.detail;
      if (d && d.type === 'rent_payment' && Accoom.Records && Accoom.ACTD) ensureForTransaction(d.transactionId).catch(function () { /* backfilled on next open */ });
    });
  }

  Accoom.Tenancy = {
    THRESHOLDS: THRESHOLDS, REMINDER: REMINDER, ACTIVE: ACTIVE,
    progress: progress, thresholds: thresholds, thresholdMs: thresholdMs, dayStartMs: dayStartMs,
    ensureForTransaction: ensureForTransaction, backfill: backfill, listFor: listFor, getFor: getFor, chain: chain, canSee: canSee,
    checkOne: checkOne, checkAll: checkAll, decide: decide, sendMessage: sendMessage,
    offerRenewal: offerRenewal, withdrawOffer: withdrawOffer, renewalFor: renewalFor, payRenewalDemo: payRenewalDemo, deliverInbox: deliverInbox
  };
})(window.Accoom);
