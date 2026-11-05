/* ==========================================================================
   ACCOOM — Minimal PDF writer (Stage 4)
   --------------------------------------------------------------------------
   Builds a real PDF 1.4 file with no library: A4 pages, the standard
   Helvetica fonts, text with wrapping, rectangles and lines.

   const doc = Accoom.PDF.create({ title, author, subject, created: Date });
   doc.addPage();
   doc.text('Hello', { x: 40, y: 60, size: 12, bold: true, color: [0,0,0] });   // y counts DOWN from the top
   doc.rect(40, 80, 200, 30, { fill: [0.9, 0.9, 0.9], stroke: [0,0,0] });
   doc.line(40, 120, 555, 120, { width: 0.5, color: [0.6,0.6,0.6] });
   const lines = doc.wrap(longText, 300, 10, false);
   const bytes = doc.toBytes();   // Uint8Array
   const blob  = doc.toBlob();    // Blob, application/pdf

   Limits: Latin-1 text only (standard fonts have no Naira sign, so callers
   write "NGN"). Text outside Latin-1 becomes "?". No images, no compression:
   files are small and the text stays searchable and easy to check.
   The same input always produces the same bytes (no random ids, no "now").
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var W = 595.28, H = 841.89; // A4 in points

  // Helvetica advance widths (1000 units per em) for ASCII 32..126.
  var WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

  var MAP = { '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u2026': '...',
    '\u2022': '-', '\u20A6': 'NGN ', '\u00A0': ' ', '\u2192': '->', '\u2713': 'OK', '\u2715': 'x' };

  function clean(s) {
    s = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i), c = s.charCodeAt(i);
      if (MAP[ch] !== undefined) out += MAP[ch];
      else if (c === 10) out += ' ';
      else if (c >= 32 && c <= 126) out += ch;
      else if (c >= 160 && c <= 255) out += ch;
      else if (c < 32) out += ' ';
      else out += '?';
    }
    return out;
  }

  function widthOf(s, size, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      w += (c >= 32 && c <= 126) ? WIDTHS[c - 32] : 556;
    }
    return w * size / 1000 * (bold ? 1.06 : 1); // bold is a little wider; keep wrapping safe
  }

  function esc(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), ch = s.charAt(i);
      if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
      else if (c > 126) out += '\\' + ('00' + c.toString(8)).slice(-3);
      else out += ch;
    }
    return out;
  }

  function num(n) { return (Math.round(n * 100) / 100).toString(); }
  function col(c) { return c.map(function (x) { return num(x); }).join(' '); }

  function pdfDate(d) {
    function p(n) { return String(n).padStart(2, '0'); }
    return 'D:' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }

  function create(meta) {
    meta = meta || {};
    var pages = [], cur = null;

    function addPage() { cur = []; pages.push(cur); return pages.length; }

    function text(str, o) {
      o = o || {};
      if (!cur) addPage();
      var s = clean(str), size = o.size || 10, font = o.italic ? 'F3' : (o.bold ? 'F2' : 'F1');
      var x = o.x || 0;
      if (o.align === 'right') x -= widthOf(s, size, o.bold);
      else if (o.align === 'center') x -= widthOf(s, size, o.bold) / 2;
      var c = o.color || [0, 0, 0];
      cur.push('BT ' + col(c) + ' rg /' + font + ' ' + num(size) + ' Tf ' + num(x) + ' ' + num(H - (o.y || 0)) + ' Td (' + esc(s) + ') Tj ET');
    }

    function rect(x, y, w, h, o) {
      o = o || {};
      if (!cur) addPage();
      var ops = 'q ';
      if (o.fill) ops += col(o.fill) + ' rg ';
      if (o.stroke) ops += col(o.stroke) + ' RG ' + num(o.lineWidth || 0.5) + ' w ';
      ops += num(x) + ' ' + num(H - y - h) + ' ' + num(w) + ' ' + num(h) + ' re ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S') + ' Q';
      cur.push(ops);
    }

    function line(x1, y1, x2, y2, o) {
      o = o || {};
      if (!cur) addPage();
      cur.push('q ' + col(o.color || [0, 0, 0]) + ' RG ' + num(o.width || 0.5) + ' w ' + num(x1) + ' ' + num(H - y1) + ' m ' + num(x2) + ' ' + num(H - y2) + ' l S Q');
    }

    // Word-wraps to maxWidth. A single word longer than the line (a URL or a
    // hash) is broken by characters so it can never run off the page.
    function wrap(str, maxWidth, size, bold) {
      var words = clean(str).split(/\s+/).filter(Boolean), lines = [], line = '';
      words.forEach(function (w) {
        while (widthOf(w, size, bold) > maxWidth) {
          var cut = w.length;
          while (cut > 1 && widthOf(w.slice(0, cut), size, bold) > maxWidth) cut--;
          if (line) { lines.push(line); line = ''; }
          lines.push(w.slice(0, cut)); w = w.slice(cut);
        }
        var t = line ? line + ' ' + w : w;
        if (widthOf(t, size, bold) <= maxWidth) line = t; else { lines.push(line); line = w; }
      });
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    }

    function toBytes() {
      var objs = [];
      function add(body) { objs.push(body); return objs.length; }
      var catalog = add(null), pagesObj = add(null);
      var f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      var f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      var f3 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
      var info = add('<< /Title (' + esc(clean(meta.title || 'ACCOOM document')) + ') /Author (' + esc(clean(meta.author || 'ACCOOM')) + ') /Subject (' +
        esc(clean(meta.subject || '')) + ') /Producer (ACCOOM PDF writer) /Creator (ACCOOM) /CreationDate (' + pdfDate(meta.created || new Date(0)) + ') >>');
      var kids = [];
      (pages.length ? pages : [[]]).forEach(function (ops) {
        var stream = ops.join('\n');
        var content = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
        var page = add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + num(W) + ' ' + num(H) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R /F3 ' + f3 + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
        kids.push(page + ' 0 R');
      });
      objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>';
      objs[pagesObj - 1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';

      var out = '%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n', offsets = [];
      objs.forEach(function (body, i) { offsets.push(out.length); out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
      var xref = out.length;
      out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
      offsets.forEach(function (o) { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
      out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
      var bytes = new Uint8Array(out.length);
      for (var i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    }

    return {
      W: W, H: H, addPage: addPage, text: text, rect: rect, line: line, wrap: wrap,
      measure: function (s, size, bold) { return widthOf(clean(s), size, bold); },
      pageCount: function () { return pages.length; },
      pageIndex: function () { return pages.length - 1; },
      usePage: function (i) { cur = pages[i]; },
      toBytes: toBytes,
      toBlob: function () { return new Blob([toBytes()], { type: 'application/pdf' }); }
    };
  }

  Accoom.PDF = { create: create, clean: clean, A4: { width: W, height: H } };
})(window.Accoom);
