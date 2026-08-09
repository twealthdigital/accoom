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
   * Load every [data-partial] element on the page.
   * Resolves once ALL partials have been injected.
   */
  Accoom.loadPartials = function () {
    var targets = Accoom.$$('[data-partial]');
    return Promise.all(targets.map(Accoom.loadPartial)).then(function () {
      Accoom.dispatch(document, 'partials:ready');
    });
  };

})(window.Accoom);