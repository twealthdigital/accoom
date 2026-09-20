/* ==========================================================================
   ACCOOM — Skeleton Loading Helper
   Shared across every page. Fill a container with wireframe placeholders
   before real content is ready, then just overwrite it with the real
   markup when it lands, same as any other render call already does.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  // Every skeleton must stay on screen at least this long, so a fast
  // response doesn't just flash the placeholder for a frame. The fetch
  // itself is never delayed — only the swap to real content is.
  var MIN_VISIBLE_MS = 400;

  // Tracks when each container's skeleton went up, keyed by the element
  // itself so multiple skeletons on one page each get their own
  // independent minimum-display timer.
  var shownAt = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  // Built in shapes. Add more here as new sections need their own shape,
  // everything else about the system stays the same.
  var TEMPLATES = {
    listingCard: function () {
      return (
        '<div class="skeleton-card">' +
          '<div class="skeleton skeleton-card-media"></div>' +
          '<div class="skeleton-card-body">' +
            '<div class="skeleton skeleton-line is-wide"></div>' +
            '<div class="skeleton skeleton-line is-medium"></div>' +
            '<div class="skeleton skeleton-line is-short"></div>' +
          '</div>' +
        '</div>'
      );
    },
    line: function () {
      return '<div class="skeleton skeleton-line is-wide"></div>';
    },
    avatarRow: function () {
      return (
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="skeleton skeleton-circle" style="width:40px;height:40px;flex-shrink:0;"></div>' +
          '<div style="flex:1;"><div class="skeleton skeleton-line is-medium"></div></div>' +
        '</div>'
      );
    }
  };

  // Accoom.showSkeleton(container, 'listingCard', 8)
  // Fills `container` with `count` copies of the named shape. Call this
  // right before your fetch, then let the real render() overwrite
  // container.innerHTML the way it already does. No separate clear step.
  Accoom.showSkeleton = function (container, kind, count) {
    if (!container) return;
    var tpl = TEMPLATES[kind];
    if (!tpl) { console.error('Accoom.showSkeleton: unknown kind "' + kind + '"'); return; }
    var html = '';
    for (var i = 0; i < (count || 4); i++) html += tpl();
    container.innerHTML = html;
    if (shownAt) shownAt.set(container, Date.now());
  };

  // Accoom.hideSkeleton(container, function () { container.innerHTML = realHtml; })
  // Waits until the skeleton has been visible for at least MIN_VISIBLE_MS
  // (never longer than the data actually takes to arrive), then swaps in
  // the real content with a short fade — same box, same dimensions, no
  // layout jump. If a container was never shown via showSkeleton(),
  // renderFn just runs immediately.
  Accoom.hideSkeleton = function (container, renderFn) {
    if (!container) { if (typeof renderFn === 'function') renderFn(); return; }
    var startedAt = (shownAt && shownAt.get(container)) || 0;
    var elapsed = startedAt ? (Date.now() - startedAt) : MIN_VISIBLE_MS;
    var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    setTimeout(function () {
      container.classList.add('skeleton-swap-out');
      requestAnimationFrame(function () {
        if (typeof renderFn === 'function') renderFn();
        container.classList.remove('skeleton-swap-out');
        container.classList.add('skeleton-swap-in');
        setTimeout(function () {
          container.classList.remove('skeleton-swap-in');
        }, 320);
      });
    }, wait);
  };

  // Let any page file add its own shape, e.g:
  // Accoom.registerSkeleton('agentCard', function () { return '...'; });
  Accoom.registerSkeleton = function (kind, tplFn) {
    TEMPLATES[kind] = tplFn;
  };

  // ==========================================================================
  // v2 — exact-shape skeletons built from the site's OWN markup.
  //   Accoom.showSkeleton(el, 'self')  -> skeleton the real, already-rendered
  //                                       markup in place (same DOM, same CSS,
  //                                       so zero layout shift).
  //   Accoom.showSkeleton(el, kind, n) -> unchanged, template mode.
  //   Accoom.hideSkeleton(el, fn)      -> unchanged API; also cleans up 'self'
  //                                       mode and ignores stale/superseded calls.
  //   Accoom.skeletonRegion(elOrSel)   -> show 'self' now, hide after the 2s
  //                                       minimum (data already rendered).
  // ==========================================================================
  var _showBase = Accoom.showSkeleton;
  var _hideBase = Accoom.hideSkeleton;
  var TEMPLATE_OPTS = {};
  var BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEMPLATE: 1, NOSCRIPT: 1, BR: 1, WBR: 1, LINK: 1, META: 1, OPTION: 1, OPTGROUP: 1, SOURCE: 1, TRACK: 1, DATALIST: 1 };
  var HIDE_INPUTS = { checkbox: 1, radio: 1, range: 1, file: 1, color: 1 };

  function ownText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return true;
    }
    return false;
  }

  // A coloured icon tile (bg + only an <svg> inside) should read as a block too.
  function onlySvgChildren(el) {
    if (!el.firstElementChild) return false;
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!(typeof SVGElement !== 'undefined' && c instanceof SVGElement)) return false;
    }
    return true;
  }

  function hasVisibleBg(cs) {
    var c = cs.backgroundColor;
    var color = c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)';
    return !!color || (cs.backgroundImage && cs.backgroundImage !== 'none');
  }

  // Pass 1 measures everything, pass 2 applies classes, so one element's
  // new class can never change what the next element measures.
  function markInk(root) {
    var plan = [];
    var planned = [];
    var wrappers = [];
    var bgUrls = [];
    function add(el, cls, lh) {
      if (el.__skPlan) {
        var existing = el.__skPlan;
        if (cls.length && existing.cls.indexOf(cls[0]) === -1) existing.cls = existing.cls.concat(cls);
        return;
      }
      var entry = { el: el, cls: cls.slice(), lh: lh || 0, hadClass: el.hasAttribute('class') };
      el.__skPlan = entry;
      planned.push(el);
      plan.push(entry);
    }

    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = el.tagName;
      if (SKIP_TAGS[tag]) continue;
      if (typeof SVGElement !== 'undefined' && el instanceof SVGElement) {
        if (!el.ownerSVGElement) add(el, ['skeleton-hide']);
        continue;
      }
      var cs = window.getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;

      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME') {
        var parent = el.parentElement;
        var fills = cs.position === 'absolute' || cs.position === 'fixed' || tag === 'IFRAME';
        if (fills && parent && parent !== root) {
          add(el, ['skeleton-hide']);
          add(parent, ['skeleton-ink']);
          parent.__skWrap = true;
          wrappers.push(parent);
        } else {
          add(el, ['skeleton-ink', 'skeleton-media']);
        }
        continue;
      }

      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        var type = (el.type || 'text').toLowerCase();
        if (type === 'hidden') continue;
        if (HIDE_INPUTS[type]) add(el, ['skeleton-hide']);
        else add(el, ['skeleton-ink', 'skeleton-field']);
        continue;
      }

      var leaf = !el.firstElementChild;
      var text = ownText(el);
      var isBtn = tag === 'BUTTON' || el.getAttribute('role') === 'button' ||
        (tag === 'A' && /(^|\s)btn(\s|$)/.test(el.className || ''));

      if (!(text || isBtn || (leaf && hasVisibleBg(cs)) || (onlySvgChildren(el) && hasVisibleBg(cs)) || (!leaf && cs.backgroundImage && cs.backgroundImage !== 'none'))) continue;

      if (cs.backgroundImage && cs.backgroundImage.indexOf('url(') !== -1) bgUrls.push(cs.backgroundImage);
      var cls = ['skeleton-ink'];
      var lh = 0;
      if (parseFloat(cs.borderTopLeftRadius) === 0) cls.push('skeleton-round');

      if (text && !isBtn) {
        var line = parseFloat(cs.lineHeight);
        if (isNaN(line)) line = parseFloat(cs.fontSize) * 1.2;
        var inner = el.getBoundingClientRect().height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
        var isBlock = cs.display === 'block' || cs.display === 'list-item' || cs.display === 'flow-root';
        if (leaf && isBlock && line > 0 && inner >= line * 1.6) {
          cls.push('skeleton-lines');
          lh = line;
        } else if (isBlock && el.parentElement && window.getComputedStyle(el.parentElement).display === 'block') {
          cls.push('skeleton-fit');
          if (cs.textAlign === 'center') cls.push('skeleton-fit-c');
          else if (cs.textAlign === 'right' || cs.textAlign === 'end') cls.push('skeleton-fit-r');
        }
      }
      add(el, cls, lh);
    }

    // Badges, buttons and dots that sit on top of an image are simply part of
    // that image block, so hide them instead of drawing a second shimmer.
    for (var q = 0; q < plan.length; q++) {
      var cand = plan[q];
      if (cand.el.__skWrap || cand.cls.indexOf('skeleton-ink') === -1) continue;
      for (var up = cand.el.parentElement; up && up !== root; up = up.parentElement) {
        if (up.__skWrap) { cand.cls = ['skeleton-hide']; cand.lh = 0; break; }
      }
    }
    for (var w = 0; w < wrappers.length; w++) delete wrappers[w].__skWrap;

    for (var p = 0; p < plan.length; p++) {
      var item = plan[p];
      for (var c = 0; c < item.cls.length; c++) item.el.classList.add(item.cls[c]);
      if (item.lh) item.el.style.setProperty('--sk-lh', item.lh + 'px');
      delete item.el.__skPlan;
    }
    plan.bgUrls = bgUrls;
    return plan;
  }

  function clearInk(container) {
    var marks = container.__skMarks;
    if (marks) {
      for (var i = 0; i < marks.length; i++) {
        var m = marks[i];
        for (var c = 0; c < m.cls.length; c++) m.el.classList.remove(m.cls[c]);
        if (m.lh) {
          m.el.style.removeProperty('--sk-lh');
          if (!m.el.getAttribute('style')) m.el.removeAttribute('style');
        }
        if (!m.hadClass && !m.el.getAttribute('class')) m.el.removeAttribute('class');
      }
    }
    container.__skMarks = null;
    container.classList.remove('skeleton-scope');
    if (!container.__skHadClass && !container.getAttribute('class')) container.removeAttribute('class');
    container.removeAttribute('aria-busy');
  }

  function startScope(container) {
    container.__skHadClass = container.hasAttribute('class');
    container.__skMarks = markInk(container);
    container.classList.add('skeleton-scope');
    container.setAttribute('aria-busy', 'true');
  }

  Accoom.showSkeleton = function (container, kind, count) {
    if (!container) return;
    if (kind === 'self') {
      if (container.__skMarks) return;
      container.__skOn = true;
      container.__skSelf = true;
      startScope(container);
      if (shownAt) shownAt.set(container, Date.now());
      container.__skToken = (container.__skToken || 0) + 1;
      return;
    }
    if (container.__skMarks) { container.__skSelf = false; clearInk(container); }
    container.__skOn = true;
    container.__skToken = (container.__skToken || 0) + 1;
    // Big-app behaviour: only put the skeleton up if the content is still not
    // ready after SHOW_DELAY_MS. If hideSkeleton() comes first, it never shows.
    clearTimeout(container.__skTimer);
    container.__skTimer = setTimeout(function () {
      container.__skTimer = null;
      _showBase(container, kind, count);
      if (TEMPLATE_OPTS[kind] && TEMPLATE_OPTS[kind].ink) startScope(container);
    }, SHOW_DELAY_MS);
  };

  Accoom.hideSkeleton = function (container, renderFn) {
    if (!container) { _hideBase(container, renderFn); return; }
    // No skeleton up (never shown, or already cleared): nothing to wait for.
    // Content was ready before the skeleton was due to appear: skip it entirely.
    if (container.__skTimer) {
      clearTimeout(container.__skTimer);
      container.__skTimer = null;
      container.__skOn = false;
      if (typeof renderFn === 'function') renderFn();
      return;
    }
    if (!container.__skOn) { if (typeof renderFn === 'function') renderFn(); return; }
    var token = container.__skToken;

    // In-place skeletons have nothing to swap, so no fade-out is needed:
    // wait out the 2s minimum, drop the skeleton classes, done.
    if (container.__skSelf) {
      var since = (shownAt && shownAt.get(container)) || 0;
      var remaining = since ? Math.max(0, MIN_VISIBLE_MS - (Date.now() - since)) : 0;
      setTimeout(function () {
        if (container.__skToken !== token) return;
        container.__skSelf = false;
        container.__skOn = false;
        clearInk(container);
        if (typeof renderFn === 'function') renderFn();
        container.classList.add('skeleton-swap-in');
        setTimeout(function () {
          container.classList.remove('skeleton-swap-in');
          if (!container.__skHadClass && !container.getAttribute('class')) container.removeAttribute('class');
        }, 320);
      }, remaining);
      return;
    }

    _hideBase(container, function () {
      if (container.__skToken !== token) return;
      container.__skOn = false;
      clearInk(container);
      if (typeof renderFn === 'function') renderFn();
    });
  };

  // Synchronous, no-wait clear. Use it right before you overwrite a
  // skeleton'd container yourself, from code that already waited the 2s.
  Accoom.clearSkeleton = function (container) {
    if (!container) return;
    container.__skSelf = false;
    container.__skOn = false;
    clearInk(container);
  };

  // How long a skeleton may wait for images before giving up (failsafe).
  var ASSET_WAIT_MAX_MS = 8000;
  // A skeleton only appears if content is still not ready after this long.
  var SHOW_DELAY_MS = 150;

  // Counts what is genuinely still loading inside a skeleton region (images
  // near the top of the page and CSS background images) and calls done()
  // once all of it has loaded or failed. Returns how many things are pending.
  function watchAssets(root, done) {
    var pending = 0;
    var finished = false;
    var timer = null;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      done();
    }
    function track(target) {
      pending++;
      var fired = false;
      var once = function () {
        if (fired) return;
        fired = true;
        pending--;
        if (pending <= 0) finish();
      };
      target.addEventListener('load', once);
      target.addEventListener('error', once);
    }

    var viewport = window.innerHeight || 800;
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.complete || !img.getClientRects().length) continue;
      var top = img.getBoundingClientRect().top;
      if (top > viewport * 2 || (img.loading === 'lazy' && top > viewport)) continue;
      track(img);
    }
    var bgs = (root.__skMarks && root.__skMarks.bgUrls) || [];
    var seen = {};
    for (var b = 0; b < bgs.length; b++) {
      var re = /url\((['"]?)(.*?)\1\)/g;
      var m;
      while ((m = re.exec(bgs[b]))) {
        if (seen[m[2]]) continue;
        seen[m[2]] = true;
        var probe = new Image();
        track(probe);
        probe.src = m[2];
      }
    }
    if (!pending) return 0;
    timer = setTimeout(finish, ASSET_WAIT_MAX_MS);
    return pending;
  }

  Accoom.skeletonRegion = function (target) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    Accoom.showSkeleton(el, 'self');
    // Big-app behaviour: the skeleton lasts exactly as long as something is
    // really loading. Nothing loading -> no skeleton at all.
    var pending = watchAssets(el, function () { Accoom.hideSkeleton(el); });
    if (!pending) Accoom.clearSkeleton(el);
  };

  Accoom.registerSkeleton = function (kind, tplFn, opts) {
    TEMPLATES[kind] = tplFn;
    TEMPLATE_OPTS[kind] = opts || {};
  };

  // Property card — the real .listing-card markup from home.js with
  // placeholder text, so the grid cell is exactly as tall/wide as a real one.
  Accoom.registerSkeleton('listingCard', function () {
    return (
      '<article class="listing-card">' +
        '<div class="listing-card-media">' +
          '<img class="media-slide is-active" src="' + BLANK_GIF + '" alt="" />' +
        '</div>' +
        '<div class="listing-card-body">' +
          '<p class="listing-name">3 Bedroom Flat, Surulere, Lagos</p>' +
          '<p class="listing-price">&#8358;205,000 <small>/yr</small></p>' +
          '<p class="listing-location">Surulere, Lagos</p>' +
          '<div class="listing-meta">' +
            '<span>2 Bed</span><span>1 Bath</span>' +
            '<span class="listing-share-wrap"><button type="button" class="listing-share" tabindex="-1"></button></span>' +
          '</div>' +
          '<div class="listing-agent">' +
            '<div class="listing-agent-id">' +
              '<span class="listing-agent-avatar"><img src="' + BLANK_GIF + '" alt="" /></span>' +
              '<span class="listing-agent-name">StayWell Agents</span>' +
            '</div>' +
            '<span class="listing-rating">4.9 (210)</span>' +
          '</div>' +
          '<div class="listing-agent-level-row">' +
            '<span class="listing-agent-level level-al1">AL1</span>' +
            '<button type="button" class="listing-view-btn" tabindex="-1"><span>View</span></button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }, { ink: true });



  // Whole-page skeleton. Every page shows a skeleton of everything visible
  // (header, footer, every section, every image) for the 2s minimum, drawn
  // from the page's own markup. Sections that run their own loading
  // lifecycle (the home listings grid) are left out of this pass so they
  // are not skeletonized twice.
  var NEVER_ROOT = /overlay|modal|lightbox|toast|dialog|drawer|panel/i;
  var PAGE_SKIP = { 'home.html': ['all-listings'] };                       // element ids
  var PAGE_EXTRA = { 'home.html': ['.all-listings .listings-header'] };    // selectors
  var partialMounts = [];

  document.addEventListener('partial:loaded', function (e) {
    if (e.detail && e.detail.el) partialMounts.push(e.detail.el);
  });

  function usableRoot(el) {
    if (!el || el.nodeType !== 1) return false;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|LINK|META)$/.test(el.tagName)) return false;
    if (el.id === 'load-page' || el.__skOn || el.hasAttribute('data-partial')) return false;
    if (typeof el.className === 'string' && NEVER_ROOT.test(el.className)) return false;
    if (el.getAttribute('role') === 'dialog') return false;
    return true;
  }

  // A wrapper with display:contents has no box of its own, so its children
  // become the skeleton roots instead.
  function collectRoots(el, out) {
    if (!usableRoot(el)) return;
    if (window.getComputedStyle(el).display === 'contents') {
      for (var i = 0; i < el.children.length; i++) collectRoots(el.children[i], out);
      return;
    }
    out.push(el);
  }

  function initPageSkeleton() {
    return; // replaced by per-element skeletons (see the end of this file)
    var page = (window.location.pathname.split('/').pop() || 'home.html').toLowerCase();
    var skip = PAGE_SKIP[page] || [];
    var roots = [];
    for (var i = 0; i < document.body.children.length; i++) {
      var child = document.body.children[i];
      if (partialMounts.indexOf(child) !== -1 || skip.indexOf(child.id) !== -1) continue;
      collectRoots(child, roots);
    }
    (PAGE_EXTRA[page] || []).forEach(function (sel) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        if (usableRoot(el)) roots.push(el);
      });
    });
    roots.forEach(function (el) { Accoom.skeletonRegion(el); });
  }

  // Header / footer arrive via fetch, so they get their skeleton the moment
  // they are in the page (after main.js has finished wiring them up).
  function initPartialSkeletons() {
    return; // replaced by per-element skeletons (see the end of this file)
    var roots = [];
    partialMounts.forEach(function (mount) {
      for (var i = 0; i < partialMounts.length; i++) {
        if (partialMounts[i] !== mount && partialMounts[i].contains(mount)) return;
      }
      collectRoots(mount, roots);
    });
    roots.forEach(function (el) { Accoom.skeletonRegion(el); });
  }

  // Run after the page's own Accoom.ready() callbacks, so they have
  // already rendered the real content the skeleton is drawn from.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(initPageSkeleton, 0); });
  } else {
    setTimeout(initPageSkeleton, 0);
  }
  document.addEventListener('partials:ready', function () { setTimeout(initPartialSkeletons, 0); });

  // ==========================================================================
  // Per-element loading skeletons (the way big apps do it). Every image, map,
  // video and CSS background image gets its OWN skeleton while it is still
  // loading, and swaps to the real thing the moment that one is ready.
  // Nothing waits on anything else and nothing is timed.
  // ==========================================================================
  var FRAME_FAILSAFE_MS = 6000;

  function noteClass(el) {
    if (el.__skHad === undefined) el.__skHad = el.hasAttribute('class');
  }

  function dropClass(el, cls) {
    el.classList.remove(cls);
    if (!el.__skHad && !el.getAttribute('class')) el.removeAttribute('class');
  }

  function watchImage(img) {
    if (img.__skImg) return;
    // Already there (cached or broken) or no source yet: nothing to wait for.
    if (img.complete || !(img.getAttribute('src') || img.getAttribute('srcset'))) return;
    // A lazy image with no box (display:none) will not load, so do not wait for it.
    if (img.loading === 'lazy' && !img.getClientRects().length) return;
    img.__skImg = true;
    noteClass(img);
    img.classList.add('sk-pending');
    var finish = function () {
      img.removeEventListener('load', finish);
      img.removeEventListener('error', finish);
      img.__skImg = false;
      dropClass(img, 'sk-pending');
    };
    img.addEventListener('load', finish);
    img.addEventListener('error', finish);
  }

  // Maps (iframes) and videos: the skeleton sits on their container and the
  // frame paints over it as soon as it has content.
  function watchFrame(el) {
    if (el.__skFrame) return;
    var box = el.parentElement;
    if (!box) return;
    if (el.tagName === 'VIDEO' && el.readyState >= 2) return;
    if (!el.getClientRects().length) return;   // hidden (closed modal, inactive slide)
    if (!el.getAttribute('src') && !el.querySelector('source')) return;   // nothing to load yet
    el.__skFrame = true;
    noteClass(box);
    box.classList.add('sk-pending-box');
    var events = ['load', 'error', 'loadeddata'];
    var timer = null;
    var finish = function () {
      clearTimeout(timer);
      for (var i = 0; i < events.length; i++) el.removeEventListener(events[i], finish);
      el.__skFrame = false;
      dropClass(box, 'sk-pending-box');
    };
    for (var i = 0; i < events.length; i++) el.addEventListener(events[i], finish);
    timer = setTimeout(finish, FRAME_FAILSAFE_MS);
  }

  function watchBackground(el, probes) {
    noteClass(el);
    el.classList.add('sk-pending-bg');
    var left = probes.length;
    var one = function () {
      left--;
      if (left <= 0) dropClass(el, 'sk-pending-bg');
    };
    for (var i = 0; i < probes.length; i++) {
      probes[i].addEventListener('load', one);
      probes[i].addEventListener('error', one);
    }
  }

  // CSS background images (hero photos, banners...) have no load event of
  // their own, so preload the same URL and watch that instead.
  function scanBackgrounds(root) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.__skBg || SKIP_TAGS[el.tagName]) continue;
      var bg = window.getComputedStyle(el).backgroundImage;
      if (!bg || bg.indexOf('url(') === -1) continue;
      el.__skBg = true;
      var re = /url\((['"]?)(.*?)\1\)/g;
      var m;
      var probes = [];
      while ((m = re.exec(bg))) {
        if (/^data:/.test(m[2])) continue;
        var probe = new Image();
        probe.src = m[2];
        if (!probe.complete) probes.push(probe);
      }
      if (probes.length) watchBackground(el, probes);
    }
  }

  function watchTree(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.tagName === 'IMG') watchImage(node);
    else if (node.tagName === 'IFRAME' || node.tagName === 'VIDEO') watchFrame(node);
    if (!node.querySelectorAll) return;
    var found = node.querySelectorAll('img, iframe, video');
    for (var i = 0; i < found.length; i++) {
      if (found[i].tagName === 'IMG') watchImage(found[i]);
      else watchFrame(found[i]);
    }
  }

  function startAssetSkeletons() {
    watchTree(document.documentElement);
    scanBackgrounds(document.body);
    if (typeof MutationObserver === 'undefined') return;
    // New images and changed sources are caught before the browser paints.
    new MutationObserver(function (records) {
      for (var r = 0; r < records.length; r++) {
        var rec = records[r];
        if (rec.type === 'attributes') {
          if (rec.target.tagName === 'IMG') watchImage(rec.target);
          else if (rec.target.tagName === 'IFRAME' || rec.target.tagName === 'VIDEO') { rec.target.__skFrame = false; watchFrame(rec.target); }
        } else {
          for (var n = 0; n < rec.addedNodes.length; n++) watchTree(rec.addedNodes[n]);
        }
      }
    }).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset']
    });
  }

  document.addEventListener('DOMContentLoaded', function () { scanBackgrounds(document.body); });
  document.addEventListener('partial:loaded', function (e) {
    if (e.detail && e.detail.el) scanBackgrounds(e.detail.el);
  });
  if (document.body) startAssetSkeletons();
  else document.addEventListener('DOMContentLoaded', startAssetSkeletons);

  // For data that really is fetched: cover just this element while the
  // promise is pending. Nothing shows if the data arrives within
  // SHOW_DELAY_MS, and once shown it stays a moment so it cannot flash.
  //   Accoom.skeletonUntil(document.querySelector('[data-name]'), fetch(url));
  Accoom.skeletonUntil = function (target, work) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    var shown = false;
    var timer = setTimeout(function () {
      shown = true;
      Accoom.showSkeleton(el, 'self');
    }, SHOW_DELAY_MS);
    var end = function () {
      clearTimeout(timer);
      if (shown) Accoom.hideSkeleton(el);
    };
    Promise.resolve(work).then(end, end);
  };

})(window.Accoom);