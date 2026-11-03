/* ==========================================================================
   ACCOOM — Partials Loader
   Include shared HTML chunks (header, footer, etc.) with a single line:
   <div data-partial="partials/footer.html"></div>
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  // HOW HEADER/FOOTER LOAD (two stages, so they appear first):
  //   1. Every page has a tiny inline "early partials" script in its <head>.
  //      It starts downloading header/footer at once and paints them the moment
  //      the mount point exists, long before the page's scripts have loaded.
  //      It marks painted elements with data-early.
  //   2. This file then finishes the job once the scripts are ready: for
  //      elements the early script painted, it only removes the data-partial
  //      attribute and fires 'partial:loaded' (so main.js, skeleton.js etc.
  //      still wire things up exactly as before). Anything the early script
  //      did not paint is loaded the normal way below.
  //
  // Header/footer are cached for the browser session. First page of a visit
  // fetches them; every page after that gets them instantly from the cache.
  // The cache is refreshed quietly in the background, so the NEXT page always
  // has the latest version without anything popping in on this one.
  var CACHE_PREFIX = 'accoom-partial:';

  function cacheGet(url) {
    try { return window.sessionStorage.getItem(CACHE_PREFIX + url); } catch (e) { return null; }
  }

  function cacheSet(url, html) {
    try { window.sessionStorage.setItem(CACHE_PREFIX + url, html); } catch (e) { /* full or blocked: ignore */ }
  }

  function fetchPartial(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('Failed to load partial: ' + url);
      return res.text();
    });
  }

  function inject(el, url, html) {
    el.innerHTML = html;
    el.removeAttribute('data-partial');
    Accoom.dispatch(document, 'partial:loaded', { url: url, el: el });
  }

  /**
   * Load a single partial into a target element
   */
  Accoom.loadPartial = function (el) {
    var url = el.getAttribute('data-partial');
    if (!url) return Promise.resolve();

    // Early script is handling (or has handled) this element.
    if (el.__early) {
      return el.__early.then(function () {
        if (el.hasAttribute('data-early')) {
          el.removeAttribute('data-early');
          el.removeAttribute('data-partial');
          Accoom.dispatch(document, 'partial:loaded', { url: url, el: el });
          return;
        }
        // Early load failed: fall back to the normal path.
        el.__early = null;
        return Accoom.loadPartial(el);
      });
    }

    var cached = cacheGet(url);
    if (cached) {
      inject(el, url, cached);
      // Refresh the cache for the next page; do not re-render this one.
      fetchPartial(url).then(function (html) { cacheSet(url, html); }, function () {});
      return Promise.resolve();
    }

    return fetchPartial(url)
      .then(function (html) {
        cacheSet(url, html);
        inject(el, url, html);
      })
      .catch(function (err) {
        console.warn(err);
      });
  };

  /**
   * Load every [data-partial] element on the page, including ones that
   * only appear after another partial injects them (e.g. header.html
   * contains its own nested [data-partial] rows for messages/
   * notifications). Keeps re-scanning until no new ones show up.
   * Resolves once ALL partials — nested or not — have been injected.
   */
  Accoom.loadPartials = function () {
    var MAX_PASSES = 5;

    // The header/footer are already painted by the early script, and this
    // function is called from an inline <script> that sits BEFORE main.js and
    // the page scripts. When the partials come from the session cache every
    // promise is already resolved, so 'partials:ready' used to fire before
    // main.js had registered its listener: the menu, messages and
    // notification icons then never got wired up (dead after a reload).
    // Waiting for DOMContentLoaded guarantees every script has registered.
    if (document.readyState === 'loading') {
      return new Promise(function (resolve) {
        document.addEventListener('DOMContentLoaded', function () {
          Accoom.loadPartials().then(resolve);
        }, { once: true });
      });
    }

    function loadPass(pass) {
      var targets = Accoom.$$('[data-partial]');
      if (!targets.length) return Promise.resolve();

      return Promise.all(targets.map(Accoom.loadPartial)).then(function () {
        var remaining = Accoom.$$('[data-partial]');
        if (remaining.length && pass < MAX_PASSES) {
          return loadPass(pass + 1);
        }
      });
    }

    return loadPass(1).then(function () {
      Accoom.dispatch(document, 'partials:ready');
    });
  };

})(window.Accoom);