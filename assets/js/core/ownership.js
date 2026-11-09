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

  Accoom.Ownership = {
    check: check,
    checkListingId: checkListingId,
    isOwn: function (subject) { return check(subject).isOwn; },
    isOwnListingId: function (id) { return checkListingId(id).isOwn; },
    viewer: viewer
  };
})(window.Accoom);
