/* ==========================================================================
   ACCOOM — Document centre (Stage 4)
   Customers see their own ACTDs. Agents see ACTDs for their own transactions.
   A reviewer (local demo admin mode) can see all. Download any version again.
   Honest limit: access rules here keep honest users apart; real protection of
   other people's records needs a backend.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.Accoom;
  var $ = function (s) { return document.querySelector(s); };
  var listEl = $('[data-dc-list]'), msgEl = $('[data-dc-msg]'), tabsEl = $('[data-dc-tabs]'), subEl = $('[data-dc-sub]');
  var me = null, view = 'mine', busy = false, openVersions = {}, eventId = '';

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function say(text, bad) { msgEl.hidden = !text; msgEl.textContent = text || ''; msgEl.className = 'dc-msg' + (bad ? ' dc-msg--bad' : ''); }
  function when(iso) { try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } }
  function naira(n) { return '\u20A6' + Number(n || 0).toLocaleString('en-NG'); }
  function newEventId() { return 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }

  function actor() {
    if (view === 'reviewer') return A.AdminDemo && A.AdminDemo.isActive() ? { role: 'admin', id: 'demo-admin' } : null;
    return me ? { role: me.role, id: me.id } : null;
  }

  /* ----------------------------------------------------------------- tabs */
  function renderTabs() {
    var tabs = [{ id: 'mine', label: me && me.role === 'agent' ? 'Documents for my listings' : 'My documents' }];
    if (A.AdminDemo && A.AdminDemo.isActive()) tabs.push({ id: 'reviewer', label: 'All documents (reviewer demo)' });
    tabsEl.hidden = tabs.length < 2;
    tabsEl.innerHTML = tabs.map(function (t) { return '<button type="button" class="dc-tab" role="tab" data-dc-tab="' + t.id + '" aria-selected="' + (t.id === view) + '">' + esc(t.label) + '</button>'; }).join('');
  }
  tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dc-tab]'); if (!b) return;
    view = b.getAttribute('data-dc-tab'); renderTabs(); load();
  });

  /* ----------------------------------------------------------------- list */
  function card(item) {
    var r = item.actd, c = r.content, s1 = c.s1, s2 = c.s2, vs = item.versions;
    var h = '<article class="dc-card" data-actd="' + esc(r.actdNumber) + '"><div class="dc-card-top"><span class="dc-num">' + esc(r.actdNumber) + '</span><span>' +
      (c.demo ? '<span class="dc-pill dc-pill--demo">DEMO</span> ' : '') + '<span class="dc-pill">Version ' + r.version + (vs.length > 1 ? ' of ' + vs.length : '') + '</span></span></div>' +
      '<span class="dc-prop">' + esc(s1.propertyName) + '</span>' +
      '<span class="dc-meta">' + esc(s1.transactionType) + ' \u00B7 ' + esc(naira(s2.total)) + ' \u00B7 ' + esc(when(s1.dateTime)) + '</span>' +
      '<span class="dc-meta">Transaction ' + esc(s1.transactionId) + (view === 'reviewer' || (me && me.role === 'agent') ? ' \u00B7 Client: ' + esc(s1.client.name) : '') + '</span>' +
      (r.version > 1 ? '<span class="dc-meta">Latest update: ' + esc(r.updateReason) + '</span>' : '') +
      '<div class="dc-actions">' +
        '<button type="button" class="dc-btn dc-btn--sm" data-dc-action="view" data-ref="' + esc(r.actdNumber) + '" data-v="' + r.version + '">View</button>' +
        '<button type="button" class="dc-btn dc-btn--sm" data-dc-action="download" data-ref="' + esc(r.actdNumber) + '" data-v="' + r.version + '">Download PDF</button>' +
        (vs.length > 1 ? '<button type="button" class="dc-btn dc-btn--sm" data-dc-action="versions" data-ref="' + esc(r.actdNumber) + '">All versions (' + vs.length + ')</button>' : '') +
        '<a class="dc-btn dc-btn--sm" style="display:inline-flex;align-items:center;text-decoration:none" href="verify-document.html?ref=' + encodeURIComponent(r.actdNumber) + '&v=' + r.version + '">Check</a>' +
      '</div>';
    if (openVersions[r.actdNumber]) {
      h += '<div class="dc-versions">' + vs.slice().reverse().map(function (v) {
        return '<div class="dc-ver"><span><strong>Version ' + v.version + '</strong> \u00B7 ' + esc(when(v.issuedAt)) + '<br>' + esc(v.version === 1 ? 'Original issue' : v.updateReason) + '</span>' +
          '<span class="dc-actions"><button type="button" class="dc-btn dc-btn--sm" data-dc-action="view" data-ref="' + esc(v.actdNumber) + '" data-v="' + v.version + '">View</button>' +
          '<button type="button" class="dc-btn dc-btn--sm" data-dc-action="download" data-ref="' + esc(v.actdNumber) + '" data-v="' + v.version + '">Download</button></span></div>';
      }).join('') + '</div>';
    }
    return h + '</article>';
  }

  var cache = {};
  function load() {
    var a = actor();
    if (!a) { listEl.innerHTML = '<div class="dc-empty">Sign in to see your documents. <a href="auth.html">Sign in or create an account</a></div>'; return Promise.resolve(); }
    listEl.innerHTML = '<div class="dc-empty">Loading your documents\u2026</div>';
    return A.ACTD.listFor(a).then(function (items) {
      cache = {}; items.forEach(function (it) { it.versions.forEach(function (v) { cache[v.actdNumber + ':' + v.version] = v; }); });
      listEl.innerHTML = items.length ? items.map(card).join('') :
        '<div class="dc-empty">' + (view === 'reviewer' ? 'No ACTDs exist in this browser yet.' : me && me.role === 'agent'
          ? 'No ACTDs yet. One is created for every successful payment on your listings.' : 'No documents yet. After a successful payment, your ACTD appears here.') + '</div>';
    }, function () { listEl.innerHTML = '<div class="dc-empty">Your documents could not be loaded. Please refresh the page.</div>'; });
  }

  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-dc-action]'); if (!b) return;
    var act = b.getAttribute('data-dc-action'), ref = b.getAttribute('data-ref'), v = b.getAttribute('data-v');
    if (act === 'versions') { openVersions[ref] = !openVersions[ref]; load(); return; }
    var rec = cache[ref + ':' + v];
    if (!rec) { say('That document could not be found.', true); return; }
    try {
      if (act === 'download') { A.ACTDGenerator.download(rec); say('Your PDF is downloading.'); }
      else { var out = A.ACTDGenerator.render(rec); A.DocumentPreview.open({ file: out.blob, name: rec.actdNumber + ' (version ' + rec.version + ')', mimeType: 'application/pdf' }); say(''); }
    } catch (err) { say('The PDF could not be created. Please try again.', true); }
  });

  /* ------------------------------------------------------------ demo tools */
  var selListing = $('[data-dc-listing]'), nameEl = $('[data-dc-name]'), cidEl = $('[data-dc-cid]'), countEl = $('[data-dc-count]'), startEl = $('[data-dc-start]'), payBtn = $('[data-dc-pay]');
  var rentFields = $('[data-dc-rent-fields]'), countLabel = $('[data-dc-count-label]');
  var PERIOD = { day: 'days', week: 'weeks', month: 'months', year: 'years' };

  function eligibleListings() {
    var all; try { all = JSON.parse(localStorage.getItem('accoom-agent-listings')) || []; } catch (e) { all = []; }
    return all.filter(function (l) { return !A.Transactions.eligibility(l); });
  }
  function fillListings() {
    var ls = eligibleListings();
    selListing.innerHTML = ls.length ? ls.map(function (l) {
      return '<option value="' + esc(l.id) + '" data-cat="' + esc(l.category) + '" data-period="' + esc(l.period) + '">' + esc(l.name) + ' (' + (l.category === 'sale' ? 'for sale' : 'rent per ' + esc(l.period)) + ', ' + esc(naira(l.price)) + ')</option>';
    }).join('') : '<option value="">No available properties. Add and approve a listing first.</option>';
    payBtn.disabled = !ls.length; syncRentFields();
  }
  function syncRentFields() {
    var o = selListing.selectedOptions[0], rent = o && o.getAttribute('data-cat') === 'rent';
    rentFields.hidden = !rent;
    if (rent) countLabel.textContent = 'How many ' + (PERIOD[o.getAttribute('data-period')] || 'periods') + '?';
  }
  selListing.addEventListener('change', syncRentFields);

  payBtn.addEventListener('click', function () {
    if (busy || !selListing.value) return;
    if (!eventId) eventId = newEventId(); // the same click can never create two transactions
    var cid = cidEl.value.trim();
    if (!cid) { say('Enter a customer ID.', true); return; }
    busy = true; payBtn.disabled = true; say('Creating the demo transaction\u2026');
    A.Transactions.recordDemoPayment({ eventId: eventId, listingId: selListing.value, customerId: cid, customerName: nameEl.value.trim() || 'Demo customer',
      periodCount: countEl.value, startDate: startEl.value || undefined }).then(function (r) {
      eventId = '';
      say((r.created ? 'Demo payment recorded. ' : 'This payment was already recorded. ') + 'ACTD ' + r.actd.actdNumber + ' is ready' + (cid !== (me && me.id) ? ' (it belongs to customer "' + cid + '", so only that customer, the agent and a reviewer can see it).' : '.'));
      return load();
    }, function (err) { say((err && err.message) || 'The demo payment failed.', true); }).then(function () { busy = false; fillListings(); });
  });

  /* ------------------------------------------------------------------ boot */
  A.ready(function () {
    if (A.Records && A.Records.init) A.Records.init();
    me = A.Identity.current();
    startEl.value = A.TenancyDates.today();
    nameEl.value = me ? me.name : ''; cidEl.value = me ? me.id : '';
    if (!me) { subEl.textContent = 'Sign in to see your documents.'; }
    else if (me.role === 'agent') subEl.textContent = 'ACTDs for transactions on your listings. You see the client\u2019s name, never their phone number or email.';
    renderTabs(); fillListings(); load();
  });
})();
