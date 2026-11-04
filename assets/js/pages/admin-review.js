/* ==========================================================================
   ACCOOM — Document review screen (Stage 3, LOCAL DEMONSTRATION MODE)
   Queue, document previews, analysis reports, side-by-side comparison,
   approve / reject / request changes, notes and history.
   Privacy: shows the agent's ID only, never phone numbers or email addresses.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.Accoom;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var gate = $('[data-adm-gate]'), app = $('[data-adm-app]'), detail = $('[data-adm-detail]'), queueEl = $('[data-adm-queue]');
  var msgEl = $('[data-adm-msg]'), filterEl = $('[data-adm-filter]');

  var state = { id: '', docId: '', cmpA: '', cmpB: '', history: {}, data: null, busy: false, filter: 'action' };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmt(iso) { try { return iso ? new Date(iso).toLocaleString() : ''; } catch (e) { return ''; } }
  function money(n) { return typeof n === 'number' ? '\u20A6' + n.toLocaleString('en-NG') : ''; }
  function say(text, bad) {
    msgEl.hidden = !text; msgEl.textContent = text || '';
    msgEl.className = 'adm-msg' + (bad ? ' adm-msg--bad' : '');
    if (text) msgEl.scrollIntoView && msgEl.scrollIntoView({ block: 'nearest' });
  }
  function actor() { return A.AdminDemo.actor(); }

  function listings() {
    try { var l = JSON.parse(localStorage.getItem('accoom-agent-listings')); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function getListing(id) { return listings().filter(function (l) { return String(l.id) === String(id); })[0] || null; }

  /* ------------------------------------------------------------------ gate */
  function showApp() {
    var on = A.AdminDemo.isActive();
    gate.hidden = on; app.hidden = !on;
    if (on) renderQueue();
  }
  $('[data-adm-enter]').addEventListener('click', function () {
    var ok = A.AdminDemo.enter($('[data-adm-phrase]').value);
    var err = $('[data-adm-gate-error]');
    err.hidden = ok; err.textContent = ok ? '' : 'That is not the confirmation phrase. Type DEMO ADMIN.';
    if (ok) showApp();
  });
  $('[data-adm-phrase]').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('[data-adm-enter]').click(); });
  $('[data-adm-exit]').addEventListener('click', function () { A.AdminDemo.exit(); state.id = ''; showApp(); });

  /* ----------------------------------------------------------------- queue */
  var FILTERS = {
    action: ['pending_review', 'ai_review', 'manual_review'], waiting: ['changes_required'],
    approved: ['approved'], rejected: ['rejected'], all: null
  };
  function stateOf(l) { return (l.approval && l.approval.state) || 'legacy_unreviewed'; }

  function renderQueue() {
    var allowed = FILTERS[state.filter];
    var items = listings().filter(function (l) {
      if (!l.approval) return false; // legacy records have no review to do
      var s = stateOf(l);
      if (allowed) return allowed.indexOf(s) !== -1;
      return s !== 'legacy_unreviewed' && s !== 'draft';
    }).sort(function (a, b) { return String((b.approval || {}).submittedAt || '') < String((a.approval || {}).submittedAt || '') ? -1 : 1; });
    queueEl.innerHTML = items.length ? items.map(function (l) {
      return '<li><button type="button" class="adm-q-item" data-adm-action="open" data-id="' + esc(l.id) + '"' + (String(l.id) === state.id ? ' aria-current="true"' : '') + '>' +
        '<span class="adm-q-name">' + esc(l.name) + '</span>' +
        '<span class="adm-q-meta">' + (l.category === 'sale' ? 'For sale' : 'For rent') + ' \u00B7 ' + esc(A.ListingReview.LABEL[stateOf(l)] || stateOf(l)) + '</span>' +
        '<span class="adm-q-meta">' + (l.documents || 0) + ' documents' + ((l.approval || {}).submittedAt ? ' \u00B7 submitted ' + esc(fmt(l.approval.submittedAt)) : '') + '</span></button></li>';
    }).join('') : '<li class="adm-empty">Nothing here right now.</li>';
  }
  filterEl.addEventListener('change', function () { state.filter = filterEl.value; renderQueue(); });

  /* --------------------------------------------------------------- loading */
  function load(id) {
    var l = getListing(id);
    if (!l) { detail.innerHTML = '<p class="adm-empty">This listing no longer exists.</p>'; return Promise.resolve(); }
    detail.innerHTML = '<p class="adm-empty">Loading\u2026</p>';
    return Promise.all([
      A.DocumentStore.listForListing(id),
      A.DocVerification.latestReports(id),
      A.Records.collection('verifications').where(function (v) { return v.listingId === String(id); }),
      A.Records.collection('auditEvents').all()
    ]).then(function (r) {
      var docs = r[0], lr = r[1], vers = r[2].sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
      var ids = {}; ids[String(id)] = true; docs.forEach(function (d) { ids[d.id] = true; });
      var audit = r[3].filter(function (e) { return ids[e.entityId]; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, 40);
      var reports = {}; lr.reports.forEach(function (x) { reports[x.documentId] = x; });
      state.data = { listing: l, docs: docs, reports: reports, verification: vers[0] || null, audit: audit };
      if (!state.docId || !docs.some(function (d) { return d.id === state.docId; })) state.docId = docs[0] ? docs[0].id : '';
      if (!docs.some(function (d) { return d.id === state.cmpA; })) state.cmpA = docs[0] ? docs[0].id : '';
      if (!docs.some(function (d) { return d.id === state.cmpB; })) state.cmpB = docs[1] ? docs[1].id : (docs[0] ? docs[0].id : '');
      render();
    }, function (err) { detail.innerHTML = '<p class="adm-error">' + esc((err && err.message) || 'Could not load this listing.') + '</p>'; });
  }

  /* ---------------------------------------------------------------- render */
  function pill(text, tone) { return '<span class="adm-pill' + (tone ? ' adm-pill--' + tone : '') + '">' + esc(text) + '</span>'; }

  function render() {
    var d = state.data; if (!d) return;
    var l = d.listing, st = stateOf(l), V = A.DocVerification;
    var inReview = ['ai_review', 'manual_review'].indexOf(st) !== -1;
    var canDecide = inReview;
    var unverified = d.docs.filter(function (x) { return x.reviewStatus !== 'verified'; }).length;

    var html = '<div class="adm-card"><div class="adm-head"><h2>' + esc(l.name) + '</h2>' +
      pill(A.ListingReview.LABEL[st] || st, st === 'approved' ? 'ok' : st === 'rejected' ? 'bad' : 'warn') + pill(l.category === 'sale' ? 'For sale' : 'For rent') + '</div>';
    if ((l.approval || {}).reason) html += '<p class="adm-hint">Last reason given to the agent: ' + esc(l.approval.reason) + '</p>';
    html += '<div class="adm-actions">' +
      '<button type="button" class="adm-btn" data-adm-action="analyze"' + (d.docs.length ? '' : ' disabled') + '>Run demo analysis</button>' +
      (st === 'pending_review' ? '<button type="button" class="adm-btn" data-adm-action="manual">Start manual review</button>' : '') + '</div>';
    if (st === 'pending_review') html += '<p class="adm-hint">Run the analysis (or start manual review) before deciding.</p>';

    html += '<label class="adm-label" for="adm-reason">Reason or message for the agent (required to request changes or reject)</label>' +
      '<textarea class="adm-textarea" id="adm-reason" data-adm-reason maxlength="500"></textarea>' +
      (unverified ? '<p class="adm-hint">' + unverified + ' of ' + d.docs.length + ' documents are not marked VERIFIED. ACCOOM has not confirmed them with any issuing authority. Approving is your decision as a reviewer.</p>' : '') +
      '<label class="adm-confirm"><input type="checkbox" data-adm-confirm /> <span>I have looked at the documents for this listing myself.</span></label>' +
      '<div class="adm-actions">' +
      '<button type="button" class="adm-btn adm-btn--primary" data-adm-action="approve"' + (canDecide ? '' : ' disabled') + '>Approve listing</button>' +
      '<button type="button" class="adm-btn" data-adm-action="changes"' + (canDecide ? '' : ' disabled') + '>Request changes</button>' +
      '<button type="button" class="adm-btn adm-btn--danger" data-adm-action="reject"' + (canDecide ? '' : ' disabled') + '>Reject</button></div>' +
      (canDecide ? '' : '<p class="adm-hint">Decisions are available while a listing is in AI Review or Manual Review.</p>') + '</div>';

    // property + agent
    html += '<div class="adm-card"><h2>Property</h2><dl class="adm-dl">' +
      '<dt>Type</dt><dd>' + esc(l.typeLabel || '') + '</dd>' +
      '<dt>Address</dt><dd>' + esc([l.address, l.area, l.state].filter(Boolean).join(', ')) + '</dd>' +
      '<dt>Price</dt><dd>' + esc(money(l.price)) + (l.category === 'rent' && l.period ? ' per ' + esc(l.period) : '') + '</dd>' +
      '<dt>Listing ID</dt><dd>' + esc(l.id) + '</dd></dl>' +
      (l.description ? '<p class="adm-detailtext">' + esc(l.description) + '</p>' : '') + '</div>';
    var agentId = (d.docs[0] && d.docs[0].ownerId) || l.ownerId || 'unknown';
    html += '<div class="adm-card"><h2>Agent</h2><dl class="adm-dl"><dt>Agent ID</dt><dd>' + esc(agentId) + '</dd>' +
      '<dt>Who is listing</dt><dd>' + esc(((l.documentation || {}).answers || {}).representation === 'owner' || !((l.documentation || {}).answers || {}).representation ? 'Owner' : 'Acting for the owner') + '</dd></dl>' +
      '<p class="adm-hint">Phone numbers and email addresses are not shown. ACCOOM contacts agents inside the app.</p></div>';

    // documents
    html += '<div class="adm-card"><h2>Documents (' + d.docs.length + ')</h2>';
    if (!d.docs.length) html += '<p class="adm-empty">No documents were uploaded.</p>';
    d.docs.forEach(function (doc) {
      var ds = V.displayStatus(doc), rep = d.reports[doc.id];
      html += '<div class="adm-doc" data-doc="' + esc(doc.id) + '"><div class="adm-doc-top"><span class="adm-doc-title">' + esc(A.DocRequirements.labelFor(l.category, doc.docType)) + '</span>' +
        pill(ds.headline, ds.tone) + '</div>' +
        '<span class="adm-doc-meta">' + esc(doc.originalName) + ' \u00B7 ' + esc(A.DocumentStore.formatSize(doc.size)) + ' \u00B7 version ' + doc.version + ' \u00B7 ' + esc(ds.stage) + '</span>' +
        '<span class="adm-doc-meta">Verification source: ' + esc(V.SOURCE_LABEL[(doc.verification && doc.verification.source) === 'none' || !doc.verification ? (rep ? rep.verificationSource : 'none') : doc.verification.source] || 'None') + '</span>' +
        (doc.rejectionReason ? '<span class="adm-doc-meta">Note: ' + esc(doc.rejectionReason) + '</span>' : '') +
        '<div class="adm-doc-actions">' +
          '<button type="button" class="adm-btn adm-btn--sm" data-adm-action="preview" data-id="' + esc(doc.id) + '">Preview</button>' +
          '<button type="button" class="adm-btn adm-btn--sm" data-adm-action="report" data-id="' + esc(doc.id) + '">' + (rep ? 'View report' : 'No report yet') + '</button>' +
          '<button type="button" class="adm-btn adm-btn--sm" data-adm-action="versions" data-group="' + esc(doc.groupId) + '">Version history</button></div>' +
        '<input class="adm-input" data-adm-docnote="' + esc(doc.id) + '" placeholder="Reason or note (required to reject or flag)" maxlength="300" />' +
        '<div class="adm-doc-actions">' +
          '<button type="button" class="adm-btn adm-btn--sm" data-adm-action="decide" data-dec="verify" data-id="' + esc(doc.id) + '">Mark verified (my decision)</button>' +
          '<button type="button" class="adm-btn adm-btn--sm" data-adm-action="decide" data-dec="needs_review" data-id="' + esc(doc.id) + '">Needs review</button>' +
          '<button type="button" class="adm-btn adm-btn--sm adm-btn--danger" data-adm-action="decide" data-dec="reject" data-id="' + esc(doc.id) + '">Reject</button>' +
          '<select class="adm-input" style="width:auto;min-height:36px" data-adm-stage="' + esc(doc.id) + '" aria-label="Set a pending stage"><option value="">Set stage\u2026</option>' +
            '<option value="issuer_pending">Issuer confirmation pending</option><option value="ownership_pending">Ownership verification pending</option><option value="human_review">Human review required</option></select></div>';
      if (state.history[doc.groupId]) html += '<ol class="adm-versions" data-history="' + esc(doc.groupId) + '">' + state.history[doc.groupId] + '</ol>';
      html += '</div>';
    });
    html += '<p class="adm-hint">Demo trigger words for file names: ' + esc(V.TRIGGER_WORDS.join(', ')) + '.</p></div>';

    // report
    var cur = d.docs.filter(function (x) { return x.id === state.docId; })[0];
    html += '<div class="adm-card"><h2>Analysis report</h2>' + (cur ? reportHtml(cur, d.reports[cur.id]) : '<p class="adm-empty">Choose a document and open its report.</p>') + '</div>';

    // cross-document
    html += '<div class="adm-card"><h2>Cross-document comparison</h2>';
    if (!d.verification) html += '<p class="adm-empty">Not run yet. Run the analysis to compare names, addresses, certificate numbers and land sizes across documents.</p>';
    else {
      html += '<p class="adm-hint">' + esc(d.verification.summary) + ' (' + esc(fmt(d.verification.createdAt)) + (d.verification.mode === 'demo' ? ', demo values' : '') + ')</p>';
      d.verification.crossDocument.forEach(function (c) {
        html += '<div class="adm-cross adm-cross--' + esc(c.status) + '"><strong>' + esc(c.label) + '</strong> ' + pill(c.status, c.status === 'inconsistent' ? 'bad' : c.status === 'consistent' ? 'ok' : '') +
          '<div class="adm-detailtext">' + esc(c.explanation) + '</div>' +
          (c.values.length ? '<div class="adm-detailtext">' + c.values.map(function (v) { return esc((v.docType === 'listing' ? 'Listing' : A.DocRequirements.labelFor(l.category, v.docType)) + ': ' + v.value); }).join(' | ') + '</div>' : '') + '</div>';
      });
    }
    html += '</div>';

    // side by side
    html += compareHtml(d);

    // notes
    html += '<div class="adm-card"><h2>Internal notes</h2><p class="adm-hint">Only reviewers see these. They are not shown to the agent.</p>' +
      '<ul class="adm-notes">' + ((l.reviewNotes || []).slice().reverse().map(function (n) { return '<li><span class="adm-detailtext">' + esc(fmt(n.at)) + ' \u00B7 ' + esc(n.by) + '</span><br>' + esc(n.text) + '</li>'; }).join('') || '<li class="adm-empty">No notes yet.</li>') + '</ul>' +
      '<textarea class="adm-textarea" data-adm-note maxlength="2000" placeholder="Write a note"></textarea>' +
      '<div class="adm-actions"><button type="button" class="adm-btn adm-btn--sm" data-adm-action="note">Save note</button></div></div>';

    // history
    html += '<div class="adm-card"><h2>History</h2><ul class="adm-notes">' +
      (((l.approval || {}).history || []).slice().reverse().map(function (h) { return '<li><span class="adm-detailtext">' + esc(fmt(h.at)) + '</span><br>' + esc((A.ListingReview.LABEL[h.from] || h.from) + ' \u2192 ' + (A.ListingReview.LABEL[h.to] || h.to)) + ' by ' + esc(h.role) + (h.reason ? ' \u2014 ' + esc(h.reason) : '') + '</li>'; }).join('') || '<li class="adm-empty">No review steps yet.</li>') + '</ul>' +
      '<h3>Recent activity log</h3><ul class="adm-notes">' + (d.audit.map(function (e) { return '<li><span class="adm-detailtext">' + esc(fmt(e.at)) + ' \u00B7 ' + esc(e.actorRole) + '</span><br>' + esc(e.action) + '</li>'; }).join('') || '<li class="adm-empty">Nothing recorded.</li>') + '</ul></div>';

    detail.innerHTML = html;
    renderQueue();
  }

  function checkLi(c) {
    var tag = c.source === 'local' ? '<span class="adm-tag">Real check</span>' : c.source === 'simulated' ? '<span class="adm-tag adm-tag--sim">Simulated</span>'
      : c.source === 'not_performed' ? '<span class="adm-tag adm-tag--none">Not performed</span>' : '<span class="adm-tag">Provider</span>';
    return '<li class="adm-check adm-check--' + esc(c.result) + '"><div class="adm-check-top"><strong>' + esc(c.label) + '</strong>' + tag + '</div>' +
      (c.detail ? '<span class="adm-detailtext">' + esc(c.detail) + '</span>' : '') + '</li>';
  }

  function reportHtml(doc, rep) {
    if (!rep) return '<p class="adm-empty">No analysis has been run for \u201C' + esc(doc.originalName) + '\u201D yet. Use \u201CRun demo analysis\u201D.</p>';
    var V = A.DocVerification, l = state.data.listing;
    var groups = { fail: [], warn: [], pass: [], not_performed: [] };
    rep.checks.forEach(function (c) { (groups[c.result] || groups.pass).push(c); });
    var sim = rep.extracted && rep.extracted.simulated;
    var h = '<p>' + pill(V.MODE_LABEL[rep.mode] || rep.mode, rep.mode === 'demo' ? 'demo' : 'warn') + '</p>' +
      '<h3>Document identification</h3><dl class="adm-dl"><dt>File</dt><dd>' + esc(doc.originalName) + ' (version ' + rep.docVersion + ')</dd>' +
      '<dt>Selected type</dt><dd>' + esc(A.DocRequirements.labelFor(l.category, doc.docType)) + '</dd>' +
      '<dt>Identified type</dt><dd>' + esc(A.DocRequirements.labelFor(l.category, rep.identifiedType)) + (sim ? ' <span class="adm-tag adm-tag--sim">Simulated</span>' : '') + '</dd></dl>' +
      '<h3>Extracted information' + (sim ? ' (sample values, not read from the file)' : '') + '</h3><dl class="adm-dl">' +
      [['Name', 'ownerName'], ['Property address', 'address'], ['Certificate / reference', 'certificateNumber'], ['Land size', 'landSize'], ['Issue date', 'issueDate'], ['Issuing authority', 'issuingAuthority']]
        .map(function (p) { return '<dt>' + p[0] + '</dt><dd>' + (esc(rep.extracted[p[1]]) || '<em>not found</em>') + '</dd>'; }).join('') +
      '<dt>Pages</dt><dd>' + (rep.extracted.pageCount != null ? esc(rep.extracted.pageCount) : 'unknown') + '</dd></dl>' +
      '<h3>Extracted text</h3><pre class="adm-pre">' + esc(rep.text || 'None') + '</pre>' +
      '<h3>Checks performed</h3>';
    [['fail', 'Failed'], ['warn', 'Warnings'], ['pass', 'Passed'], ['not_performed', 'Not performed']].forEach(function (g) {
      if (groups[g[0]].length) h += '<p class="adm-label">' + g[1] + ' (' + groups[g[0]].length + ')</p><ul class="adm-checks">' + groups[g[0]].map(checkLi).join('') + '</ul>';
    });
    h += '<h3>Cross-document comparison</h3>' + ((rep.crossDocument || []).length
      ? (rep.crossDocument.map(function (c) { return '<div class="adm-cross adm-cross--' + esc(c.status) + '"><strong>' + esc(c.label) + '</strong>: ' + esc(c.status) + '</div>'; }).join(''))
      : '<p class="adm-hint">Run the listing analysis to fill this in.</p>') +
      '<h3>Risk assessment</h3><p>' + pill('Risk level: ' + rep.risk.level, rep.risk.level === 'low' ? 'ok' : rep.risk.level === 'medium' ? 'warn' : 'bad') + '</p><p class="adm-detailtext">' + esc(rep.risk.explanation) + '</p>' +
      '<h3>AI recommendation</h3><p class="adm-detailtext">' + esc(rep.aiRecommendation) + '</p>' +
      '<h3>Human administrator decision</h3><p class="adm-detailtext">' + (rep.adminDecision && rep.adminDecision.decision
        ? esc(rep.adminDecision.decision.replace(/_/g, ' ')) + ' by ' + esc(rep.adminDecision.by) + ' on ' + esc(fmt(rep.adminDecision.at)) + (rep.adminDecision.notes ? ' \u2014 ' + esc(rep.adminDecision.notes) : '')
        : 'No administrator decision yet.') + '</p>' +
      '<h3>Verification source and date</h3><p class="adm-detailtext">' + esc(V.SOURCE_LABEL[rep.verificationSource] || rep.verificationSource) + ' \u00B7 report created ' + esc(fmt(rep.createdAt)) + '</p>';
    return h;
  }

  function compareHtml(d) {
    var opts = function (sel) { return d.docs.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(A.DocRequirements.labelFor(d.listing.category, x.docType) + ' \u2014 ' + x.originalName) + '</option>'; }).join(''); };
    var h = '<div class="adm-card"><h2>Side-by-side comparison</h2>';
    if (d.docs.length < 2) return h + '<p class="adm-empty">Upload at least two documents to compare them.</p></div>';
    var a = d.docs.filter(function (x) { return x.id === state.cmpA; })[0], b = d.docs.filter(function (x) { return x.id === state.cmpB; })[0];
    var ra = a && d.reports[a.id], rb = b && d.reports[b.id];
    h += '<div class="adm-compare"><div><select class="adm-input" data-adm-cmp="A" aria-label="First document">' + opts(state.cmpA) + '</select>' +
      '<div class="adm-doc-actions" style="margin-top:6px"><button type="button" class="adm-btn adm-btn--sm" data-adm-action="cmp-load" data-which="A">Load preview</button></div><div data-adm-cmp-view="A"></div></div>' +
      '<div><select class="adm-input" data-adm-cmp="B" aria-label="Second document">' + opts(state.cmpB) + '</select>' +
      '<div class="adm-doc-actions" style="margin-top:6px"><button type="button" class="adm-btn adm-btn--sm" data-adm-action="cmp-load" data-which="B">Load preview</button></div><div data-adm-cmp-view="B"></div></div></div>';
    if (ra && rb) {
      h += '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Detail</th><th>First</th><th>Second</th></tr></thead><tbody>' +
        [['Name', 'ownerName'], ['Address', 'address'], ['Certificate / reference', 'certificateNumber'], ['Land size', 'landSize'], ['Issue date', 'issueDate']].map(function (p) {
          var x = ra.extracted[p[1]] || '', y = rb.extracted[p[1]] || '';
          var diff = x && y && x.toLowerCase() !== y.toLowerCase();
          return '<tr' + (diff ? ' class="adm-diff"' : '') + '><td>' + p[0] + '</td><td>' + esc(x || 'not found') + '</td><td>' + esc(y || 'not found') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + (ra.extracted.simulated || rb.extracted.simulated ? '<p class="adm-hint">These are demo sample values, not text read from the files.</p>' : '');
    } else h += '<p class="adm-hint">Run the analysis to compare extracted details.</p>';
    return h + '</div>';
  }

  /* --------------------------------------------------------------- actions */
  function reason() { var el = $('[data-adm-reason]'); return el ? el.value.trim() : ''; }
  function confirmed() { var el = $('[data-adm-confirm]'); return !!(el && el.checked); }

  function run(promise, okMsg) {
    if (state.busy) return;
    state.busy = true;
    return promise.then(function () { if (okMsg) say(okMsg); return load(state.id); }, function (err) { say((err && err.message) || 'That did not work.', true); })
      .then(function () { state.busy = false; }, function () { state.busy = false; });
  }

  function showPreview(which, docId) {
    var doc = state.data.docs.filter(function (x) { return x.id === docId; })[0]; if (!doc) return;
    var box = $('[data-adm-cmp-view="' + which + '"]'); box.innerHTML = '<p class="adm-hint">Loading\u2026</p>';
    A.DocumentStore.urlFor(docId).then(function (url) {
      box.innerHTML = doc.mimeType === 'application/pdf'
        ? '<iframe class="adm-frame" src="' + esc(url) + '" title="' + esc(doc.originalName) + '"></iframe>'
        : '<img class="adm-frame-img" src="' + esc(url) + '" alt="' + esc(doc.originalName) + '" />';
    }, function (e) { box.innerHTML = '<p class="adm-error">' + esc((e && e.message) || 'Could not open this file.') + '</p>'; });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-adm-action]');
    if (!b || !app.contains(b) || !A.AdminDemo.isActive()) return;
    var act = b.getAttribute('data-adm-action'), RV = A.ListingReview, V = A.DocVerification;
    if (act === 'open') { state.id = b.getAttribute('data-id'); state.docId = ''; state.history = {}; say(''); load(state.id).then(function () { detail.scrollIntoView && detail.scrollIntoView({ block: 'start' }); });
      return; }
    if (!state.id) return;
    if (act === 'analyze') run(V.analyzeListing(state.id, actor()), 'Demo analysis finished. Remember: these results are simulated except the checks tagged \u201CReal check\u201D.');
    else if (act === 'manual') run(RV.transition(state.id, 'manual_review', actor()), 'Manual review started.');
    else if (act === 'approve') {
      if (!confirmed()) { say('Tick the box to confirm you looked at the documents yourself.', true); return; }
      run(RV.approve(state.id, actor()), 'Listing approved and published. It can now appear to buyers.');
    } else if (act === 'changes' || act === 'reject') {
      if (!reason()) { say('Write a reason the agent can read first.', true); return; }
      if (!confirmed()) { say('Tick the box to confirm you looked at the documents yourself.', true); return; }
      run(act === 'changes' ? RV.requestChanges(state.id, actor(), reason()) : RV.reject(state.id, actor(), reason()), act === 'changes' ? 'Changes requested. The agent can see your reason.' : 'Listing rejected.');
    } else if (act === 'note') {
      run(RV.addNote(state.id, actor(), $('[data-adm-note]').value), 'Note saved.');
    } else if (act === 'report') { state.docId = b.getAttribute('data-id'); render(); }
    else if (act === 'preview') A.DocumentPreview.open({ docId: b.getAttribute('data-id'), name: (state.data.docs.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0] || {}).originalName,
      mimeType: (state.data.docs.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0] || {}).mimeType });
    else if (act === 'decide') {
      var id = b.getAttribute('data-id'), inp = $('[data-adm-docnote="' + id + '"]');
      run(V.decideDocument(actor(), id, b.getAttribute('data-dec'), { notes: inp ? inp.value : '' }), 'Document updated.');
    } else if (act === 'versions') {
      var g = b.getAttribute('data-group');
      if (state.history[g]) { delete state.history[g]; render(); return; }
      A.DocumentStore.history(g).then(function (vs) {
        state.history[g] = vs.map(function (v) { return '<li>Version ' + v.version + ': ' + esc(v.originalName) + ', uploaded ' + esc(fmt(v.uploadedAt)) + (v.isCurrent ? ' (current)' : ' (replaced' + (v.replacedReason ? ': ' + esc(v.replacedReason) : '') + ')') + '</li>'; }).join('');
        render();
      });
    } else if (act === 'cmp-load') { var w = b.getAttribute('data-which'); showPreview(w, w === 'A' ? state.cmpA : state.cmpB); }
  });

  document.addEventListener('change', function (e) {
    if (!A.AdminDemo.isActive()) return;
    var c = e.target.closest('[data-adm-cmp]');
    if (c) { if (c.getAttribute('data-adm-cmp') === 'A') state.cmpA = c.value; else state.cmpB = c.value; render(); return; }
    var s = e.target.closest('[data-adm-stage]');
    if (s && s.value && state.id) {
      var id = s.getAttribute('data-adm-stage');
      run(A.DocVerification.decideDocument(actor(), id, s.value, {}), 'Document stage updated.');
    }
  });

  /* ------------------------------------------------------------------ boot */
  A.ready(function () {
    if (A.Records && A.Records.init) A.Records.init();
    showApp();
  });
})();
