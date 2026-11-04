/* ==========================================================================
   ACCOOM — Document preview (Stage 2)
   --------------------------------------------------------------------------
   Accoom.DocumentPreview.open({ file | docId, name, mimeType })

   Nothing is read until the person opens a preview (lazy). Images show in
   an <img>; PDFs show in an <iframe> with an "Open in new tab" fallback,
   because some phone browsers cannot display PDFs inline.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var root = null, bodyEl = null, titleEl = null, lastFocus = null, tempUrl = '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'dp-modal';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'dp-title');
    root.innerHTML =
      '<div class="dp-backdrop" data-dp-close></div>' +
      '<div class="dp-box">' +
        '<div class="dp-head"><h2 class="dp-title" id="dp-title"></h2>' +
        '<button type="button" class="dp-close" data-dp-close aria-label="Close preview">&times;</button></div>' +
        '<div class="dp-body" data-dp-body></div>' +
      '</div>';
    document.body.appendChild(root);
    bodyEl = root.querySelector('[data-dp-body]');
    titleEl = root.querySelector('.dp-title');
    root.addEventListener('click', function (e) { if (e.target.closest('[data-dp-close]')) close(); });
    document.addEventListener('keydown', function (e) { if (!root.hidden && e.key === 'Escape') close(); });
  }

  function show(name, html) {
    build();
    titleEl.textContent = name || 'Document preview';
    bodyEl.innerHTML = html;
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.classList.add('dp-open');
    var btn = root.querySelector('.dp-close');
    if (btn) btn.focus();
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    bodyEl.innerHTML = ''; // drops the iframe/img so nothing keeps the file in memory
    document.documentElement.classList.remove('dp-open');
    if (tempUrl) { try { URL.revokeObjectURL(tempUrl); } catch (e) { /* ignore */ } tempUrl = ''; }
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* ignore */ }
  }

  function render(url, name, mime) {
    if (mime === 'application/pdf') {
      show(name,
        '<iframe class="dp-frame" src="' + esc(url) + '" title="' + esc(name) + '"></iframe>' +
        '<p class="dp-fallback">Can\u2019t see the document? <a href="' + esc(url) + '" target="_blank" rel="noopener">Open it in a new tab</a>.</p>');
    } else {
      show(name, '<img class="dp-img" src="' + esc(url) + '" alt="Preview of ' + esc(name) + '" />');
    }
  }

  function open(opts) {
    opts = opts || {};
    if (opts.file) {
      if (tempUrl) { try { URL.revokeObjectURL(tempUrl); } catch (e) { /* ignore */ } }
      tempUrl = URL.createObjectURL(opts.file);
      render(tempUrl, opts.name || opts.file.name, opts.mimeType || opts.file.type);
      return Promise.resolve();
    }
    if (opts.docId && Accoom.DocumentStore) {
      show(opts.name, '<p class="dp-loading">Loading\u2026</p>');
      return Accoom.DocumentStore.urlFor(opts.docId).then(function (url) {
        render(url, opts.name, opts.mimeType);
      }, function (err) {
        show(opts.name, '<p class="dp-error">' + esc(err && err.message ? err.message : 'This document could not be opened.') + '</p>');
      });
    }
    return Promise.resolve();
  }

  Accoom.DocumentPreview = { open: open, close: close };
})(window.Accoom);
