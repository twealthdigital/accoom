/* ==========================================================================
   ACCOOM — Listing review & approval service (Stage 2)
   --------------------------------------------------------------------------
   A listing has TWO separate axes:
     status             lifecycle: in_review, available, hold, sold, ...
     approval.state     review:    draft, pending_review, ai_review,
                                   manual_review, changes_required,
                                   approved, rejected, legacy_unreviewed

   A listing is PUBLIC only when:
     status === 'available'  AND  approval.state === 'approved'
     AND approval.published === true
   Everything else (including listings created before review existed) is
   private. Every public page must filter through
   Accoom.ListingReview.isPubliclyVisible / filterPublic.

   Who may do what:
     agent   draft -> pending_review (submit / resubmit)
     system  pending_review -> ai_review / manual_review
     admin   approve, reject, request changes, reopen

   Honest limits: "admin" is a local demonstration role, not real
   authentication. Nothing here is verified by a server.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var KEY = 'accoom-agent-listings';

  // --------------------------------------------------------------------------
  // TESTING ONLY. While enabled, every listing an agent SUCCESSFULLY submits
  // (documents complete, status pending_review) is immediately approved,
  // verified and published, so it shows on the homepage, Browse and Search.
  // It still goes through the normal state machine and audit trail
  // (pending_review -> manual_review -> approved) using the actor below.
  // When real admin review is ready: set enabled to false. Nothing else changes;
  // admins then approve/verify from admin-review.html via approve(..., {verified:true}).
  // --------------------------------------------------------------------------
  var AUTO_APPROVE = { enabled: true, actorId: 'auto-approve-testing' };

  var LABEL = {
    draft: 'Draft', pending_review: 'Pending Review', ai_review: 'AI Review', manual_review: 'Manual Review',
    changes_required: 'Changes Required', approved: 'Approved', rejected: 'Rejected',
    legacy_unreviewed: 'Not reviewed'
  };

  // from -> { to: [roles allowed] }
  var RULES = {
    draft:             { pending_review: ['agent'] },
    pending_review:    { ai_review: ['system', 'admin'], manual_review: ['system', 'admin'], changes_required: ['admin'], rejected: ['admin'] },
    ai_review:         { manual_review: ['system', 'admin'], changes_required: ['admin'], approved: ['admin'], rejected: ['admin'] },
    manual_review:     { changes_required: ['admin'], approved: ['admin'], rejected: ['admin'] },
    changes_required:  { pending_review: ['agent'] },
    approved:          { pending_review: ['agent', 'system'] },     // re-review after a critical change
    rejected:          { manual_review: ['admin'] },                // only an administrator can reopen
    legacy_unreviewed: { pending_review: ['agent'], draft: ['agent'] }
  };

  function fail(code, message, extra) {
    var e = new Error(message); e.code = code;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function nowIso() { return new Date().toISOString(); }

  /* --------------------------------------------------------------- storage */
  function readList() {
    var raw;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { throw fail('storage', 'Saved listings could not be read.'); }
    if (!raw) return [];
    var list;
    try { list = JSON.parse(raw); } catch (e) { throw fail('corrupt', 'Saved listings are unreadable.'); }
    return Array.isArray(list) ? list : [];
  }
  function writeList(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { throw fail('quota', 'Browser storage is full. The change was not saved.'); }
  }
  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return i;
    return -1;
  }
  function get(id) {
    var list = readList(), i = find(list, id);
    return i === -1 ? null : list[i];
  }

  function audit(actor, action, id, detail) {
    if (!Accoom.Records || !Accoom.Records.audit) return Promise.resolve();
    return Accoom.Records.audit({ actorId: (actor && actor.id) || '', actorRole: (actor && actor.role) || 'system', action: action,
      entityType: 'listing', entityId: String(id), detail: detail || {} }).catch(function () { /* audit must not hide the result */ });
  }

  function notify(title, text, link) {
    try {
      if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: title, text: text, link: link || 'my-listings.html?tab=in_review' });
    } catch (e) { /* a notification problem never blocks a review step */ }
  }

  /* ------------------------------------------------------------ visibility */
  function approvalOf(listing) { return (listing && listing.approval) || null; }

  function isPubliclyVisible(listing) {
    var a = approvalOf(listing);
    return !!listing && listing.status === 'available' && !!a && a.state === 'approved' && a.published === true;
  }
  function filterPublic(list) { return (Array.isArray(list) ? list : []).filter(isPubliclyVisible); }

  function labelOf(listing) {
    var a = approvalOf(listing);
    if (!a) return 'Not reviewed';
    if (a.state === 'approved' && a.published && listing.status === 'available') return 'Available';
    return LABEL[a.state] || 'Not reviewed';
  }

  /* ------------------------------------------------------------ transition */
  function canTransition(from, to, role) {
    var row = RULES[from];
    return !!(row && row[to] && row[to].indexOf(role) !== -1);
  }

  // Applies one approval transition and saves it. Never touches documents.
  function transition(id, to, actor, opts) {
    opts = opts || {};
    actor = actor || { role: 'system' };
    return new Promise(function (resolve, reject) {
      var list, i;
      try { list = readList(); i = find(list, id); } catch (e) { reject(e); return; }
      if (i === -1) { reject(fail('not_found', 'Listing not found.')); return; }
      var rec = list[i];
      var a = Object.assign({ state: 'legacy_unreviewed', history: [] }, rec.approval || {});
      var from = a.state;
      if (!canTransition(from, to, actor.role)) {
        reject(fail('not_allowed', actor.role + ' cannot move a listing from "' + (LABEL[from] || from) + '" to "' + (LABEL[to] || to) + '".'));
        return;
      }
      if ((to === 'changes_required' || to === 'rejected') && !String(opts.reason || '').trim()) {
        reject(fail('reason_required', 'Give the agent a clear reason so they can fix the problem.'));
        return;
      }
      var at = nowIso();
      var history = (a.history || []).slice(-49);
      history.push({ from: from, to: to, at: at, by: actor.id || '', role: actor.role, reason: opts.reason || '' });

      var next = Object.assign({}, a, {
        state: to, updatedAt: at, history: history,
        reason: (to === 'changes_required' || to === 'rejected' || (to === 'pending_review' && opts.reason)) ? (opts.reason || '') : '',
        published: false,
        verified: false          // a listing is verified only by an explicit approval below
      });
      if (to === 'pending_review') next.submittedAt = at;
      if (to === 'approved') {
        next.approvedAt = at; next.approvedBy = actor.id || '';
        next.published = opts.publish !== false;
        if (opts.verified === true) { next.verified = true; next.verifiedAt = at; next.verifiedBy = actor.id || ''; }
      }

      var status = rec.status;
      if (to === 'approved') {
        // Only a listing that is in review goes live. A listing the agent put on hold stays on hold.
        if (opts.publish !== false && (status === 'in_review' || status === 'available')) status = 'available';
        else if (status === 'in_review') status = 'hold';
      } else if (status === 'available' || status === 'in_review' || status === 'hold') {
        status = 'in_review'; // any non-approved state is private
      }

      var statusHistory = Array.isArray(rec.statusHistory) ? rec.statusHistory.slice(-49) : [];
      if (status !== rec.status) statusHistory.push({ status: status, at: at });
      var activity = Array.isArray(rec.activityHistory) ? rec.activityHistory.slice() : [];
      activity.push({ type: 'review_' + to, at: at });

      list[i] = Object.assign({}, rec, { approval: next, status: status, statusHistory: statusHistory, activityHistory: activity, updatedAt: at });
      try { writeList(list); } catch (e) { reject(e); return; }

      audit(actor, 'listing.' + to, id, { from: from, to: to, reason: opts.reason || '', published: next.published }).then(function () {
        resolve(list[i]);
      });
    });
  }

  /* --------------------------------------------------------- agent actions */
  // Checks the documents, then moves draft / changes_required -> pending_review.
  function submitForReview(id, actor) {
    actor = actor || { role: 'agent' };
    var rec = get(id);
    if (!rec) return Promise.reject(fail('not_found', 'Listing not found.'));
    var from = (rec.approval && rec.approval.state) || 'legacy_unreviewed';
    if (from === 'pending_review' || from === 'ai_review' || from === 'manual_review') {
      return Promise.reject(fail('already_submitted', 'This listing is already being reviewed.'));
    }
    if (!Accoom.DocumentStore) return Promise.reject(fail('unavailable', 'Document storage is not loaded.'));
    return Accoom.DocumentStore.listForListing(id).then(function (docs) {
      var report = Accoom.DocRequirements.evaluate(rec.listingType || rec.category, rec.typeLabel,
        (rec.documentation && rec.documentation.answers) || {}, docs);
      if (!report.complete) {
        throw fail('documents_incomplete', 'Some required documents are missing.', { report: report });
      }
      return transition(id, 'pending_review', actor);
    }).then(function (saved) {
      return autoReviewForTesting(saved);
    }).then(function (saved) {
      if (isPubliclyVisible(saved)) return saved; // auto-approved: the approval notice was already sent
      notify('Listing submitted for review', '\u201C' + saved.name + '\u201D was submitted. ACCOOM will review the documents before it is shown to buyers.');
      return saved;
    });
  }

  // TESTING ONLY (see AUTO_APPROVE). Runs the same transitions a reviewer would,
  // as a clearly labelled automatic actor. Returns the listing unchanged when off.
  function autoReviewForTesting(saved) {
    if (!AUTO_APPROVE.enabled) return Promise.resolve(saved);
    var system = { role: 'system', id: AUTO_APPROVE.actorId };
    var admin = { role: 'admin', id: AUTO_APPROVE.actorId };
    return transition(saved.id, 'manual_review', system).then(function () {
      return approve(saved.id, admin, { verified: true });
    });
  }

  // Called after a document is replaced. A critical replacement pulls an
  // approved listing back to review so it is never public with unreviewed evidence.
  function documentReplaced(id, docType, actor) {
    var rec = get(id);
    if (!rec) return Promise.resolve({ reviewRequired: false });
    var a = rec.approval || {};
    var critical = Accoom.DocRequirements.isCritical(rec.listingType || rec.category, docType);
    if (a.state !== 'approved' || !critical) return Promise.resolve({ reviewRequired: false });
    var why = 'The document "' + Accoom.DocRequirements.labelFor(rec.listingType || rec.category, docType) + '" was replaced and must be reviewed again.';
    return transition(id, 'pending_review', actor || { role: 'system' }, { reason: why }).then(function (back) {
      return autoReviewForTesting(back);
    }).then(function (now) {
      if (isPubliclyVisible(now)) return { reviewRequired: false };
      notify('Listing back in review', '\u201C' + rec.name + '\u201D is hidden from buyers until the replaced document is reviewed.');
      return { reviewRequired: true, reason: why };
    });
  }

  // Keeps the listing's document count in step with what is actually stored.
  function syncDocumentation(id) {
    if (!Accoom.DocumentStore) return Promise.resolve();
    return Accoom.DocumentStore.listForListing(id).then(function (docs) {
      var list = readList(), i = find(list, id);
      if (i === -1) return;
      var doc = Object.assign({}, list[i].documentation || {});
      doc.submittedCount = docs.length;
      if (docs.length) doc.lastSubmittedAt = docs.reduce(function (m, d) { return d.uploadedAt > m ? d.uploadedAt : m; }, '');
      list[i] = Object.assign({}, list[i], { documentation: doc, documents: docs.length });
      writeList(list);
    });
  }

  /* -------------------------------------------------------- admin actions */
  function adminOnly(actor) {
    if (!actor || actor.role !== 'admin') return Promise.reject(fail('forbidden', 'Only an administrator can do this.'));
    return null;
  }
  function approve(id, actor, opts) {
    return adminOnly(actor) || transition(id, 'approved', actor, opts).then(function (rec) {
      notify('Listing approved', '\u201C' + rec.name + '\u201D was approved' + (rec.approval.published ? ' and is now available to buyers.' : '.'), 'my-listings.html');
      return rec;
    });
  }
  function reject(id, actor, reason) {
    return adminOnly(actor) || transition(id, 'rejected', actor, { reason: reason }).then(function (rec) {
      notify('Listing rejected', '\u201C' + rec.name + '\u201D was rejected: ' + reason);
      return rec;
    });
  }
  function requestChanges(id, actor, reason) {
    return adminOnly(actor) || transition(id, 'changes_required', actor, { reason: reason }).then(function (rec) {
      notify('Changes required', '\u201C' + rec.name + '\u201D needs changes: ' + reason);
      return rec;
    });
  }

  // Internal reviewer notes. Stored on the listing, never shown to the agent.
  function addNote(id, actor, text) {
    var err = adminOnly(actor); if (err) return err;
    text = String(text || '').trim();
    if (!text) return Promise.reject(fail('empty', 'Write a note first.'));
    return new Promise(function (resolve, reject) {
      try {
        var list = readList(), i = find(list, id);
        if (i === -1) { reject(fail('not_found', 'Listing not found.')); return; }
        var notes = (list[i].reviewNotes || []).slice(-99);
        notes.push({ at: nowIso(), by: actor.id || 'admin', text: text.slice(0, 2000) });
        list[i] = Object.assign({}, list[i], { reviewNotes: notes });
        writeList(list);
        audit(actor, 'listing.note', id, {}).then(function () { resolve(list[i]); });
      } catch (e) { reject(e); }
    });
  }

  Accoom.ListingReview = {
    addNote: addNote,
    AUTO_APPROVE: AUTO_APPROVE,
    LABEL: LABEL,
    RULES: RULES,
    get: get,
    canTransition: canTransition,
    transition: transition,
    submitForReview: submitForReview,
    autoReviewForTesting: autoReviewForTesting,
    documentReplaced: documentReplaced,
    syncDocumentation: syncDocumentation,
    approve: approve,
    reject: reject,
    requestChanges: requestChanges,
    isPubliclyVisible: isPubliclyVisible,
    filterPublic: filterPublic,
    labelOf: labelOf
  };
})(window.Accoom);
