/* ACCOOM — public receipt check (Stage 5). Shows no personal data. Only sees THIS browser's records. */
(function () {
  'use strict';
  var A = window.Accoom, $ = function (s) { return document.querySelector(s); };
  var out = $('[data-vf-result]');

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function when(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return iso; } }
  function show(cls, html) { out.className = 'dc-result dc-result--' + cls; out.innerHTML = html; }

  function check(ref) {
    ref = String(ref || '').trim().toUpperCase();
    if (!/^ACR-\d{4}-[A-Z0-9]{10}$/.test(ref)) { show('warn', '<strong>That does not look like a receipt number.</strong> It should look like ACR-2026-XXXXXXXXXX.'); return; }
    show('warn', 'Checking\u2026');
    A.Receipts.verify(ref).then(function (r) {
      if (!r.found) { show('warn', '<strong>Not found in this browser.</strong> ACCOOM cannot look up receipts issued elsewhere yet. This does not mean the receipt is fake.'); return; }
      var lines = ['<strong>' + esc(r.receiptNumber) + '</strong>', 'Type: ' + esc(r.purpose), 'Issued: ' + esc(when(r.issuedAt))];
      if (r.demo) lines.push('<strong>This is a DEMONSTRATION receipt. No real payment was made.</strong>');
      lines.push(r.sealMatches ? 'The record\u2019s seal matches: it has not been changed since it was issued.' : '<strong>The seal does NOT match.</strong> This record has been changed since it was issued.');
      lines.push('<em>The seal is a fingerprint, not a digital signature. It shows ACCOOM\u2019s stored record is unchanged. It does not prove the payment or the parties are genuine.</em>');
      show(r.sealMatches ? 'ok' : 'bad', lines.join('<br>'));
    }, function () { show('bad', 'The check could not run. Please try again.'); });
  }

  $('[data-vf-form]').addEventListener('submit', function (e) { e.preventDefault(); check($('[data-vf-ref]').value); });
  A.ready(function () {
    if (A.Records && A.Records.init) A.Records.init();
    var ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) { $('[data-vf-ref]').value = ref; check(ref); }
  });
})();
