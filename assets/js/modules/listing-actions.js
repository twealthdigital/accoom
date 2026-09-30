/* ==========================================================================
   ACCOOM — Listing Actions (agent dashboard)

   Adds to every listing card in "Your Listings":
     • Share button  -> the same centered share dialog the buyer site uses
     • 3-dot button  -> dropdown: Delete · Hold · Edit · View
         Delete / Hold  -> warning dialog (Proceed / Cancel) with a loading
                           state while the request is in flight
         Edit           -> placeholder until the My Listings page exists
         View           -> big agent-side property view that opens INSIDE the
                           listings container, in front of the other cards
     • Clicking a card itself does nothing (no navigation).

   It finds cards on its own (via the share button on each card), so it does
   not depend on your exact card markup, and it keeps working when tabs
   re-render (MutationObserver). Nothing else on the page needs to change —
   just include the CSS and this file.

   Wiring to a real backend:
     Accoom.ListingActions.configure({
       service: { remove: function (id, info) { return fetch(...) },
                  hold:   function (id, info) { return fetch(...) } },
       resolver: function (info, base) { return fetch(...).then(r => r.json()) }
     });
   Or just listen for the (cancelable) 'accoom:listing-action' event.
   ========================================================================== */

(function (window, document) {
  'use strict';

  var Accoom = window.Accoom = window.Accoom || {};
  if (Accoom.ListingActions) return;

  /* ------------------------------------------------------------------------
     Config
     ------------------------------------------------------------------------ */
  var cfg = {
    scope: 'main',              // where listing cards live
    cardSelector: null,         // optional: force card detection
    shareSelector: null,        // optional: force share-button detection
    containerSelector: null,    // optional: where the View dialog opens
    editHref: null,             // optional: e.g. 'my-listings.html' (adds ?id=)
    storageKey: 'accoom-agent-listing-state',
    viewTimeout: 10000,         // ms before the View dialog shows "try again"
    resolver: null,             // optional async data source for the View dialog
    service: null               // optional { remove(id, info), hold(id, info) }
  };

  var NAIRA = '\u20A6';
  var PRICE_RE = /\u20A6\s*([\d,]+(?:\.\d+)?)/;
  var PLACEHOLDER_IMG = 'assets/images/home-properties/placeholder.png';

  /* Same placeholder copy the buyer page shows. Replace per-listing by
     returning these fields from cfg.resolver / data-* attributes. */
  var DEFAULTS = {
    furnishing: 'Semi Furnished',
    yearBuilt: '2024',
    parking: '2 Cars',
    dateAdded: 'May 20, 2026',
    views: '245',
    description: [
      'This property is designed with modern architecture and high-quality finishing. All rooms are en-suite with wardrobes. The kitchen is fully fitted with cabinets, cooker, and heat extractor. The compound is spacious with ample parking space and greenery.',
      'Ideal for families or individuals looking for comfort, security, and elegance.'
    ],
    amenities: [
      'Fitted Kitchen', 'Wardrobes', 'En-suite Rooms', 'Guest Toilet',
      'Air Conditioning', 'Water Heater', 'Prepaid Meter', 'Balcony',
      'CCTV Cameras', 'Electric Fence', 'Gated Compound', 'Security House',
      'Children Play Area', 'Green Area', 'Kitchen Cabinets', 'Heat Extractor'
    ],
    quickFacts: [
      { icon: 'living', text: '1 Living Room' },
      { icon: 'kitchen', text: '1 Kitchen' },
      { icon: 'car', text: '2 Parking Spaces' },
      { icon: 'shield', text: '24/7 Security' },
      { icon: 'bolt', text: 'Constant Power' },
      { icon: 'drop', text: 'Borehole Water' },
      { icon: 'ceiling', text: 'Pop Ceiling' },
      { icon: 'tiles', text: 'Tiled Floor' }
    ]
  };

  var STATUS_LABEL = {
    available: 'Available',
    'in-progress': 'In Progress',
    sold: 'Sold',
    delisted: 'Delisted',
    dispute: 'In Dispute',
    reported: 'Reported'
  };

  /* ------------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------------ */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toArray(list) { return Array.prototype.slice.call(list || []); }

  function attrString(el, name) {
    var v = el.getAttribute(name);
    return v == null ? '' : v;
  }

  function classString(el) {
    var c = el.getAttribute && el.getAttribute('class');
    return c || '';
  }

  function delay(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  function hashString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return Math.abs(h).toString(36);
  }

  function toast(message) {
    if (typeof Accoom.showToast === 'function') {
      Accoom.showToast({ message: message, duration: 4500 });
    }
  }

  // Saves a notification (header dropdown + notifications page, via the shared
  // NotificationService) AND pops a toast with a "View" link. A repeat of the
  // exact same notification within 4s is ignored so a double-click can't spam.
  var lastNotified = {};
  function notify(title, text, link) {
    var key = title + '|' + text;
    var now = Date.now();
    if (lastNotified[key] && now - lastNotified[key] < 4000) return;
    lastNotified[key] = now;

    var svc = Accoom.NotificationService;
    if (svc && typeof svc.add === 'function') {
      try {
        svc.add({ type: 'accoom', title: esc(title), text: esc(text), link: link || 'agent-dashboard.html' });
      } catch (e) { /* never let a notification failure break the action */ }
    }
    if (typeof Accoom.showToast === 'function') {
      Accoom.showToast({ message: text, link: 'notifications.html', linkLabel: 'View', duration: 6000 });
    }
  }

  function getStore() {
    try { return JSON.parse(window.localStorage.getItem(cfg.storageKey)) || {}; }
    catch (e) { return {}; }
  }

  function setStore(data) {
    try { window.localStorage.setItem(cfg.storageKey, JSON.stringify(data)); } catch (e) { /* ignore */ }
  }

  function formatNaira(n) { return NAIRA + Number(n).toLocaleString('en-NG'); }

  /* ------------------------------------------------------------------------
     Icons (inline, stroke = currentColor)
     ------------------------------------------------------------------------ */
  function svg(inner, size, extra) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false"' + (extra || '') + '>' + inner + '</svg>';
  }

  var PATH = {
    dots: '<circle cx="12" cy="5" r="1.5" fill="currentColor"></circle><circle cx="12" cy="12" r="1.5" fill="currentColor"></circle><circle cx="12" cy="19" r="1.5" fill="currentColor"></circle>',
    trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>',
    pause: '<circle cx="12" cy="12" r="9"></circle><line x1="10" y1="9" x2="10" y2="15"></line><line x1="14" y1="9" x2="14" y2="15"></line>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"></path>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
    close: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line>',
    pin: '<path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"></path><circle cx="12" cy="10" r="2.5"></circle>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    chevL: '<polyline points="15 18 9 12 15 6"></polyline>',
    chevR: '<polyline points="9 18 15 12 9 6"></polyline>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>',
    bed: '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"></path><path d="M3 18h18"></path><path d="M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"></path>',
    bath: '<path d="M4 12h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z"></path><path d="M6 12V6a2 2 0 0 1 4 0"></path>',
    living: '<path d="M4 18v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5"></path><path d="M4 18h16v2H4z"></path><path d="M6 11V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"></path>',
    kitchen: '<path d="M4 3h16v18H4z"></path><path d="M4 9h16"></path><path d="M9 3v6"></path>',
    car: '<path d="M3 11.5 6 5h12l3 6.5"></path><path d="M3 11.5h18v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H6v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"></path>',
    shield: '<path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5l8-3z"></path>',
    bolt: '<polygon points="13 2 3 14 11 14 10 22 21 10 13 10 13 2"></polygon>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path>',
    ceiling: '<rect x="3" y="4" width="18" height="4" rx="1"></rect><line x1="7" y1="12" x2="7" y2="20"></line><line x1="12" y1="12" x2="12" y2="20"></line><line x1="17" y1="12" x2="17" y2="20"></line>',
    tiles: '<rect x="3" y="3" width="8" height="8"></rect><rect x="13" y="3" width="8" height="8"></rect><rect x="3" y="13" width="8" height="8"></rect><rect x="13" y="13" width="8" height="8"></rect>'
  };

  function icon(name, size, extra) { return svg(PATH[name] || '', size || 16, extra); }

  var SHARE_ICONS = {
    whatsapp: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.2 3.3 5.3 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z"/><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>',
    twitter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7.1l-5.6-6.9L4 22H1l8.1-9.3L1 2h7.3l5 6.3L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg>',
    facebook: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.6 1.6-1.6h1.7V3.2C16.5 3.1 15.4 3 14.2 3c-2.6 0-4.4 1.6-4.4 4.5V9.8H7v3.2h2.8v8h3.7z"/></svg>',
    telegram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 2.7 11.6c-1 .4-1 1.6.1 1.9l4.9 1.5 1.9 5.8c.2.7 1.1.9 1.6.3l2.6-2.8 5 3.7c.7.5 1.7.2 1.9-.7l3.2-15c.2-.9-.7-1.6-1.5-1.3zM8.6 14l9.4-5.8c.2-.1.4.1.2.3l-7.6 6.9-.3 3.2-1.4-4.1z"/></svg>',
    email: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 6 10-6"></path></svg>'
  };

  /* ------------------------------------------------------------------------
     Layers: one Escape key closes whatever is on top
     ------------------------------------------------------------------------ */
  var layers = [];

  function pushLayer(layer) { layers.push(layer); }

  function popLayer(layer) {
    var i = layers.indexOf(layer);
    if (i !== -1) layers.splice(i, 1);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var top = layers[layers.length - 1];
    if (top && typeof top.close === 'function') {
      e.preventDefault();
      top.close(true);
    }
  });

  /* Scroll lock (counted so stacked dialogs don't unlock each other) */
  var lockCount = 0;
  function lockScroll() {
    lockCount++;
    document.documentElement.classList.add('lax-no-scroll');
    document.body.classList.add('lax-no-scroll');
  }
  function unlockScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (!lockCount) {
      document.documentElement.classList.remove('lax-no-scroll');
      document.body.classList.remove('lax-no-scroll');
    }
  }

  /* Keep Tab inside a dialog */
  function trapTab(e, root) {
    if (e.key !== 'Tab') return;
    var items = toArray(root.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  /* ------------------------------------------------------------------------
     Detecting listing cards (via their share button — class-name agnostic)
     ------------------------------------------------------------------------ */
  function scopeEl() { return document.querySelector(cfg.scope) || document.body; }

  function isOurs(el) {
    return !!(el.closest && el.closest('.lax-controls, .lax-menu, .lax-modal-overlay, .lax-view-overlay'));
  }

  function isShareControl(el) {
    if (!el || el.nodeType !== 1 || isOurs(el)) return false;
    if (cfg.shareSelector) return el.matches(cfg.shareSelector);

    var tag = el.tagName;
    var interactive = tag === 'BUTTON' || tag === 'A' || el.getAttribute('role') === 'button' ||
      el.hasAttribute('tabindex') || el.hasAttribute('onclick');

    var names = toArray(el.attributes).map(function (a) { return a.name; }).join(' ');
    var hay = attrString(el, 'aria-label') + ' ' + attrString(el, 'title') + ' ' + classString(el) + ' ' + names;
    var byName = /share/i.test(hay);

    var byIcon = false;
    if (!byName && interactive) {
      var icons = el.querySelector('svg');
      byIcon = !!(icons && icons.querySelectorAll('circle').length === 3 && icons.querySelectorAll('line').length >= 2);
    }
    if (!byName && !byIcon) return false;
    if (!interactive && !byName) return false;

    // Must look like a small icon button, never a big container
    if (el.querySelector('img, video')) return false;
    if (el.querySelectorAll('*').length > 14) return false;
    if ((el.textContent || '').replace(/\s+/g, ' ').trim().length > 24) return false;
    return true;
  }

  function listShareControls(root) {
    var all = toArray(root.querySelectorAll('button, a, [role="button"], [tabindex], [onclick], [class*="share" i], [aria-label*="share" i], [title*="share" i]'));
    return all.filter(function (el) {
      if (!isShareControl(el)) return false;
      // outermost match only
      var p = el.parentElement;
      return !(p && p !== root && isShareControl(p));
    });
  }

  function closestShare(target) {
    var stop = scopeEl();
    for (var el = target; el && el !== document.documentElement; el = el.parentElement) {
      if (isShareControl(el)) {
        var p = el.parentElement;
        if (p && isShareControl(p)) continue; // climb to the outermost
        return stop.contains(el) ? el : null;
      }
      if (el === stop) break;
    }
    return null;
  }

  function leafTexts(root) {
    var out = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
      var t = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      var p = node.parentNode;
      if (p && p.closest && p.closest('.lax-controls, script, style, button, [role="button"]')) continue;
      out.push(t);
    }
    return out;
  }

  function looksLikeCard(el) {
    if (!el.querySelector('img, video, [style*="background"]')) return false;
    var texts = leafTexts(el);
    if (!texts.length) return false;
    return PRICE_RE.test(texts.join(' ')) || texts.length >= 3;
  }

  function cardFromShare(btn) {
    if (cfg.cardSelector) return btn.closest(cfg.cardSelector);
    var limit = scopeEl();
    var n = btn.parentElement;
    while (n && n !== document.documentElement) {
      if (n.classList && n.classList.contains('lax-card')) return n;
      if (n.querySelector('[role="tablist"]')) return null;
      if (listShareControls(n).length > 1) return null;
      if (looksLikeCard(n)) return n;
      if (n === limit || n === document.body) return null;
      n = n.parentElement;
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     Reading a card
     ------------------------------------------------------------------------ */
  function firstText(el) {
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  function readCard(card) {
    var d = card.dataset || {};
    var texts = leafTexts(card);
    var joined = texts.join(' ');

    // price
    var pm = PRICE_RE.exec(joined);
    var priceValue = pm ? parseFloat(pm[1].replace(/,/g, '')) : null;
    var period = /\/\s*(year|yr|annum)/i.test(joined) ? 'year' :
      /\/\s*(month|mo)\b/i.test(joined) ? 'month' :
      /for sale/i.test(joined) ? 'sale' : '';

    // name
    var name = d.name || d.title || '';
    if (!name) {
      var nameEl = card.querySelector('[data-name], [data-lax-name], h1, h2, h3, h4, h5, h6, [class*="name" i], [class*="title" i]');
      name = firstText(nameEl);
    }
    if (!name) {
      for (var i = 0; i < texts.length; i++) {
        if (!PRICE_RE.test(texts[i]) && texts[i].length > 2) { name = texts[i]; break; }
      }
    }

    // location
    var location = d.location || '';
    if (!location) {
      var locEl = card.querySelector('[data-location], [class*="location" i], [class*="-loc" i], [class*="_loc" i]');
      location = firstText(locEl);
    }
    if (!location) {
      var seenPrice = false;
      for (var j = 0; j < texts.length; j++) {
        var t = texts[j];
        if (PRICE_RE.test(t)) { seenPrice = true; continue; }
        if (!seenPrice) continue;
        if (/^\//.test(t) || /^(year|month|yr|mo)$/i.test(t)) continue;
        if (/\b(bed|bath)s?\b/i.test(t)) continue;
        location = t;
        break;
      }
    }

    var bedsM = /(\d+)\s*Beds?\b/i.exec(joined);
    var bathsM = /(\d+)\s*Baths?\b/i.exec(joined);

    var img = card.querySelector('img');
    var image = d.image || (img ? (img.currentSrc || img.src) : '');
    if (!image) {
      var bg = card.querySelector('[style*="background"]');
      var bm = bg && /url\((['"]?)(.*?)\1\)/.exec(bg.getAttribute('style') || '');
      if (bm) image = bm[2];
    }

    var id = d.laxId || d.listingId || d.propertyId || d.id || card.getAttribute('data-id') || '';
    if (!id) {
      var linkEl = card.querySelector('[href*="id="], [data-lax-href*="id="]') ||
        ((card.getAttribute('href') || card.getAttribute('data-lax-href')) ? card : null);
      var href = linkEl ? (linkEl.getAttribute('href') || linkEl.getAttribute('data-lax-href') || '') : '';
      var hm = /[?&]id=([^&#]+)/.exec(href);
      if (hm) { try { id = decodeURIComponent(hm[1]); } catch (err) { id = hm[1]; } }
    }
    var generated = false;
    if (!id) { id = 'lax-' + hashString(name + '|' + location + '|' + (priceValue || '')); generated = true; }

    return {
      id: String(id),
      generatedId: generated,
      name: name || 'Property on ACCOOM',
      location: location,
      priceValue: priceValue,
      price: priceValue != null ? formatNaira(priceValue) : '',
      period: period,
      beds: bedsM ? parseInt(bedsM[1], 10) : null,
      baths: bathsM ? parseInt(bathsM[1], 10) : null,
      image: image
    };
  }

  function inferType(name) {
    var n = (name || '').toLowerCase();
    if (/duplex/.test(n)) return 'Detached Duplex';
    if (/mini\s*flat/.test(n)) return 'Mini Flat';
    if (/self[\s-]*contain/.test(n)) return 'Self Contained';
    if (/flat|apartment/.test(n)) return 'Apartment';
    if (/commercial|shop|office/.test(n)) return 'Commercial Space';
    if (/land|plot/.test(n)) return 'Land';
    if (/hall/.test(n)) return 'Hall';
    if (/room/.test(n)) return 'Room';
    return 'Property';
  }

  function periodLabel(period) {
    if (period === 'year') return '/ year';
    if (period === 'month') return '/ month';
    if (period === 'sale') return 'For Sale';
    return '';
  }

  /* ------------------------------------------------------------------------
     Status + tabs + container
     ------------------------------------------------------------------------ */
  function statusFromText(t) {
    t = (t || '').toLowerCase();
    if (/delist/.test(t)) return 'delisted';
    if (/dispute/.test(t)) return 'dispute';
    if (/report/.test(t)) return 'reported';
    if (/\bsold\b/.test(t)) return 'sold';
    if (/progress/.test(t)) return 'in-progress';
    if (/\bhold\b/.test(t)) return 'hold';
    if (/available/.test(t)) return 'available';
    return null;
  }

  function findContainer(card) {
    if (cfg.containerSelector) {
      var forced = card.closest(cfg.containerSelector);
      if (forced) return forced;
    }
    var c = card.closest('[data-lax-container]') || card.closest('.ag-dash-section');
    if (c) return c;
    var n = card.parentElement;
    while (n && n !== document.body) {
      if (n.querySelector('[role="tablist"]') || n.tagName === 'SECTION') return n;
      n = n.parentElement;
    }
    return card.parentElement || document.body;
  }

  function tabCandidates(container) {
    return toArray(container.querySelectorAll('[role="tab"], button, a, li, [class*="tab" i]')).filter(function (el) {
      var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return t.length > 0 && t.length < 40 && statusFromText(t) && !el.closest('.lax-card');
    });
  }

  function isActiveTab(el) {
    if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'true' || el.getAttribute('aria-current') === 'page') return true;
    return /(^|[\s_-])(is-)?(active|selected|current)($|[\s_-])/i.test(classString(el));
  }

  function activeTabStatus(container) {
    var tabs = tabCandidates(container);
    for (var i = 0; i < tabs.length; i++) {
      if (isActiveTab(tabs[i])) return statusFromText(tabs[i].textContent);
    }
    return null;
  }

  function getStatus(card) {
    var d = card.dataset || {};
    if (d.status) return statusFromText(d.status) || d.status;
    var fromTab = activeTabStatus(findContainer(card));
    return fromTab || 'available';
  }

  function findBadge(tab) {
    var all = toArray(tab.querySelectorAll('*'));
    for (var i = 0; i < all.length; i++) {
      if (!all[i].children.length && /^\d+$/.test((all[i].textContent || '').trim())) return all[i];
    }
    return null;
  }

  function adjustTabCount(container, status, delta) {
    var tabs = tabCandidates(container).filter(function (t) { return statusFromText(t.textContent) === status; });
    if (!tabs.length) return;
    // choose the outermost element for that status (button/[role=tab]) that owns a badge
    for (var i = 0; i < tabs.length; i++) {
      var badge = findBadge(tabs[i]);
      if (badge) {
        var n = parseInt(badge.textContent.trim(), 10) || 0;
        badge.textContent = String(Math.max(0, n + delta));
        return;
      }
    }
  }

  /* ------------------------------------------------------------------------
     Decorating cards
     ------------------------------------------------------------------------ */
  var signatures = {};   // "TAG.class-a.class-b" -> true (seeded by cards with a share button)

  function signatureOf(card) {
    var cls = classString(card).split(/\s+/).filter(function (c) { return c && c.indexOf('lax-') !== 0 && c !== 'is-leaving'; });
    if (!cls.length) return null;
    return { tag: card.tagName.toLowerCase(), classes: cls };
  }

  function sigSelector(sig) {
    var esc_ = window.CSS && CSS.escape ? CSS.escape : function (s) { return s.replace(/([^\w-])/g, '\\$1'); };
    return sig.tag + '.' + sig.classes.map(esc_).join('.');
  }

  function ensurePositioned(el) {
    if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
  }

  function decorate(card) {
    if (card.getAttribute('data-lax-enhanced')) return;
    card.setAttribute('data-lax-enhanced', '1');
    card.classList.add('lax-card');
    ensurePositioned(card);

    // Stop the card itself (and any wrapping links) from navigating anywhere.
    toArray(card.querySelectorAll('a[href]')).concat(card.tagName === 'A' ? [card] : []).forEach(function (a) {
      if (a.closest('.lax-controls')) return;
      a.setAttribute('data-lax-href', a.getAttribute('href'));
      a.removeAttribute('href');
    });

    var info = readCard(card);
    card.setAttribute('data-lax-id', info.id);

    var wrap = document.createElement('div');
    wrap.className = 'lax-controls';
    wrap.innerHTML =
      '<button type="button" class="lax-more" aria-haspopup="menu" aria-expanded="false" ' +
      'aria-label="More options for ' + esc(info.name) + '" title="More options">' + icon('dots', 18) + '</button>';
    card.appendChild(wrap);

    var btn = wrap.querySelector('.lax-more');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(card, btn);
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(card, btn);
      }
    });

    var sig = signatureOf(card);
    if (sig) signatures[sigSelector(sig)] = sig;
  }

  var enhancing = false;
  function enhance() {
    if (enhancing) return;
    enhancing = true;
    try {
      var scope = scopeEl();
      // 1) cards that own a share button
      listShareControls(scope).forEach(function (btn) {
        var card = cardFromShare(btn);
        if (card && scope.contains(card)) decorate(card);
      });
      // 2) same-looking cards without a share button (e.g. other tabs)
      Object.keys(signatures).forEach(function (sel) {
        var found;
        try { found = scope.querySelectorAll(sel); } catch (e) { return; }
        toArray(found).forEach(function (card) {
          if (!card.getAttribute('data-lax-enhanced') && looksLikeCard(card)) decorate(card);
        });
      });
      if (cfg.cardSelector) {
        toArray(scope.querySelectorAll(cfg.cardSelector)).forEach(decorate);
      }
    } finally {
      enhancing = false;
    }
  }

  /* ------------------------------------------------------------------------
     3-dot dropdown
     ------------------------------------------------------------------------ */
  var menuEl = null;
  var menuState = null; // { card, btn, layer, onReposition }

  function buildMenu() {
    menuEl = document.createElement('div');
    menuEl.className = 'lax-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('aria-label', 'Listing options');
    document.body.appendChild(menuEl);

    menuEl.addEventListener('click', function (e) {
      var item = e.target.closest('[data-lax-action]');
      if (!item || !menuState) return;
      e.preventDefault();
      e.stopPropagation();
      var card = menuState.card;
      var btn = menuState.btn;
      var action = item.getAttribute('data-lax-action');
      closeMenu(false);
      runAction(action, card, btn);
    });

    menuEl.addEventListener('keydown', function (e) {
      var items = toArray(menuEl.querySelectorAll('[data-lax-action]'));
      var idx = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') { closeMenu(true); }
    });
  }

  function menuItemsFor(status) {
    var items = [
      { action: 'delete', label: 'Delete', icon: 'trash', danger: true },
      { action: 'hold',            label: 'Hold',           icon: 'pause' },
      { action: 'make-available',  label: 'Make Available', icon: 'check' },
      { action: 'edit',            label: 'Edit',           icon: 'edit'  },
      { action: 'view',            label: 'View',           icon: 'eye'   }
    ];
    // On Hold tab: show Make Available, hide Hold
    if (status === 'hold') {
      return items.filter(function (i) { return i.action !== 'hold'; });
    }
    // Everywhere else: hide Make Available, and also hide Hold if already delisted
    return items.filter(function (i) {
      if (i.action === 'make-available') return false;
      if (i.action === 'hold' && status === 'delisted') return false;
      return true;
    });
  }

  function positionMenu() {
    if (!menuState || !menuEl) return;
    var r = menuState.btn.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (r.bottom < 0 || r.top > vh) { closeMenu(false); return; } // button scrolled away

    var mw = menuEl.offsetWidth;
    var mh = menuEl.offsetHeight;
    var gap = 8;
    var roomAbove = r.top - gap - 8;
    var above = roomAbove >= mh || roomAbove > (vh - r.bottom - gap - 8);
    var top = above ? r.top - gap - mh : r.bottom + gap;
    top = Math.max(8, Math.min(top, vh - mh - 8));
    var left = Math.max(8, Math.min(r.right - mw, vw - mw - 8));

    menuEl.style.top = top + 'px';
    menuEl.style.left = left + 'px';
    menuEl.classList.toggle('is-below', !above);
  }

  function openMenu(card, btn) {
    if (!menuEl) buildMenu();
    if (menuState) closeMenu(false);

    var status = getStatus(card);
    menuEl.innerHTML = menuItemsFor(status).map(function (i) {
      return (i.action === 'view' ? '<div class="lax-menu-sep" role="separator"></div>' : '') +
        '<button type="button" role="menuitem" class="lax-menu-item' + (i.danger ? ' lax-menu-item--danger' : '') +
        '" data-lax-action="' + i.action + '">' + icon(i.icon, 17) + '<span>' + i.label + '</span></button>';
    }).join('');

    btn.setAttribute('aria-expanded', 'true');
    menuState = { card: card, btn: btn };
    menuState.layer = { close: function (restore) { closeMenu(restore); } };
    pushLayer(menuState.layer);

    var reposition = function () { window.requestAnimationFrame(positionMenu); };
    menuState.onReposition = reposition;
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);

    positionMenu();
    menuEl.classList.add('is-open');
    var first = menuEl.querySelector('[data-lax-action]');
    if (first) first.focus();
  }

  function closeMenu(restoreFocus) {
    if (!menuState) return;
    var st = menuState;
    menuState = null;
    st.btn.setAttribute('aria-expanded', 'false');
    popLayer(st.layer);
    window.removeEventListener('resize', st.onReposition);
    window.removeEventListener('scroll', st.onReposition, true);
    if (menuEl) menuEl.classList.remove('is-open');
    if (restoreFocus) st.btn.focus();
  }

  function toggleMenu(card, btn) {
    if (menuState && menuState.btn === btn) closeMenu(false);
    else openMenu(card, btn);
  }

  // click / touch outside closes the menu
  document.addEventListener('mousedown', function (e) {
    if (!menuState) return;
    if (menuEl.contains(e.target) || menuState.btn.contains(e.target)) return;
    closeMenu(false);
  }, true);
  document.addEventListener('touchstart', function (e) {
    if (!menuState) return;
    if (menuEl.contains(e.target) || menuState.btn.contains(e.target)) return;
    closeMenu(false);
  }, { capture: true, passive: true });

  /* ------------------------------------------------------------------------
     Centered modal shell (shared by share + confirm)
     ------------------------------------------------------------------------ */
  function important(el, styles) {
    Object.keys(styles).forEach(function (k) { el.style.setProperty(k, styles[k], 'important'); });
  }

  // Inline !important so no other stylesheet can pull the dialog off-centre.
  function pinCenter(overlay, box) {
    important(overlay, {
      position: 'fixed', top: '0', right: '0', bottom: '0', left: '0',
      width: '100%', height: '100%', margin: '0', 'box-sizing': 'border-box',
      display: 'flex', 'align-items': 'center', 'justify-content': 'center'
    });
    important(box, { position: 'relative', top: 'auto', left: 'auto', right: 'auto', bottom: 'auto', margin: 'auto' });
  }

  function createModal(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'lax-modal-overlay';
    overlay.innerHTML =
      '<div class="lax-modal" role="' + (opts.role || 'dialog') + '" aria-modal="true" aria-label="' + esc(opts.label) + '" tabindex="-1">' +
        '<button type="button" class="lax-modal-close" aria-label="Close">' + icon('close', 14) + '</button>' +
        '<div data-lax-modal-body></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var box = overlay.querySelector('.lax-modal');
    pinCenter(overlay, box);
    var body = overlay.querySelector('[data-lax-modal-body]');
    var closeBtn = overlay.querySelector('.lax-modal-close');
    var returnFocus = opts.returnFocus || document.activeElement;
    var busy = false;
    var closed = false;

    var layer = { close: function () { if (!busy) close(); } };

    function close() {
      if (closed) return;
      closed = true;
      popLayer(layer);
      overlay.classList.remove('is-open');
      unlockScroll();
      window.setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 320);
      if (returnFocus && typeof returnFocus.focus === 'function' && document.contains(returnFocus)) {
        try { returnFocus.focus(); } catch (e) { /* ignore */ }
      }
      if (typeof opts.onClose === 'function') opts.onClose();
    }

    closeBtn.addEventListener('click', function () { if (!busy) close(); });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && !busy) close(); });
    overlay.addEventListener('keydown', function (e) { trapTab(e, box); });

    lockScroll();
    pushLayer(layer);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        overlay.classList.add('is-open');
        var target = opts.focus ? overlay.querySelector(opts.focus) : null;
        (target || box).focus();
      });
    });

    return {
      overlay: overlay,
      box: box,
      body: body,
      close: close,
      setBusy: function (v) { busy = v; closeBtn.disabled = v; }
    };
  }

  /* ------------------------------------------------------------------------
     Share dialog (same content + behaviour as the buyer site)
     ------------------------------------------------------------------------ */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (err) { reject(err); }
    });
  }

  function shareUrlFor(p) {
    var url;
    try { url = new URL('property.html', window.location.href); }
    catch (e) { return window.location.href; }
    url.search = '?id=' + encodeURIComponent(p.id);
    url.hash = '';
    return url.href;
  }

  function openShare(p, returnFocus) {
    var shareUrl = shareUrlFor(p);
    var meta = [p.price, p.location].filter(Boolean).join(' \u00B7 ');
    var shareText = encodeURIComponent(p.name + (meta ? ' - ' + meta : ''));
    var encodedUrl = encodeURIComponent(shareUrl);

    var modal = createModal({ label: 'Share this property', focus: '[data-lax-copy]', returnFocus: returnFocus });
    modal.body.innerHTML =
      '<h3 class="lax-modal-title">Share this property</h3>' +
      '<p class="lax-modal-sub">Send this listing to someone who needs it.</p>' +
      '<div class="lax-share-preview">' +
        '<img data-lax-share-img alt="" />' +
        '<div class="lax-share-preview-text">' +
          '<p class="lax-share-preview-name">' + esc(p.name) + '</p>' +
          '<p class="lax-share-preview-meta">' + esc(meta) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="lax-share-options">' +
        '<a class="lax-share-option" target="_blank" rel="noopener" href="https://wa.me/?text=' + shareText + '%20' + encodedUrl + '"><span class="lax-share-option-icon">' + SHARE_ICONS.whatsapp + '</span><span>WhatsApp</span></a>' +
        '<a class="lax-share-option" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=' + shareText + '&url=' + encodedUrl + '"><span class="lax-share-option-icon">' + SHARE_ICONS.twitter + '</span><span>X</span></a>' +
        '<a class="lax-share-option" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl + '"><span class="lax-share-option-icon">' + SHARE_ICONS.facebook + '</span><span>Facebook</span></a>' +
        '<a class="lax-share-option" target="_blank" rel="noopener" href="https://t.me/share/url?url=' + encodedUrl + '&text=' + shareText + '"><span class="lax-share-option-icon">' + SHARE_ICONS.telegram + '</span><span>Telegram</span></a>' +
        '<a class="lax-share-option" href="mailto:?subject=' + shareText + '&body=' + encodedUrl + '"><span class="lax-share-option-icon">' + SHARE_ICONS.email + '</span><span>Email</span></a>' +
      '</div>' +
      '<div class="lax-share-link">' +
        '<input type="text" readonly aria-label="Listing link" data-lax-link />' +
        '<button type="button" data-lax-copy><span data-lax-copy-label>Copy</span></button>' +
      '</div>';

    var img = modal.body.querySelector('[data-lax-share-img]');
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      img.src = PLACEHOLDER_IMG;
    });
    img.src = (p.images && p.images[0]) || p.image || PLACEHOLDER_IMG;

    var input = modal.body.querySelector('[data-lax-link]');
    var label = modal.body.querySelector('[data-lax-copy-label]');
    input.value = shareUrl;
    input.addEventListener('focus', function () { input.select(); });

    modal.body.querySelector('[data-lax-copy]').addEventListener('click', function () {
      input.select();
      copyText(shareUrl).then(function () {
        label.textContent = 'Copied!';
      }, function () {
        label.textContent = 'Press Ctrl+C';
      }).then(function () {
        window.setTimeout(function () { label.textContent = 'Copy'; }, 1800);
      });
    });
  }

  /* ------------------------------------------------------------------------
     Warning dialogs (delete / hold) with loading state
     ------------------------------------------------------------------------ */
  function openConfirm(opts) {
    var modal = createModal({ label: opts.title, role: 'alertdialog', focus: '[data-lax-cancel]', returnFocus: opts.returnFocus });
    modal.body.innerHTML =
      '<div class="lax-confirm-icon' + (opts.tone === 'danger' ? ' lax-confirm-icon--danger' : '') + '">' + icon(opts.icon || 'alert', 24) + '</div>' +
      '<h3 class="lax-modal-title">' + esc(opts.title) + '</h3>' +
      '<p class="lax-modal-sub">' + esc(opts.text) + '</p>' +
      '<p class="lax-confirm-name">' + esc(opts.name) + '</p>' +
      '<div class="lax-confirm-error" role="alert" hidden></div>' +
      '<div class="lax-confirm-actions">' +
        '<button type="button" class="lax-btn lax-btn--ghost" data-lax-cancel>Cancel</button>' +
        '<button type="button" class="lax-btn ' + (opts.tone === 'danger' ? 'lax-btn--danger' : 'lax-btn--gold') + '" data-lax-proceed>Proceed</button>' +
      '</div>';

    var cancel = modal.body.querySelector('[data-lax-cancel]');
    var proceed = modal.body.querySelector('[data-lax-proceed]');
    var errorEl = modal.body.querySelector('.lax-confirm-error');

    cancel.addEventListener('click', function () { modal.close(); });

    proceed.addEventListener('click', function () {
      if (proceed.disabled) return;
      errorEl.hidden = true;
      modal.setBusy(true);
      cancel.disabled = true;
      proceed.disabled = true;
      proceed.innerHTML = '<span class="lax-spinner" aria-hidden="true"></span><span>' + esc(opts.busyLabel || 'Working\u2026') + '</span>';

      var work;
      try { work = Promise.resolve(opts.onConfirm()); }
      catch (err) { work = Promise.reject(err); }

      work.then(function () {
        modal.setBusy(false);
        modal.close();
      }, function () {
        modal.setBusy(false);
        cancel.disabled = false;
        proceed.disabled = false;
        proceed.textContent = 'Try again';
        errorEl.textContent = 'Something went wrong on our side, so nothing was changed. Please try again.';
        errorEl.hidden = false;
      });
    });
  }

  /* ------------------------------------------------------------------------
     Delete / Hold
     ------------------------------------------------------------------------ */
  // Persistence is now fully handled via accoom-agent-listings in localStorage.
  // syncHeld() and the in-memory held[] array are no longer needed.

  var mockService = {
    remove: function () { return delay(700); },
    hold: function () { return delay(700); }
  };

  function service(kind) {
    var s = cfg.service && cfg.service[kind] ? cfg.service : mockService;
    return s[kind];
  }

  function persistState(id, status, name) {
    var store = getStore();
    store[id] = { status: status, name: name, at: new Date().toISOString() };
    setStore(store);
    // Also update accoom-agent-listings so the status survives a page refresh
    persistListingStatus(id, status);
  }

  // Write the new status directly into accoom-agent-listings (the source of truth
  // for agent-dashboard.js). 'deleted' entries are stripped on load so they vanish.
  function persistListingStatus(id, newStatus) {
    try {
      var key = 'accoom-agent-listings';
      var raw = window.localStorage.getItem(key);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return;
      var found = false;
      list = list.map(function (f) {
        if (String(f.id) === String(id)) {
          found = true;
          return Object.assign({}, f, { status: newStatus, updatedAt: new Date().toISOString() });
        }
        return f;
      });
      if (found) window.localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { /* never break the action over a storage failure */ }
  }

  function ensureEmptyNote(parent) {
    if (!parent) return;
    var hasCards = toArray(parent.children).some(function (c) { return c.classList.contains('lax-card'); });
    var note = parent.querySelector(':scope > .lax-empty');
    if (hasCards && note) note.parentNode.removeChild(note);
    if (!hasCards && !note) {
      var p = document.createElement('p');
      p.className = 'lax-empty';
      p.textContent = 'No properties here right now.';
      parent.appendChild(p);
    }
  }

  function afterSuccess(kind, card, info, status) {
    var container = findContainer(card);
    var action = kind === 'remove' ? 'delete' : kind === 'make-available' ? 'make-available' : 'hold';
    var newStatus = kind === 'remove' ? 'deleted' : kind === 'make-available' ? 'available' : 'hold';

    persistState(info.id, newStatus, info.name);

    var evt;
    try {
      evt = new CustomEvent('accoom:listing-action', {
        cancelable: true,
        detail: { action: action, id: info.id, name: info.name, from: status, card: card }
      });
    } catch (e) { evt = null; }
    var proceed = evt ? document.dispatchEvent(evt) : true;

    if (proceed) {
      // tab counters
      adjustTabCount(container, status, -1);
      if (action === 'hold') adjustTabCount(container, 'hold', 1);
      if (action === 'make-available') adjustTabCount(container, 'available', 1);

      // animate out, then remove from current tab
      var parent = card.parentElement;
      card.classList.add('is-leaving');
      window.setTimeout(function () {
        if (card.parentNode) card.parentNode.removeChild(card);
        ensureEmptyNote(parent);
      }, 240);
    }

    if (action === 'delete') {
      notify('Listing deleted', '\u201C' + info.name + '\u201D was permanently deleted from your listings.');
    } else if (action === 'hold') {
      notify('Listing put on hold', '\u201C' + info.name + '\u201D was moved to your Hold tab.');
    } else if (action === 'make-available') {
      notify('Listing restored', '\u201C' + info.name + '\u201D is back on the Available tab.');
    }
  }

  // Tab clicks re-render cards; give that a moment then re-decorate.
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[role="tab"], button, a, li');
    if (!t || isOurs(t) || t.closest('.lax-card')) return;
    if (!statusFromText(t.textContent)) return;
    window.setTimeout(enhance, 60);
    window.setTimeout(enhance, 350);
  });

  function actionDelete(card, btn) {
    var info = readCard(card);
    var status = getStatus(card);
    openConfirm({
      returnFocus: btn,
      tone: 'danger',
      icon: 'trash',
      title: 'Delete this listing?',
      text: 'This is your last warning. The listing will be removed from your dashboard and from ACCOOM, and you won\u2019t be able to undo it from here.',
      name: info.name,
      busyLabel: 'Deleting\u2026',
      onConfirm: function () {
        return Promise.resolve(service('remove')(info.id, info)).then(function () {
          afterSuccess('remove', card, info, status);
        });
      }
    });
  }

  function actionHold(card, btn) {
    var info = readCard(card);
    var status = getStatus(card);
    openConfirm({
      returnFocus: btn,
      tone: 'gold',
      icon: 'pause',
      title: 'Put this listing on hold?',
      text: 'It will move to your Delisted tab and buyers won\u2019t be able to see it on ACCOOM while it\u2019s there.',
      name: info.name,
      busyLabel: 'Moving\u2026',
      onConfirm: function () {
        return Promise.resolve(service('hold')(info.id, info)).then(function () {
          afterSuccess('hold', card, info, status);
        });
      }
    });
  }

  function actionEdit(card) {
    var info = readCard(card);
    notify('Listing edit opened', 'You opened \u201C' + info.name + '\u201D for editing.');
    if (cfg.editHref) {
      window.location.href = cfg.editHref + (cfg.editHref.indexOf('?') === -1 ? '?' : '&') + 'id=' + encodeURIComponent(info.id);
      return;
    }
  }

  function actionMakeAvailable(card, btn) {
    var info = readCard(card);
    var status = getStatus(card);
    openConfirm({
      returnFocus: btn,
      tone: 'gold',
      icon: 'check',
      title: 'Make this listing available?',
      text: 'It will move back to your Available tab and buyers will be able to see it on ACCOOM again.',
      name: info.name,
      busyLabel: 'Restoring\u2026',
      onConfirm: function () {
        return Promise.resolve(service('hold')(info.id, info)).then(function () {
          afterSuccess('make-available', card, info, status);
        });
      }
    });
  }

  function runAction(action, card, btn) {
    if (action === 'delete') actionDelete(card, btn);
    else if (action === 'hold') actionHold(card, btn);
    else if (action === 'make-available') actionMakeAvailable(card, btn);
    else if (action === 'edit') actionEdit(card);
    else if (action === 'view') openView(card, btn);
  }

  /* ------------------------------------------------------------------------
     Property data for the View + Share dialogs
     ------------------------------------------------------------------------ */
  function parseList(v) {
    if (!v) return null;
    try {
      var parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) { /* fall through */ }
    return String(v).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function baseProperty(card) {
    var info = readCard(card);
    var d = card.dataset || {};
    var status = getStatus(card);

    var p = {
      id: info.id,
      generatedId: info.generatedId,
      name: info.name,
      location: info.location,
      price: info.price,
      priceValue: info.priceValue,
      period: info.period,
      beds: info.beds,
      baths: info.baths,
      typeLabel: d.type || inferType(info.name),
      image: info.image,
      images: parseList(d.images) || (info.image ? [info.image] : []),
      video: d.video || null,
      status: status,
      about: d.about || '',
      description: null,
      amenities: null,
      quickFacts: null,
      furnishing: d.furnishing,
      yearBuilt: d.yearBuilt,
      parking: d.parking,
      dateAdded: d.dateAdded,
      views: d.views
    };

    // Saved agent uploads (from the My Listings form) — pull the WHOLE
    // record, not just media, so the View dialog tallies exactly with
    // what the agent filled in rather than quietly falling back to
    // placeholder copy for anything they actually supplied.
    try {
      var saved = JSON.parse(window.localStorage.getItem('accoom-agent-listings'));
      if (Array.isArray(saved)) {
        saved.forEach(function (s) {
          if (String(s.id) !== String(p.id)) return;
          if (s.images && s.images.length) p.images = s.images;
          else if (s.cover && !d.images) p.images = [s.cover];
          if (s.video && !p.video) p.video = s.video;
          if (Array.isArray(s.videosAll) && s.videosAll.length > 1) {
            // extra videos beyond the primary one join the gallery as slides too
            p.extraVideos = s.videosAll.filter(function (v) { return v !== p.video; });
          }
          if (s.about) p.about = s.about;
          if (Array.isArray(s.description) && s.description.length) p.description = s.description;
          if (Array.isArray(s.amenities) && s.amenities.length) p.amenities = s.amenities;
          if (Array.isArray(s.quickFacts) && s.quickFacts.length) p.quickFacts = s.quickFacts;
          if (s.furnishing) p.furnishing = s.furnishing;
          if (s.yearBuilt) p.yearBuilt = s.yearBuilt;
          if (s.parking != null) p.parking = s.parking + (s.parking === 1 ? ' Car' : ' Cars');
          if (s.dateAdded) p.dateAdded = s.dateAdded;
          if (s.views != null) p.views = s.views;
          if (s.typeLabel && !d.type) p.typeLabel = s.typeLabel;
          if (s.location && !d.location) p.location = s.location;
          if (s.priceValue != null && !d.images /* agent-authored, trust it over the DOM-scraped price */) {
            p.priceValue = s.priceValue;
            p.price = formatNaira(s.priceValue);
          }
          if (s.period) p.period = s.period;
          if (s.beds != null) p.beds = s.beds;
          if (s.baths != null) p.baths = s.baths;
          if (s.totalPayable != null) p.totalPayable = s.totalPayable;
          if (s.agencyFeePct != null) p.agencyFeePct = s.agencyFeePct;
          if (s.legalFeePct != null) p.legalFeePct = s.legalFeePct;
          if (s.agencyFee != null) p.agencyFee = s.agencyFee;
          if (s.legalFee != null) p.legalFee = s.legalFee;
        });
      }
    } catch (e) { /* ignore */ }

    // Shared catalogue (numeric ids only, so we never mis-match)
    if (Accoom.PropertyService && Accoom.PropertyService.getById && /^\d+$/.test(p.id)) {
      var hit = Accoom.PropertyService.getById(p.id);
      if (hit && !d.images) {
        if (hit.images && hit.images.length) p.images = hit.images;
        if (hit.video && !p.video) p.video = hit.video;
      }
    }

    return p;
  }

  function resolveProperty(card) {
    var base = baseProperty(card);
    var info = readCard(card);
    if (typeof cfg.resolver !== 'function') return Promise.resolve(base);
    return Promise.resolve(cfg.resolver(info, base)).then(function (extra) {
      var ex = (extra && typeof extra === 'object') ? extra : {};
      var merged = {};
      Object.keys(base).forEach(function (k) { merged[k] = base[k]; });
      Object.keys(ex).forEach(function (k) { if (ex[k] != null) merged[k] = ex[k]; });
      if (merged.priceValue != null && !ex.price) merged.price = formatNaira(merged.priceValue);
      return merged;
    });
  }

  /* ------------------------------------------------------------------------
     VIEW dialog (opens inside the listings container)
     ------------------------------------------------------------------------ */
  var view = null; // { overlay, panel, body, container, layer, token, ... }

  function headerOffset() {
    var els = toArray(document.querySelectorAll('header, .site-header, [class*="header" i]'));
    for (var i = 0; i < els.length; i++) {
      var pos = window.getComputedStyle(els[i]).position;
      if (pos === 'fixed' || pos === 'sticky') {
        var r = els[i].getBoundingClientRect();
        if (r.height > 0 && r.height < 200 && r.top <= 1) return Math.round(r.bottom) + 10;
      }
    }
    return 12;
  }

  function skeletonHtml() {
    return '<div class="lax-view-grid" aria-busy="true">' +
      '<div class="lax-view-left">' +
        '<div class="lax-skel lax-skel--gallery lax-o1"></div>' +
        '<div class="lax-content lax-o3" style="display:flex;flex-direction:column;gap:16px">' +
          '<div class="lax-skel lax-skel--block"></div><div class="lax-skel lax-skel--block"></div>' +
        '</div>' +
      '</div>' +
      '<div class="lax-view-right">' +
        '<div class="lax-card-box lax-o2"><div class="lax-skel lax-skel--line" style="width:70%;height:22px"></div><div class="lax-skel lax-skel--line" style="width:50%"></div><div class="lax-skel lax-skel--line" style="width:40%;height:24px"></div></div>' +
        '<div class="lax-card-box lax-o5"><div class="lax-skel lax-skel--line"></div><div class="lax-skel lax-skel--line"></div><div class="lax-skel lax-skel--line"></div><div class="lax-skel lax-skel--line"></div></div>' +
      '</div>' +
    '</div>';
  }

  function isResidential(p) {
    return !/land|hall|commercial/i.test(p.name + ' ' + p.typeLabel);
  }

  var IMAGE_POOLS = [
    { re: /mini/i, files: ['miniflat', 'miniflat1', 'bedroomflat3', 'bedroomflat4'] },
    { re: /self|contain/i, files: ['selfcon1', 'selfcon2', 'selfcon3', 'selfcon4'] },
    { re: /duplex|bedroom|apartment|flat/i, files: ['bedroomflat3', 'bedroomflat4', 'miniflat1', 'miniflat'] },
    { re: /commercial|shop|office/i, files: ['commercialspace', 'commercialspace2', 'land1'] },
    { re: /land|plot/i, files: ['land1', 'land2', 'land3'] },
    { re: /hall/i, files: ['hall2', 'hall3', 'bedroomflat4'] },
    { re: /room/i, files: ['singleroom', 'singleroom3', 'miniflat1'] }
  ];
  var GENERIC_POOL = ['miniflat1', 'miniflat', 'bedroomflat3', 'bedroomflat4'];

  function baseName(src) {
    return String(src || '').split('?')[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  }

  // Every listing shows at least 3 photos, like the buyer page. Real photos
  // (data-images, saved uploads, catalogue) always come first.
  function ensureMinImages(p, min) {
    var list = (p.images || []).filter(Boolean).slice();
    if (list.length >= min) return list;
    var label = (p.name || '') + ' ' + (p.typeLabel || '');
    var pool = GENERIC_POOL;
    for (var i = 0; i < IMAGE_POOLS.length; i++) {
      if (IMAGE_POOLS[i].re.test(label)) { pool = IMAGE_POOLS[i].files; break; }
    }
    var seen = {};
    list.forEach(function (src) { seen[baseName(src)] = true; });
    pool.concat(GENERIC_POOL).forEach(function (f) {
      if (list.length >= min || seen[f.toLowerCase()]) return;
      seen[f.toLowerCase()] = true;
      list.push('assets/images/home-properties/' + f + '.png');
    });
    return list;
  }

  // No cap: every photo, video and surroundings item is shown.

  function buildSlides(p) {
    var slides = [];
    var images = ensureMinImages(p, 3);
    if (!images.length) images = [PLACEHOLDER_IMG];
    if (p.video) slides.push({ type: 'video', src: p.video, poster: images[0] });
    images.forEach(function (src) { slides.push({ type: 'image', src: src }); });
    (p.extraVideos || []).forEach(function (src) { slides.push({ type: 'video', src: src, poster: images[0] }); });
    return slides;
  }

  var THUMBS_VISIBLE = 3; // buyer view stays uncluttered; the rest is one tap away via "+N"

  function galleryHtml(p, slides, statusLabel) {
    var multi = slides.length > 1;
    var visibleCount = Math.min(THUMBS_VISIBLE, slides.length);
    var hiddenCount = slides.length - visibleCount;
    var thumbs = multi ? '<div class="lax-thumbs" data-lax-thumbs>' + slides.slice(0, visibleCount).map(function (s, i) {
      var poster = s.type === 'video' ? s.poster : s.src;
      var isLastVisible = i === visibleCount - 1 && hiddenCount > 0;
      return '<button type="button" class="lax-thumb' + (isLastVisible ? ' lax-thumb-more' : '') + '" data-index="' + i + '" aria-label="' +
        (isLastVisible ? ('Show ' + hiddenCount + ' more') : (s.type === 'video' ? 'Play video' : 'Photo ' + (i + 1))) + '">' +
        '<img src="' + esc(poster) + '" alt="" loading="lazy" />' +
        (s.type === 'video' && !isLastVisible ? '<span class="lax-thumb-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></span>' : '') +
        (isLastVisible ? '<span class="lax-thumb-more-badge">+' + hiddenCount + '</span>' : '') +
        '</button>';
    }).join('') + '</div>' : '';

    return '<section class="lax-gallery lax-o1" data-lax-gallery>' +
      '<div class="lax-gallery-main is-loading" data-lax-main>' +
        '<span class="lax-gallery-tag">' + esc(statusLabel) + '</span>' +
        '<img data-lax-img alt="' + esc(p.name) + '" />' +
        '<video data-lax-video muted loop playsinline preload="metadata" style="display:none"></video>' +
        (multi ? '<button type="button" class="lax-gallery-nav lax-gallery-prev" data-lax-prev aria-label="Previous">' + icon('chevL', 18) + '</button>' +
                 '<button type="button" class="lax-gallery-nav lax-gallery-next" data-lax-next aria-label="Next">' + icon('chevR', 18) + '</button>' : '') +
        '<button type="button" class="lax-gallery-viewphotos" data-lax-open-lightbox>' + icon('camera', 14) + ' View Photos</button>' +
        '<span class="lax-gallery-counter" data-lax-counter>1/' + slides.length + '</span>' +
      '</div>' + thumbs + '</section>';
  }

  function propertyHtml(p, slides) {
    var statusLabel = STATUS_LABEL[p.status] || 'Listing';
    var priceSuffix = periodLabel(p.period);
    var isSale = p.period === 'sale';
    var residential = isResidential(p);

    var tags = [];
    if (p.beds != null) tags.push(p.beds + (p.beds === 1 ? ' Bed' : ' Beds'));
    if (p.baths != null) tags.push(p.baths + (p.baths === 1 ? ' Bath' : ' Baths'));
    if (p.typeLabel) tags.push(p.typeLabel);
    if (Array.isArray(p.tags)) tags = tags.concat(p.tags);

    var titleCard =
      '<div class="lax-card-box lax-title-card lax-o2">' +
        '<h1 id="lax-view-title-main">' + esc(p.name) + '</h1>' +
        (p.location ? '<p class="lax-loc">' + icon('pin', 15) + '<span>' + esc(p.location) + '</span></p>' : '') +
        (p.price ? '<p class="lax-price">' + esc(p.price) + (priceSuffix && !isSale ? '<small> ' + esc(priceSuffix) + '</small>' : '') + (isSale ? '<small> For Sale</small>' : '') + '</p>' : '') +
        (tags.length ? '<div class="lax-tags">' + tags.map(function (t) { return '<span class="lax-tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
      '</div>';

    var shareCard =
      '<div class="lax-card-box lax-share-card lax-o6">' +
        '<span class="lax-share-card-label">Share Property</span>' +
        '<button type="button" class="lax-share-btn" data-lax-share-in-view>' + icon('share', 14) + ' Share</button>' +
      '</div>';

    var overviewRows = [];
    if (!p.generatedId) overviewRows.push(['Property ID', p.id]);
    overviewRows.push(['Property Type', p.typeLabel || 'Property']);
    overviewRows.push(['Status', statusLabel]);
    if (p.furnishing) overviewRows.push(['Furnishing', p.furnishing]);
    if (p.category === 'sale' && p.yearBuilt) overviewRows.push(['Year Built', p.yearBuilt]);
    if (p.parking && p.parking !== '0' && p.parking !== 0) overviewRows.push(['Parking Space', p.parking]);
    overviewRows.push(['Date Added', p.dateAdded || DEFAULTS.dateAdded]);
    overviewRows.push(['Views', p.views || DEFAULTS.views]);

    var overview =
      '<div class="lax-card-box lax-o7"><h3>Property Overview</h3>' +
      overviewRows.map(function (r) {
        return '<div class="lax-overview-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
      }).join('') + '</div>';

    // content blocks
    var about = p.about || ('This ' + (p.typeLabel || 'property').toLowerCase() + (p.location ? ' is located in ' + p.location : ' is listed on ACCOOM') + '.');

    var facts = Array.isArray(p.quickFacts) ? p.quickFacts.filter(function (f) {
      if (!f || !f.text) return false;
      var text = String(f.text).toLowerCase();
      if (text.indexOf(' 0 ') !== -1 || text.indexOf('0 ') === 0 || text === '0') return false;
      return true;
    }) : [];
    if (!facts.length) {
      if (p.beds && p.beds !== 0 && p.beds !== '0') facts.push({ icon: 'bed', text: p.beds + (p.beds === 1 ? ' Bedroom' : ' Bedrooms') });
      if (p.baths && p.baths !== 0 && p.baths !== '0') facts.push({ icon: 'bath', text: p.baths + (p.baths === 1 ? ' Bathroom' : ' Bathrooms') });
      if (residential) facts = facts.concat(DEFAULTS.quickFacts);
    }

    var descParas = Array.isArray(p.description) ? p.description : (p.description ? [String(p.description)] : (residential ? DEFAULTS.description : []));
    var amenities = Array.isArray(p.amenities) && p.amenities.length ? p.amenities : (residential ? DEFAULTS.amenities : []);

    var aboutBlock =
      '<section class="lax-block lax-o3"><h2>About this property</h2><p>' + esc(about) + '</p>' +
        (facts.length ? '<div class="lax-quickfacts">' + facts.map(function (f) {
          return '<div class="lax-quickfact">' + icon(f.icon || 'check', 18) + '<span>' + esc(f.text) + '</span></div>';
        }).join('') + '</div>' : '') +
      '</section>';

    var descBlock = descParas.length
      ? '<section class="lax-block lax-o4 lax-desc"><h2>Detailed Description</h2>' + descParas.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</section>'
      : '';

    var amenityBlock = amenities.length
      ? '<section class="lax-block lax-o5"><h2>Amenities &amp; Features</h2><div class="lax-amenities">' + amenities.map(function (a) {
          return '<span class="lax-amenity">' + svg(PATH.check, 16, ' stroke-width="2.5"') + esc(a) + '</span>';
        }).join('') + '</div></section>'
      : '';

    // Mobile order: gallery, title, about, description, amenities, share, overview.
    // Desktop: left = gallery, about, amenities; right = title, share, overview, description.
    return '<div class="lax-view-grid">' +
      '<div class="lax-view-left">' + galleryHtml(p, slides, statusLabel) + aboutBlock + amenityBlock + '</div>' +
      '<div class="lax-view-right">' + titleCard + shareCard + overview + descBlock + '</div>' +
    '</div>';
  }

  // Rough, honest stand-in for real adaptive streaming (which needs a
  // server transcoding multiple renditions): on a slow or metered
  // connection we only preload metadata and never autoplay, so a big
  // video file doesn't stall the page on a weak network.
  function connectionIsSlow() {
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return false;
    if (c.saveData) return true;
    return /^(slow-2g|2g|3g)$/.test(c.effectiveType || '');
  }

  function initGallery(root, p, slides, dlg) {
    var main = root.querySelector('[data-lax-main]');
    var img = root.querySelector('[data-lax-img]');
    var video = root.querySelector('[data-lax-video]');
    var counter = root.querySelector('[data-lax-counter]');
    var thumbs = root.querySelector('[data-lax-thumbs]');
    var viewBtn = root.querySelector('[data-lax-open-lightbox]');
    var index = 0;
    var imageSlides = slides.filter(function (s) { return s.type === 'image'; });
    var slowNet = connectionIsSlow();
    video.setAttribute('preload', slowNet ? 'none' : 'metadata');

    function loaded() { main.classList.remove('is-loading'); }

    img.addEventListener('load', loaded);
    img.addEventListener('error', function () {
      if (img.getAttribute('data-fallback')) { loaded(); return; }
      img.setAttribute('data-fallback', '1');
      img.src = PLACEHOLDER_IMG;
    });
    video.addEventListener('loadeddata', loaded);
    video.addEventListener('error', loaded);

    function setActive(i) {
      index = (i + slides.length) % slides.length;
      var slide = slides[index];
      main.classList.add('is-loading');

      if (slide.type === 'video') {
        img.style.display = 'none';
        video.style.display = 'block';
        video.setAttribute('poster', slide.poster || '');
        if (video.getAttribute('src') !== slide.src) video.setAttribute('src', slide.src);
        // Don't force autoplay on a slow connection — let the person tap play themselves.
        if (!slowNet) {
          var pr = video.play && video.play();
          if (pr && pr.catch) pr.catch(function () {});
        } else {
          loaded();
        }
        if (viewBtn) viewBtn.style.display = imageSlides.length ? '' : 'none';
      } else {
        if (video.pause) video.pause();
        video.style.display = 'none';
        img.style.display = 'block';
        img.removeAttribute('data-fallback');
        img.classList.add('is-swapping');
        window.setTimeout(function () {
          img.src = slide.src;
          img.classList.remove('is-swapping');
          if (img.complete && img.naturalWidth) loaded();
        }, 100);
      }

      if (counter) counter.textContent = (index + 1) + '/' + slides.length;
      if (thumbs) {
        toArray(thumbs.querySelectorAll('.lax-thumb')).forEach(function (t) {
          var on = parseInt(t.getAttribute('data-index'), 10) === index;
          t.classList.toggle('is-active', on);
          if (on && t.scrollIntoView) {
            try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ }
          }
        });
      }
    }

    var prev = root.querySelector('[data-lax-prev]');
    var next = root.querySelector('[data-lax-next]');
    if (prev) prev.addEventListener('click', function (e) { e.stopPropagation(); setActive(index - 1); });
    if (next) next.addEventListener('click', function (e) { e.stopPropagation(); setActive(index + 1); });
    if (thumbs) {
      thumbs.addEventListener('click', function (e) {
        var t = e.target.closest('.lax-thumb');
        if (!t) return;
        var i = parseInt(t.getAttribute('data-index'), 10);
        setActive(i);
        // "+N" tile: jump straight into the full-screen viewer so the rest is one tap away
        if (t.classList.contains('lax-thumb-more') && viewBtn) viewBtn.click();
      });
    }

    // swipe on the main image
    var sx = 0, sy = 0;
    main.addEventListener('touchstart', function (e) {
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    main.addEventListener('touchend', function (e) {
      if (slides.length < 2) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) setActive(index + (dx < 0 ? 1 : -1));
    }, { passive: true });

    function openLightboxFromCurrent() {
      if (!slides.length) return;
      if (video.pause) video.pause();
      openLightbox(dlg, slides, index);
    }
    main.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      if (slides[index].type === 'image') openLightboxFromCurrent();
    });
    if (viewBtn) viewBtn.addEventListener('click', function (e) { e.stopPropagation(); openLightboxFromCurrent(); });

    dlg.gallery = {
      prev: function () { if (slides.length > 1) setActive(index - 1); },
      next: function () { if (slides.length > 1) setActive(index + 1); },
      stop: function () { if (video.pause) video.pause(); }
    };

    setActive(0);
    // first image sets src through setActive's timer; make sure the shimmer can't hang
    window.setTimeout(function () { if (img.complete) loaded(); }, 1500);
  }

  // Photo viewer — same look + controls as the buyer site's lightbox:
  // gold-framed stage, sliding track (swipe/drag), prev/next, counter,
  // zoom out / reset / zoom in, click to zoom, right-click to zoom out.
  function openLightbox(dlg, imgs, start) {
    var total = imgs.length;
    var box = document.createElement('div');
    box.className = 'lax-lb';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Property photos and videos');
    box.innerHTML =
      '<div class="lax-lb-stage">' +
        '<div class="lax-lb-frame" data-lb-frame>' +
          '<div class="lax-lb-track" data-lb-track>' +
            imgs.map(function (im) {
              if (im.type === 'video') {
                return '<div class="lax-lb-slide lax-lb-slide--video"><video src="' + esc(im.src) + '"' + (im.poster ? ' poster="' + esc(im.poster) + '"' : '') + ' controls playsinline preload="metadata"></video></div>';
              }
              return '<div class="lax-lb-slide"><img src="' + esc(im.src) + '" alt="" draggable="false" /></div>';
            }).join('') +
          '</div>' +
          '<div class="lax-lb-zoom">' +
            '<button type="button" class="lax-lb-zoom-btn" data-lb-zoom-out aria-label="Zoom out">' + svg('<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.6" y2="16.6"></line><line x1="8" y1="11" x2="14" y2="11"></line>', 16) + '</button>' +
            '<button type="button" class="lax-lb-zoom-btn" data-lb-zoom-reset aria-label="Reset zoom">' + svg('<path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path>', 15) + '</button>' +
            '<button type="button" class="lax-lb-zoom-btn" data-lb-zoom-in aria-label="Zoom in">' + svg('<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.6" y2="16.6"></line><line x1="8" y1="11" x2="14" y2="11"></line><line x1="11" y1="8" x2="11" y2="14"></line>', 16) + '</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="lax-lb-close" aria-label="Close">' + svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>', 16) + '</button>' +
        (total > 1 ? '<button type="button" class="lax-lb-nav lax-lb-prev" aria-label="Previous photo">' + svg('<polyline points="15 18 9 12 15 6"></polyline>', 16, ' stroke-width="2.4"') + '</button>' +
                     '<button type="button" class="lax-lb-nav lax-lb-next" aria-label="Next photo">' + svg('<polyline points="9 18 15 12 9 6"></polyline>', 16, ' stroke-width="2.4"') + '</button>' : '') +
        '<span class="lax-lb-counter" data-lb-counter></span>' +
      '</div>';
    document.body.appendChild(box);

    var track = box.querySelector('[data-lb-track]');
    var frame = box.querySelector('[data-lb-frame]');
    var counter = box.querySelector('[data-lb-counter]');
    var current = Math.max(0, Math.min(start || 0, total - 1));
    var zoom = 1;
    var drag = null;
    var closed = false;
    var layer = { close: function () { close(); } };

    toArray(track.querySelectorAll('img')).forEach(function (im) {
      im.addEventListener('error', function () {
        if (!im.getAttribute('data-fallback')) { im.setAttribute('data-fallback', '1'); im.src = PLACEHOLDER_IMG; }
      });
    });

    function setZoom(level) {
      var im = track.children[current] && track.children[current].querySelector('img');
      zoom = im ? Math.max(1, Math.min(3, level)) : 1;
      if (im) im.style.transform = 'scale(' + zoom + ')';
      frame.classList.toggle('is-zoomed', zoom > 1);
    }

    function render(instant) {
      track.style.transition = instant ? 'none' : '';
      track.style.transform = 'translateX(' + (-current * 100) + '%)';
      counter.textContent = (current + 1) + ' / ' + total;
    }

    function go(n) {
      // reset zoom on the slide we are leaving
      var old = track.children[current] && track.children[current].querySelector('img');
      if (old) old.style.transform = '';
      var oldVideo = track.children[current] && track.children[current].querySelector('video');
      if (oldVideo && oldVideo.pause) oldVideo.pause();
      current = (n + total) % total;
      setZoom(1);
      render();
    }

    function close() {
      if (closed) return;
      closed = true;
      popLayer(layer);
      box.classList.remove('is-open');
      box.removeEventListener('keydown', onKey);
      window.setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 300);
      var f = dlg.panel && dlg.panel.querySelector('[data-lax-open-lightbox]');
      if (f && document.contains(f)) f.focus();
    }

    function onKey(e) {
      if (e.key === 'ArrowRight') { e.stopPropagation(); if (total > 1) go(current + 1); }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); if (total > 1) go(current - 1); }
      else trapTab(e, box);
    }

    box.querySelector('.lax-lb-close').addEventListener('click', close);
    var pv = box.querySelector('.lax-lb-prev');
    var nx = box.querySelector('.lax-lb-next');
    if (pv) pv.addEventListener('click', function (e) { e.stopPropagation(); go(current - 1); });
    if (nx) nx.addEventListener('click', function (e) { e.stopPropagation(); go(current + 1); });
    box.addEventListener('mousedown', function (e) { if (e.target === box) close(); });
    box.addEventListener('keydown', onKey);

    // drag / swipe
    track.addEventListener('pointerdown', function (e) {
      if (total < 2 || zoom > 1 || (e.target && e.target.closest && e.target.closest('video'))) return;
      drag = { startX: e.clientX, dx: 0 };
      track.style.transition = 'none';
      if (track.setPointerCapture) { try { track.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    });
    track.addEventListener('pointermove', function (e) {
      if (!drag) return;
      drag.dx = e.clientX - drag.startX;
      var pct = (drag.dx / (track.clientWidth || 1)) * 100;
      track.style.transform = 'translateX(' + (-current * 100 + pct) + '%)';
    });
    function endDrag() {
      if (!drag) return;
      var threshold = (track.clientWidth || 300) * 0.16;
      var dx = drag.dx;
      lastDrag = Math.abs(dx);
      drag = null;
      if (dx < -threshold) go(current + 1);
      else if (dx > threshold) go(current - 1);
      else render();
    }
    var lastDrag = 0;
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    // zoom: click = in, right-click = out, buttons + reset
    frame.addEventListener('click', function () {
      if (lastDrag > 6) { lastDrag = 0; return; }
      if (track.children[current] && track.children[current].querySelector('video')) return;
      setZoom(zoom + 0.5);
    });
    frame.addEventListener('contextmenu', function (e) { e.preventDefault(); setZoom(zoom - 0.5); });
    box.querySelector('[data-lb-zoom-in]').addEventListener('click', function (e) { e.stopPropagation(); setZoom(zoom + 0.5); });
    box.querySelector('[data-lb-zoom-out]').addEventListener('click', function (e) { e.stopPropagation(); setZoom(zoom - 0.5); });
    box.querySelector('[data-lb-zoom-reset]').addEventListener('click', function (e) { e.stopPropagation(); setZoom(1); });

    pushLayer(layer);
    render(true);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        box.classList.add('is-open');
        var c = box.querySelector('.lax-lb-close');
        if (c) c.focus();
      });
    });
  }

  function closeView(restoreFocus, instant) {
    if (!view) return;
    var v = view;
    view = null;
    v.token++;
    window.clearTimeout(v.timer);
    popLayer(v.layer);
    unlockScroll();
    if (v.gallery) v.gallery.stop();
    document.removeEventListener('keydown', v.onKey);
    v.overlay.classList.remove('is-open');

    var cleanup = function () {
      if (v.overlay.parentNode) v.overlay.parentNode.removeChild(v.overlay);
      if (v.overflowPatched) v.container.style.overflow = v.prevOverflow;
    };
    if (instant) cleanup(); else window.setTimeout(cleanup, 280);

    if (restoreFocus && v.trigger && document.contains(v.trigger)) {
      try { v.trigger.focus(); } catch (e) { /* ignore */ }
    }
  }

  function renderViewError(v, retry) {
    v.body.innerHTML =
      '<div class="lax-view-error" role="alert">' +
        icon('alert', 34) +
        '<p>We couldn\u2019t load this property right now.</p>' +
        '<button type="button" class="lax-btn lax-btn--gold" data-lax-retry>Try again</button>' +
      '</div>';
    v.body.querySelector('[data-lax-retry]').addEventListener('click', retry);
  }

  function openView(card, trigger) {
    if (view) closeView(false, true);

    var container = findContainer(card);
    ensurePositioned(container);

    var overlay = document.createElement('div');
    overlay.className = 'lax-view-overlay';
    overlay.innerHTML =
      '<div class="lax-view" role="dialog" aria-modal="true" aria-labelledby="lax-view-title" tabindex="-1">' +
        '<div class="lax-view-bar">' +
          '<div class="lax-view-bar-left"><span class="lax-view-badge">Agent view</span>' +
          '<span class="lax-view-bar-title" id="lax-view-title">Property details</span></div>' +
          '<button type="button" class="lax-view-close" aria-label="Close property view">' + icon('close', 16) + '</button>' +
        '</div>' +
        '<div class="lax-view-body" data-lax-view-body></div>' +
      '</div>';

    var prevOverflow = container.style.overflow;
    var overflowPatched = false;
    // Mounted on <body> so no parent (transform/overflow/padding) can push it off-centre.
    document.body.appendChild(overlay);
    important(overlay, {
      position: 'fixed', top: '0', right: '0', bottom: '0', left: '0',
      width: '100%', height: '100%', margin: '0', 'box-sizing': 'border-box',
      display: 'flex', 'align-items': 'center', 'justify-content': 'center'
    });
    important(overlay.querySelector('.lax-view'), { margin: 'auto', position: 'relative', left: 'auto', top: 'auto' });
    lockScroll();
    // nothing behind the dialog may scroll; only the dialog body can
    var blockScroll = function (e) { if (!e.target.closest || !e.target.closest('.lax-view-body')) e.preventDefault(); };
    overlay.addEventListener('wheel', blockScroll, { passive: false });
    overlay.addEventListener('touchmove', blockScroll, { passive: false });

    var panel = overlay.querySelector('.lax-view');
    var v = view = {
      overlay: overlay, panel: panel, body: overlay.querySelector('[data-lax-view-body]'),
      container: container, trigger: trigger, token: 0, timer: null,
      prevOverflow: prevOverflow, overflowPatched: overflowPatched, gallery: null
    };

    v.layer = { close: function (restore) { closeView(restore !== false); } };
    pushLayer(v.layer);

    v.onKey = function (e) {
      if (document.querySelector('.lax-modal-overlay.is-open') || document.querySelector('.lax-lb')) return;
      var typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement && document.activeElement.tagName) || '');
      if (e.key === 'ArrowLeft' && v.gallery && !typing) v.gallery.prev();
      else if (e.key === 'ArrowRight' && v.gallery && !typing) v.gallery.next();
      else if (e.key === 'Tab') trapTab(e, panel);
    };
    document.addEventListener('keydown', v.onKey);

    overlay.querySelector('.lax-view-close').addEventListener('click', function () { closeView(true); });
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeView(true); });

    function load() {
      var token = ++v.token;
      var started = Date.now();
      window.clearTimeout(v.timer);
      v.body.innerHTML = skeletonHtml();
      v.body.scrollTop = 0;

      v.timer = window.setTimeout(function () {
        if (view !== v || token !== v.token) return;
        v.token++;
        renderViewError(v, load);
      }, cfg.viewTimeout);

      var work;
      try { work = resolveProperty(card); } catch (err) { work = Promise.reject(err); }

      work.then(function (p) {
        var wait = Math.max(0, 280 - (Date.now() - started));
        return delay(wait).then(function () { return p; });
      }).then(function (p) {
        if (view !== v || token !== v.token) return;
        window.clearTimeout(v.timer);
        var slides = buildSlides(p);
        v.body.innerHTML = propertyHtml(p, slides);
        overlay.querySelector('#lax-view-title').textContent = p.name;
        initGallery(v.body, p, slides, v);
        var shareBtn = v.body.querySelector('[data-lax-share-in-view]');
        if (shareBtn) shareBtn.addEventListener('click', function () {
          openShare({ id: p.id, name: p.name, price: p.price, location: p.location, images: p.images, image: p.image }, shareBtn);
        });
      }).catch(function () {
        if (view !== v || token !== v.token) return;
        window.clearTimeout(v.timer);
        renderViewError(v, load);
      });
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        overlay.classList.add('is-open');
        panel.focus();
      });
    });

    load();
  }

  /* ------------------------------------------------------------------------
     Global click handling: share button + "cards don't open on click"
     ------------------------------------------------------------------------ */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.nodeType !== 1) t = t && t.parentElement;
    if (!t || isOurs(t)) return;

    var scope = scopeEl();
    if (!scope.contains(t)) return;

    // Share button on a card -> our centered share dialog
    var sb = closestShare(t);
    if (sb) {
      var card = cardFromShare(sb);
      if (card) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        decorate(card);
        openShare(baseProperty(card), card.querySelector('.lax-more'));
        return;
      }
    }

    // Any other click inside a card does nothing (no navigation)
    var inCard = t.closest('.lax-card');
    if (inCard) {
      var link = t.closest('a');
      if (link) e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Middle-click / context "open in new tab" on stripped links can't happen (href removed),
  // but keep auxclick from reaching card handlers too.
  document.addEventListener('auxclick', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('.lax-card') && !isOurs(t)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ------------------------------------------------------------------------
     Boot + re-render watching
     ------------------------------------------------------------------------ */
  var scheduled = false;
  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(function () { scheduled = false; enhance(); }, 40);
  }

  function relevantMutation(records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var n = added[j];
        if (n.nodeType !== 1) continue;
        if (isOurs(n)) continue;
        if (n.classList && (n.classList.contains('accoom-toast') || n.classList.contains('lax-empty'))) continue;
        return true;
      }
    }
    return false;
  }

  function boot() {
    enhance();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function (records) {
        if (relevantMutation(records)) scheduleEnhance();
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    document.addEventListener('accoom:listings-rendered', scheduleEnhance);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ------------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------------ */
  Accoom.ListingActions = {
    version: '1.0.0',
    configure: function (opts) {
      opts = opts || {};
      Object.keys(opts).forEach(function (k) { cfg[k] = opts[k]; });
      scheduleEnhance();
      return cfg;
    },
    enhance: enhance,
    getState: function (id) { var s = getStore(); return id == null ? s : (s[id] || null); },
    defaults: DEFAULTS
  };

})(window, document);