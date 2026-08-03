/* ==========================================================================
   ACCOOM — home.js
   Home page only. Depends on main.js (Accoom.initDropdown) loaded first.
   ========================================================================== */
(function (Accoom) {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    Accoom.initDropdown(document.querySelector(".hero-search-field [data-dropdown]"));
  });
})(window.Accoom);