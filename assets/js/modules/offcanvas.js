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

    // Swipe-to-close (touch) — waits until the gesture clearly commits
    // to an axis before doing anything, so it never fights the panel's
    // own vertical scroll (.panel-scroll).
    (function initSwipeToClose() {
      var startX = 0, startY = 0, currentX = 0, dragging = null, panelWidth = 0;

      Accoom.on(panelEl, 'touchstart', function (e) {
        if (!isOpen()) return;
        var t = e.touches[0];
        startX = currentX = t.clientX;
        startY = t.clientY;
        dragging = null;
        panelWidth = panelEl.offsetWidth;
        panelEl.style.transition = 'none';
      }, { passive: true });

      Accoom.on(panelEl, 'touchmove', function (e) {
        if (!isOpen()) return;
        var t = e.touches[0];
        var dx = t.clientX - startX;
        var dy = t.clientY - startY;

        if (dragging === null) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          dragging = Math.abs(dx) > Math.abs(dy) && dx > 0;
          if (!dragging) return;
        }
        if (!dragging) return;

        e.preventDefault();
        currentX = t.clientX;
        panelEl.style.transform = 'translateX(' + Math.max(0, dx) + 'px)';
      }, { passive: false });

      Accoom.on(panelEl, 'touchend', function () {
        if (!isOpen()) return;
        panelEl.style.transition = '';
        panelEl.style.transform = '';

        if (dragging && (currentX - startX) > panelWidth * 0.3) {
          close();
        }
        dragging = null;
      });
    })();

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