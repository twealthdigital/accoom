/* ==========================================================================
   ACCOOM — Who is using this browser (Stage 4)
   --------------------------------------------------------------------------
   Real accounts need a backend. Until then this returns the signed-in user
   from localStorage ("accoom-user"). That record has no id, so a stable
   stand-in id is used: "local-agent" for agents (what Stage 2 already used
   for document owners) and "local-customer" for everyone else.

   This is identity for DEMONSTRATION only. It is not authentication: anyone
   can edit browser storage. Access rules in the frontend keep honest users
   from seeing each other's records; they cannot stop a determined one.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  function readUser() {
    try { return JSON.parse(window.localStorage.getItem('accoom-user')); } catch (e) { return null; }
  }

  function current() {
    var u = readUser();
    if (!u) return null;
    var role = u.role === 'agent' ? 'agent' : 'customer';
    var name = u.fullName || u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || (role === 'agent' ? 'ACCOOM agent' : 'ACCOOM customer');
    var id = u.id || u.userId || (role === 'agent' ? (u.agentId || 'local-agent') : 'local-customer');
    return { id: String(id), role: role, name: String(name) };
  }

  Accoom.Identity = { current: current };
})(window.Accoom);
