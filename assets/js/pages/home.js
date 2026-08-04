/* ==========================================================================
   ACCOOM — Home Page
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    // Initialize hero animations
    Accoom.initHeroAnimations({
      offset: 50
    });

    // Initialize button animations
    Accoom.initButtonAnimations();

    // Initialize hero search dropdown
    var dropdown = document.querySelector('.hero-search-field .dropdown[data-dropdown]');
    if (dropdown) {
      Accoom.initDropdown(dropdown, {
        onSelect: function (value, text) {
          // Update hidden input
          var hidden = dropdown.querySelector('input[type="hidden"]');
          if (hidden) hidden.value = value;
        }
      });
    }

    // Location buttons (geolocation)
    var locateBtns = Accoom.$$('.hero-locate-btn');
    locateBtns.forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        Accoom.getUserLocation()
          .then(function (position) {
            // Handle location - update UI
            console.log('Location:', position);
          })
          .catch(function (error) {
            console.warn('Location error:', error.message);
          });
      });
    });

    // Quick search form
    var quickSearch = document.querySelector('.quick-search-bar');
    if (quickSearch) {
      Accoom.on(quickSearch, 'submit', function (e) {
        e.preventDefault();
        var input = this.querySelector('input');
        if (input && input.value.trim()) {
          // Handle search
          console.log('Search:', input.value.trim());
        }
      });
    }

    // Hero search form
    var heroSearch = document.querySelector('.hero-search');
    if (heroSearch) {
      Accoom.on(heroSearch, 'submit', function (e) {
        e.preventDefault();
        var location = this.querySelector('#hs-location');
        var type = this.querySelector('#hs-type');
        // Handle search
        console.log('Search:', {
          location: location ? location.value : '',
          type: type ? type.value : ''
        });
      });
    }

    // Popular search pills
    Accoom.$$('.pill').forEach(function (pill) {
      Accoom.on(pill, 'click', function (e) {
        e.preventDefault();
        var text = this.textContent.trim();
        // Populate search with pill text
        var quickInput = document.querySelector('.quick-search-bar input');
        if (quickInput) {
          quickInput.value = text;
          quickInput.focus();
        }
        console.log('Popular search:', text);
      });
    });

    console.log('Home page initialized');
  });

})(window.Accoom);