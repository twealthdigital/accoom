/* ==========================================================================
   ACCOOM - Listing ownership detection (Agent Contact & Payment Permission
   System, Stage 1)
   --------------------------------------------------------------------------
   ONE place that answers: "is the signed-in person the owner of this listing
   / this agent profile?". Later stages (hide contact, block self-chat, hide
   payment) must call this instead of comparing ids themselves.

   How people and owners are represented in ACCOOM today
     viewer   localStorage "accoom-user" ({ role, email, id? ...}).
              Stable id = Accoom.Sync.userKey() (hash of the email). Older
              records may carry id / userId / agentId. An agent with none of
              these used the stand-in "local-agent" (see core/identity.js).
     listing  { ownerId, agentKey, agent: { ownerId, agentKey } }.
              Listings made in THIS browser were saved with ownerId =
              user.id || user.agentId || "local-agent". The copy shared by
              the test server (and pulled by other browsers) carries
              ownerId = agentKey = the agent's userKey(). Sample (hardcoded)
              catalogue items have no owner at all.

   Result of a check (Accoom.Ownership.check(subject)):
     state  'own'      signed-in agent, and the listing/profile is theirs
            'other'    someone else's listing/profile (or a sample listing
                       that no real person owns)
            'guest'    nobody is signed in
            'unknown'  a real listing/profile with no owner information, or
                       the viewer's identity is not known yet. Callers must
                       treat this as "not confirmed": never show a payment
                       prompt on it, and do not claim it is someone's own.
   isOwn is true ONLY for state 'own'.

   This is frontend logic. The test server has no authentication, so a
   backend must repeat the same comparison (viewer id vs listing.ownerId)
   before it creates a conversation or a payment.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var LEGACY_AGENT_ID = 'local-agent';

  function readUser() {
    try { return JSON.parse(window.localStorage.getItem('accoom-user')); } catch (e) { return null; }
  }

  function clean(v) {
    if (v === null || v === undefined) return '';
    var s = String(v).trim();
    return s === 'undefined' || s === 'null' ? '' : s;
  }

  // Every id the signed-in person may appear under on a listing.
  // Returns null when nobody is signed in.
  function viewer() {
    var u = readUser();
    if (!u || typeof u !== 'object') return null;
    var role = u.role === 'agent' ? 'agent' : 'customer';
    var ids = [];
    function add(v) { v = clean(v); if (v && ids.indexOf(v) === -1) ids.push(v); }
    if (Accoom.Sync && typeof Accoom.Sync.userKey === 'function') add(Accoom.Sync.userKey());
    add(u.id); add(u.userId); add(u.agentId);
    // Stand-in id used before real accounts: only ever an agent's own.
    if (role === 'agent') add(LEGACY_AGENT_ID);
    return { role: role, ids: ids, known: ids.length > 0 };
  }

  // Owner ids found on a listing or an agent object.
  function ownerIds(subject) {
    var out = [];
    function add(v) { v = clean(v); if (v && out.indexOf(v) === -1) out.push(v); }
    if (!subject || typeof subject !== 'object') return out;
    add(subject.ownerId); add(subject.agentKey);
    if (subject.agent && typeof subject.agent === 'object') { add(subject.agent.ownerId); add(subject.agent.agentKey); }
    return out;
  }

  // A real (agent-created) record is expected to name its owner.
  function isRealRecord(subject) {
    if (!subject || typeof subject !== 'object') return false;
    if (subject.agentListing === true || subject.real === true) return true;
    return !!(subject.agent && subject.agent.real === true);
  }

  function result(state, extra) {
    var r = { state: state, isOwn: state === 'own', isOther: state === 'other', isGuest: state === 'guest', isUnknown: state === 'unknown' };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /* check(subject): subject = a listing, a catalogue card item, an agent
     object, or a plain owner id string. */
  function check(subject) {
    var v = viewer();
    if (!v) return result('guest');

    var owners = (typeof subject === 'string' || typeof subject === 'number')
      ? (clean(subject) ? [clean(subject)] : [])
      : ownerIds(subject);
    var real = (typeof subject === 'string' || typeof subject === 'number') ? true : isRealRecord(subject);

    if (!owners.length) {
      // Sample catalogue items are owned by nobody: safe to treat as someone else's.
      if (!real) return result('other', { reason: 'no-owner-sample' });
      return result('unknown', { reason: 'missing-owner' });
    }
    // Customers own no listings. Only agents can match.
    if (v.role !== 'agent') return result('other', { reason: 'not-an-agent' });
    if (!v.known) return result('unknown', { reason: 'viewer-unknown' });

    for (var i = 0; i < owners.length; i++) {
      if (v.ids.indexOf(owners[i]) !== -1) return result('own', { reason: 'id-match' });
    }
    return result('other', { reason: 'id-differs' });
  }

  /* checkListingId(id): look the listing up in the shared catalogue
     (Accoom.PropertyService) and check it. Unknown id -> 'unknown'. */
  function checkListingId(id) {
    var svc = Accoom.PropertyService;
    var list = [];
    try { list = (svc && svc.getAll) ? svc.getAll() : []; } catch (e) { list = []; }
    var found = null;
    for (var i = 0; i < list.length; i++) { if (String(list[i].id) === String(id)) { found = list[i]; break; } }
    if (!found) return viewer() ? result('unknown', { reason: 'listing-not-found' }) : result('guest');
    return check(found);
  }

  /* ------------------------------------------------------------------
     Stage 2 - self-contact prevention
     canContact(subject)    false only when the listing/profile is the
                            signed-in agent's own. (Guests are sent to
                            sign-up by the existing flow; unknown owner is
                            allowed here because it cannot be proved own -
                            the server must still refuse it.)
     contactRequestOk(req)  false when a stored "accoom-contact-request"
                            (or any {ownerId, agentKey, agent} object) names
                            the signed-in agent as the person to contact.
     gateContact(els, subj) hides (and disables) contact / message / chat
                            controls on the signed-in agent's own listing or
                            profile, and shows them again when it is not.
     onChange(fn)           re-run a gate when the account changes in another
                            tab or the page is restored from the back/forward
                            cache, so no stale "own" state survives.
     ------------------------------------------------------------------ */
  function canContact(subject) { return !check(subject).isOwn; }

  function contactRequestOk(req) {
    if (!req || typeof req !== 'object') return true;
    return !check(req).isOwn;
  }

  function setBlocked(el, blocked) {
    if (!el) return;
    if (blocked) {
      if (el.getAttribute('data-self-contact') !== 'blocked') {
        el.setAttribute('data-self-contact', 'blocked');
        el.setAttribute('data-self-contact-display', el.style.display || '');
      }
      el.hidden = true;
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('tabindex', '-1');
      if ('disabled' in el) el.disabled = true;
    } else if (el.getAttribute('data-self-contact') === 'blocked') {
      el.removeAttribute('data-self-contact');
      el.hidden = false;
      el.style.display = el.getAttribute('data-self-contact-display') || '';
      el.removeAttribute('data-self-contact-display');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('tabindex');
      if ('disabled' in el) el.disabled = false;
    }
  }

  var CONTACT_SELECTOR = '[data-pd-contact-agent], [data-ap-contact], [data-contact-agent], [data-message-agent], [data-chat-agent]';

  function gateContact(target, subject) {
    var blocked = !canContact(subject);
    var list = [];
    if (typeof target === 'string') list = Array.prototype.slice.call(document.querySelectorAll(target));
    else if (target && target.nodeType === 1) list = [target];
    else if (target && target.length) list = Array.prototype.slice.call(target);
    list.forEach(function (el) { setBlocked(el, blocked); });
    return blocked;
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return;
    window.addEventListener('storage', function (e) { if (!e || e.key === 'accoom-user' || e.key === null) fn(); });
    window.addEventListener('pageshow', function (e) { if (e && e.persisted) fn(); });
  }

  /* ------------------------------------------------------------------
     Stage 4 - payment permission (central rule, reused by later stages)
     canInitiatePayment(subject)  true only when somebody is signed in and the
                                  listing is provably SOMEONE ELSE'S ('other').
                                  False for guests, the owner's own listing
                                  ('own') and listings whose owner cannot be
                                  established ('unknown'): a payment prompt must
                                  never appear on those.
     This says who MAY pay. Who initiated the contact (the sender) is decided
     by the chat screen (conv.outgoing); the receiving agent never pays.
     ------------------------------------------------------------------ */
  function canInitiatePayment(subject) { return check(subject).isOther; }

  /* ------------------------------------------------------------------
     Stage 5B - payment UI on property pages (listing view)
     canSeePaymentUI(subject)  false for guests, for the agent's own listing,
                               and for an agent viewing a listing whose owner
                               cannot be established ('unknown'). True for an
                               agent on someone else's listing and for customers
                               (customers own nothing, so a missing owner on the
                               record cannot make them pay themselves: their
                               existing experience is kept).
     gatePayment(els, subject) hides + disables those controls when it is false,
                               restores them when it is true again.
     ------------------------------------------------------------------ */
  function canSeePaymentUI(subject) {
    var c = check(subject);
    if (c.isGuest || c.isOwn) return false;
    if (c.isUnknown) { var v = viewer(); return !!(v && v.role !== 'agent'); }
    return true;
  }

  function gatePayment(target, subject) {
    var blocked = !canSeePaymentUI(subject);
    var list = [];
    if (typeof target === 'string') list = Array.prototype.slice.call(document.querySelectorAll(target));
    else if (target && target.nodeType === 1) list = [target];
    else if (target && target.length) list = Array.prototype.slice.call(target);
    list.forEach(function (el) { setBlocked(el, blocked); });
    return blocked;
  }

  /* ------------------------------------------------------------------
     Stage 5C - payment.html opened directly (URL, bookmark, history)
     canAccessPaymentPage(propertyId) -> { allowed, reason }
       guest                      blocked  ('guest')
       no property id (wallet     allowed  ('no-property')
         top-up)
       customer                   allowed  ('customer'): customers own
                                  nothing, so their experience is unchanged
       agent, someone else's      allowed  ('other-listing')
         listing
       agent, own listing         blocked  ('own-listing')
       agent, owner cannot be     blocked  ('unverifiable'): listing missing
         established              from the catalogue, real listing with no
                                  owner, or the viewer's id is unknown
     Any property id on the URL counts as a property payment, whatever
     mode / context says, so "?context=wallet&id=<own listing>" gets no
     way round it. Frontend only: a backend must repeat the same check.
     ------------------------------------------------------------------ */
  function canAccessPaymentPage(propertyId) {
    var v = viewer();
    if (!v) return { allowed: false, reason: 'guest' };
    var id = clean(propertyId);
    if (!id) return { allowed: true, reason: 'no-property' };
    if (v.role !== 'agent') return { allowed: true, reason: 'customer' };
    var c = checkListingId(id);
    if (c.isOther) return { allowed: true, reason: 'other-listing' };
    return { allowed: false, reason: c.isOwn ? 'own-listing' : 'unverifiable' };
  }

  Accoom.Ownership = {
    canAccessPaymentPage: canAccessPaymentPage,
    canSeePaymentUI: canSeePaymentUI,
    gatePayment: gatePayment,
    canInitiatePayment: canInitiatePayment,
    canInitiatePaymentForListingId: function (id) { return checkListingId(id).isOther; },
    check: check,
    checkListingId: checkListingId,
    isOwn: function (subject) { return check(subject).isOwn; },
    isOwnListingId: function (id) { return checkListingId(id).isOwn; },
    viewer: viewer,
    canContact: canContact,
    contactRequestOk: contactRequestOk,
    gateContact: gateContact,
    onChange: onChange,
    CONTACT_SELECTOR: CONTACT_SELECTOR
  };
})(window.Accoom);
