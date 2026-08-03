/* ==========================================================================
   ACCOOM — header.js
   Page-specific wiring for the header + mobile side panel. Relies on
   the reusable helpers registered on window.Accoom by main.js, so
   main.js must be loaded first.
   ========================================================================== */
(function (Accoom) {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var hamburgerBtn = document.querySelector("[data-panel-open]");
    var closeBtn = document.querySelector("[data-panel-close]");
    var overlay = document.querySelector("[data-panel-overlay]");
    var panel = document.querySelector("[data-panel]");
    var darkModeToggle = document.querySelector("[data-dark-toggle]");

Accoom.initOffCanvas(hamburgerBtn, panel, overlay, closeBtn);
    Accoom.initThemeToggle(darkModeToggle);

    // Location dropdowns (desktop header + mobile side panel)
    function initLocationDropdown(wrapper) {
      if (!wrapper) return;

      var trigger = wrapper.querySelector(".dropdown-trigger");
      var menu = wrapper.querySelector("[data-dropdown-panel]");

      if (!trigger || !menu) return;

      function open() {
        menu.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      }

      function close() {
        menu.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
      }

      function isOpen() {
        return menu.classList.contains("is-open");
      }

      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        isOpen() ? close() : open();
      });

      document.addEventListener("click", function (e) {
        if (!wrapper.contains(e.target)) close();
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") close();
      });
    }

    initLocationDropdown(document.querySelector(".location-dropdown"));
    initLocationDropdown(document.querySelector(".panel-location-dropdown"));
  });
})(window.Accoom);