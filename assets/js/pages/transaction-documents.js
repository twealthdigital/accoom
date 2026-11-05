/* ==========================================================================
   ACCOOM — Receipts & agreements page (Stage 5)
   Customers: see receipts, confirm physical receipts, sign agreements.
   Agents: see receipts for their transactions (client NAME only, never phone
   or email), deliver physical receipts, prepare agreements, choose how future
   clients receive receipts.
   Honest limits: access rules here keep honest users apart in this browser;
   real protection of other people's records needs a backend.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.Accoom;
  var $ = function (s) { return document.querySelector(s); };
  var panel = $('[data-td-panel]'), msgEl = $('[data-td-msg]'), tabsEl = $('[data-td-tabs]'), attEl = $('[data-td-attention]'), subEl = $('[data-td-sub]');
  var me = null, tab = 'receipts', busy = false, cache = { receipts: {}, agreements: {} }, openAgreement = '';

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function say(text, bad) { msgEl.hidden = !text; msgEl.textContent = text || ''; msgEl.className = 'dc-msg' + (bad ? ' dc-msg--bad' : ''); }
  function when(iso) { try { return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } }
  function naira(n) { return '\u20A6' + Number(n || 0).toLocaleString('en-NG'); }
  function isAgent() { return !!me && me.role === 'agent'; }
  function errText(e, fallback) { return (e && e.message) || fallback || 'Something went wrong. Please try again.'; }

  /* ------------------------------------------------------------------ tabs */
  var TABS = [
    { id: 'receipts', label: 'Receipts' },
    { id: 'delivery', label: 'Receipt delivery' },
    { id: 'agreements', label: 'Agreements' },
    { id: 'settings', label: 'Receipt settings', agentOnly: true },
    { id: 'privacy', label: 'Privacy' }
  ];
  function visibleTabs() { return TABS.filter(function (t) { return !t.agentOnly || isAgent(); }); }
  function renderTabs() {
    tabsEl.innerHTML = visibleTabs().map(function (t) {
      return '<button type="button" class="dc-tab" role="tab" data-td-tab="' + t.id + '" aria-selected="' + (t.id === tab) + '">' + esc(t.label) + '</button>';
    }).join('');
  }
  tabsEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-td-tab]'); if (!b) return;
    go(b.getAttribute('data-td-tab'));
  });
  function go(id) {
    if (!visibleTabs().some(function (t) { return t.id === id; })) id = 'receipts';
    tab = id; say(''); renderTabs(); render();
    try { window.history.replaceState(null, '', '#' + id); } catch (e) { /* ignore */ }
  }

  function signedOut() { panel.innerHTML = '<div class="dc-empty">Sign in to see your receipts and agreements. <a href="auth.html">Sign in or create an account</a></div>'; }

  /* ------------------------------------------------------------- attention */
  // Open items stay here until the client answers or the issue is resolved.
  function renderAttention() {
    if (!me) { attEl.innerHTML = ''; return Promise.resolve(); }
    return Promise.all([A.Receipts.outstandingFor(me), A.Agreements.listFor(me)]).then(function (res) {
      var d = res[0], ag = res[1].filter(function (a) { return isAgent() ? a.status === 'client_signed' : a.status === 'awaiting_client'; });
      var h = '';
      if (d.length) {
        h += '<div class="td-banner"><strong>' + (isAgent() ? 'Physical receipts need your attention' : 'Please confirm your physical receipt') + '</strong><ul>' + d.map(function (a) {
          return '<li>' + esc(a.listingName) + ' (' + esc(a.receiptNumber) + '): ' + esc(A.Receipts.STATE_LABEL[a.state]) + '</li>'; }).join('') +
          '</ul><a href="#delivery" data-td-go="delivery">Open receipt delivery</a></div>';
      }
      if (ag.length) {
        h += '<div class="td-banner"><strong>' + (isAgent() ? 'Agreements waiting for your countersignature' : 'Agreements waiting for your signature') + '</strong><ul>' +
          ag.map(function (a) { return '<li>' + esc(a.title) + ' (' + esc(a.listingName) + ')</li>'; }).join('') + '</ul><a href="#agreements" data-td-go="agreements">Open agreements</a></div>';
      }
      attEl.innerHTML = h;
    }, function () { attEl.innerHTML = ''; });
  }
  attEl.addEventListener('click', function (e) { var g = e.target.closest('[data-td-go]'); if (g) { e.preventDefault(); go(g.getAttribute('data-td-go')); } });

  /* -------------------------------------------------------------- receipts */
  function receiptCard(r) {
    var c = r.content;
    return '<article class="dc-card"><div class="dc-card-top"><span class="dc-num">' + esc(r.receiptNumber) + '</span><span>' +
      (c.demo ? '<span class="dc-pill dc-pill--demo">DEMO</span> ' : '') + '<span class="dc-pill">' + (r.delivery === 'physical' ? 'Physical receipt' : 'Digital receipt') + '</span></span></div>' +
      '<span class="dc-prop">' + esc(c.property.name) + '</span>' +
      '<span class="dc-meta">' + esc(c.purpose) + ' \u00B7 ' + esc(naira(c.amountPaid)) + ' \u00B7 ' + esc(when(c.payment.paidAt)) + '</span>' +
      '<span class="dc-meta">Reference ' + esc(c.payment.reference) + (isAgent() ? ' \u00B7 Client: ' + esc(c.client.name) : '') + '</span>' +
      '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--sm" data-td-act="r-view" data-id="' + esc(r.id) + '">View</button>' +
      '<button type="button" class="dc-btn dc-btn--sm" data-td-act="r-dl" data-id="' + esc(r.id) + '">Download PDF</button>' +
      '<a class="dc-btn dc-btn--sm" style="display:inline-flex;align-items:center;text-decoration:none" href="verify-receipt.html?ref=' + encodeURIComponent(r.receiptNumber) + '">Check this receipt</a></div></article>';
  }
  function renderReceipts() {
    panel.innerHTML = '<div class="dc-empty">Loading\u2026</div>';
    return A.Receipts.backfill(me).then(function () { return A.Receipts.listFor(me); }).then(function (list) {
      cache.receipts = {}; list.forEach(function (r) { cache.receipts[r.id] = r; });
      panel.innerHTML = list.length ? '<div class="dc-list">' + list.map(receiptCard).join('') + '</div>'
        : '<div class="dc-empty">' + (isAgent() ? 'No receipts yet. One is issued for every successful payment on your listings.' : 'No receipts yet. After a successful payment your ACCOOM receipt appears here.') + '</div>';
    }, function (e) { panel.innerHTML = '<div class="dc-empty">' + esc(errText(e, 'Your receipts could not be loaded.')) + '</div>'; });
  }

  /* -------------------------------------------------------------- delivery */
  function timeline(a) {
    return '<ul class="td-timeline">' + a.history.slice().reverse().map(function (h) {
      var who = h.role === 'system' ? 'ACCOOM' : h.role === 'agent' ? 'Agent' : h.role === 'customer' ? 'Client' : 'Reviewer';
      return '<li><strong>' + esc(who) + '</strong> \u00B7 ' + esc(A.Receipts.STATE_LABEL[h.state]) + ' \u00B7 ' + esc(when(h.at)) + (h.note ? '<br>' + esc(h.note) : '') + '</li>'; }).join('') + '</ul>';
  }
  function deliveryCard(a) {
    var open = ['pending_agent', 'agent_marked_delivered', 'client_problem', 'client_not_received'].indexOf(a.state) !== -1;
    var h = '<article class="dc-card" data-ack="' + esc(a.transactionId) + '"><div class="dc-card-top"><span class="dc-num">' + esc(a.receiptNumber) + '</span><span class="dc-pill">' + (open ? 'Open' : 'Closed') + '</span></div>' +
      '<span class="dc-prop">' + esc(a.listingName) + '</span><span class="td-state ' + (open ? 'td-state--open' : 'td-state--good') + '">' + esc(A.Receipts.STATE_LABEL[a.state]) + '</span>';
    if (isAgent() && ['pending_agent', 'client_problem', 'client_not_received'].indexOf(a.state) !== -1) {
      h += '<label class="dc-label" for="dn-' + esc(a.transactionId) + '">Note (optional)</label><input class="dc-input" id="dn-' + esc(a.transactionId) + '" data-td-note type="text" maxlength="200" placeholder="For example: handed to the client at the property" />' +
        '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--primary dc-btn--sm" data-td-act="d-mark" data-tx="' + esc(a.transactionId) + '">I delivered the physical receipt</button></div>' +
        '<p class="dc-note">This is your statement only. The client must still confirm they received it.</p>';
    }
    if (!isAgent() && a.state === 'agent_marked_delivered') {
      h += '<fieldset style="border:0;padding:0;margin:4px 0 0;display:flex;flex-direction:column;gap:8px"><legend class="dc-label">Did you receive your receipt?</legend>' +
        [['ok', 'I\u2019ve received my receipt and I\u2019m satisfied'], ['problem', 'I\u2019ve received it, but there\u2019s a problem'], ['not_received', 'I haven\u2019t received my receipt']].map(function (o) {
          return '<label class="td-radio"><input type="radio" name="ans-' + esc(a.transactionId) + '" value="' + o[0] + '" /> <span>' + o[1] + '</span></label>'; }).join('') + '</fieldset>' +
        '<label class="dc-label" for="dnote-' + esc(a.transactionId) + '">Tell us more (needed if there is a problem)</label><input class="dc-input" id="dnote-' + esc(a.transactionId) + '" data-td-note type="text" maxlength="300" />' +
        '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--primary dc-btn--sm" data-td-act="d-answer" data-tx="' + esc(a.transactionId) + '">Send my answer</button></div>';
    }
    if (!isAgent() && (a.state === 'client_problem' || a.state === 'client_not_received')) {
      h += '<label class="dc-label" for="dres-' + esc(a.transactionId) + '">When it is sorted out, say how</label><input class="dc-input" id="dres-' + esc(a.transactionId) + '" data-td-note type="text" maxlength="300" />' +
        '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--sm" data-td-act="d-resolve" data-tx="' + esc(a.transactionId) + '">Mark this as resolved</button></div>';
    }
    return h + timeline(a) + '</article>';
  }
  function renderDelivery() {
    panel.innerHTML = '<div class="dc-empty">Loading\u2026</div>';
    return A.Receipts.deliveriesFor(me).then(function (list) {
      panel.innerHTML = (list.length ? '<div class="dc-list">' + list.map(deliveryCard).join('') + '</div>'
        : '<div class="dc-empty">No physical receipts to track. This list only shows listings where the agent chose physical receipt delivery.</div>') +
        '<div class="td-honest">An agent marking a receipt as delivered never counts as your confirmation. Only you can tell ACCOOM you received it. Open issues stay here until they are resolved.</div>';
    }, function (e) { panel.innerHTML = '<div class="dc-empty">' + esc(errText(e)) + '</div>'; });
  }

  /* ------------------------------------------------------------ agreements */
  function agreementCard(a) {
    var open = a.id === openAgreement;
    var h = '<article class="dc-card" data-agr="' + esc(a.id) + '"><div class="dc-card-top"><span class="dc-num">' + esc(a.title) + '</span><span class="dc-pill">' + esc(A.Agreements.KINDS[a.kind] || a.kind) + '</span></div>' +
      '<span class="dc-prop">' + esc(a.listingName) + '</span><span class="td-state ' + (a.status === 'completed' ? 'td-state--good' : 'td-state--open') + '">' + esc(A.Agreements.STATUS_LABEL[a.status]) + '</span>' +
      '<span class="dc-meta">' + (isAgent() ? 'Client: ' + esc(a.customerName || 'Not provided') : 'Agent: ' + esc(a.agentName || 'Not provided')) + ' \u00B7 Prepared ' + esc(when(a.createdAt)) + '</span>';
    var needsMe = isAgent() ? a.status === 'client_signed' : a.status === 'awaiting_client';
    h += '<div class="dc-actions">' + (needsMe ? '<button type="button" class="dc-btn dc-btn--primary dc-btn--sm" data-td-act="a-open" data-id="' + esc(a.id) + '">' + (open ? 'Hide' : (isAgent() ? 'Review and countersign' : 'Review and sign')) + '</button>' : '') +
      (a.fileName ? '<button type="button" class="dc-btn dc-btn--sm" data-td-act="a-file" data-id="' + esc(a.id) + '">Download agreement file</button>' : '') +
      '<button type="button" class="dc-btn dc-btn--sm" data-td-act="a-pdf" data-id="' + esc(a.id) + '">Download ' + (a.fileName ? 'signing record' : 'agreement and signing record') + ' (PDF)</button>' +
      (isAgent() && ['awaiting_client', 'client_signed'].indexOf(a.status) !== -1 ? '<button type="button" class="dc-btn dc-btn--sm" data-td-act="a-cancel" data-id="' + esc(a.id) + '">Cancel</button>' : '') + '</div>';
    if (open && needsMe) h += signPanel(a);
    if (a.signatures.length) h += '<ul class="td-timeline">' + a.signatures.map(function (s) {
      return '<li><strong>' + (s.role === 'client' ? 'Client' : 'Agent') + '</strong> signed as \u201C' + esc(s.typedName) + '\u201D \u00B7 ' + esc(when(s.at)) + ' \u00B7 visual signature + electronic record</li>'; }).join('') + '</ul>';
    return h + '</article>';
  }
  function signPanel(a) {
    var h = '<div class="td-form" data-sign="' + esc(a.id) + '"><strong>' + esc(a.title) + '</strong>';
    h += a.body ? '<div class="td-terms">' + esc(a.body) + '</div>' : '<p class="dc-note">This agreement is an uploaded file (' + esc(a.fileName) + '). <button type="button" class="dc-btn dc-btn--sm" data-td-act="a-viewfile" data-id="' + esc(a.id) + '">Open the file</button> Read it before you sign.</p>';
    h += '<label class="dc-label" for="sg-name">Type your full name</label><input class="dc-input" id="sg-name" data-sg-name type="text" maxlength="80" autocomplete="name" />' +
      '<span class="dc-label">Draw your signature (optional)</span><canvas class="td-sig-canvas" data-sg-canvas width="360" height="110" aria-label="Signature drawing area"></canvas>' +
      '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--sm" data-td-act="sg-clear">Clear drawing</button></div>' +
      '<label class="td-check"><input type="checkbox" data-sg-read /> <span>I have read this agreement and I agree to sign it.</span></label>' +
      '<div class="td-honest">' + esc(A.Agreements.DISCLAIMER) + '</div>' +
      '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--primary" data-td-act="a-sign" data-id="' + esc(a.id) + '">' + (isAgent() ? 'Countersign' : 'Sign agreement') + '</button>' +
      (!isAgent() ? '<button type="button" class="dc-btn" data-td-act="a-decline" data-id="' + esc(a.id) + '">I do not agree</button>' : '') + '</div></div>';
    return h;
  }
  function prepareForm(txs) {
    if (!txs.length) return '<div class="dc-empty">You can prepare an agreement after a payment is successful on one of your listings.</div>';
    return '<details class="dc-demo" data-td-prepare><summary>Prepare an agreement for a client</summary><div class="dc-demo-body td-form">' +
      '<label class="dc-label" for="pa-tx">Transaction</label><select class="dc-input" id="pa-tx" data-pa-tx>' + txs.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.listingName) + ' \u00B7 ' + esc(t.customerName || 'Client') + ' \u00B7 ' + esc(naira(t.amounts.total)) + '</option>'; }).join('') + '</select>' +
      '<label class="dc-label" for="pa-kind">Agreement type</label><select class="dc-input" id="pa-kind" data-pa-kind>' + Object.keys(A.Agreements.KINDS).map(function (k) { return '<option value="' + k + '">' + esc(A.Agreements.KINDS[k]) + '</option>'; }).join('') + '</select>' +
      '<label class="dc-label" for="pa-title">Title</label><input class="dc-input" id="pa-title" data-pa-title type="text" maxlength="100" placeholder="e.g. Tenancy agreement for Flat 3" />' +
      '<label class="td-radio"><input type="radio" name="pa-mode" value="text" checked data-pa-mode /> <span>Type the agreement terms here</span></label>' +
      '<label class="td-radio"><input type="radio" name="pa-mode" value="file" data-pa-mode /> <span>Upload an agreement file (PDF, JPG or PNG)</span></label>' +
      '<div data-pa-text><label class="dc-label" for="pa-text">Agreement terms</label><textarea class="dc-input td-textarea" id="pa-text" data-pa-text-input maxlength="12000"></textarea></div>' +
      '<div data-pa-file hidden><label class="dc-label" for="pa-file">Agreement file</label><input class="dc-input" id="pa-file" data-pa-file-input type="file" accept="' + esc(A.DocumentStore.ACCEPT) + '" /></div>' +
      '<label class="td-check"><input type="checkbox" data-pa-counter checked /> <span>I will countersign after the client signs</span></label>' +
      '<div class="dc-actions"><button type="button" class="dc-btn dc-btn--primary" data-td-act="a-create">Send to client for signing</button></div></div></details>';
  }
  function renderAgreements() {
    panel.innerHTML = '<div class="dc-empty">Loading\u2026</div>';
    var jobs = [A.Agreements.listFor(me)];
    if (isAgent()) jobs.push(A.Transactions.listFor(me));
    return Promise.all(jobs).then(function (res) {
      var list = res[0]; cache.agreements = {}; list.forEach(function (a) { cache.agreements[a.id] = a; });
      var txs = isAgent() ? res[1].filter(function (t) { return t.status === 'succeeded'; }) : [];
      panel.innerHTML = (isAgent() ? prepareForm(txs) : '') +
        (list.length ? '<div class="dc-list">' + list.map(agreementCard).join('') + '</div>' : '<div class="dc-empty">' + (isAgent() ? 'No agreements yet.' : 'No agreements to sign right now.') + '</div>') +
        '<div class="td-honest">' + esc(A.Agreements.DISCLAIMER) + '</div>';
      bindCanvas();
    }, function (e) { panel.innerHTML = '<div class="dc-empty">' + esc(errText(e)) + '</div>'; });
  }

  /* signature canvas (drawn mark) */
  var drew = false;
  function bindCanvas() {
    var cv = panel.querySelector('[data-sg-canvas]'); drew = false;
    if (!cv) return;
    var ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    var down = false;
    function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; }
    cv.addEventListener('pointerdown', function (e) { down = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    cv.addEventListener('pointermove', function (e) { if (!down) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); drew = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { down = false; }); });
  }

  /* -------------------------------------------------------------- settings */
  function renderSettings() {
    var l; try { l = JSON.parse(localStorage.getItem('accoom-agent-listings')) || []; } catch (e) { l = []; }
    l = l.filter(function (x) { return x && x.status !== 'deleted' && String(x.id).indexOf('demo-') !== 0; });
    panel.innerHTML = '<div class="td-banner td-banner--info"><strong>How should clients receive the official receipt?</strong>Digital: ACCOOM makes the receipt available to the client after payment. Physical: you deliver a paper receipt and the client confirms they got it. The client is told which one applies before they pay. Payments already made keep the method that applied when they were made.</div>' +
      (l.length ? '<table class="td-table"><tbody>' + l.map(function (x) {
        return '<tr><td><strong>' + esc(x.name || 'Untitled') + '</strong><br><small>' + esc(x.location || '') + '</small></td><td><label class="dc-label" for="rs-' + esc(x.id) + '">Receipt delivery</label><select class="dc-input" id="rs-' + esc(x.id) + '" data-td-method="' + esc(x.id) + '"><option value="digital"' + (x.receiptDelivery !== 'physical' ? ' selected' : '') + '>Digital receipt</option><option value="physical"' + (x.receiptDelivery === 'physical' ? ' selected' : '') + '>Physical receipt (I will deliver it)</option></select></td></tr>'; }).join('') + '</tbody></table>'
        : '<div class="dc-empty">You have no listings yet.</div>');
    return Promise.resolve();
  }

  /* --------------------------------------------------------------- privacy */
  function renderPrivacy() {
    panel.innerHTML = '<div class="td-privacy"><h3>What ACCOOM collects</h3><p>Property documents you upload, payment and transaction records, receipts, agreements and signing records, and notifications about them.</p>' +
      '<h3>Why</h3><p>To review properties, record what happened in a transaction, give both sides a copy, and help settle disputes.</p>' +
      '<h3>Who can see it</h3><ul><li><strong>Clients</strong> see their own receipts, agreements and ACTDs.</li><li><strong>Agents</strong> see receipts and agreements for their own transactions. They see the client\u2019s <strong>name only</strong>. They never see a client\u2019s phone number or email address. ACCOOM sends client notifications itself.</li><li><strong>ACCOOM reviewers</strong> can open records when they investigate a transaction or dispute.</li></ul>' +
      '<h3>How it is stored</h3><p>In this demonstration version, everything is stored <strong>in your own browser</strong> on this device. It is not backed up, does not sync to other devices, and can be lost if the browser data is cleared. It is not legally secure evidence retention. A secure server will be needed before real use.</p>' +
      '<h3>How long it is kept</h3><p>ACCOOM has not set a final retention period yet and does not promise to keep records forever. Before launch ACCOOM will publish how long each kind of record is kept and why. Until then, records here stay until you or your browser clears them.</p>' +
      '<h3>Disputes</h3><p>If a receipt was not delivered or a document is wrong, report it from Receipt delivery. The issue stays open until it is resolved, and every step is recorded with the time.</p>' +
      '<h3>Deleting your records</h3><p>You can ask ACCOOM to delete personal records. Some transaction records may need to be kept for a period for legal or dispute reasons. This demonstration cannot process requests because there is no server. A request process will be published before launch.</p>' +
      '<h3>Notifications</h3><p>Right now notifications appear inside ACCOOM only. SMS, WhatsApp and email are not connected, so none are sent.</p></div>';
    return Promise.resolve();
  }

  function render() {
    if (!me) { signedOut(); return Promise.resolve(); }
    var p = tab === 'receipts' ? renderReceipts() : tab === 'delivery' ? renderDelivery() : tab === 'agreements' ? renderAgreements() : tab === 'settings' ? renderSettings() : renderPrivacy();
    return p.then(renderAttention);
  }

  /* --------------------------------------------------------------- actions */
  function noteIn(btn) { var c = btn.closest('[data-ack]'); var n = c && c.querySelector('[data-td-note]'); return n ? n.value : ''; }
  function run(job, okText) {
    if (busy) return; busy = true;
    job().then(function (r) { say(okText || ''); return render(); }, function (e) { say(errText(e), true); }).then(function () { busy = false; });
  }
  function preview(blob, name, mime) { A.DocumentPreview.open({ file: blob, name: name, mimeType: mime || 'application/pdf' }); }

  panel.addEventListener('change', function (e) {
    var t = e.target;
    if (t.hasAttribute('data-pa-mode')) {
      var isFile = t.value === 'file';
      panel.querySelector('[data-pa-text]').hidden = isFile; panel.querySelector('[data-pa-file]').hidden = !isFile;
    }
    if (t.hasAttribute('data-td-method')) {
      A.Receipts.setListingDelivery(me, t.getAttribute('data-td-method'), t.value).then(function () { say('Saved. This applies to payments made from now on.'); }, function (err) { say(errText(err), true); });
    }
  });

  panel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-td-act]'); if (!b) return;
    var act = b.getAttribute('data-td-act'), id = b.getAttribute('data-id'), tx = b.getAttribute('data-tx');
    try {
      if (act === 'r-view' || act === 'r-dl') {
        var r = cache.receipts[id]; if (!r) { say('That receipt could not be found.', true); return; }
        var out = A.ReceiptGenerator.renderReceipt(r);
        if (act === 'r-dl') { A.ReceiptGenerator.save(out); say('Your receipt is downloading.'); } else { preview(out.blob, r.receiptNumber, 'application/pdf'); say(''); }
        return;
      }
      if (act === 'd-mark') return run(function () { return A.Receipts.markDelivered(me, tx, noteIn(b)); }, 'Marked as delivered. Now the client has been asked to confirm.');
      if (act === 'd-answer') {
        var card = b.closest('[data-ack]'), sel = card.querySelector('input[type=radio]:checked');
        if (!sel) { say('Choose one of the three answers first.', true); return; }
        return run(function () { return A.Receipts.clientRespond(me, tx, sel.value, noteIn(b)); }, 'Thank you. Your answer was recorded.');
      }
      if (act === 'd-resolve') return run(function () { return A.Receipts.resolve(me, tx, noteIn(b)); }, 'Marked as resolved.');
      if (act === 'a-open') {
        openAgreement = openAgreement === id ? '' : id;
        var go1 = !isAgent() && openAgreement ? A.Agreements.markViewed(me, id).catch(function () {}) : Promise.resolve();
        go1.then(renderAgreements); return;
      }
      if (act === 'a-pdf') { var ag = cache.agreements[id]; A.ReceiptGenerator.save(A.ReceiptGenerator.renderSigning(ag, false)); say('Your PDF is downloading.'); return; }
      if (act === 'a-file' || act === 'a-viewfile') {
        A.Agreements.getFile(me, id).then(function (f) {
          if (act === 'a-file') { A.ReceiptGenerator.saveBlob(f.blob, f.fileName); say('Your file is downloading.'); }
          else { preview(f.blob, f.fileName, f.blob.type); }
        }, function (err) { say(errText(err), true); });
        return;
      }
      if (act === 'sg-clear') { var cv = panel.querySelector('[data-sg-canvas]'); if (cv) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); drew = false; } return; }
      if (act === 'a-sign') {
        var f = panel.querySelector('[data-sign="' + id + '"]'), cv2 = f.querySelector('[data-sg-canvas]');
        return run(function () { return A.Agreements.sign(me, id, { typedName: f.querySelector('[data-sg-name]').value, agreedRead: f.querySelector('[data-sg-read]').checked, drawnImage: drew ? cv2.toDataURL('image/png') : '' }); }, isAgent() ? 'Countersigned. Everyone has signed.' : 'Signed. The agent has been asked to countersign.');
      }
      if (act === 'a-decline') { var why = window.prompt('Why are you not signing? (a short reason)'); if (why === null) return; return run(function () { return A.Agreements.decline(me, id, why); }, 'You declined. The agent was told.'); }
      if (act === 'a-cancel') { var why2 = window.prompt('Why are you cancelling this agreement?'); if (why2 === null) return; return run(function () { return A.Agreements.cancel(me, id, why2); }, 'Agreement cancelled.'); }
      if (act === 'a-create') {
        var mode = panel.querySelector('[data-pa-mode]:checked').value, fileEl = panel.querySelector('[data-pa-file-input]');
        return run(function () {
          return A.Agreements.create(me, panel.querySelector('[data-pa-tx]').value, { kind: panel.querySelector('[data-pa-kind]').value, title: panel.querySelector('[data-pa-title]').value,
            text: mode === 'text' ? panel.querySelector('[data-pa-text-input]').value : '', file: mode === 'file' ? (fileEl.files && fileEl.files[0]) || null : null,
            requireCountersign: panel.querySelector('[data-pa-counter]').checked });
        }, 'Sent to the client for signing.');
      }
    } catch (err) { say(errText(err, 'That could not be completed.'), true); }
  });

  /* ------------------------------------------------------------------ boot */
  A.ready(function () {
    if (A.Records && A.Records.init) A.Records.init();
    me = A.Identity.current();
    var h = (window.location.hash || '').replace('#', '');
    if (h) tab = h;
    if (!me) { subEl.textContent = 'Sign in to see your receipts and agreements.'; renderTabs(); signedOut(); return; }
    subEl.textContent = isAgent()
      ? 'Receipts and agreements for transactions on your listings. You see the client\u2019s name, never their phone number or email.'
      : 'Your ACCOOM payment receipts, receipt delivery and agreements to sign.';
    if (!visibleTabs().some(function (t) { return t.id === tab; })) tab = 'receipts';
    renderTabs();
    A.Receipts.deliverInbox(me).catch(function () {}).then(render);
  });
})();
