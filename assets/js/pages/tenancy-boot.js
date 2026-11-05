/* ACCOOM — runs the tenancy reminder check when someone opens a page that loads it (Stage 6).
   Reminders are idempotent, so running this on every page open is safe. */
(function () {
  'use strict';
  var A = window.Accoom;
  A.ready(function () {
    if (!A.Tenancy || !A.Identity) return;
    if (A.Records && A.Records.init) A.Records.init();
    var me = A.Identity.current();
    if (!me) return;
    A.Tenancy.backfill(me).then(function () { return A.Tenancy.checkAll(); }).then(function () { return A.Tenancy.deliverInbox(me); }).catch(function () { /* never block the page */ });
  });
})();
