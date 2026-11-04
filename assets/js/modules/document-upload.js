/* ==========================================================================
   ACCOOM — Property Documentation upload UI (Stage 2)
   --------------------------------------------------------------------------
   Renders the "Property Documentation" section of the listing form.

   const ctrl = Accoom.DocumentUpload.mount(containerEl, {
     getType:      () => 'rent' | 'sale',
     getTypeLabel: () => 'Land / Plot',
     ownerId:      'agent id',
     onChange:     () => {}              // readiness may have changed
   });

   ctrl.loadExisting(listingId, approval)   edit mode: show saved documents
   ctrl.refresh()                           listing type / property type changed
   ctrl.getAnswers() / ctrl.setAnswers(o)   "who is listing" answer
   ctrl.readiness()                         { complete, missing, groupIssues, ... }
   ctrl.hasPending()                        files chosen but not yet saved
   ctrl.commit(listingId)                   saves chosen files -> Promise<result>

   Files are only CHOSEN here. They are saved (IndexedDB, via
   Accoom.DocumentStore) when the agent saves or submits the listing, so
   nothing is stored for a listing that was never saved.

   Honest wording: an uploaded document is shown as "Uploaded (not yet
   reviewed)". Nothing on this page ever says "verified" for a document.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var uid = 0;
  var MAX_ADDITIONAL = 5;

  var STATUS_TEXT = {
    uploaded: 'Uploaded (not yet reviewed)',
    processing: 'Being analysed',
    analysis_complete: 'Analysis complete, awaiting review',
    issuer_confirmation_pending: 'Waiting for issuer confirmation',
    ownership_verification_pending: 'Waiting for ownership check',
    human_review_required: 'Needs a person to review',
    verified: 'Verified',
    needs_review: 'Needs review',
    rejected: 'Rejected'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function mount(container, opts) {
    opts = opts || {};
    var DS = Accoom.DocumentStore, DR = Accoom.DocRequirements;
    var state = {
      listingId: '', approval: null, answers: {}, existing: [], staged: [], errors: {}, committing: null, loadError: ''
    };
    var input = null, pendingType = '';

    function type() { return opts.getType ? opts.getType() : 'rent'; }
    function typeLabel() { return opts.getTypeLabel ? opts.getTypeLabel() : ''; }
    function spec() { return DR.forListing(type(), typeLabel(), state.answers); }
    function changed() { if (opts.onChange) try { opts.onChange(); } catch (e) { /* ignore */ } }

    // Documents cannot be changed while ACCOOM is reviewing them, or after rejection.
    function locked() {
      var s = state.approval && state.approval.state;
      return s === 'pending_review' || s === 'ai_review' || s === 'manual_review' || s === 'rejected';
    }

    /* -------------------------------------------------------- derived data */
    function existingFor(id) { return state.existing.filter(function (d) { return d.docType === id; }); }
    function stagedFor(id) { return state.staged.filter(function (s) { return s.docType === id; }); }

    function readiness() {
      var docs = state.existing.slice();
      state.staged.forEach(function (s) {
        if (s.status === 'uploaded') return;
        docs.push({ docType: s.docType, isCurrent: true, reviewStatus: 'uploaded' });
      });
      // a staged replacement hides the old file only if the old one was rejected
      return DR.evaluate(type(), typeLabel(), state.answers, docs);
    }

    /* ------------------------------------------------------------- render */
    function fileLine(d) {
      var s = STATUS_TEXT[d.reviewStatus] || d.reviewStatus;
      var tone = d.reviewStatus === 'rejected' ? 'bad' : d.reviewStatus === 'needs_review' ? 'warn' : d.reviewStatus === 'verified' ? 'ok' : 'neutral';
      return '<div class="du-file" data-du-doc="' + esc(d.id) + '">' +
        '<span class="du-file-icon" aria-hidden="true">' + (d.mimeType === 'application/pdf' ? 'PDF' : 'IMG') + '</span>' +
        '<span class="du-file-main"><span class="du-file-name">' + esc(d.originalName) + '</span>' +
        '<span class="du-file-meta">' + esc(DS.formatSize(d.size)) + ' \u00B7 Version ' + d.version + ' \u00B7 <span class="du-tone du-tone--' + tone + '">' + esc(s) + '</span></span>' +
        (d.rejectionReason ? '<span class="du-file-reason">Reviewer note: ' + esc(d.rejectionReason) + '</span>' : '') +
        '</span>' +
        '<span class="du-file-actions">' +
          '<button type="button" class="du-link" data-du-action="preview-doc" data-id="' + esc(d.id) + '">Preview</button>' +
          (locked() ? '' : '<button type="button" class="du-link" data-du-action="replace" data-type="' + esc(d.docType) + '">Replace</button>') +
        '</span></div>';
    }

    function stagedLine(s) {
      var st = s.status === 'uploading' ? 'Uploading\u2026' : s.status === 'error' ? s.error : 'Ready to upload when you save';
      var tone = s.status === 'error' ? 'bad' : s.status === 'uploading' ? 'warn' : 'neutral';
      return '<div class="du-file du-file--staged" data-du-staged="' + s.uid + '">' +
        '<span class="du-file-icon" aria-hidden="true">' + (s.file.type === 'application/pdf' ? 'PDF' : 'IMG') + '</span>' +
        '<span class="du-file-main"><span class="du-file-name">' + esc(s.file.name) + '</span>' +
        '<span class="du-file-meta">' + esc(DS.formatSize(s.file.size)) + ' \u00B7 <span class="du-tone du-tone--' + tone + '">' + esc(st) + '</span></span></span>' +
        '<span class="du-file-actions">' +
          '<button type="button" class="du-link" data-du-action="preview-staged" data-uid="' + s.uid + '">Preview</button>' +
          (s.status === 'uploading' ? '' : '<button type="button" class="du-link du-link--danger" data-du-action="remove" data-uid="' + s.uid + '">Remove</button>') +
        '</span></div>';
    }

    function itemHtml(it) {
      var ex = existingFor(it.id), sg = stagedFor(it.id);
      var chooseLabel = it.multiple ? (ex.length + sg.length ? 'Add another file' : 'Choose file')
        : (ex.length || sg.length ? 'Choose a different file' : 'Choose file');
      var canChoose = !locked() && !(it.multiple && ex.length + sg.length >= MAX_ADDITIONAL);
      // For single-file slots with a saved document the "Replace" link is used instead.
      var showChoose = canChoose && !(ex.length && !it.multiple);
      var err = state.errors[it.id];
      var badgeTone = it.badge === 'Required' || it.badge === 'Required for your listing' ? 'required' : it.badge === 'Optional' ? 'optional' : 'applicable';
      return '<div class="du-item" data-du-type="' + esc(it.id) + '">' +
        '<div class="du-item-head"><span class="du-item-name">' + esc(it.label) + '</span>' +
        '<span class="du-badge du-badge--' + badgeTone + '">' + esc(it.badge) + '</span></div>' +
        (it.help ? '<p class="du-help">' + esc(it.help) + '</p>' : '') +
        ex.map(fileLine).join('') + sg.map(stagedLine).join('') +
        (err ? '<p class="du-error" role="alert">' + esc(err) + '</p>' : '') +
        (showChoose ? '<button type="button" class="du-choose" data-du-action="choose" data-type="' + esc(it.id) + '">' + chooseLabel + '</button>' : '') +
        '</div>';
    }

    function render() {
      var sp = spec();
      var r = readiness();
      var html = '';

      if (state.approval && state.approval.state === 'changes_required') {
        html += '<div class="du-banner du-banner--warn" role="status"><strong>Changes required.</strong> ' + esc(state.approval.reason || 'ACCOOM asked for changes to this listing.') + '</div>';
      } else if (state.approval && state.approval.state === 'rejected') {
        html += '<div class="du-banner du-banner--bad" role="status"><strong>Rejected.</strong> ' + esc(state.approval.reason || 'This listing was rejected.') + ' Documents are kept for the record and can no longer be changed.</div>';
      } else if (locked()) {
        html += '<div class="du-banner" role="status">This listing is being reviewed. Documents are locked until the review finishes.</div>';
      } else if (state.approval && state.approval.state === 'approved') {
        html += '<div class="du-banner" role="status">This listing is approved. Replacing a key document (such as a title or ownership document) sends it back for review and hides it from buyers until it is approved again.</div>';
      }
      if (state.loadError) html += '<div class="du-banner du-banner--bad" role="alert">' + esc(state.loadError) + '</div>';

      html += '<div class="du-question"><p class="du-question-label">' + esc(sp.question.label) + '</p>';
      sp.question.options.forEach(function (o) {
        var checked = (state.answers[sp.question.id] || sp.question.defaultValue) === o.value;
        html += '<label class="du-radio"><input type="radio" name="du-' + esc(sp.question.id) + '" value="' + esc(o.value) + '"' +
          (checked ? ' checked' : '') + (locked() ? ' disabled' : '') + ' data-du-answer="' + esc(sp.question.id) + '" /> <span>' + esc(o.label) + '</span></label>';
      });
      html += '</div>';

      html += '<p class="du-accepted">Accepted: PDF, JPG, JPEG or PNG. Up to ' + esc(DS.formatSize(DS.MAX_SIZE)) + ' per file. Take clear, full-page photos so every page can be read.</p>';

      var shownGroups = {};
      sp.items.forEach(function (it) {
        if (it.group && !shownGroups[it.group]) {
          shownGroups[it.group] = true;
          var g = sp.groups.filter(function (x) { return x.id === it.group; })[0];
          var issue = r.groupIssues.some(function (x) { return x.id === it.group; });
          if (g) html += '<div class="du-group' + (issue ? ' du-group--open' : ' du-group--ok') + '"><strong>' + esc(g.label) + '.</strong> ' + esc(g.help) + '</div>';
        }
        html += itemHtml(it);
      });

      if (r.complete) {
        html += '<p class="du-summary du-summary--ok" role="status">All required documents are added. ACCOOM will still review them before the listing is shown to buyers.</p>';
      } else {
        var parts = r.missing.map(function (m) { return m.label; }).concat(r.groupIssues.map(function (g) { return g.label; }));
        html += '<p class="du-summary" role="status">Still needed: ' + esc(parts.join('; ')) + '.</p>';
      }
      container.innerHTML = html;
    }

    /* ---------------------------------------------------------- file input */
    function ensureInput() {
      if (input) return input;
      input = document.createElement('input');
      input.type = 'file';
      input.hidden = true;
      input.setAttribute('accept', DS.ACCEPT);
      document.body.appendChild(input); // outside the container: render() replaces its contents
      input.addEventListener('change', function () {
        var files = Array.prototype.slice.call(input.files || []);
        input.value = '';
        if (files.length) stage(pendingType, files);
      });
      return input;
    }

    function dupStaged(file) {
      return state.staged.some(function (s) {
        return s.file.name === file.name && s.file.size === file.size && s.file.lastModified === file.lastModified;
      });
    }

    function stage(docType, files) {
      var item = spec().items.filter(function (i) { return i.id === docType; })[0];
      if (!item || locked()) return;
      state.errors[docType] = '';
      files.forEach(function (file) {
        var v = DS.validateFile(file);
        if (!v.ok) { state.errors[docType] = file.name + ': ' + v.message; return; }
        if (dupStaged(file)) { state.errors[docType] = '\u201C' + file.name + '\u201D is already chosen for this listing.'; return; }
        if (item.multiple) {
          if (existingFor(docType).length + stagedFor(docType).length >= MAX_ADDITIONAL) {
            state.errors[docType] = 'You can add up to ' + MAX_ADDITIONAL + ' additional documents.'; return;
          }
        } else {
          state.staged = state.staged.filter(function (s) { return s.docType !== docType; }); // one file per slot
        }
        state.staged.push({ uid: ++uid, docType: docType, file: file, status: 'ready', error: '' });
      });
      render(); changed();
    }

    /* -------------------------------------------------------------- events */
    container.addEventListener('click', function (e) {
      var b = e.target.closest('[data-du-action]');
      if (!b || !container.contains(b)) return;
      var a = b.getAttribute('data-du-action');
      if (a === 'choose' || a === 'replace') {
        if (state.committing || locked()) return;
        pendingType = b.getAttribute('data-type');
        var item = spec().items.filter(function (i) { return i.id === pendingType; })[0];
        var inp = ensureInput();
        inp.multiple = !!(item && item.multiple);
        inp.click();
      } else if (a === 'remove') {
        var id = Number(b.getAttribute('data-uid'));
        state.staged = state.staged.filter(function (s) { return s.uid !== id; });
        render(); changed();
      } else if (a === 'preview-staged') {
        var s = state.staged.filter(function (x) { return x.uid === Number(b.getAttribute('data-uid')); })[0];
        if (s && Accoom.DocumentPreview) Accoom.DocumentPreview.open({ file: s.file });
      } else if (a === 'preview-doc') {
        var d = state.existing.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
        if (d && Accoom.DocumentPreview) Accoom.DocumentPreview.open({ docId: d.id, name: d.originalName, mimeType: d.mimeType });
      }
    });

    container.addEventListener('change', function (e) {
      var r = e.target.closest('[data-du-answer]');
      if (!r) return;
      state.answers[r.getAttribute('data-du-answer')] = r.value;
      render(); changed();
    });

    /* -------------------------------------------------------------- public */
    function loadExisting(listingId, approval) {
      state.listingId = String(listingId || '');
      state.approval = approval || null;
      state.loadError = '';
      if (!state.listingId) { state.existing = []; render(); return Promise.resolve(); }
      return DS.listForListing(state.listingId).then(function (docs) {
        state.existing = docs;
        render(); changed();
      }, function (err) {
        state.loadError = (err && err.message) || 'Saved documents could not be loaded.';
        render();
      });
    }

    function hasPending() { return state.staged.some(function (s) { return s.status !== 'uploaded'; }); }

    // Saves every chosen file. One failure does not stop the others, and a
    // failed file stays on screen with its reason so the agent can retry.
    function commit(listingId) {
      if (state.committing) return state.committing; // double-click protection
      var queue = state.staged.filter(function (s) { return s.status !== 'uploaded'; });
      var result = { uploaded: [], failed: [], replacedTypes: [] };
      if (!queue.length) return Promise.resolve(result);
      var ownerId = opts.ownerId || '';

      var chain = Promise.resolve();
      queue.forEach(function (s) {
        chain = chain.then(function () {
          s.status = 'uploading'; s.error = ''; render();
          var current = existingFor(s.docType)[0];
          var item = spec().items.filter(function (i) { return i.id === s.docType; })[0];
          var p = (current && !(item && item.multiple))
            ? DS.replace(current.id, s.file, { reason: 'Replaced by the agent while editing the listing' })
            : DS.add({ file: s.file, listingId: listingId, propertyId: listingId, ownerId: ownerId, docType: s.docType });
          return p.then(function (rec) {
            s.status = 'uploaded';
            result.uploaded.push(rec);
            if (current && !(item && item.multiple)) result.replacedTypes.push(s.docType);
            // refresh the in-memory list so the next file in the same slot sees the new version
            state.existing = state.existing.filter(function (d) { return d.id !== (current && current.id); }).concat([rec]);
          }, function (err) {
            s.status = 'error';
            s.error = (err && err.message) || 'This file could not be saved.';
            result.failed.push({ docType: s.docType, name: s.file.name, code: err && err.code, message: s.error });
          });
        });
      });

      state.committing = chain.then(function () {
        state.staged = state.staged.filter(function (s) { return s.status !== 'uploaded'; });
        state.committing = null;
        state.listingId = String(listingId);
        return DS.listForListing(listingId).then(function (docs) { state.existing = docs; }, function () { /* keep memory copy */ })
          .then(function () { render(); changed(); return result; });
      });
      return state.committing;
    }

    ensureInput();
    render();

    return {
      refresh: function () { render(); changed(); },
      loadExisting: loadExisting,
      getAnswers: function () { return Object.assign({}, state.answers); },
      setAnswers: function (a) { state.answers = Object.assign({}, a || {}); render(); },
      readiness: readiness,
      hasPending: hasPending,
      isCommitting: function () { return !!state.committing; },
      commit: commit,
      setApproval: function (a) { state.approval = a || null; render(); }
    };
  }

  Accoom.DocumentUpload = { mount: mount };
})(window.Accoom);
