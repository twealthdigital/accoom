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

  /**
   * Render <li role="option"> items into a dropdown's list from data,
   * so option lists (like country/state) can come from a data file or
   * API instead of being hardcoded as HTML.
   * items: [{ value, label }], selected: matching value to mark active.
   */
  Accoom.setDropdownOptions = function (rootEl, items, selected) {
    if (!rootEl) return;
    var isMulti = rootEl.hasAttribute('data-dropdown-multiple');
    var selectedList = isMulti ? (Array.isArray(selected) ? selected : []) : null;
    var panel = rootEl.querySelector('[data-dropdown-panel]');
    var list = rootEl.querySelector('[data-dropdown-options]') || panel;
    var labelEl = rootEl.querySelector('[data-dropdown-label]');
    var hiddenInput = rootEl.querySelector('input[type="hidden"]');
    if (!list) return;

    list.innerHTML = (items || []).map(function (item) {
      var active = isMulti
        ? (selectedList.indexOf(item.value) !== -1 ? ' is-active' : '')
        : (item.value === selected ? ' is-active' : '');
      var check = isMulti ? '<span class="select-dropdown-check" aria-hidden="true"></span>' : '';
      return '<li role="option" data-value="' + item.value + '" class="' +
        'select-dropdown-option' + active + '">' + check + item.label + '</li>';
    }).join('');

    if (isMulti) {
      var matches = (items || []).filter(function (i) { return selectedList.indexOf(i.value) !== -1; });
      if (labelEl) {
        labelEl.textContent = matches.length
          ? matches.map(function (m) { return m.label; }).join(', ')
          : (labelEl.getAttribute('data-placeholder-text') || labelEl.textContent);
      }
      if (hiddenInput) hiddenInput.value = matches.map(function (m) { return m.value; }).join(',');
    } else {
      var match = items && items.filter(function (i) { return i.value === selected; })[0];
      if (labelEl) labelEl.textContent = match ? match.label : labelEl.getAttribute('data-placeholder-text') || labelEl.textContent;
      if (hiddenInput) hiddenInput.value = match ? match.value : '';
    }
  };

  Accoom.initDropdown = function (rootEl, options) {
    if (!rootEl) return;

    var trigger = rootEl.querySelector('.dropdown-trigger');
    var panel = rootEl.querySelector('[data-dropdown-panel]');
    var labelEl = rootEl.querySelector('[data-dropdown-label]');
    var hiddenInput = rootEl.querySelector('input[type="hidden"]');
    var searchInput = rootEl.querySelector('[data-dropdown-search]');
    var noResultsEl = rootEl.querySelector('[data-dropdown-empty]');

    if (!trigger || !panel) return;

    var openClass = (options && options.openClass) || 'is-open';
    var onSelect = options && options.onSelect;

    function filterOptions(term) {
      var q = term.trim().toLowerCase();
      var visible = 0;
      Accoom.$$('[role="option"]', panel).forEach(function (li) {
        var match = !q || li.textContent.trim().toLowerCase().indexOf(q) !== -1;
        li.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      if (noResultsEl) noResultsEl.hidden = visible !== 0;
    }

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
      if (searchInput) {
        searchInput.value = '';
        filterOptions('');
        setTimeout(function () { searchInput.focus(); }, 0);
      }
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

    // Search-as-you-type (only present on searchable dropdowns)
    if (searchInput) {
      Accoom.on(searchInput, 'input', function () {
        filterOptions(searchInput.value);
      });
      Accoom.on(searchInput, 'click', function (e) { e.stopPropagation(); });
      Accoom.on(searchInput, 'keydown', function (e) { e.stopPropagation(); });
    }

// Option selection
    var isMulti = rootEl.hasAttribute('data-dropdown-multiple');

    // Option selection
    Accoom.delegate(panel, 'click', '[role="option"]', function (e) {
      // Ignore options that belong to a nested dropdown's own panel
      if (this.closest('[data-dropdown-panel]') !== panel) return;

      e.preventDefault();
      var item = this;
      var value = item.getAttribute('data-value') || '';
      var text = item.textContent.trim();

      if (isMulti) {
        item.classList.toggle('is-active');

        var chosen = Accoom.$$('[role="option"].is-active', panel).map(function (li) {
          return { value: li.getAttribute('data-value') || '', text: li.textContent.trim() };
        });

        if (labelEl) {
          labelEl.textContent = chosen.length
            ? chosen.map(function (c) { return c.text; }).join(', ')
            : (labelEl.getAttribute('data-placeholder-text') || '');
        }
        if (hiddenInput) {
          hiddenInput.value = chosen.map(function (c) { return c.value; }).join(',');
          Accoom.dispatch(hiddenInput, 'input');
          Accoom.dispatch(hiddenInput, 'change');
        }

        if (typeof onSelect === 'function') onSelect(chosen);
        Accoom.dispatch(rootEl, 'dropdown:select', { values: chosen.map(function (c) { return c.value; }), items: chosen });
        // Multi-select stays open so the person can pick more than one.
        return;
      }

      // Update label
      if (labelEl) labelEl.textContent = text;
      if (hiddenInput) {
        hiddenInput.value = value;
        Accoom.dispatch(hiddenInput, 'input');
        Accoom.dispatch(hiddenInput, 'change');
      }

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