/* ==========================================================================
   ACCOOM — Custom select
   Replaces every native <select> with the site's gold themed dropdown.
   The real <select> stays in the page (hidden) as the source of truth, so
   existing code that reads select.value, listens for "change", or rebuilds
   options keeps working untouched. Selects added later (rendered by JS) are
   picked up automatically. Opt out with data-native on a select.
   ========================================================================== */
(function () {
  'use strict';

  var CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  var SEARCH_AFTER = 8; // show a search box once there are more options than this
  var openApi = null;
  var seq = 0;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML.replace(/"/g, '&quot;');
  }

  function enhance(select) {
    if (select.__acx || select.multiple || select.hasAttribute('data-native') || select.size > 1) return;
    select.__acx = true;

    var id = 'acx-' + (++seq);
    var wrap = document.createElement('div');
    wrap.className = 'acx-select';
    if (select.hasAttribute('style') && /width:\s*auto/.test(select.getAttribute('style'))) wrap.classList.add('acx-select--auto');
    wrap.innerHTML =
      '<button type="button" class="acx-trigger" id="' + id + '" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="acx-label"></span>' + CHEVRON +
      '</button>' +
      '<div class="acx-panel" role="listbox" aria-labelledby="' + id + '">' +
        '<div class="acx-search-wrap"><input type="text" class="acx-search" placeholder="Search..." aria-label="Search options" autocomplete="off" /></div>' +
        '<div class="acx-list"></div>' +
      '</div>';
    select.parentNode.insertBefore(wrap, select.nextSibling);
    select.classList.add('acx-native');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    var trigger = wrap.querySelector('.acx-trigger');
    var label = wrap.querySelector('.acx-label');
    var panel = wrap.querySelector('.acx-panel');
    var searchWrap = wrap.querySelector('.acx-search-wrap');
    var search = wrap.querySelector('.acx-search');
    var list = wrap.querySelector('.acx-list');
    var focusIdx = -1;

    function opts() { return Array.prototype.slice.call(select.options); }

    function syncLabel() {
      var o = select.options[select.selectedIndex];
      var text = o ? o.textContent : '';
      label.textContent = text || select.getAttribute('aria-label') || 'Select';
      label.classList.toggle('is-placeholder', !o || o.value === '' );
      trigger.disabled = select.disabled;
      wrap.classList.toggle('is-disabled', select.disabled);
      // keep the field's own label pointing at something focusable
      var lbl = select.id && document.querySelector('label[for="' + select.id + '"]');
      if (lbl && !lbl.__acx) { lbl.__acx = true; lbl.addEventListener('click', function (e) { e.preventDefault(); trigger.focus(); }); }
    }

    function renderList(q) {
      q = (q || '').trim().toLowerCase();
      var html = '';
      opts().forEach(function (o, i) {
        if (q && o.textContent.toLowerCase().indexOf(q) === -1) return;
        var sel = i === select.selectedIndex;
        html += '<button type="button" class="acx-option' + (sel ? ' is-selected' : '') + '" role="option" aria-selected="' + sel + '"' + (o.disabled ? ' disabled' : '') + ' data-i="' + i + '">' + esc(o.textContent) + '</button>';
      });
      list.innerHTML = html || '<p class="acx-empty">No matches</p>';
      focusIdx = -1;
    }

    function place() {
      var r = trigger.getBoundingClientRect();
      var vh = window.innerHeight;
      var below = vh - r.bottom - 12;
      var above = r.top - 12;
      var h = Math.min(280, Math.max(120, panel.scrollHeight));
      var up = below < Math.min(h, 200) && above > below;
      var max = Math.max(120, Math.min(280, up ? above : below));
      panel.style.maxHeight = max + 'px';
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 160) - 8)) + 'px';
      panel.style.width = Math.max(r.width, 160) + 'px';
      if (up) { panel.style.top = 'auto'; panel.style.bottom = (vh - r.top + 6) + 'px'; }
      else { panel.style.bottom = 'auto'; panel.style.top = (r.bottom + 6) + 'px'; }
    }

    function onOutside(e) { if (!wrap.contains(e.target)) close(); }
    function onMove(e) {
      if (e && e.target && panel.contains(e.target)) return;
      var r = trigger.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { close(); return; } // trigger scrolled out of view
      place();
    }

    function open() {
      if (select.disabled) return;
      if (openApi && openApi !== api) openApi.close();
      searchWrap.style.display = select.options.length > SEARCH_AFTER ? '' : 'none';
      search.value = '';
      renderList('');
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      place();
      openApi = api;
      var cur = list.querySelector('.is-selected');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
      if (select.options.length > SEARCH_AFTER) window.setTimeout(function () { search.focus(); }, 10);
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('touchstart', onOutside, true);
      window.addEventListener('resize', onMove);
      window.addEventListener('scroll', onMove, true);
    }
    function close() {
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      if (openApi === api) openApi = null;
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('touchstart', onOutside, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    }

    function choose(i) {
      var changed = select.selectedIndex !== i;
      setIndex.call(select, i);
      syncLabel();
      close();
      trigger.focus();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    function moveFocus(d) {
      var items = Array.prototype.slice.call(list.querySelectorAll('.acx-option:not([disabled])'));
      if (!items.length) return;
      focusIdx = Math.max(0, Math.min(items.length - 1, focusIdx + d));
      items.forEach(function (b, k) { b.classList.toggle('is-focused', k === focusIdx); });
      items[focusIdx].scrollIntoView({ block: 'nearest' });
    }
    function pickFocused() {
      var items = Array.prototype.slice.call(list.querySelectorAll('.acx-option:not([disabled])'));
      if (items[focusIdx]) choose(parseInt(items[focusIdx].getAttribute('data-i'), 10));
    }

    trigger.addEventListener('click', function () { wrap.classList.contains('is-open') ? close() : open(); });
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!wrap.classList.contains('is-open')) open(); }
    });
    search.addEventListener('input', function () { renderList(search.value); moveFocus(1); });
    function keys(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); pickFocused(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
      else if (e.key === 'Tab') { close(); }
    }
    search.addEventListener('keydown', keys);
    panel.addEventListener('keydown', keys);
    list.addEventListener('click', function (e) {
      var b = e.target.closest('.acx-option');
      if (b && !b.disabled) choose(parseInt(b.getAttribute('data-i'), 10));
    });

    // Keep the look in step when code changes the real select.
    var proto = HTMLSelectElement.prototype;
    var valueDesc = Object.getOwnPropertyDescriptor(proto, 'value');
    var indexDesc = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');
    var setIndex = indexDesc.set;
    Object.defineProperty(select, 'value', {
      configurable: true,
      get: function () { return valueDesc.get.call(select); },
      set: function (v) { valueDesc.set.call(select, v); syncLabel(); }
    });
    Object.defineProperty(select, 'selectedIndex', {
      configurable: true,
      get: function () { return indexDesc.get.call(select); },
      set: function (v) { indexDesc.set.call(select, v); syncLabel(); }
    });
    select.addEventListener('change', syncLabel);
    if (window.MutationObserver) {
      new MutationObserver(syncLabel).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
    }

    var api = { close: close };
    syncLabel();
  }

  function scan(root) {
    var list = (root || document).querySelectorAll ? (root || document).querySelectorAll('select') : [];
    Array.prototype.forEach.call(list, enhance);
  }

  function init() {
    scan(document);
    if (!window.MutationObserver) return;
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () { pending = false; scan(document); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.Accoom = window.Accoom || {};
  window.Accoom.enhanceSelects = scan;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
