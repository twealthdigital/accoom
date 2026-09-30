/* ==========================================================================
   ACCOOM — My Listings (agent listing form)

   No backend yet: reads/writes 'accoom-agent-listings' in localStorage,
   the same key agent-dashboard.js reads for "Your Listings" and
   listing-actions.js reads for the agent-side View dialog. A saved
   listing here carries every field the View dialog and (eventually) the
   buyer-facing property page would need, so what an agent uploads is
   exactly what shows — nothing is silently filled in from placeholder
   copy once a real value exists.

   This file is long because the form does a lot: a reusable searchable
   dropdown, a live price breakdown, a live map preview, three upload
   zones with per-file progress, a strict contact-info / social-media
   guard with an escalating lockout, and draft autosave. Section
   comments below mark each piece.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    var form = document.querySelector('[data-ml-form]');
    if (!form) return;

    /* ======================================================================
       Small helpers
       ====================================================================== */
    var NAIRA = '\u20A6';

    function esc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function toArray(l) { return Array.prototype.slice.call(l || []); }
    function formatNumber(n) { return Number(n || 0).toLocaleString('en-NG'); }
    function parseNumber(v) { return parseFloat(String(v || '').replace(/[^\d.]/g, '')) || 0; }
    function todayLabel() {
      return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function toast(message, extra) {
      if (typeof Accoom.showToast !== 'function') return;
      var o = { message: message, duration: 4500 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      Accoom.showToast(o);
    }

    /* ======================================================================
       Option lists — every one of these is exactly what a buyer would
       later see, so the "Custom" fallback is here for anything real
       properties have that this list doesn't.
       ====================================================================== */
    var PROPERTY_TYPES = [
      '2 Bedroom Flat / Apartment', '3 Bedroom Flat / Apartment', '4 Bedroom Flat / Apartment',
      'Mini Flat', 'Self Contained (Single Room)', 'Detached Duplex', 'Semi-Detached Duplex',
      'Terrace Duplex', 'Bungalow', 'Studio Apartment', 'Room (Shared Facilities)',
      'Commercial Space / Shop', 'Office Space', 'Event Hall', 'Land / Plot'
    ].map(function (t) { return { value: t, label: t }; });

    var FURNISHING_OPTIONS = ['Furnished', 'Semi Furnished', 'Unfurnished'].map(function (t) { return { value: t, label: t }; });

    var QUICKFACT_OPTIONS = [
      { id: 'security', icon: 'shield', text: '24/7 Security' },
      { id: 'power', icon: 'bolt', text: 'Constant Power' },
      { id: 'water', icon: 'drop', text: 'Borehole Water' },
      { id: 'ceiling', icon: 'ceiling', text: 'Pop Ceiling' },
      { id: 'tiles', icon: 'tiles', text: 'Tiled Floor' },
      { id: 'estate', icon: 'shield', text: 'Gated Estate' },
      { id: 'road', icon: 'car', text: 'Good Access Road' }
    ];

    var AMENITY_OPTIONS = [
      'Fitted Kitchen', 'Wardrobes', 'En-suite Rooms', 'Guest Toilet', 'Air Conditioning',
      'Water Heater', 'Prepaid Meter', 'Balcony', 'CCTV Cameras', 'Electric Fence',
      'Gated Compound', 'Security House', 'Children Play Area', 'Green Area',
      'Kitchen Cabinets', 'Heat Extractor'
    ];

    /* ======================================================================
       Custom searchable dropdown — used for Property Type, Period, State
       and Furnishing. Not a native <select>, so it can match the site's
       gold theme and carry a search box + a "Custom" option.
       ====================================================================== */
    var CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    var selectSeq = 0;
    var openSelect = null;

    function buildSelect(mountKey, config) {
      var mount = document.querySelector('[data-ml-select-mount="' + mountKey + '"]');
      if (!mount) return null;

      var id = 'ml-select-' + (++selectSeq);
      var wrap = document.createElement('div');
      wrap.className = 'ml-select';
      wrap.innerHTML =
        '<button type="button" class="ml-select-trigger" id="' + id + '" aria-haspopup="listbox" aria-expanded="false">' +
          '<span class="ml-select-trigger-label is-placeholder">' + esc(config.placeholder) + '</span>' + CHEVRON +
        '</button>' +
        '<div class="ml-select-panel" role="listbox" aria-labelledby="' + id + '">' +
          '<div class="ml-select-search-wrap"><input type="text" class="ml-select-search" placeholder="Search..." aria-label="Search options" /></div>' +
          '<div class="ml-select-list"></div>' +
        '</div>' +
        (config.allowCustom ? '<input type="text" class="ml-input ml-select-custom-input" placeholder="Type your own" data-ml-guard />' : '');
      mount.appendChild(wrap);

      var trigger = wrap.querySelector('.ml-select-trigger');
      var triggerLabel = wrap.querySelector('.ml-select-trigger-label');
      var panel = wrap.querySelector('.ml-select-panel');
      var searchInput = wrap.querySelector('.ml-select-search');
      var list = wrap.querySelector('.ml-select-list');
      var customInput = wrap.querySelector('.ml-select-custom-input');

      var options = config.options.slice();
      if (config.allowCustom) options = options.concat([{ value: '__custom__', label: 'Custom \u2014 type your own' }]);

      var state = { value: null, label: '', isCustom: false, focusIndex: -1 };

      function renderList(filterText) {
        var q = (filterText || '').trim().toLowerCase();
        var filtered = options.filter(function (o) { return !q || o.label.toLowerCase().indexOf(q) !== -1; });
        if (!filtered.length) {
          list.innerHTML = '<p class="ml-select-empty">No matches</p>';
          return;
        }
        list.innerHTML = filtered.map(function (o, i) {
          var selected = o.value === state.value;
          return '<button type="button" class="ml-select-option' + (selected ? ' is-selected' : '') + '" data-value="' + esc(o.value) + '" data-i="' + i + '" role="option" aria-selected="' + selected + '">' + esc(o.label) + '</button>';
        }).join('');
      }

      function open() {
        if (openSelect && openSelect !== api) openSelect.close();
        wrap.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        renderList('');
        searchInput.value = '';
        openSelect = api;
        window.setTimeout(function () { searchInput.focus(); }, 10);
        document.addEventListener('mousedown', onOutside, true);
      }
      function close() {
        wrap.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (openSelect === api) openSelect = null;
        document.removeEventListener('mousedown', onOutside, true);
      }
      function onOutside(e) { if (!wrap.contains(e.target)) close(); }

      function choose(value, label, isCustom, silent) {
        state.value = value;
        state.label = label || '';
        state.isCustom = !!isCustom;
        triggerLabel.textContent = state.label || config.placeholder;
        triggerLabel.classList.toggle('is-placeholder', !state.label);
        wrap.classList.toggle('is-custom', state.isCustom);
        mount.classList.toggle('has-error', false);
        if (state.isCustom) {
          window.setTimeout(function () { customInput.focus(); }, 10);
        }
        if (!silent && typeof config.onChange === 'function') config.onChange(state.value, state.label, state.isCustom);
      }

      trigger.addEventListener('click', function () { wrap.classList.contains('is-open') ? close() : open(); });
      trigger.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
      searchInput.addEventListener('input', function () { renderList(searchInput.value); });
      searchInput.addEventListener('keydown', function (e) {
        var opts = toArray(list.querySelectorAll('.ml-select-option'));
        if (e.key === 'ArrowDown') { e.preventDefault(); if (opts[0]) opts[0].focus(); }
        else if (e.key === 'Escape') { close(); trigger.focus(); }
      });
      list.addEventListener('keydown', function (e) {
        var opts = toArray(list.querySelectorAll('.ml-select-option'));
        var idx = opts.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (opts[idx + 1] || opts[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (opts[idx - 1] || opts[opts.length - 1]).focus(); }
        else if (e.key === 'Escape') { close(); trigger.focus(); }
      });
      list.addEventListener('click', function (e) {
        var btn = e.target.closest('.ml-select-option');
        if (!btn) return;
        var value = btn.getAttribute('data-value');
        if (value === '__custom__') { choose('__custom__', '', true); }
        else {
          var found = options.filter(function (o) { return o.value === value; })[0];
          choose(value, found ? found.label : value, false);
        }
        close();
      });
      if (customInput) {
        customInput.addEventListener('input', function () {
          state.label = customInput.value.trim();
          state.value = state.label;
        });
      }

      var api = {
        el: wrap,
        getValue: function () { return state.isCustom ? (customInput ? customInput.value.trim() : '') : state.value; },
        getLabel: function () { return state.isCustom ? (customInput ? customInput.value.trim() : '') : (state.label || ''); },
        isCustom: function () { return state.isCustom; },
        setValue: function (value, label, isCustom) {
          if (isCustom) {
            choose('__custom__', '', true, true);
            if (customInput) customInput.value = label || value || '';
          } else {
            var found = options.filter(function (o) { return o.value === value || o.label === value; })[0];
            choose(found ? found.value : value, found ? found.label : (label || value), false, true);
          }
        },
        close: close,
        setError: function (on) { mount.classList.toggle('has-error', !!on); }
      };
      return api;
    }

    /* ======================================================================
       Field mounts
       ====================================================================== */
    var titleField = document.getElementById('ml-title').closest('.ml-field');
    var titleInput = document.getElementById('ml-title');
    var areaField = document.getElementById('ml-area').closest('.ml-field');
    var areaInput = document.getElementById('ml-area');
    var addressField = document.getElementById('ml-address').closest('.ml-field');
    var addressInput = document.getElementById('ml-address');
    var priceField = document.getElementById('ml-price').closest('.ml-field');
    var priceInput = document.getElementById('ml-price');
    var agencyInput = document.getElementById('ml-agency-fee');
    var legalInput = document.getElementById('ml-legal-fee');
    var descField = document.getElementById('ml-description').closest('.ml-field');
    var descInput = document.getElementById('ml-description');
    var yearField = document.getElementById('ml-year').closest('.ml-field');

    var propertyTypeMount = document.querySelector('[data-ml-select-mount="propertyType"]');
    var propertyTypeSelect = buildSelect('propertyType', { options: PROPERTY_TYPES, placeholder: 'Select property type', allowCustom: true });
    propertyTypeMount.querySelector('.ml-select-trigger').id = 'ml-type-search';

    var periodMount = document.querySelector('[data-ml-select-mount="period"]');
    var periodField = document.querySelector('[data-ml-period-field]');
    var periodSelect = buildSelect('period', {
      options: [{ value: 'year', label: 'Year' }, { value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }],
      placeholder: 'Select billing period', search: false
    });

    var stateSelect = buildSelect('state', {
      options: (Accoom.getStates ? Accoom.getStates('Nigeria') : []),
      placeholder: 'Select state',
      onChange: scheduleMapUpdate
    });

    var furnishingSelect = buildSelect('furnishing', { options: FURNISHING_OPTIONS, placeholder: 'Select furnishing', allowCustom: true });

    /* ======================================================================
       Category (rent / sale)
       ====================================================================== */
    var categoryValue = 'rent';
    var categoryButtons = toArray(document.querySelectorAll('[data-ml-category] .ml-segmented-btn'));
    categoryButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        categoryValue = btn.getAttribute('data-value');
        categoryButtons.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        periodField.hidden = categoryValue === 'sale';
        autosaveDraftSoon();
      });
    });

    /* ======================================================================
       Price breakdown
       ====================================================================== */
    var priceOut = document.querySelector('[data-ml-price-out]');
    var agencyOut = document.querySelector('[data-ml-agency-out]');
    var legalOut = document.querySelector('[data-ml-legal-out]');
    var totalOut = document.querySelector('[data-ml-total-out]');
    var agencyLabelOut = document.querySelector('[data-ml-agency-label]');
    var legalLabelOut = document.querySelector('[data-ml-legal-label]');

    function recomputePrice() {
      var price = parseNumber(priceInput.value);
      var agencyFee = parseNumber(agencyInput.value);
      var legalFee = parseNumber(legalInput.value);
      var total = price + agencyFee + legalFee;
      priceOut.textContent = NAIRA + formatNumber(price);
      agencyLabelOut.textContent = 'Agency fee';
      legalLabelOut.textContent = 'Legal fee';
      agencyOut.textContent = NAIRA + formatNumber(agencyFee);
      legalOut.textContent = NAIRA + formatNumber(legalFee);
      totalOut.textContent = NAIRA + formatNumber(total);
    }
    priceInput.addEventListener('input', function () {
      var digits = priceInput.value.replace(/[^\d]/g, '');
      priceInput.value = digits ? formatNumber(digits) : '';
      recomputePrice();
    });
    [agencyInput, legalInput].forEach(function (el) {
      el.addEventListener('input', function () {
        var digits = el.value.replace(/[^\d]/g, '');
        el.value = digits ? formatNumber(digits) : '';
        recomputePrice();
      });
    });
    recomputePrice();

    /* ======================================================================
       Map preview — same "?q=...&output=embed" pattern property.html uses,
       so what the agent sees here is what a buyer sees later.
       ====================================================================== */
    var mapEl = document.querySelector('[data-ml-map]');
    var mapFrame = document.querySelector('[data-ml-map-frame]');
    var mapTimer = null;

    function updateMapNow() {
      var state = stateSelect.getValue();
      var area = areaInput.value.trim();
      if (!state || !area) { mapEl.classList.remove('is-ready'); return; }
      var q = [addressInput.value.trim(), area, state, 'Nigeria'].filter(Boolean).join(', ');
      mapFrame.src = 'https://www.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed';
      mapEl.classList.add('is-ready');
    }
    function scheduleMapUpdate() {
      window.clearTimeout(mapTimer);
      mapTimer = window.setTimeout(updateMapNow, 500);
    }
    [areaInput, addressInput].forEach(function (el) { el.addEventListener('input', scheduleMapUpdate); });

    /* ======================================================================
       Quick facts + amenities: checkbox grid, plus custom chip add-ons
       ====================================================================== */
    var quickFactsGrid = document.querySelector('[data-ml-quickfacts]');
    var quickFactsField = quickFactsGrid.closest('.ml-field');
    quickFactsGrid.innerHTML = QUICKFACT_OPTIONS.map(function (o) {
      return '<label class="ml-check"><input type="checkbox" value="' + esc(o.id) + '" /><span>' + esc(o.text) + '</span></label>';
    }).join('');

    var amenitiesGrid = document.querySelector('[data-ml-amenities]');
    var amenitiesField = amenitiesGrid.closest('.ml-card');
    amenitiesGrid.innerHTML = AMENITY_OPTIONS.map(function (o) {
      return '<label class="ml-check"><input type="checkbox" value="' + esc(o) + '" /><span>' + esc(o) + '</span></label>';
    }).join('');

    var customChips = { quickFacts: [], amenities: [] };
    function renderChips(key) {
      var el = document.querySelector('[data-ml-chip-list="' + key + '"]');
      el.innerHTML = customChips[key].map(function (text, i) {
        return '<span class="ml-chip">' + esc(text) + '<button type="button" data-i="' + i + '" aria-label="Remove ' + esc(text) + '">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></span>';
      }).join('');
      toArray(el.querySelectorAll('button')).forEach(function (btn) {
        btn.addEventListener('click', function () {
          customChips[key].splice(parseInt(btn.getAttribute('data-i'), 10), 1);
          renderChips(key);
          autosaveDraftSoon();
        });
      });
    }
    toArray(document.querySelectorAll('[data-ml-custom-add]')).forEach(function (wrap) {
      var key = wrap.getAttribute('data-ml-custom-add');
      var input = wrap.querySelector('input');
      var btn = wrap.querySelector('button');
      function add() {
        var v = input.value.trim();
        if (!v) return;
        if (guardCheck(input, v)) return; // blocked + already handled
        customChips[key].push(v);
        input.value = '';
        renderChips(key);
        autosaveDraftSoon();
      }
      btn.addEventListener('click', add);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    });

    /* ======================================================================
       Contact-info / social-media guard
       ------------------------------------------------------------------
       Runs on every text field. Catches phone numbers, emails, links,
       off-platform phrases and social-app names — including spaced,
       hyphenated or leetspeak-obfuscated app names ("wha-tsa pp",
       "wh4tsapp"). A match is deleted from the field immediately, then
       a centered warning shows. More than 5 warnings in this tab locks
       the whole page for 30 seconds — timed from a stored timestamp, so
       reloading does not restart or skip the countdown — and wipes the
       draft once it ends.
       ====================================================================== */
    var LETTER_CLASS = { a: '[a4@]', e: '[e3]', i: '[i1!]', o: '[o0]', s: '[s5$]', t: '[t7]' };
    function fuzzyKeywordRegex(word) {
      var body = word.split('').map(function (ch) { return LETTER_CLASS[ch] || ch; }).join('[^a-z0-9]{0,3}');
      return new RegExp(body, 'i');
    }
    var APP_NAMES = ['whatsapp', 'facebook', 'instagram', 'telegram', 'snapchat', 'tiktok', 'wechat', 'signal', 'viber', 'discord', 'skype', 'messenger', 'linkedin', 'twitter'];
    var APP_PATTERNS = APP_NAMES.map(function (n) { return { name: n, re: fuzzyKeywordRegex(n) }; });

    var PHONE_RE = /(?:\+?\d[\d\-\s().]{6,}\d)/;
    var EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
    var URL_RE = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|ng|co|io|me|link|xyz|info)\b\S*)/i;
    var PHRASE_RE = /\b(off[\s-]?platform|outside\s+(?:the\s+)?app|pay\s+(?:me\s+)?directly|cash\s+only|send\s+money\s+directly|meet\s+(?:me\s+)?(?:in\s+person|physically)\s+to\s+pay)\b/i;

    function scanForbidden(text) {
      if (!text) return null;
      var m = PHONE_RE.exec(text);
      if (m && m[0].replace(/\D/g, '').length >= 7) return { match: m[0].trim(), label: 'a phone number' };
      m = EMAIL_RE.exec(text);
      if (m) return { match: m[0], label: 'an email address' };
      m = URL_RE.exec(text);
      if (m) return { match: m[0], label: 'a link' };
      if (window.Accoom && Accoom.ContentGuard) return Accoom.ContentGuard.scan(text);
      m = PHRASE_RE.exec(text);
      if (m) return { match: m[0], label: 'off-platform contact language' };
      for (var i = 0; i < APP_PATTERNS.length; i++) {
        m = APP_PATTERNS[i].re.exec(text);
        if (m) return { match: m[0], label: 'a social media reference' };
      }
      return null;
    }

    var VIOL_KEY = 'accoom-ml-violations';
    var LOCK_KEY = 'accoom-ml-lock-until';
    var DRAFT_KEY = 'accoom-ml-draft';

    function getViolations() { try { return parseInt(sessionStorage.getItem(VIOL_KEY), 10) || 0; } catch (e) { return 0; } }
    function setViolations(n) { try { sessionStorage.setItem(VIOL_KEY, String(n)); } catch (e) { /* ignore */ } }
    function getLockUntil() { try { return parseInt(sessionStorage.getItem(LOCK_KEY), 10) || 0; } catch (e) { return 0; } }
    function isLocked() { return getLockUntil() > Date.now(); }

    var lockEl = document.querySelector('[data-ml-lock]');
    var lockSecondsEl = document.querySelector('[data-ml-lock-seconds]');
    var lockTimer = null;

    function showLockOverlay(until) {
      document.body.classList.add('ml-is-locked');
      lockEl.hidden = false;
      window.clearInterval(lockTimer);
      function tick() {
        var remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        lockSecondsEl.textContent = remaining;
        if (remaining <= 0) { window.clearInterval(lockTimer); finishLock(); }
      }
      tick();
      lockTimer = window.setInterval(tick, 250);
    }
    function startLock() {
      var until = Date.now() + 30000;
      try { sessionStorage.setItem(LOCK_KEY, String(until)); } catch (e) { /* ignore */ }
      warnQueue = []; warnShowing = false; hideWarnDialog();
      showLockOverlay(until);
    }
    function finishLock() {
      try {
        sessionStorage.removeItem(LOCK_KEY);
        sessionStorage.removeItem(VIOL_KEY);
        sessionStorage.removeItem(DRAFT_KEY);
      } catch (e) { /* ignore */ }
      wipeForm();
      document.body.classList.remove('ml-is-locked');
      lockEl.hidden = true;
    }
    // The lock screen never shows just from opening this page — only as
    // a live result of what gets typed on THIS visit. Any lock/warning
    // state from an earlier visit is cleared out immediately on load.
    try {
      sessionStorage.removeItem(LOCK_KEY);
      sessionStorage.removeItem(VIOL_KEY);
    } catch (e) { /* ignore */ }

    // Warning dialog (queued so a paste with several violations shows one at a time)
    var warnOverlay = null;
    var warnQueue = [];
    var warnShowing = false;
    var WARN_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

    function ensureWarnOverlay() {
      if (warnOverlay) return;
      warnOverlay = document.createElement('div');
      warnOverlay.className = 'ml-warn-overlay';
      warnOverlay.innerHTML =
        '<div class="ml-warn-box" role="alertdialog" aria-modal="true" tabindex="-1">' +
          '<div class="ml-warn-icon">' + WARN_ICON + '</div>' +
          '<h3>That can\u2019t stay in this listing</h3>' +
          '<p>You wrote:</p>' +
          '<p class="ml-warn-quote" data-ml-warn-quote></p>' +
          '<p data-ml-warn-msg>Every ACCOOM transaction happens on the platform \u2014 phone numbers, emails, links and social media handles aren\u2019t allowed in listings. See our <a href="#" target="_blank" rel="noopener">Privacy Policy</a> for why.</p>' +
          '<button type="button" class="ml-warn-dismiss" data-ml-warn-dismiss>Dismiss</button>' +
        '</div>';
      document.body.appendChild(warnOverlay);
    }
    function drainWarnQueue() {
      if (isLocked()) { warnQueue = []; warnShowing = false; return; }
      if (!warnQueue.length) { warnShowing = false; document.documentElement.classList.remove('lax-no-scroll'); return; }
      warnShowing = true;
      document.documentElement.classList.add('lax-no-scroll');
      ensureWarnOverlay();
      var info = warnQueue.shift();
      warnOverlay.querySelector('[data-ml-warn-quote]').textContent = '\u201C' + info.match.trim() + '\u201D';
      var msgEl = warnOverlay.querySelector('[data-ml-warn-msg]');
      if (msgEl) {
        if (!msgEl.__default) msgEl.__default = msgEl.innerHTML;
        if (info.kind === 'profanity') msgEl.innerHTML = 'Please keep listings professional \u2014 offensive or inappropriate language isn\u2019t allowed on ACCOOM.';
        else if (info.kind === 'payment') msgEl.innerHTML = 'All payments on ACCOOM happen through the platform \u2014 payment details and off-platform payment wording aren\u2019t allowed in listings.';
        else msgEl.innerHTML = msgEl.__default;
      }
      warnOverlay.classList.add('is-open');
      var btn = warnOverlay.querySelector('[data-ml-warn-dismiss]');
      function onDismiss() {
        btn.removeEventListener('click', onDismiss);
        warnOverlay.classList.remove('is-open');
        window.setTimeout(drainWarnQueue, 220);
      }
      btn.addEventListener('click', onDismiss);
      window.requestAnimationFrame(function () { btn.focus(); });
    }
    function hideWarnDialog() { if (warnOverlay) warnOverlay.classList.remove('is-open'); }

    function handleViolation(fieldEl, info) {
      // Remove the offending text immediately, before anything is shown.
      var suppress = suppressGuardFlag; suppressGuardFlag = true;
      fieldEl.value = fieldEl.value.split(info.match).join('').replace(/\s{2,}/g, ' ').trim();
      suppressGuardFlag = suppress;
      var counter = document.querySelector('[data-ml-count="' + fieldEl.id + '"]');
      if (counter) counter.textContent = fieldEl.value.length + ' / ' + fieldEl.getAttribute('maxlength');

      var n = getViolations() + 1;
      setViolations(n);
      if (n > 5) startLock();
      else { warnQueue.push(info); if (!warnShowing) drainWarnQueue(); }
    }

    var suppressGuardFlag = false;
    function guardCheck(el, valueOverride) {
      if (suppressGuardFlag || isLocked()) return false;
      var info = scanForbidden(valueOverride != null ? valueOverride : el.value);
      if (!info) return false;
      handleViolation(el, info);
      // A paste can hold several violations: keep cleaning until the field is clean.
      if (valueOverride == null) {
        var guardLoops = 0;
        while (guardLoops++ < 10 && !isLocked()) {
          var more = scanForbidden(el.value);
          if (!more) break;
          handleViolation(el, more);
        }
      }
      return true;
    }
    function attachGuard(el) {
      el.addEventListener('input', function () { guardCheck(el); });
    }

    /* ======================================================================
       Character counters
       ====================================================================== */
    function attachCounter(el) {
      var counter = document.querySelector('[data-ml-count="' + el.id + '"]');
      if (!counter) return;
      var max = el.getAttribute('maxlength');
      function update() { counter.textContent = el.value.length + ' / ' + max; }
      el.addEventListener('input', update);
      update();
    }
    [titleInput, descInput].forEach(attachCounter);

    /* ======================================================================
       Wire the guard to every free-text field, including ones created
       dynamically by the custom selects.
       ====================================================================== */
    [titleInput, areaInput, addressInput, descInput].forEach(attachGuard);
    toArray(document.querySelectorAll('[data-ml-custom-add] input')).forEach(attachGuard);
    [propertyTypeSelect, furnishingSelect].forEach(function (sel) {
      if (sel && sel.el) {
        var input = sel.el.querySelector('.ml-select-custom-input');
        if (input) attachGuard(input);
      }
    });

    /* ======================================================================
       Uploads — Property Photos / Property Video / Surroundings
       ====================================================================== */
    var uploads = { images: [], videos: [], environment: [] };
    var uploadSeq = 0;
    var IMG_MAX_SIDE = 1600;
    var IMG_QUALITY = 0.8;
    var IMG_MAX_INPUT_MB = 30;
    var VIDEO_MAX_MB = 50;

    // Photos are shrunk straight from the picked file (no slow text conversion),
    // a few at a time so phones don't run out of memory.
    function shrinkFile(file, maxSide, quality, cb) {
      var url;
      try { url = URL.createObjectURL(file); } catch (e) { cb(null); return; }
      shrinkDataUrl(url, maxSide, quality, function (out) {
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        cb(out);
      });
    }
    var imgQueue = [];
    var imgActive = 0;
    var IMG_CONCURRENCY = 3;
    function pumpImages() {
      while (imgActive < IMG_CONCURRENCY && imgQueue.length) {
        imgActive++;
        (function (task) { task(function () { imgActive--; pumpImages(); }); })(imgQueue.shift());
      }
    }
    function enqueueImage(task) { imgQueue.push(task); pumpImages(); }

    // Save stays switched off until every upload has finished.
    var PENDING_NOTE = 'Uploads are finishing \u2014 you can save once they\u2019re done.';
    function updateSaveGate() {
      if (!saveBtn) return;
      var pending = ['images', 'videos', 'environment'].some(function (k) {
        return uploads[k].some(function (u) { return !u.dataUrl; });
      });
      saveBtn.disabled = pending;
      saveBtn.setAttribute('aria-busy', pending ? 'true' : 'false');
      if (!submitNote) return;
      if (pending) {
        submitNote.textContent = PENDING_NOTE;
        submitNote.style.color = '';
      } else if (submitNote.textContent === PENDING_NOTE) {
        submitNote.textContent = 'Fill in every required field to save this listing.';
        submitNote.style.color = '';
      }
    }

    // Redraws an image smaller and re-encodes it as JPEG. cb(null) if it can't be read.
    function shrinkDataUrl(src, maxSide, quality, cb) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { cb(null); return; }
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, cw, ch);
          cb(canvas.toDataURL('image/jpeg', quality));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = src;
    }
    var CLOSE_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

    function setupUpload(wrapper) {
      var key = wrapper.getAttribute('data-ml-upload');
      var min = parseInt(wrapper.getAttribute('data-ml-min'), 10) || 0;
      var max = parseInt(wrapper.getAttribute('data-ml-max'), 10) || 10;
      var input = wrapper.querySelector('[data-ml-upload-input]');
      var btn = wrapper.querySelector('[data-ml-upload-btn]');
      var grid = wrapper.querySelector('[data-ml-upload-grid]');
      var countEl = wrapper.querySelector('[data-ml-upload-count]');

      function renderCount() {
        var n = uploads[key].length;
        if (key === 'images') countEl.textContent = n + ' of ' + max + ' photos added (minimum ' + min + ')';
        else if (key === 'videos') countEl.textContent = n + ' of ' + max + ' videos added';
        else countEl.textContent = n + ' of ' + max + ' videos or images added';
        btn.disabled = n >= max;
        updateSaveGate();
      }

      function addFile(file) {
        if (uploads[key].length >= max) { toast('You\u2019ve reached the ' + max + '-upload limit here.'); return; }
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        var isVideo = file.type === 'video/mp4' || (!file.type && ext === 'mp4');
        var isImage = file.type === 'image/png' || file.type === 'image/jpeg' ||
          (!file.type && (ext === 'png' || ext === 'jpg' || ext === 'jpeg'));
        if ((!isVideo && !isImage) || (key === 'images' && !isImage) || (key === 'videos' && !isVideo)) {
          toast('"' + file.name + '" isn\u2019t allowed. Photos: PNG, JPG or JPEG. Videos: MP4 only.');
          return;
        }
        if (isImage && file.size > IMG_MAX_INPUT_MB * 1024 * 1024) { toast('"' + file.name + '" is too large (' + IMG_MAX_INPUT_MB + 'MB max per photo).'); return; }
        if (isVideo && file.size > VIDEO_MAX_MB * 1024 * 1024) { toast('"' + file.name + '" is too large. Videos must be ' + VIDEO_MAX_MB + 'MB or less to save here.'); return; }

        var item = { id: 'u' + (++uploadSeq), name: file.name, type: isVideo ? 'video' : 'image', dataUrl: null };
        uploads[key].push(item);
        renderCount();

        var cell = document.createElement('div');
        cell.className = 'ml-upload-item is-loading' + (isVideo ? ' is-video' : '');
        cell.innerHTML =
          '<div class="ml-upload-spinner"></div>' +
          '<div class="ml-upload-progress"><div class="ml-upload-progress-bar"></div></div>' +
          '<button type="button" class="ml-upload-remove" aria-label="Remove ' + esc(file.name) + '">' + CLOSE_SVG + '</button>';
        grid.appendChild(cell);

        // Quick path: the original file is never read as text, so this is near-instant.
        var previewUrl = null;
        function failRead(msg) {
          uploads[key] = uploads[key].filter(function (u) { return u.id !== item.id; });
          if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { /* ignore */ } }
          cell.remove();
          renderCount();
          toast(msg || 'Couldn\u2019t read "' + file.name + '". Please try again.');
        }
        function onReady(result, preview) {
          item.dataUrl = result;
          cell.classList.remove('is-loading');
          var spin = cell.querySelector('.ml-upload-spinner');
          if (spin) spin.className = 'ml-upload-done';
          var src = preview || item.dataUrl;
          var mediaHtml = isVideo
            ? '<video src="' + src + '" muted playsinline preload="metadata"></video>'
            : '<img src="' + src + '" alt="" />';
          cell.insertAdjacentHTML('afterbegin', mediaHtml);
          var bar = cell.querySelector('.ml-upload-progress-bar');
          if (bar) bar.style.width = '100%';
          window.setTimeout(function () { var p = cell.querySelector('.ml-upload-progress'); if (p) p.remove(); }, 300);
          updateSaveGate();
          autosaveDraftSoon();
        }
        var startBar = cell.querySelector('.ml-upload-progress-bar');
        if (startBar) startBar.style.width = '65%';

        if (isImage) {
          enqueueImage(function (done) {
            shrinkFile(file, IMG_MAX_SIDE, IMG_QUALITY, function (small) {
              done();
              if (small) onReady(small); else failRead();
            });
          });
        } else if (!Accoom.MediaStore) {
          failRead('Videos can\u2019t be saved in this browser.');
        } else {
          var mediaKey = Accoom.MediaStore.newKey();
          item.isNew = true;
          item.mediaKey = mediaKey;
          previewUrl = URL.createObjectURL(file);
          Accoom.MediaStore.put(mediaKey, file).then(function () {
            onReady(Accoom.MediaStore.refOf(mediaKey), previewUrl);
          }, function () {
            failRead('Couldn\u2019t save "' + file.name + '" \u2014 your browser may be out of space.');
          });
        }

        cell.querySelector('.ml-upload-remove').addEventListener('click', function () {
          uploads[key] = uploads[key].filter(function (u) { return u.id !== item.id; });
          if (item.isNew && item.mediaKey && Accoom.MediaStore) { Accoom.MediaStore.remove(item.mediaKey).catch(function () {}); }
          if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { /* ignore */ } }
          cell.remove();
          renderCount();
        });
      }

      btn.addEventListener('click', function () { if (!btn.disabled) input.click(); });
      input.addEventListener('change', function () {
        toArray(input.files).forEach(addFile);
        input.value = '';
      });
      renderCount();

      return {
        clear: function () { uploads[key] = []; grid.innerHTML = ''; renderCount(); },
        addExisting: function (item) {
          var withId = { id: 'u' + (++uploadSeq), name: item.name || '', type: item.type, dataUrl: item.dataUrl };
          uploads[key].push(withId);
          var cell = document.createElement('div');
          cell.className = 'ml-upload-item' + (withId.type === 'video' ? ' is-video' : '');
          var mediaHtml = withId.type === 'video'
            ? '<video src="' + withId.dataUrl + '" muted playsinline preload="metadata"></video>'
            : '<img src="' + withId.dataUrl + '" alt="" />';
          cell.innerHTML = mediaHtml + '<button type="button" class="ml-upload-remove" aria-label="Remove">' + CLOSE_SVG + '</button>';
          grid.appendChild(cell);
          cell.querySelector('.ml-upload-remove').addEventListener('click', function () {
            uploads[key] = uploads[key].filter(function (u) { return u.id !== withId.id; });
            cell.remove();
            renderCount();
          });
          renderCount();
        }
      };
    }
    var uploadApi = {};
    toArray(document.querySelectorAll('[data-ml-upload]')).forEach(function (w) {
      uploadApi[w.getAttribute('data-ml-upload')] = setupUpload(w);
    });

    /* ======================================================================
       Draft autosave (text/selection fields only — never the media, so a
       reload can't be used to dodge the lockout by "losing" what tripped
       it, and so we never try to stuff data URLs into sessionStorage).
       ====================================================================== */
    var draftTimer = null;
    function autosaveDraftSoon() {
      window.clearTimeout(draftTimer);
      draftTimer = window.setTimeout(saveDraftNow, 400);
    }
    function saveDraftNow() {
      if (isLocked() || editingId) return;
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
          category: categoryValue,
          propertyType: propertyTypeSelect.getValue(), propertyTypeLabel: propertyTypeSelect.getLabel(), propertyTypeCustom: propertyTypeSelect.isCustom(),
          period: periodSelect.getValue(),
          title: titleInput.value, state: stateSelect.getValue(), area: areaInput.value, address: addressInput.value,
          price: priceInput.value, agencyFee: agencyInput.value, legalFee: legalInput.value,
          beds: byField('beds'), baths: byField('baths'), kitchens: byField('kitchens'), livingRooms: byField('livingRooms'),
          parking: byField('parking'), yearBuilt: byField('yearBuilt'),
          furnishing: furnishingSelect.getValue(), furnishingCustom: furnishingSelect.isCustom(),
          quickFactsChecked: checkedValues(quickFactsGrid), amenitiesChecked: checkedValues(amenitiesGrid),
          customQuickFacts: customChips.quickFacts, customAmenities: customChips.amenities,
          description: descInput.value
        }));
      } catch (e) { /* storage full/unavailable — draft just won't persist */ }
    }
    function byField(name) {
      var el = document.querySelector('[data-ml-field="' + name + '"]');
      return el ? el.value : '';
    }
    function checkedValues(grid) {
      return toArray(grid.querySelectorAll('input:checked')).map(function (i) { return i.value; });
    }
    toArray(form.querySelectorAll('input, textarea')).forEach(function (el) { el.addEventListener('input', autosaveDraftSoon); });
    toArray(form.querySelectorAll('input[type="checkbox"]')).forEach(function (el) { el.addEventListener('change', autosaveDraftSoon); });
    categoryButtons.forEach(function (b) { b.addEventListener('click', autosaveDraftSoon); });

    function restoreDraft() {
      var raw; try { raw = sessionStorage.getItem(DRAFT_KEY); } catch (e) { raw = null; }
      if (!raw) return;
      var d; try { d = JSON.parse(raw); } catch (e) { return; }
      if (!d) return;
      suppressGuardFlag = true;
      categoryButtons.forEach(function (b) {
        var on = b.getAttribute('data-value') === d.category;
        b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
        if (on) categoryValue = d.category;
      });
      periodField.hidden = categoryValue === 'sale';
      if (d.propertyTypeCustom) propertyTypeSelect.setValue(null, d.propertyTypeLabel, true);
      else if (d.propertyType) propertyTypeSelect.setValue(d.propertyType);
      if (d.period) periodSelect.setValue(d.period);
      if (d.state) stateSelect.setValue(d.state);
      if (d.furnishingCustom) furnishingSelect.setValue(null, d.furnishingLabel || d.furnishing, true);
      else if (d.furnishing) furnishingSelect.setValue(d.furnishing);
      titleInput.value = d.title || ''; areaInput.value = d.area || ''; addressInput.value = d.address || '';
      priceInput.value = d.price || ''; agencyInput.value = d.agencyFee || ''; legalInput.value = d.legalFee || '';
      ['beds', 'baths', 'kitchens', 'livingRooms', 'parking', 'yearBuilt'].forEach(function (name) {
        var el = document.querySelector('[data-ml-field="' + name + '"]');
        if (el && d[name] != null) el.value = d[name];
      });
      descInput.value = d.description || '';
      (d.quickFactsChecked || []).forEach(function (v) {
        var i = quickFactsGrid.querySelector('input[value="' + CSS.escape(v) + '"]'); if (i) i.checked = true;
      });
      (d.amenitiesChecked || []).forEach(function (v) {
        var i = amenitiesGrid.querySelector('input[value="' + CSS.escape(v) + '"]'); if (i) i.checked = true;
      });
      customChips.quickFacts = (d.customQuickFacts || []).slice();
      customChips.amenities = (d.customAmenities || []).slice();
      renderChips('quickFacts'); renderChips('amenities');
      recomputePrice(); scheduleMapUpdate();
      [titleInput, descInput].forEach(function (el) {
        var counter = document.querySelector('[data-ml-count="' + el.id + '"]');
        if (counter) counter.textContent = el.value.length + ' / ' + el.getAttribute('maxlength');
      });
      suppressGuardFlag = false;
    }

    /* ======================================================================
       Wipe everything (used after a lockout ends)
       ====================================================================== */
    function wipeForm() {
      suppressGuardFlag = true;
      form.reset();
      categoryValue = 'rent';
      categoryButtons.forEach(function (b) {
        var on = b.getAttribute('data-value') === 'rent';
        b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      periodField.hidden = false;
      [propertyTypeSelect, periodSelect, stateSelect, furnishingSelect].forEach(function (s) { s.setValue(null, '', false); });
      agencyInput.value = ''; legalInput.value = '';
      recomputePrice();
      mapFrame.src = ''; mapEl.classList.remove('is-ready');
      customChips.quickFacts = []; customChips.amenities = [];
      renderChips('quickFacts'); renderChips('amenities');
      Object.keys(uploadApi).forEach(function (k) { uploadApi[k].clear(); });
      [titleInput, descInput].forEach(function (el) {
        var counter = document.querySelector('[data-ml-count="' + el.id + '"]');
        if (counter) counter.textContent = '0 / ' + el.getAttribute('maxlength');
      });
      clearAllErrors();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      suppressGuardFlag = false;
    }

    /* ======================================================================
       Validation + save
       ====================================================================== */
    var saveBtn = document.querySelector('[data-ml-save]');
    var saveLabel = document.querySelector('[data-ml-save-label]');
    var submitNote = document.querySelector('[data-ml-submit-note]');

    function clearAllErrors() {
      toArray(form.querySelectorAll('.has-error')).forEach(function (el) { el.classList.remove('has-error'); });
    }
    function markError(el) { if (el) el.classList.add('has-error'); }

    function collect() {
      clearAllErrors();
      var firstBad = null;
      function bad(el) { if (!firstBad) firstBad = el; markError(el); }

      var data = { category: categoryValue };

      data.typeLabel = propertyTypeSelect.getLabel();
      if (!data.typeLabel) bad(propertyTypeMount);

      if (categoryValue === 'rent') {
        data.period = periodSelect.getValue();
        if (!data.period) bad(periodField);
      } else {
        data.period = 'sale';
      }

      data.name = titleInput.value.trim();
      if (!data.name) bad(titleField);

      data.state = stateSelect.getValue();
      if (!data.state) bad(document.querySelector('[data-ml-select-mount="state"]'));
      data.area = areaInput.value.trim();
      if (!data.area) bad(areaField);
      data.address = addressInput.value.trim();
      if (!data.address) bad(addressField);
      data.location = [data.area, data.state].filter(Boolean).join(', ');

      data.priceValue = parseNumber(priceInput.value);
      if (!data.priceValue) bad(priceField);
      data.agencyFee = parseNumber(agencyInput.value);
      data.legalFee = parseNumber(legalInput.value);
      data.totalPayable = data.priceValue + data.agencyFee + data.legalFee;
      data.price = NAIRA + formatNumber(data.priceValue);

      ['beds', 'baths', 'kitchens', 'livingRooms', 'parking'].forEach(function (name) {
        var el = document.querySelector('[data-ml-field="' + name + '"]');
        if (el.value.trim() === '') bad(el.closest('.ml-field'));
        data[name] = parseInt(el.value, 10) || 0;
      });
      var yearEl = document.querySelector('[data-ml-field="yearBuilt"]');
      data.yearBuilt = yearEl.value.trim();
      if (!data.yearBuilt) bad(yearField);

      data.furnishing = furnishingSelect.getLabel();
      if (!data.furnishing) bad(document.querySelector('[data-ml-select-mount="furnishing"]'));

      var qfChecked = toArray(quickFactsGrid.querySelectorAll('input:checked')).map(function (i) {
        var opt = QUICKFACT_OPTIONS.filter(function (o) { return o.id === i.value; })[0];
        return { icon: opt ? opt.icon : 'check', text: opt ? opt.text : i.value };
      });
      data.quickFacts = qfChecked.concat(customChips.quickFacts.map(function (t) { return { icon: 'check', text: t }; }));
      if (!data.quickFacts.length) bad(quickFactsField);

      var amChecked = toArray(amenitiesGrid.querySelectorAll('input:checked')).map(function (i) { return i.value; });
      data.amenities = amChecked.concat(customChips.amenities.slice());
      if (!data.amenities.length) bad(amenitiesField);

      data.descriptionRaw = descInput.value.trim();
      if (!data.descriptionRaw) bad(descField);
      data.description = data.descriptionRaw ? data.descriptionRaw.split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean) : [];

      var imagesWrapper = document.querySelector('[data-ml-upload="images"]');
      if (uploads.images.length < 3) bad(imagesWrapper);
      var pending = ['images', 'videos', 'environment'].some(function (k) { return uploads[k].some(function (u) { return !u.dataUrl; }); });

      if (firstBad || pending) {
        submitNote.textContent = pending ? 'Wait for uploads to finish, then try again.' : 'Fill in every required field \u2014 they\u2019re marked in red.';
        submitNote.style.color = 'var(--danger, #d64545)';
        if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast(pending ? 'Uploads are still finishing.' : 'Some required fields are missing.');
        return null;
      }
      return data;
    }

    var editingId = null;
    (function readEditParam() {
      var m = /[?&]id=([^&#]+)/.exec(window.location.search);
      if (m) editingId = decodeURIComponent(m[1]);
    })();

    function persistListing(data) {
      var list;
      try { list = JSON.parse(localStorage.getItem('accoom-agent-listings')); } catch (e) { list = null; }
      if (!Array.isArray(list)) list = [];

      var propertyImages = uploads.images.map(function (u) { return u.dataUrl; });
      var envImages = uploads.environment.filter(function (u) { return u.type === 'image'; }).map(function (u) { return u.dataUrl; });
      var images = propertyImages.concat(envImages);
      var videoItem = uploads.videos[0] || uploads.environment.filter(function (u) { return u.type === 'video'; })[0];
      var videos = uploads.videos.map(function (u) { return u.dataUrl; })
        .concat(uploads.environment.filter(function (u) { return u.type === 'video'; }).map(function (u) { return u.dataUrl; }));

      var id = editingId || ('LST-' + Date.now());
      var existing = list.filter(function (l) { return String(l.id) === String(id); })[0];

      var record = {
        id: id,
        name: data.name,
        location: data.location,
        state: data.state,
        area: data.area,
        address: data.address,
        status: existing ? existing.status : 'available',
        category: data.category,
        typeLabel: data.typeLabel,
        period: data.period,
        cover: images[0] || (existing ? existing.cover : ''),
        images: images,
        video: videoItem ? videoItem.dataUrl : null,
        videosAll: videos,
        price: data.priceValue,
        priceValue: data.priceValue,
        agencyFee: data.agencyFee,
        legalFee: data.legalFee,
        totalPayable: data.totalPayable,
        beds: data.beds, baths: data.baths, kitchens: data.kitchens, livingRooms: data.livingRooms,
        parking: data.parking, yearBuilt: String(data.yearBuilt), furnishing: data.furnishing,
        description: data.description,
        amenities: data.amenities, quickFacts: data.quickFacts,
        photos: images.length, videos: videos.length, documents: existing ? existing.documents : 0,
        dateAdded: existing ? existing.dateAdded : todayLabel(),
        views: existing ? existing.views : '0',
        updatedAt: new Date().toISOString()
      };

      var idx = list.findIndex ? list.findIndex(function (l) { return String(l.id) === String(id); }) : -1;
      if (idx === -1) list.push(record); else list[idx] = record;

      localStorage.setItem('accoom-agent-listings', JSON.stringify(list));
      return record;
    }

    var shrinkStep = 0;
    var SHRINK_STEPS = [[1280, 0.72], [1024, 0.62], [800, 0.55]];

    function retryWithSmallerImages(data) {
      if (shrinkStep >= SHRINK_STEPS.length) return false;
      var media = uploads.images.concat(uploads.environment).filter(function (u) { return u.type === 'image' && u.dataUrl; });
      if (!media.length) return false;
      var step = SHRINK_STEPS[shrinkStep++];
      var pending = media.length;
      media.forEach(function (u) {
        shrinkDataUrl(u.dataUrl, step[0], step[1], function (small) {
          if (small) u.dataUrl = small;
          pending--;
          if (pending === 0) trySave(data);
        });
      });
      return true;
    }

    function trySave(data) {
      try {
        persistListing(data);
        try {
          if (Accoom.NotificationService) {
            Accoom.NotificationService.add({
              type: 'accoom',
              title: editingId ? 'Listing updated' : 'Listing published',
              text: editingId
                ? '\u201C' + data.name + '\u201D was updated successfully.'
                : '\u201C' + data.name + '\u201D is now live under Available Properties on your dashboard.',
              link: 'agent-dashboard.html'
            });
          }
        } catch (err) { /* a notification problem must never stop a save */ }
        try { sessionStorage.removeItem(DRAFT_KEY); } catch (err) { /* ignore */ }
        setSaving(false);
        toast(editingId ? 'Listing updated.' : 'Listing saved and sent for review.', { link: 'agent-dashboard.html', linkLabel: 'View dashboard' });
        window.location.href = 'agent-dashboard.html';
      } catch (err) {
        if (err && err.name === 'QuotaExceededError' && retryWithSmallerImages(data)) return;
        setSaving(false);
        if (err && err.name === 'QuotaExceededError') {
          submitNote.textContent = 'This listing is too big to save here. Remove a few photos and try again.';
        } else {
          submitNote.textContent = 'Something went wrong saving this listing. Please try again.';
        }
        submitNote.style.color = 'var(--danger, #d64545)';
        toast('Couldn\u2019t save this listing.');
      }
    }

    function setSaving(on) {
      saveBtn.disabled = on;
      saveLabel.innerHTML = on ? '<span class="ml-save-spinner" aria-hidden="true"></span> Saving\u2026' : (editingId ? 'Save changes' : 'Save listing');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (isLocked()) return;
      var data = collect();
      if (!data) return;
      setSaving(true);
      window.setTimeout(function () {
        shrinkStep = 0;
        trySave(data);
      }, 900);
    });

    /* ======================================================================
       Edit mode — populate everything from a saved record
       ====================================================================== */
    function loadForEdit(id) {
      var list; try { list = JSON.parse(localStorage.getItem('accoom-agent-listings')); } catch (e) { list = null; }
      var record = Array.isArray(list) ? list.filter(function (l) { return String(l.id) === String(id); })[0] : null;
      if (!record) { editingId = null; return; }

      document.querySelector('[data-ml-title]').textContent = 'Edit listing';
      saveLabel.textContent = 'Save changes';

      suppressGuardFlag = true;
      categoryValue = record.category || 'rent';
      categoryButtons.forEach(function (b) {
        var on = b.getAttribute('data-value') === categoryValue;
        b.classList.toggle('is-active', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      periodField.hidden = categoryValue === 'sale';

      var knownType = PROPERTY_TYPES.filter(function (t) { return t.value === record.typeLabel; })[0];
      if (knownType) propertyTypeSelect.setValue(knownType.value); else propertyTypeSelect.setValue(null, record.typeLabel, true);
      if (record.period && record.period !== 'sale') periodSelect.setValue(record.period);
      if (record.state) stateSelect.setValue(record.state);
      var knownFurn = FURNISHING_OPTIONS.filter(function (t) { return t.value === record.furnishing; })[0];
      if (knownFurn) furnishingSelect.setValue(knownFurn.value); else if (record.furnishing) furnishingSelect.setValue(null, record.furnishing, true);

      titleInput.value = record.name || '';
      areaInput.value = record.area || '';
      addressInput.value = record.address || '';
      priceInput.value = record.priceValue ? formatNumber(record.priceValue) : '';
      agencyInput.value = record.agencyFee != null ? formatNumber(record.agencyFee)
        : (record.agencyFeePct != null ? formatNumber(Math.round((record.priceValue || 0) * record.agencyFeePct / 100)) : '');
      legalInput.value = record.legalFee != null ? formatNumber(record.legalFee)
        : (record.legalFeePct != null ? formatNumber(Math.round((record.priceValue || 0) * record.legalFeePct / 100)) : '');
      ['beds', 'baths', 'kitchens', 'livingRooms', 'parking'].forEach(function (name) {
        var el = document.querySelector('[data-ml-field="' + name + '"]');
        if (el) el.value = record[name] != null ? record[name] : '';
      });
      document.querySelector('[data-ml-field="yearBuilt"]').value = record.yearBuilt || '';
      descInput.value = (record.description || []).join('\n\n');

      (record.quickFacts || []).forEach(function (qf) {
        var opt = QUICKFACT_OPTIONS.filter(function (o) { return o.text === qf.text; })[0];
        if (opt) { var i = quickFactsGrid.querySelector('input[value="' + opt.id + '"]'); if (i) i.checked = true; }
        else customChips.quickFacts.push(qf.text);
      });
      (record.amenities || []).forEach(function (a) {
        if (AMENITY_OPTIONS.indexOf(a) !== -1) { var i = amenitiesGrid.querySelector('input[value="' + CSS.escape(a) + '"]'); if (i) i.checked = true; }
        else customChips.amenities.push(a);
      });
      renderChips('quickFacts'); renderChips('amenities');

      (record.images || []).forEach(function (src) { uploadApi.images.addExisting({ type: 'image', dataUrl: src }); });
      if (record.video) uploadApi.videos.addExisting({ type: 'video', dataUrl: record.video });

      recomputePrice(); scheduleMapUpdate();
      [titleInput, descInput].forEach(function (el) {
        var counter = document.querySelector('[data-ml-count="' + el.id + '"]');
        if (counter) counter.textContent = el.value.length + ' / ' + el.getAttribute('maxlength');
      });
      suppressGuardFlag = false;
    }
    if (editingId) loadForEdit(editingId);
    else if (!isLocked()) restoreDraft();
  });

})(window.Accoom);