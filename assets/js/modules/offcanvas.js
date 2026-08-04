/* ==========================================================================
   ACCOOM — Off-Canvas Panel Module
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize an off-canvas panel
   */
  Accoom.initOffCanvas = function (triggerEl, panelEl, overlayEl, closeEl, options) {
    if (!triggerEl || !panelEl || !overlayEl) return;

    var openClass = (options && options.openClass) || 'is-open';
    var visibleClass = (options && options.visibleClass) || 'is-visible';
    var lockClass = (options && options.lockClass) || 'no-scroll';
    var breakpoint = (options && options.breakpoint) || 992;

    function open() {
      panelEl.classList.add(openClass);
      overlayEl.classList.add(visibleClass);
      document.body.classList.add(lockClass);
      triggerEl.setAttribute('aria-expanded', 'true');
      Accoom.dispatch(document, 'panel:open');
    }

    function close() {
      panelEl.classList.remove(openClass);
      overlayEl.classList.remove(visibleClass);
      document.body.classList.remove(lockClass);
      triggerEl.setAttribute('aria-expanded', 'false');
      Accoom.dispatch(document, 'panel:close');
    }

    function isOpen() {
      return panelEl.classList.contains(openClass);
    }

    // Open trigger - FIXED to prevent multiple bindings
    Accoom.on(triggerEl, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      isOpen() ? close() : open();
    });

    // Close button
    if (closeEl) {
      Accoom.on(closeEl, 'click', function (e) {
        e.preventDefault();
        close();
      });
    }

    // Overlay click
    Accoom.on(overlayEl, 'click', function (e) {
      if (e.target === overlayEl) {
        close();
      }
    });

    // Escape key
    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });

    // Window resize - close if going above breakpoint
    var resizeHandler = Accoom.throttle(function () {
      if (window.innerWidth >= breakpoint && isOpen()) {
        close();
      }
    }, 100);

    Accoom.on(window, 'resize', resizeHandler);

    return {
      open: open,
      close: close,
      isOpen: isOpen
    };
  };

})(window.Accoom);