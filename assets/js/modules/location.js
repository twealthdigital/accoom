/* ==========================================================================
   ACCOOM — Location Module
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize location dropdowns
   */
  Accoom.initLocationDropdown = function (wrapper) {
    if (!wrapper) return;

    var trigger = wrapper.querySelector('.dropdown-trigger');
    var menu = wrapper.querySelector('[data-dropdown-panel]');

    if (!trigger || !menu) return;

    function open() {
      menu.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    function close() {
      menu.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function isOpen() {
      return menu.classList.contains('is-open');
    }

    // Trigger click
    Accoom.on(trigger, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      isOpen() ? close() : open();
    });

    // Click on options inside panel - FIXED to update both desktop and mobile
    Accoom.delegate(menu, 'click', '[role="option"]', function (e) {
      e.preventDefault();
      var text = this.textContent.trim();
      
      // Update the span inside the trigger
      var span = trigger.querySelector('span');
      if (span) {
        span.textContent = text;
      }
      
      // Also update any data-dropdown-label (for other dropdowns)
      var label = wrapper.querySelector('[data-dropdown-label]');
      if (label) {
        label.textContent = text;
      }
      
      close();
    });

    // Close on outside click
    Accoom.on(document, 'click', function (e) {
      if (!wrapper.contains(e.target)) {
        close();
      }
    });

    // Escape key
    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });

    return {
      open: open,
      close: close,
      isOpen: isOpen
    };
  };

  /**
   * Get user's location (geolocation)
   */
  Accoom.getUserLocation = function () {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        function (position) {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        function (error) {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  };

  /**
   * Reverse geocode (mock - replace with actual API)
   */
  Accoom.reverseGeocode = function (lat, lng) {
    // Mock implementation - replace with actual geocoding API
    return Promise.resolve({
      city: 'Lagos',
      country: 'Nigeria',
      formatted: 'Lagos, Nigeria'
    });
  };

})(window.Accoom);