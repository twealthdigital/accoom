/* ==========================================================================
   ACCOOM — Partials Loader
   Include shared HTML chunks (header, footer, etc.) with a single line:
   <div data-partial="partials/footer.html"></div>
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Load a single partial into a target element
   */
  Accoom.loadPartial = function (el) {
    var url = el.getAttribute('data-partial');
    if (!url) return Promise.resolve();

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load partial: ' + url);
        return res.text();
      })
      .then(function (html) {
        el.innerHTML = html;
        el.removeAttribute('data-partial');
        Accoom.dispatch(document, 'partial:loaded', { url: url, el: el });
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