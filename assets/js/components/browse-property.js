/* ==========================================================================
   ACCOOM — Browse Property Overlay
   Reusable across every page. Requires:
   - partials/browse-property.html included via [data-partial] (on home)
   - assets/js/data/properties.js loaded before this file
   - the shared .panel-overlay backdrop already present on the page
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  function formatPrice(price) {
    return '₦' + price.toLocaleString('en-NG');
  }

  function cardHTML(item) {
    var img = (item.images && item.images[0]) || 'assets/images/home-properties/placeholder.png';
    return (
      '<a class="browse-result" href="property.html?id=' + encodeURIComponent(item.id) +
      '&name=' + encodeURIComponent(item.name) + '" data-browse-result-id="' + item.id + '">' +
        '<span class="browse-result-thumb" style="background-image:url(\'' + img + '\')"></span>' +
        '<span class="browse-result-body">' +
          '<span class="browse-result-name">' + item.name + '</span>' +
          '<span class="browse-result-meta">' + item.location + ' &middot; ' + item.beds + ' bed</span>' +
        '</span>' +
        '<span class="browse-result-price">' + formatPrice(item.price) + '</span>' +
      '</a>'
    );
  }

  function renderResults(listEl, emptyEl, items) {
    listEl.innerHTML = items.map(cardHTML).join('');
    emptyEl.classList.toggle('is-visible', items.length === 0);
  }

  function getCatalogue() {
    return (Accoom.PropertyService && Accoom.PropertyService.getAll()) || [];
  }

  // Delegates to the ONE smart parser (price intent, bedroom count,
  // multi-token AND, "cheap"/"expensive") that lives in properties.js,
  // so this dropdown and the main grid never disagree on what a query
  // means. Falls back to a plain substring match only if PropertyService
  // hasn't loaded yet.
  function filterItems(all, query) {
    if (Accoom.PropertyService && Accoom.PropertyService.searchList) {
      return Accoom.PropertyService.searchList(all, query).items;
    }
    var q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(function (item) {
      return (item.name + ' ' + item.location).toLowerCase().indexOf(q) !== -1;
    });
  }

  var scrollLockMinY = null;
  var touchStartY = null;

  function clampBrowseScroll() {
    if (scrollLockMinY == null) return;
    if (window.scrollY < scrollLockMinY) {
      window.scrollTo(0, scrollLockMinY);
    }
  }

  function handleBrowseTouchStart(e) {
    if (scrollLockMinY == null) return;
    touchStartY = e.touches[0].clientY;
  }

  function handleBrowseTouchMove(e) {
    if (scrollLockMinY == null || touchStartY == null) return;
    var currentY = e.touches[0].clientY;
    var draggingDown = currentY > touchStartY;
    // Re-check direction from THIS move, not just the original touch
    // point, so a drag that changes direction mid-gesture is still
    // caught. Block the instant we're at (or past) the wall and the
    // finger is trying to pull further down.
    if (draggingDown && window.scrollY <= scrollLockMinY) {
      e.preventDefault();
      // Snap immediately rather than waiting for the next scroll
      // event, so no momentum can build from this frame onward.
      if (window.scrollY < scrollLockMinY) {
        window.scrollTo(0, scrollLockMinY);
      }
    }
    touchStartY = currentY;
  }

  Accoom.initBrowseSearch = function () {
    var triggers = Accoom.$$('[data-browse-trigger]');
    if (!triggers.length) return;

    var overlay = document.querySelector('[data-browse-overlay]');
    var backdrop = document.querySelector('[data-panel-overlay]');

    // No overlay on this page (e.g. not home): Browse just jumps to home.
    if (!overlay || !backdrop) {
      if (document.body.getAttribute('data-browse-nav-init') === 'true') return;
      document.body.setAttribute('data-browse-nav-init', 'true');
      triggers.forEach(function (trigger) {
        Accoom.on(trigger, 'click', function (e) {
          e.preventDefault();
          try { sessionStorage.setItem('accoom-open-browse', '1'); } catch (_) {}
          window.location.href = 'home.html';
        });
      });
      return;
    }

    // This runs once on ready AND again after every partial load
    // (footer, notifications, browse...). Without this guard each run
    // binds ANOTHER click handler to the same triggers, so a single
    // click on Browse toggled open→close→open→close and the overlay
    // appeared to never open. Bind listeners exactly once.
    if (overlay.getAttribute('data-browse-init') === 'true') return;
    overlay.setAttribute('data-browse-init', 'true');

    var input = overlay.querySelector('[data-browse-input]');
    var closeBtn = overlay.querySelector('[data-browse-close]');
    var listEl = overlay.querySelector('[data-browse-results]');
    var emptyEl = overlay.querySelector('[data-browse-empty]');

    if (!input || !listEl || !emptyEl) {
      console.error('browse-property.html markup is missing an expected element (data-browse-input / data-browse-results / data-browse-empty). Trigger click will still open the overlay but search list will not render.');
    }

    // Keeps the nav in sync with the overlay: Browse lights up while the
    // bar is open, Home lights back up once it's closed.
    function setBrowseNavActive(isOpen) {
      var homeLinks = document.querySelectorAll('.nav-links a[href="home.html"], .panel-nav a[href="home.html"]');
      homeLinks.forEach(function (link) {
        link.classList.toggle('active', !isOpen);
      });
      triggers.forEach(function (trigger) {
        trigger.classList.toggle('active', isOpen);
      });
    }

    // Opening Browse shows the full listings (just like scrolling to
    // "All Property Listings" on home). Results appear / refine as you type.
    function clearResults() {
      if (listEl) listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('is-visible');
    }

    // Measures the real, current gap between the header and the actual
    // "All Property Listings" section, and sizes the mask to match it
    // exactly — no assumptions about scroll math, so it's always 100%
    // accurate regardless of page height, image load timing, or breakpoint.
    function updateMask() {
      var maskEl = overlay.querySelector('[data-browse-mask]');
      if (!maskEl) return;
      var sectionEl = document.querySelector('[data-listings-grid]') || document.querySelector('.listings-grid');
      if (!sectionEl) { maskEl.style.height = '0px'; return; }
      var headerEl = document.querySelector('.site-header');
      var headerHeight = headerEl ? headerEl.offsetHeight : 0;
      var gap = sectionEl.getBoundingClientRect().top - headerHeight;
      maskEl.style.height = Math.max(gap, 0) + 'px';
    }

    function open(e) {
      if (e && e.preventDefault) e.preventDefault();

      // From anywhere other than home, jump to home and auto-open there.
      var onHome = /(home\.html|index\.html)$/i.test(location.pathname) || location.pathname.endsWith('/');
      if (!onHome) {
        try { sessionStorage.setItem('accoom-open-browse', '1'); } catch (_) {}
        window.location.href = 'home.html';
        return;
      }

      // If Browse was triggered from inside the mobile hamburger side
      // panel, slide that panel shut first so it isn't left open behind
      // the search overlay (they share the same backdrop element).
      var sidePanel = document.querySelector('[data-panel]');
      if (sidePanel && sidePanel.classList.contains('is-open')) {
        sidePanel.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
        // The backdrop is the SAME element as our own `backdrop` var
        // (data-panel-overlay). It has to be cleared here too, not just
        // the panel itself, or it's left "is-visible" and only hidden by
        // the .browse-property-locked CSS rule below. Once Browse closes
        // and that rule stops applying, this backdrop pops back up and
        // blocks every tap until the user taps it once to dismiss it.
        if (backdrop) backdrop.classList.remove('is-visible');
        var hamburgerBtn = document.querySelector('[data-panel-open]');
        if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'false');
      }

      overlay.classList.add('is-open');
      setBrowseNavActive(true);
      // Don't light up the shared panel-overlay backdrop here — it dims
      // the WHOLE page, and we only want the header (above the search
      // bar) darkened. That's handled entirely by browse-property.css now.
      document.body.classList.add('browse-property-locked');
      if (input) input.value = '';

      // Show every listing immediately, as if the section were scrolled to.
      if (listEl) renderResults(listEl, emptyEl, getCatalogue());

      // Keep the real section aligned behind the blur for continuity.
      // scrollIntoView's "start" lines the section up flush with the
      // viewport top, but the fixed header then covers the first chunk
      // of it — so raise the stop point by the header's height (plus a
      // little breathing room). Tweak SCROLL_OFFSET if it still looks off.
        var section = document.querySelector('[data-listings-grid]') || document.querySelector('.listings-grid');
      if (section) {
        // Just a small nudge downward, not a jump toward the section.
        // The mask/collapse further below is what actually reveals it.
        var OPEN_NUDGE = 260; // px, same on every breakpoint
        var targetY = window.pageYOffset + OPEN_NUDGE;
        scrollLockMinY = Math.max(targetY, 0);
        window.scrollTo({ top: scrollLockMinY, behavior: 'smooth' });

        // Wait for the smooth scroll to actually finish before removing
        // the sections above — collapsing early would shrink the page
        // mid-scroll and cut the animation short.
        window.clearTimeout(Accoom._browseCollapseTimer);
        Accoom._browseCollapseTimer = window.setTimeout(function () {
          var overlayHeight = overlay.offsetHeight;
          document.documentElement.style.setProperty('--browse-overlay-h', overlayHeight + 'px');
          document.body.classList.add('browse-sections-collapsed');
          // Height just changed (sections removed) — re-pin exactly at
          // the top of the listings section now that it's page-top.
          window.scrollTo(0, 0);
          scrollLockMinY = 0;
        }, 450);
      }

      Accoom.on(window, 'scroll', clampBrowseScroll);
      document.documentElement.classList.add('browse-scroll-walled');
      document.addEventListener('touchstart', handleBrowseTouchStart, { passive: true });
      document.addEventListener('touchmove', handleBrowseTouchMove, { passive: false });

      // Keep the mask locked to the section's real position at all
      // times — this stays accurate even while the smooth scroll is
      // still animating, or if the page height shifts as images/video
      // finish loading.
      updateMask();
      Accoom.on(window, 'scroll', updateMask);
      Accoom.on(window, 'resize', updateMask);

      if (input) input.focus();
    }

    function close() {
      overlay.classList.remove('is-open');
      setBrowseNavActive(false);
      document.body.classList.remove('browse-property-locked');
      if (input) input.value = '';
      clearResults();
      Accoom.off(window, 'scroll', updateMask);
      Accoom.off(window, 'resize', updateMask);
      Accoom.off(window, 'scroll', clampBrowseScroll);
      document.documentElement.classList.remove('browse-scroll-walled');
      document.removeEventListener('touchstart', handleBrowseTouchStart);
      document.removeEventListener('touchmove', handleBrowseTouchMove);
      window.clearTimeout(Accoom._browseCollapseTimer);

      // Bring the hidden sections back — restores real page height and
      // layout. No scroll-back animation; the page just stays where it
      // is once the sections reappear.
      document.body.classList.remove('browse-sections-collapsed');
      document.documentElement.style.removeProperty('--browse-overlay-h');

      scrollLockMinY = null;
      touchStartY = null;
      var maskEl = overlay.querySelector('[data-browse-mask]');
      if (maskEl) maskEl.style.height = '0px';
    }

    triggers.forEach(function (trigger) {
      Accoom.on(trigger, 'click', function (e) {
        if (overlay.classList.contains('is-open')) close();
        else open(e);
      });
    });

    Accoom.on(backdrop, 'click', function () {
      if (overlay.classList.contains('is-open')) close();
    });

    // Clicking the blury dark area (not the bar/results) also closes.
    Accoom.on(overlay, 'click', function (e) {
      if (e.target === overlay || e.target.classList.contains('browse-property-inner')) {
        close();
      }
    });

    if (closeBtn) Accoom.on(closeBtn, 'click', close);

    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    Accoom.on(input, 'input', Accoom.debounce(function () {
      var query = input.value.trim();
      // Live-filter the dropdown list itself using the shared smart
      // matcher — this is what makes results narrow as you type.
      if (listEl && emptyEl) {
        renderResults(listEl, emptyEl, filterItems(getCatalogue(), query));
      }
      // Also drive the real listings grid behind the overlay so it's
      // already correct the moment the overlay closes.
      if (Accoom.setListingsSearch) Accoom.setListingsSearch(query);
    }, 150));

    // Pressing Enter COMMITS the search: jump straight to the grid and
    // narrow the filter panel's own options (price range, bed pills,
    // agent levels) down to only what actually exists among the
    // matches — so visitors only ever get offered filters that work.
    Accoom.on(input, 'keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var query = input.value.trim();
      if (Accoom.syncFilterAvailability) Accoom.syncFilterAvailability(query);
      if (Accoom.setListingsSearch) Accoom.setListingsSearch(query);
      // Bar stays open, just commit the filter. It used to call close()
      // here, which dumped the user back to the top of the page.
    });

    if (listEl) {
      Accoom.delegate(listEl, 'click', '[data-browse-result-id]', function () {
        var id = this.getAttribute('data-browse-result-id');
        var item = Accoom.PropertyService.getById(id);
        if (item) Accoom.setStorage('accoom-active-listing', item);
      });
    }
  };

  Accoom.ready(function () {
    // Wait until every partial (including browse-property.html) is actually
    // in the DOM before deciding whether this page has an overlay. Running
    // this earlier caused it to wrongly conclude "no overlay" and bind a
    // permanent force-navigate-to-home.html handler, which then stacked
    // with the real handler once the partial loaded — causing every click
    // to reload the page instead of opening the panel.
    Accoom.on(document, 'partials:ready', function () {
      Accoom.initBrowseSearch();
    });

    // If we arrived from another page with the intent to browse, open it.
    // If we arrived from another page with the intent to browse, open it.
    Accoom.on(document, 'partials:ready', function () {
      try {
        if (!sessionStorage.getItem('accoom-open-browse')) return;
        sessionStorage.removeItem('accoom-open-browse');

        function clickBrowseTrigger() {
          var trg = document.querySelector('[data-browse-trigger]');
          if (trg) trg.click();
        }

        // Open immediately — don't wait for every image to finish
        // downloading. The open() flow itself scrolls to an estimate,
        // then hard-pins to the very top once the sections above are
        // collapsed 450ms later — that pin is the final resting spot
        // regardless of image/layout timing, so no separate re-scroll
        // is needed here (it was causing a visible double-scroll).
        clickBrowseTrigger();
      } catch (_) {}
    });
  });

})(window.Accoom);