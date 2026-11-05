/* ACCOOM — tells the client how the receipt will be delivered BEFORE they pay (Stage 5). */
(function () {
  'use strict';
  var A = window.Accoom;
  function listing(id) {
    try { return (JSON.parse(localStorage.getItem('accoom-agent-listings')) || []).filter(function (l) { return String(l.id) === String(id); })[0] || null; } catch (e) { return null; }
  }
  A.ready(function () {
    var sel = document.querySelector('[data-dc-listing]');
    if (!sel || !A.Receipts) return;
    var box = document.createElement('p');
    box.className = 'dc-note'; box.setAttribute('data-receipt-notice', ''); box.setAttribute('role', 'status');
    sel.parentNode.insertBefore(box, sel.nextSibling);
    function update() {
      var n = sel.value ? A.Receipts.noticeFor(listing(sel.value)) : null;
      box.hidden = !n; box.textContent = n ? n.text : '';
      box.style.fontWeight = n && n.delivery === 'physical' ? '700' : '';
    }
    sel.addEventListener('change', update); sel.addEventListener('focus', update);
    window.setTimeout(update, 300);
  });
})();
