/* ==========================================================================
   ACCOOM — ACTD PDF generator (Stage 4)
   --------------------------------------------------------------------------
   Accoom.ACTDGenerator.render(actdRecord)   -> { bytes, blob, fileName }
   Accoom.ACTDGenerator.download(actdRecord) -> saves the PDF
   Accoom.ACTDGenerator.fileName(actdRecord)

   Draws the six ACTD sections from the record's frozen snapshot, so any
   version can be downloaded again exactly as it was issued. Needs
   Accoom.PDF (pdf-writer.js) and, for the QR code, the vendored
   qrcode-generator. Amounts are printed as "NGN 1,000" because the standard
   PDF fonts have no Naira sign.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var M = 40, CW = 515.28, TOP = 92, BOTTOM = 800;
  var INK = [0.1, 0.1, 0.1], GREY = [0.4, 0.4, 0.4], GOLD = [0.83, 0.63, 0.09], PALE = [0.96, 0.94, 0.88], RULE = [0.8, 0.78, 0.72];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function p2(n) { return String(n).padStart(2, '0'); }
  // Nigeria is UTC+1 all year, so a fixed offset keeps the output identical wherever it is rendered.
  function dateTime(iso) {
    if (!iso) return '-';
    var d = new Date(new Date(iso).getTime() + 3600000);
    return p2(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ' WAT';
  }
  function day(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? m[3] + ' ' + MON[+m[2] - 1] + ' ' + m[1] : (s || '-');
  }
  function ngn(n) { return Accoom.ACTD.ngn(n); }
  function val(v) { return v === undefined || v === null || v === '' ? '-' : String(v); }

  function fileName(rec) { return rec.actdNumber + '-v' + rec.version + '.pdf'; }

  function render(rec) {
    var c = rec.content, doc = Accoom.PDF.create({
      title: 'ACCOOM Certificate Transaction Document ' + rec.actdNumber + ' (version ' + rec.version + ')',
      author: 'ACCOOM', subject: 'ACTD ' + rec.actdNumber, created: new Date(rec.issuedAt)
    });
    var y = TOP;

    function header() {
      doc.rect(0, 0, doc.W, 54, { fill: [0.09, 0.09, 0.09] });
      doc.text('ACCOOM', { x: M, y: 35, size: 22, bold: true, color: GOLD });
      doc.text('Certificate Transaction Document', { x: doc.W - M, y: 33, size: 9, align: 'right', color: [1, 1, 1] });
      if (c.demo) {
        doc.rect(0, 54, doc.W, 20, { fill: [0.72, 0.15, 0.15] });
        doc.text('DEMONSTRATION RECORD - NO REAL PAYMENT WAS MADE', { x: doc.W / 2, y: 68, size: 9, bold: true, align: 'center', color: [1, 1, 1] });
      }
    }
    function newPage() { doc.addPage(); header(); y = c.demo ? TOP : 78; }
    function ensure(h) { if (y + h > BOTTOM) newPage(); }

    function section(title) {
      ensure(60);
      y += 6;
      doc.rect(M, y, CW, 20, { fill: PALE });
      doc.rect(M, y, 3, 20, { fill: GOLD });
      doc.text(title, { x: M + 10, y: y + 14, size: 10.5, bold: true, color: INK });
      y += 30;
    }
    function sub(title) { ensure(30); doc.text(title, { x: M, y: y + 8, size: 9, bold: true, color: GREY }); y += 16; }
    function kv(label, value, o) {
      o = o || {};
      var lines = doc.wrap(val(value), CW - 155, 9.5, !!o.bold), h = lines.length * 12.5 + 4;
      ensure(h);
      doc.text(label, { x: M, y: y + 9, size: 8.5, bold: true, color: GREY });
      lines.forEach(function (l, i) { doc.text(l, { x: M + 155, y: y + 9 + i * 12.5, size: 9.5, bold: !!o.bold, color: INK }); });
      y += h;
    }
    function para(text, o) {
      o = o || {}; var size = o.size || 9, lines = doc.wrap(text, (o.width || CW), size, false), h = lines.length * (size + 3.5) + 4;
      ensure(h);
      lines.forEach(function (l, i) { doc.text(l, { x: o.x || M, y: y + size + i * (size + 3.5), size: size, italic: !!o.italic, color: o.color || INK }); });
      y += h;
    }
    function rule() { ensure(8); doc.line(M, y + 2, M + CW, y + 2, { width: 0.5, color: RULE }); y += 8; }

    /* ------------------------------------------------------------ title */
    newPage();
    doc.text('ACCOOM CERTIFICATE TRANSACTION DOCUMENT (ACTD)', { x: M, y: y + 12, size: 14, bold: true, color: INK });
    y += 22;
    doc.text(rec.actdNumber + '   |   Version ' + rec.version + (rec.version > 1 ? ' (updated)' : ''), { x: M, y: y + 10, size: 11, bold: true, color: GOLD });
    y += 18;
    if (rec.version > 1) para('This is version ' + rec.version + '. Reason for this version: ' + rec.updateReason + '. Earlier versions are kept and can still be downloaded.', { italic: true, color: GREY });

    /* -------------------------------------------------- section 1 */
    var s1 = c.s1;
    section('SECTION 1 - TRANSACTION SUMMARY');
    kv('ACTD number', s1.actdNumber, { bold: true });
    kv('Transaction ID', s1.transactionId);
    kv('Property ID', s1.propertyId);
    kv('Property name', s1.propertyName);
    kv('Property location', s1.propertyLocation);
    kv('Transaction type', s1.transactionType);
    kv('Date and time', dateTime(s1.dateTime));
    kv('Transaction status', s1.status);
    kv('Client', s1.client.name + ' (ID ' + s1.client.id + ')');
    kv('Agent', s1.agent.name + (s1.agent.id ? ' (ID ' + s1.agent.id + ')' : ''));
    kv(c.s4.startDate ? 'Landlord' : 'Seller', s1.landlord.name || s1.landlord.note);

    /* -------------------------------------------------- section 2 */
    var s2 = c.s2;
    section('SECTION 2 - PAYMENT CONFIRMATION');
    s2.lines.forEach(function (ln) {
      var lines = doc.wrap(ln.label, CW - 130, 9.5, false), h = lines.length * 12.5 + 4; ensure(h);
      lines.forEach(function (l, i) { doc.text(l, { x: M, y: y + 9 + i * 12.5, size: 9.5, color: INK }); });
      doc.text(ngn(ln.amount), { x: M + CW, y: y + 9, size: 9.5, align: 'right', color: INK });
      y += h;
    });
    rule();
    ensure(20);
    doc.text('Total amount paid', { x: M, y: y + 10, size: 11, bold: true, color: INK });
    doc.text(ngn(s2.total), { x: M + CW, y: y + 10, size: 11, bold: true, align: 'right', color: INK });
    y += 22;
    kv('Payment method', s2.method);
    kv('Payment provider', s2.provider);
    kv('Payment reference', s2.reference);
    kv('Confirmed at', dateTime(s2.confirmedAt));
    kv('Payment status', s2.status, { bold: true });
    kv('ACCOOM receipt reference', s2.receiptRef);

    /* -------------------------------------------------- section 3 */
    var s3 = c.s3;
    section('SECTION 3 - PROPERTY INFORMATION');
    kv('Property type', s3.propertyType);
    kv('Full address', s3.address);
    kv('State', s3.state);
    kv('Area', s3.area);
    kv('Listing reference', s3.listingRef);
    kv('Agent', s3.agent.name + (s3.agent.id ? ' (ID ' + s3.agent.id + ')' : ''));
    kv(c.s4.startDate ? 'Landlord' : 'Seller', s3.landlord.name || s3.landlord.note);
    if (s3.description) kv('Description', s3.description);
    sub('Property documentation submitted');
    if (!s3.documents.length) para('No property documents are recorded for this listing.', { color: GREY });
    s3.documents.forEach(function (d) { para('- ' + d.label + ': ' + d.fileName + ' (v' + d.version + ') - ' + d.outcome, { x: M + 6, width: CW - 6, size: 8.5 }); });
    para(s3.verification, { italic: true, color: GREY, size: 8.5 });

    /* -------------------------------------------------- section 4 */
    var s4 = c.s4;
    section('SECTION 4 - AGREEMENT AND CONFIRMATION');
    kv('Agreed terms', s4.terms);
    if (s4.rentalDuration) {
      kv('Rental duration', s4.rentalDuration);
      kv('Start date', day(s4.startDate));
      kv('Expiry date', day(s4.expiryDate));
      kv('Renewal conditions', s4.renewalConditions);
      kv('Occupancy Extension', s4.occupancyExtension);
    }
    s4.confirmations.forEach(function (x) { kv(x.party + ' confirmation', x.state); });
    kv('Digital signing records', s4.signingRecords.length ? s4.signingRecords.map(function (r) { return r.party + ' - ' + r.level + ' - ' + dateTime(r.at); }).join('; ') : 'No signing record at the time of issue.');
    kv('Agreement references', s4.agreementRefs.length ? s4.agreementRefs.join(', ') : 'None recorded.');

    /* -------------------------------------------------- section 5 */
    var s5 = c.s5;
    section('SECTION 5 - DOCUMENT DELIVERY');
    kv('Receipt delivery method', s5.receiptDeliveryText);
    sub('Documents issued');
    s5.documentsIssued.forEach(function (d) { para('- ' + d.name + ' - ' + d.ref + (d.note ? ' (' + d.note + ')' : ''), { x: M + 6, width: CW - 6, size: 8.5 }); });
    kv('Delivery dates', s5.deliveryDates.map(function (d) { return d.item + ': ' + dateTime(d.at); }).join('; '));
    kv('Agent delivery confirmation', s5.agentConfirmation);
    kv('Client acknowledgement', s5.clientAcknowledgement);
    kv('Outstanding documents', s5.outstanding.length ? s5.outstanding.join('; ') : 'None recorded.');
    kv('Reported problems', s5.reportedProblems.length ? s5.reportedProblems.join('; ') : 'None recorded.');

    /* -------------------------------------------------- section 6 */
    var s6 = c.s6;
    ensure(380); // keep the whole authentication section on one page
    section('SECTION 6 - ACCOOM AUTHENTICATION');
    var qrTop = y + 4, size = 118;
    doc.rect(M, qrTop, size, size, { fill: [1, 1, 1], stroke: RULE });
    if (typeof window.qrcode === 'function') {
      var qr = window.qrcode(0, 'M'); qr.addData(s6.verifyUrl); qr.make();
      var n = qr.getModuleCount(), quiet = 3, cell = (size - 8) / (n + quiet * 2), ox = M + 4 + quiet * cell, oy = qrTop + 4 + quiet * cell;
      for (var r = 0; r < n; r++) {
        var run = -1;
        for (var q = 0; q <= n; q++) {
          var dark = q < n && qr.isDark(r, q);
          if (dark && run < 0) run = q;
          if (!dark && run >= 0) { doc.rect(ox + run * cell, oy + r * cell, (q - run) * cell + 0.15, cell + 0.15, { fill: [0, 0, 0] }); run = -1; }
        }
      }
    } else doc.text('QR code unavailable', { x: M + 8, y: qrTop + 60, size: 8, color: GREY });
    var tx = M + size + 16, tw = CW - size - 16, ty = qrTop + 4;
    function side(label, value, mono) {
      doc.text(label, { x: tx, y: ty + 8, size: 8, bold: true, color: GREY }); ty += 12;
      doc.wrap(value, tw, mono ? 8 : 9, false).forEach(function (l) { doc.text(l, { x: tx, y: ty + 8, size: mono ? 8 : 9, color: INK }); ty += 11; });
      ty += 4;
    }
    side('ACTD reference', rec.actdNumber + '  (version ' + rec.version + ')');
    side('Issue timestamp', dateTime(rec.issuedAt));
    side('Verification URL', s6.verifyUrl, true);
    y = Math.max(qrTop + size, ty) + 8;
    sub('Digital authentication seal (SHA-256)');
    doc.wrap(rec.seal, CW, 8.5, false).forEach(function (l) { ensure(12); doc.text(l, { x: M, y: y + 8, size: 8.5, color: INK }); y += 11; });
    para(s6.sealNote, { italic: true, color: GREY, size: 8 });
    sub('Version history');
    (s6.history || []).forEach(function (h) { para('Version ' + h.version + ' - ' + dateTime(h.issuedAt) + ' - ' + h.reason, { x: M + 6, width: CW - 6, size: 8.5 }); });
    para('Check this document online: scan the QR code or open the verification URL. In this demonstration version the check only works in the browser that holds the record.', { size: 8, color: GREY, italic: true });

    ensure(70);
    y += 6;
    var stLines = doc.wrap(s6.statement, CW - 20, 9, false), bh = stLines.length * 12.5 + 16;
    ensure(bh);
    doc.rect(M, y, CW, bh, { fill: PALE, stroke: GOLD, lineWidth: 0.8 });
    stLines.forEach(function (l, i) { doc.text(l, { x: M + 10, y: y + 15 + i * 12.5, size: 9, color: INK }); });
    y += bh + 4;

    /* ----------------------------------------------------- footers */
    var total = doc.pageCount();
    for (var i = 0; i < total; i++) {
      doc.usePage(i);
      doc.line(M, 814, M + CW, 814, { width: 0.5, color: RULE });
      doc.text(rec.actdNumber + ' - v' + rec.version, { x: M, y: 827, size: 7.5, color: GREY });
      doc.text('ACCOOM-generated transaction record', { x: doc.W / 2, y: 827, size: 7.5, align: 'center', color: GREY });
      doc.text('Page ' + (i + 1) + ' of ' + total, { x: M + CW, y: 827, size: 7.5, align: 'right', color: GREY });
    }

    var bytes = doc.toBytes();
    return { bytes: bytes, blob: new Blob([bytes], { type: 'application/pdf' }), fileName: fileName(rec) };
  }

  function download(rec) {
    var out = render(rec), url = URL.createObjectURL(out.blob), a = document.createElement('a');
    a.href = url; a.download = out.fileName; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
    return out;
  }

  Accoom.ACTDGenerator = { render: render, download: download, fileName: fileName, _dateTime: dateTime };
})(window.Accoom);
