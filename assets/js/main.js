/* ==========================================================================
   ACCOOM — main.js
   Site-wide, reusable helpers. Load this before any page-specific
   script (header.js, home.js, ...). Keep this file free of markup
   that only exists on one page.
   ========================================================================== */
window.Accoom = window.Accoom || {};

(function (Accoom) {
  "use strict";

  /* Toggle a dropdown/menu open+closed, close it on outside click or
     Escape. Reused by the header's location dropdown and nav menu. */
  Accoom.initToggle = function (triggerEl, panelEl, options) {
    if (!triggerEl || !panelEl) return;

    var openClass = (options && options.openClass) || "is-open";

    function close() {
      panelEl.classList.remove(openClass);
      triggerEl.setAttribute("aria-expanded", "false");
    }

    function open() {
      panelEl.classList.add(openClass);
      triggerEl.setAttribute("aria-expanded", "true");
    }

    triggerEl.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = panelEl.classList.contains(openClass);
      isOpen ? close() : open();
    });

    document.addEventListener("click", function (e) {
      if (!panelEl.contains(e.target) && e.target !== triggerEl) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    return { open: open, close: close };
  };

  /* Off-canvas panel: trigger opens it, an overlay + explicit close
     button + Escape all close it, and body scroll is locked while
     open. Reused by the header's mobile side panel (and any future
     off-canvas surface, e.g. a filter drawer on the browse page). */
  Accoom.initOffCanvas = function (triggerEl, panelEl, overlayEl, closeEl, options) {
    if (!triggerEl || !panelEl || !overlayEl) return;

    var openClass = (options && options.openClass) || "is-open";
    var visibleClass = (options && options.visibleClass) || "is-visible";
    var lockClass = (options && options.lockClass) || "no-scroll";

    function open() {
      panelEl.classList.add(openClass);
      overlayEl.classList.add(visibleClass);
      document.body.classList.add(lockClass);
      triggerEl.setAttribute("aria-expanded", "true");
    }

    function close() {
      panelEl.classList.remove(openClass);
      overlayEl.classList.remove(visibleClass);
      document.body.classList.remove(lockClass);
      triggerEl.setAttribute("aria-expanded", "false");
    }

    triggerEl.addEventListener("click", open);
    closeEl && closeEl.addEventListener("click", close);
    overlayEl.addEventListener("click", close);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panelEl.classList.contains(openClass)) close();
    });

    // Collapsing back to desktop width should never leave the panel stuck open.
    window.addEventListener("resize", function () {
      if (window.innerWidth >= 992 && panelEl.classList.contains(openClass)) close();
    });

    return { open: open, close: close };
  };

  /* Persisted light/dark theme toggle. Sitewide (not header-only) since
     the chosen theme should stick across every page the user visits. */
Accoom.initThemeToggle = function (toggleEls, options) {
    var storageKey = (options && options.storageKey) || "accoom-theme";
    var themeClass = (options && options.themeClass) || "dark-mode";
    var defaultTheme = (options && options.defaultTheme) || "dark";

    var els = !toggleEls ? [] :
      (toggleEls.length !== undefined ? Array.prototype.slice.call(toggleEls) : [toggleEls]);

    function apply(theme) {
      document.documentElement.classList.toggle(themeClass, theme === "dark");
      els.forEach(function (el) { el.checked = theme === "dark"; });
    }

    var saved = localStorage.getItem(storageKey) || defaultTheme;
    apply(saved);

    els.forEach(function (el) {
      el.addEventListener("change", function () {
        var theme = el.checked ? "dark" : "light";
        localStorage.setItem(storageKey, theme);
        apply(theme);
      });
    });

    return { apply: apply };
  };

  document.addEventListener("DOMContentLoaded", function () {
    // Nothing site-wide runs on load yet beyond what page scripts wire up.
  });
})(window.Accoom);

/* Custom "select" dropdown: click trigger to open a list, click an
     item to choose it (updates trigger label + hidden input), closes
     on outside click, Escape, or selection. Reused anywhere a native
     <select> isn't styleable enough — hero search, filters, etc. */
  Accoom.initDropdown = function (rootEl, options) {
    if (!rootEl) return;

    var trigger = rootEl.querySelector(".dropdown-trigger");
    var panel = rootEl.querySelector("[data-dropdown-panel]");
    var labelEl = rootEl.querySelector("[data-dropdown-label]");
    var hiddenInput = rootEl.querySelector("input[type='hidden']");
    if (!trigger || !panel) return;

    var openClass = (options && options.openClass) || "is-open";
    var onSelect = options && options.onSelect;

    function close() {
      panel.classList.remove(openClass);
      trigger.setAttribute("aria-expanded", "false");
    }
    function open() {
      panel.classList.add(openClass);
      trigger.setAttribute("aria-expanded", "true");
    }

    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      panel.classList.contains(openClass) ? close() : open();
    });

    panel.addEventListener("click", function (e) {
      var item = e.target.closest("[role='option']");
      if (!item) return;

      var value = item.getAttribute("data-value") || "";
      var text = item.textContent;

      if (labelEl) labelEl.textContent = text;
      if (hiddenInput) hiddenInput.value = value;

      panel.querySelectorAll("[role='option']").forEach(function (li) {
        li.classList.remove("is-active");
      });
      item.classList.add("is-active");

      close();
      if (typeof onSelect === "function") onSelect(value, text);
    });

    document.addEventListener("click", function (e) {
      if (!rootEl.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    return { open: open, close: close };
  };