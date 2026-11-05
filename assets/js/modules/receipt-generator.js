/* ==========================================================================
   ACCOOM — Receipt and signing-record PDFs (Stage 5)
   --------------------------------------------------------------------------
   Accoom.ReceiptGenerator.renderReceipt(receipt)   -> { bytes, blob, fileName }
   Accoom.ReceiptGenerator.renderSigning(agreement) -> { bytes, blob, fileName }
   Accoom.ReceiptGenerator.save(out)                -> downloads the file
   Accoom.ReceiptGenerator.saveBlob(blob, name)

   Uses Accoom.PDF (pdf-writer.js) and the vendored qrcode-generator, the same
   look as the ACTD. A receipt is drawn from its frozen snapshot, so it can be
   downloaded again exactly as issued.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var M = 40, CW = 515.28, BOTTOM = 790;
  var INK = [0.1, 0.1, 0.1], GREY = [0.4, 0.4, 0.4], GOLD = [0.83, 0.63, 0.09], PALE = [0.96, 0.94, 0.88], RULE = [0.8, 0.78, 0.72], RED = [0.72, 0.15, 0.15];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function p2(n) { return String(n).padStart(2, '0'); }
  function dateTime(iso) {
    if (!iso) return '-';
    var d = new Date(new Date(iso).getTime() + 3600000); // Nigeria is UTC+1 all year
    return p2(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' WAT';
  }
  function val(v) { return v === undefined || v === null || v === '' ? '-' : String(v); }
  function ngn(n) { return Accoom.ACTD.ngn(n); }

  function toolkit(doc, demo) {
    var y = 80, t = {};
    function header() {
      doc.rect(0, 0, doc.W, 54, { fill: [0.09, 0.09, 0.09] });
      doc.text('ACCOOM', { x: M, y: 35, size: 22, bold: true, color: GOLD });
      doc.text(t.headline || '', { x: doc.W - M, y: 33, size: 9, align: 'right', color: [1, 1, 1] });
      if (demo) {
        doc.rect(0, 54, doc.W, 20, { fill: RED });
        doc.text('DEMONSTRATION RECORD - NO REAL PAYMENT WAS MADE', { x: doc.W / 2, y: 68, size: 9, bold: true, align: 'center', color: [1, 1, 1] });
      }
      y = demo ? 92 : 78;
    }
    t.start = function (headline) { t.headline = headline; header(); };
    t.ensure = function (h) { if (y + h > BOTTOM) { doc.addPage(); header(); } };
    t.y = function () { return y; };
    t.skip = function (n) { y += n; };
    t.section = function (title) {
      t.ensure(60); y += 6;
      doc.rect(M, y, CW, 20, { fill: PALE }); doc.rect(M, y, 3, 20, { fill: GOLD });
      doc.text(title, { x: M + 10, y: y + 14, size: 10.5, bold: true, color: INK }); y += 30;
    };
    t.kv = function (label, value, o) {
      o = o || {};
      var lines = doc.wrap(val(value), CW - 155, 9.5, !!o.bold), h = lines.length * 12.5 + 4;
      t.ensure(h);
      doc.text(label, { x: M, y: y + 9, size: 9, bold: true, color: GREY });
      lines.forEach(function (l, i) { doc.text(l, { x: M + 150, y: y + 9 + i * 12.5, size: 9.5, bold: !!o.bold, color: INK }); });
      y += h;
    };
    t.para = function (text, o) {
      o = o || {};
      doc.wrap(text, CW, o.size || 9, false).forEach(function (l) { t.ensure(13); doc.text(l, { x: M, y: y + 9, size: o.size || 9, italic: !!o.italic, bold: !!o.bold, color: o.color || INK }); y += 12.5; });
      y += 2;
    };
    t.qr = function (url, size) {
      var top = y + 4;
      doc.rect(M, top, size, size, { fill: [1, 1, 1], stroke: RULE });
      if (typeof window.qrcode === 'function') {
        var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
        var n = qr.getModuleCount(), quiet = 3, cell = (size - 8) / (n + quiet * 2), ox = M + 4 + quiet * cell, oy = top + 4 + quiet * cell;
        for (var r = 0; r < n; r++) {
          var run = -1;
          for (var q = 0; q <= n; q++) {
            var dark = q < n && qr.isDark(r, q);
            if (dark && run < 0) run = q;
            if (!dark && run >= 0) { doc.rect(ox + run * cell, oy + r * cell, (q - run) * cell + 0.15, cell + 0.15, { fill: [0, 0, 0] }); run = -1; }
          }
        }
      } else doc.text('QR code unavailable', { x: M + 8, y: top + 60, size: 8, color: GREY });
      return top;
    };
    return t;
  }

  /* ---------------------------------------------------------------- receipt */
  function renderReceipt(r) {
    var c = r.content;
    var doc = Accoom.PDF.create({ title: 'ACCOOM payment receipt ' + r.receiptNumber, author: 'ACCOOM', subject: 'Receipt ' + r.receiptNumber, created: new Date(r.issuedAt) });
    var t = toolkit(doc, c.demo);
    t.start('Payment Receipt');

    doc.text(c.purpose.toUpperCase(), { x: M, y: t.y() + 12, size: 11, bold: true, color: GOLD });
    doc.text(r.receiptNumber, { x: M, y: t.y() + 34, size: 18, bold: true, color: INK });
    t.skip(50);

    t.section('RECEIPT DETAILS');
    t.kv('Receipt number', r.receiptNumber, { bold: true });
    t.kv('Receipt type', c.purpose);
    t.kv('Date and time', dateTime(c.payment.paidAt));
    t.kv('Transaction ID', c.transactionId);

    t.section('PARTIES AND PROPERTY');
    t.kv('Client', c.client.name);
    t.kv('Property', c.property.name);
    t.kv('Location', c.property.location);
    t.kv('Agent', c.agent.name);

    t.section('PAYMENT BREAKDOWN');
    c.lines.forEach(function (l) { t.kv(l.label, ngn(l.amount)); });
    t.ensure(26);
    doc.line(M, t.y() + 2, M + CW, t.y() + 2, { color: RULE });
    t.skip(6);
    t.kv('Amount paid', ngn(c.amountPaid), { bold: true });

    t.section('PAYMENT INFORMATION');
    t.kv('Payment reference', c.payment.reference);
    t.kv('Payment method', c.payment.method);
    t.kv('Payment provider', c.payment.provider);
    t.kv('Payment status', c.payment.status);

    t.section('RECEIPT DELIVERY');
    t.para(c.deliveryText);

    t.ensure(190);
    t.section('ACCOOM AUTHENTICATION');
    var size = 118, top = t.qr(c.verifyUrl, size), tx = M + size + 16, tw = CW - size - 16, ty = top + 4;
    function side(label, value, mono) {
      doc.text(label, { x: tx, y: ty + 8, size: 8, bold: true, color: GREY }); ty += 12;
      doc.wrap(value, tw, mono ? 8 : 9, false).forEach(function (l) { doc.text(l, { x: tx, y: ty + 8, size: mono ? 8 : 9, color: INK }); ty += 11; });
      ty += 4;
    }
    side('Receipt number', r.receiptNumber);
    side('Issued', dateTime(r.issuedAt));
    side('Verification URL', c.verifyUrl, true);
    t.skip(Math.max(size, ty - top) + 10);
    doc.text('Digital authentication seal (SHA-256)', { x: M, y: t.y() + 8, size: 9, bold: true, color: GREY }); t.skip(16);
    doc.wrap(r.seal, CW, 8.5, false).forEach(function (l) { t.ensure(12); doc.text(l, { x: M, y: t.y() + 8, size: 8.5, color: INK }); t.skip(11); });
    t.skip(6);
    t.para(c.note, { size: 8, color: GREY, italic: true });
    t.para('The seal is a fingerprint of ACCOOM\u2019s stored record, not a digital signature. In this demonstration version the online check only works in the browser that holds the record.', { size: 8, color: GREY });

    var bytes = doc.toBytes();
    return { bytes: bytes, blob: new Blob([bytes], { type: 'application/pdf' }), fileName: r.receiptNumber + '.pdf' };
  }

  /* ----------------------------------------------------------- signing record */
  function renderSigning(a, demo) {
    var doc = Accoom.PDF.create({ title: 'ACCOOM signing record: ' + a.title, author: 'ACCOOM', subject: 'Agreement ' + a.id, created: new Date(a.updatedAt || a.createdAt) });
    var t = toolkit(doc, !!demo);
    t.start('Agreement signing record');

    doc.text(a.title, { x: M, y: t.y() + 14, size: 15, bold: true, color: INK }); t.skip(26);
    t.kv('Agreement type', Accoom.Agreements.KINDS[a.kind] || a.kind);
    t.kv('Property', a.listingName);
    t.kv('Client', a.customerName || 'Not provided');
    t.kv('Agent', a.agentName || 'Not provided');
    t.kv('Status', Accoom.Agreements.STATUS_LABEL[a.status] || a.status, { bold: true });
    t.kv('Agreement reference', a.id);
    t.kv('Agreement fingerprint (SHA-256)', a.contentSha256);

    if (a.body) {
      t.section('AGREEMENT TERMS');
      a.body.split(/\n+/).forEach(function (p) { t.para(p, { size: 9.5 }); });
    } else {
      t.section('AGREEMENT FILE');
      t.para('This agreement was uploaded as a file: ' + a.fileName + '. The file is not copied into this record. Download it separately. The fingerprint above identifies the exact file that was reviewed and signed.');
    }

    t.section('SIGNATURES');
    if (!a.signatures.length) t.para('No one has signed yet.');
    a.signatures.forEach(function (s) {
      t.ensure(40);
      t.kv(s.role === 'client' ? 'Client signed' : 'Agent countersigned', s.typedName + ' (' + dateTime(s.at) + ')', { bold: true });
      t.kv('Signature type', s.method === 'drawn_and_typed' ? 'Typed name and drawn mark (visual signature)' : 'Typed name (visual signature)');
      t.kv('Signed fingerprint', s.contentSha256);
    });

    t.section('SIGNING EVENTS (recorded by ACCOOM)');
    a.events.forEach(function (e) { t.kv(dateTime(e.at), e.type.replace(/_/g, ' ') + ' (' + e.role + ')' + (e.note ? ': ' + e.note : '')); });

    t.section('WHAT THIS RECORD IS');
    t.para(Accoom.Agreements.DISCLAIMER);
    if (a.finalSeal) { t.skip(4); doc.text('Final seal (SHA-256)', { x: M, y: t.y() + 8, size: 9, bold: true, color: GREY }); t.skip(16); doc.wrap(a.finalSeal, CW, 8.5, false).forEach(function (l) { t.ensure(12); doc.text(l, { x: M, y: t.y() + 8, size: 8.5, color: INK }); t.skip(11); }); }

    var bytes = doc.toBytes();
    return { bytes: bytes, blob: new Blob([bytes], { type: 'application/pdf' }), fileName: 'signing-record-' + a.id + '.pdf' };
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  }
  function save(out) { saveBlob(out.blob, out.fileName); return out; }

  Accoom.ReceiptGenerator = { renderReceipt: renderReceipt, renderSigning: renderSigning, save: save, saveBlob: saveBlob };
})(window.Accoom);
