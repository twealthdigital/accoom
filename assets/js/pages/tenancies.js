/* ==========================================================================
   ACCOOM — My tenancies (Stage 6)
   Tenants: see term progress, reminder status, renewal options; tell ACCOOM
   whether they want to renew; sign and pay (demo) for a renewal offer.
   Agents: see each tenant's decision, offer renewal terms, withdraw offers.
   Both: message each other through ACCOOM (no phone numbers or emails).
   Reminders are worked out when ACCOOM is opened in this browser. A server
   scheduler is needed for fully automatic reminders.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.Accoom;
  var $ = function (s) { return document.querySelector(s); };
  var listEl = $('[data-tn-list]'), msgEl = $('[data-tn-msg]'), subEl = $('[data-tn-sub]'), noteEl = $('[data-tn-note]');
  var me = null, busy = false, cache = {}, extras = {};

  var PERIOD = { day: 'day', week: 'week', month: 'month', year: 'year' };
  var DECISIONS = [['renew', 'I want to renew'], ['not_renew', 'I do not want to renew'], ['discuss', 'I need to discuss renewal']];
  var DECISION_LABEL = { none: 'No decision yet', renew: 'Wants to renew', not_renew: 'Does not want to renew', discuss: 'Needs to discuss renewal' };

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function say(text, bad) { msgEl.hidden = !text; msgEl.textContent = text || ''; msgEl.className = 'dc-msg' + (bad ? ' dc-msg--bad' : ''); }
  function naira(n) { return '\u20A6' + Number(n || 0).toLocaleString('en-NG'); }
  function when(iso) { try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } }
  function dayText(ms) { return new Date(ms + 3600000).toISOString().slice(0, 10); } // Nigerian date of an instant
  function isAgent() { return !!me && me.role === 'agent'; }
  function errText(e, f) { return (e && e.message) || f || 'Something went wrong. Please try again.'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function statusText(t, p) {
    if (t.status === 'renewed') return 'Renewed';
    if (t.status === 'occupancy_extension') return 'In Occupancy Extension';
    if (!p.started) return 'Starts on ' + t.startDate;
    if (p.expiryReached) return 'Scheduled expiry date reached';
    return 'Active';
  }

  /* ------------------------------------------------------------------ card */
  function reminderSteps(t) {
    var th = A.Tenancy.thresholds(t);
    return '<div class="tn-steps">' + A.Tenancy.THRESHOLDS.map(function (pct) {
      var r = t.reminders[pct], label, cls = '';
      if (r && (r.state === 'sent' || r.state === 'already_sent')) { label = 'Reminder sent ' + dayText(new Date(r.at).getTime()); cls = ' tn-step--sent'; }
      else if (r && r.state === 'skipped_late') label = 'Skipped (passed before ACCOOM was opened)';
      else label = 'Due ' + dayText(th[pct]);
      return '<div class="tn-step' + cls + '"><strong>' + pct + '%</strong>' + esc(label) + '</div>';
    }).join('') + '</div>';
  }

  function card(t) {
    var p = A.Tenancy.progress(t), ex = extras[t.id] || {};
    var h = '<article class="tn-card" id="' + esc(t.id) + '" data-tn="' + esc(t.id) + '">' +
      '<div class="tn-head"><div><p class="tn-title">' + esc(t.listingName) + '</p><span class="dc-meta">' + (isAgent() ? 'Tenant: ' + esc(t.customerName || 'Not provided') : 'Agent: ' + esc(t.agentName || 'Not provided')) + '</span></div>' +
      '<span><span class="dc-pill">' + esc(statusText(t, p)) + '</span>' + (t.paymentSource === 'demo' ? ' <span class="dc-pill dc-pill--demo">DEMO</span>' : '') + '</span></div>' +
      '<div class="tn-grid">' +
        '<div class="tn-fact"><small>Start date</small><span>' + esc(t.startDate) + '</span></div><div class="tn-fact"><small>Scheduled expiry</small><span>' + esc(t.expiryDate) + '</span></div>' +
        '<div class="tn-fact"><small>Rental period</small><span>' + esc(plural(t.periodCount, PERIOD[t.billingPeriod])) + '</span></div><div class="tn-fact"><small>Rent</small><span>' + esc(naira(t.rentAmount)) + ' per ' + esc(PERIOD[t.billingPeriod]) + '</span></div>' +
      '</div>' +
      '<div class="tn-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.rounded + '"><span style="width:' + p.percent.toFixed(1) + '%"></span></div>' +
      '<span class="tn-bar-label">' + (p.started ? p.rounded + '% of this tenancy has passed' + (p.expiryReached ? '' : ' \u00B7 ' + plural(p.daysLeft, 'day') + ' left') : 'This tenancy has not started yet') + '</span>' +
      '<p class="tn-h">Reminders</p>' + reminderSteps(t) +
      '<p class="tn-h">Occupancy Extension</p><span class="dc-meta">' + (t.occupancyExtension && t.occupancyExtension.days > 0
        ? plural(t.occupancyExtension.days, 'day') + ' after the scheduled expiry date, as agreed in the tenancy terms.' : 'None was agreed for this tenancy.') + '</span>' +
      '<p class="tn-h">Payments</p><ul class="td-timeline">' + t.paymentHistory.map(function (x) {
        return '<li>' + esc(x.kind === 'renewal' ? 'Renewal' : 'Rent') + ' \u00B7 ' + esc(naira(x.amount)) + ' \u00B7 ' + esc(when(x.paidAt)) + ' \u00B7 ' + esc(x.receiptRef) + (x.actdNumber ? ' \u00B7 ' + esc(x.actdNumber) : '') + (x.source === 'demo' ? ' (demo)' : '') + '</li>'; }).join('') + '</ul>';
    if (ex.chain && ex.chain.length > 1) h += '<p class="tn-h">Earlier and later tenancies</p><ul class="td-timeline">' + ex.chain.map(function (c) {
      return '<li>' + (c.id === t.id ? '<strong>This one</strong>' : '<a href="#' + esc(c.id) + '">' + esc(c.startDate + ' to ' + c.expiryDate) + '</a>') + ' \u00B7 ' + esc(c.status) + '</li>'; }).join('') + '</ul>';
    h += renewalSection(t, p, ex) + messageSection(t) + '</article>';
    return h;
  }

  function renewalSection(t, p, ex) {
    var h = '<p class="tn-h">Renewal</p>';
    if (t.status === 'renewed') {
      return h + '<span class="dc-meta">This tenancy was renewed. ' + (t.renewedByTenancyId ? '<a href="#' + esc(t.renewedByTenancyId) + '">See the new tenancy</a>.' : '') + ' The original record and its ACTD are kept.</span>';
    }
    var open = ex.renewal && ex.renewal.status === 'offered' ? ex.renewal : null;
    h += '<span class="dc-meta">Decision: <strong>' + esc(DECISION_LABEL[t.renewalDecision]) + '</strong>' + (t.renewalHistory.length ? ' \u00B7 ' + esc(when(t.renewalHistory[t.renewalHistory.length - 1].at)) : '') + '</span>';
    if (!isAgent()) {
      if (!p.renewalWindowOpen) h += '<span class="dc-meta">The renewal window opens on ' + esc(dayText(A.Tenancy.thresholdMs(t, 70))) + ' (when 70% of the tenancy has passed).</span>';
      else {
        h += '<div class="tn-decisions">' + DECISIONS.map(function (d) {
          return '<button type="button" class="dc-btn tn-decision" aria-pressed="' + (t.renewalDecision === d[0]) + '" data-tn-act="decide" data-d="' + d[0] + '" data-id="' + esc(t.id) + '">' + d[1] + '</button>'; }).join('') + '</div>' +
          '<label class="dc-label" for="tn-note-' + esc(t.id) + '">Add a note (optional)</label><input class="dc-input" id="tn-note-' + esc(t.id) + '" data-tn-note type="text" maxlength="300" />' +
          '<span class="dc-meta">Choosing an option does not renew anything. Your agent is told, and renewal only happens after you sign an agreement and pay.</span>';
      }
    } else if (!open && (t.renewalDecision === 'renew' || t.renewalDecision === 'discuss')) {
      h += '<div class="td-form" data-tn-offer="' + esc(t.id) + '"><strong>Offer renewal terms</strong><div class="tn-row2"><div><label class="dc-label" for="of-amt-' + esc(t.id) + '">New rent per period (NGN)</label>' +
        '<input class="dc-input" id="of-amt-' + esc(t.id) + '" data-of-amount type="number" min="1" inputmode="decimal" value="' + esc(t.rentAmount) + '" /></div><div><label class="dc-label" for="of-per-' + esc(t.id) + '">Billing period</label>' +
        '<select class="dc-input" id="of-per-' + esc(t.id) + '" data-of-period>' + ['day', 'week', 'month', 'year'].map(function (x) { return '<option value="' + x + '"' + (x === t.billingPeriod ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' +
        '<div><label class="dc-label" for="of-cnt-' + esc(t.id) + '">Number of periods</label><input class="dc-input" id="of-cnt-' + esc(t.id) + '" data-of-count type="number" min="1" max="120" value="1" inputmode="numeric" /></div>' +
        '<div><label class="dc-label" for="of-st-' + esc(t.id) + '">New start date</label><input class="dc-input" id="of-st-' + esc(t.id) + '" data-of-start type="date" value="' + esc(t.expiryDate) + '" /></div></div>' +
        '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--primary dc-btn--sm" data-tn-act="offer" data-id="' + esc(t.id) + '">Send offer and renewal agreement</button></div></div>';
    } else if (!open) h += '<span class="dc-meta">Waiting for the tenant to ask to renew.</span>';
    if (open) {
      h += '<div class="tn-offer"><strong>Renewal offer</strong><br>' + esc(naira(open.newAmount)) + ' per ' + esc(PERIOD[open.newBillingPeriod]) + ' for ' + esc(plural(open.periodCount, PERIOD[open.newBillingPeriod])) +
        '<br>From ' + esc(open.newStartDate) + ' to ' + esc(open.newExpiryDate) + ' \u00B7 Total ' + esc(naira(open.totalAmount)) +
        '<br>Agreement: ' + esc(ex.agreement ? A.Agreements.STATUS_LABEL[ex.agreement.status] : 'unknown') + '</div>';
      if (!isAgent()) {
        var signed = ex.agreement && ['client_signed', 'completed'].indexOf(ex.agreement.status) !== -1;
        h += '<div class="dc-actions"><a class="dc-btn dc-btn--sm" style="display:inline-flex;align-items:center;text-decoration:none" href="transaction-documents.html#agreements">Read and sign the renewal agreement</a>' +
          '<button type="button" class="dc-btn dc-btn--primary dc-btn--sm" data-tn-act="pay" data-id="' + esc(open.id) + '"' + (signed ? '' : ' disabled') + '>Pay for the renewal (demonstration)</button></div>' +
          '<span class="dc-meta">' + (signed ? 'This is a DEMONSTRATION payment. No real money moves. A new ACTD and receipt are issued.' : 'You can pay after you have signed the renewal agreement.') + '</span>';
      } else h += '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--sm" data-tn-act="withdraw" data-id="' + esc(open.id) + '">Withdraw this offer</button></div>';
    }
    return h;
  }

  function messageSection(t) {
    return '<p class="tn-h">Messages (through ACCOOM)</p><div class="tn-chat">' + (t.messages.length ? t.messages.slice(-30).map(function (m) {
      return '<div class="tn-msg' + (m.role === me.role ? ' tn-msg--me' : '') + '"><small>' + esc(m.role === me.role ? 'You' : m.name || (m.role === 'agent' ? 'Agent' : 'Tenant')) + ' \u00B7 ' + esc(when(m.at)) + '</small>' + esc(m.text) + '</div>'; }).join('')
      : '<span class="dc-meta">No messages yet.</span>') + '</div>' +
      '<label class="dc-label" for="tn-msg-' + esc(t.id) + '">' + (isAgent() ? 'Message the tenant' : 'Message your agent / landlord') + '</label>' +
      '<input class="dc-input" id="tn-msg-' + esc(t.id) + '" data-tn-msgtext type="text" maxlength="500" placeholder="Do not share phone numbers or email addresses" />' +
      '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--sm" data-tn-act="send" data-id="' + esc(t.id) + '">Send message</button></div>';
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    if (!me) { listEl.innerHTML = '<div class="dc-empty">Sign in to see your tenancies. <a href="auth.html">Sign in or create an account</a></div>'; return Promise.resolve(); }
    listEl.innerHTML = '<div class="dc-empty">Loading\u2026</div>';
    return A.Tenancy.backfill(me).then(function () { return A.Tenancy.checkAll(); }).then(function () { return A.Tenancy.listFor(me); }).then(function (list) {
      cache = {}; list.forEach(function (t) { cache[t.id] = t; });
      return Promise.all(list.map(function (t) {
        return Promise.all([A.Tenancy.chain(me, t.id).catch(function () { return [t]; }), A.Tenancy.renewalFor(me, t.id).catch(function () { return null; })]).then(function (r) {
          extras[t.id] = { chain: r[0], renewal: r[1] };
          return r[1] ? A.Agreements.getFor(me, r[1].agreementId).then(function (a) { extras[t.id].agreement = a; }, function () {}) : null;
        });
      })).then(function () {
        listEl.innerHTML = list.length ? list.map(card).join('') : '<div class="dc-empty">' + (isAgent() ? 'No tenancies yet. One starts automatically for every successful rental payment on your listings.' : 'No tenancies yet. After a successful rental payment, your tenancy appears here.') + '</div>';
        var h = (window.location.hash || '').replace('#', ''), el = h && document.getElementById(h);
        if (el && el.scrollIntoView) el.scrollIntoView();
      });
    }, function (e) { listEl.innerHTML = '<div class="dc-empty">' + esc(errText(e, 'Your tenancies could not be loaded.')) + '</div>'; })
      .then(function () { return A.Tenancy.deliverInbox(me); });
  }

  function run(job, okText) {
    if (busy) return; busy = true;
    job().then(function () { say(okText || ''); return render(); }, function (e) { say(errText(e), true); }).then(function () { busy = false; });
  }
  function within(el, sel) { var c = el.closest('[data-tn]'); return c ? c.querySelector(sel) : null; }

  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tn-act]'); if (!b) return;
    var act = b.getAttribute('data-tn-act'), id = b.getAttribute('data-id');
    if (act === 'decide') { var n = within(b, '[data-tn-note]'); return run(function () { return A.Tenancy.decide(me, id, b.getAttribute('data-d'), n ? n.value : ''); }, 'Your choice was recorded and your agent was told. Nothing is renewed yet.'); }
    if (act === 'send') { var m = within(b, '[data-tn-msgtext]'); return run(function () { return A.Tenancy.sendMessage(me, id, m ? m.value : ''); }, 'Message sent.'); }
    if (act === 'offer') {
      var f = b.closest('[data-tn-offer]');
      return run(function () { return A.Tenancy.offerRenewal(me, id, { amount: f.querySelector('[data-of-amount]').value, billingPeriod: f.querySelector('[data-of-period]').value, periodCount: f.querySelector('[data-of-count]').value, startDate: f.querySelector('[data-of-start]').value }); },
        'Offer sent. The tenant has a renewal agreement to read and sign.');
    }
    if (act === 'withdraw') { var why = window.prompt('Why are you withdrawing this offer?'); if (why === null) return; return run(function () { return A.Tenancy.withdrawOffer(me, id, why); }, 'Offer withdrawn.'); }
    if (act === 'pay') return run(function () { return A.Tenancy.payRenewalDemo(me, id); }, 'Demonstration renewal payment recorded. A new ACTD, receipt and tenancy were created. The original ones are kept.');
  });

  A.ready(function () {
    if (A.Records && A.Records.init) A.Records.init();
    me = A.Identity.current();
    if (me) subEl.textContent = isAgent() ? 'Tenancies on your listings, each tenant\u2019s renewal decision, and renewal offers. You see the tenant\u2019s name, never their phone number or email.' : 'Your rentals, how far through each term you are, and your renewal options.';
    noteEl.textContent = 'ACCOOM works out reminders when ACCOOM is opened in this browser. This demonstration has no server, so it cannot send reminders while the app is closed, and it never sends SMS, WhatsApp or email.';
    render();
  });
})();
