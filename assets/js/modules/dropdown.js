/* ==========================================================================
   ACCOOM — Dropdown Module
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  /**
   * Initialize a dropdown
   */
Accoom._dropdownRegistry = Accoom._dropdownRegistry || [];

  Accoom.initDropdown = function (rootEl, options) {
    if (!rootEl) return;

    var trigger = rootEl.querySelector('.dropdown-trigger');
    var panel = rootEl.querySelector('[data-dropdown-panel]');
    var labelEl = rootEl.querySelector('[data-dropdown-label]');
    var hiddenInput = rootEl.querySelector('input[type="hidden"]');

    if (!trigger || !panel) return;

    var openClass = (options && options.openClass) || 'is-open';
    var onSelect = options && options.onSelect;

    function close() {
      panel.classList.remove(openClass);
      trigger.setAttribute('aria-expanded', 'false');
    }

function open() {
      Accoom._dropdownRegistry.forEach(function (d) {
        if (d.close !== close && !(d.el && d.el.contains(rootEl))) d.close();
      });
      panel.classList.add(openClass);
      trigger.setAttribute('aria-expanded', 'true');
    }

    function isOpen() {
      return panel.classList.contains(openClass);
    }

    // Trigger click - FIXED to prevent propagation
    Accoom.on(trigger, 'click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      isOpen() ? close() : open();
    });

// Option selection
    Accoom.delegate(panel, 'click', '[role="option"]', function (e) {
      // Ignore options that belong to a nested dropdown's own panel
      if (this.closest('[data-dropdown-panel]') !== panel) return;

      e.preventDefault();
      var item = this;
      var value = item.getAttribute('data-value') || '';
      var text = item.textContent.trim();

      // Update label
      if (labelEl) labelEl.textContent = text;
      if (hiddenInput) hiddenInput.value = value;

      // Update active state
      Accoom.$$('[role="option"]', panel).forEach(function (li) {
        li.classList.remove('is-active');
      });
      item.classList.add('is-active');

      close();

      if (typeof onSelect === 'function') {
        onSelect(value, text);
      }

      Accoom.dispatch(rootEl, 'dropdown:select', { value: value, text: text });
    });

    // Outside click
    Accoom.on(document, 'click', function (e) {
      if (!rootEl.contains(e.target)) {
        close();
      }
    });

    // Escape key
    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });

Accoom._dropdownRegistry.push({ close: close, isOpen: isOpen, el: rootEl });

    return {
      open: open,
      close: close,
      isOpen: isOpen
    };
  };

})(window.Accoom);