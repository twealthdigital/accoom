/* ========================================================================== 
   ACCOOM - Accommodation Filter
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    var form = document.querySelector('[data-accommodation-form]');
    var sections = document.querySelector('[data-filter-sections]');
    var countEl = document.querySelector('[data-filter-result-count]');
    var chipsEl = document.querySelector('[data-filter-chips]');
    if (!form || !sections) return;

    var all = Accoom.PropertyService ? Accoom.PropertyService.getAll() : [];
    var unique = function (values) { return Array.from(new Set(values)); };
    var types = unique(all.map(function (item) { return { value: item.typeKey, label: item.typeLabel }; }).map(function (item) { return JSON.stringify(item); })).map(JSON.parse);
    var levels = unique(all.map(function (item) { return item.agent.level; }));
    var PRICE_MIN = 50000;
    var PRICE_MAX = 10000000;
    var PRICE_STEP = 100000;
    var NIGERIA_DATA_URL = 'https://cdn.jsdelivr.net/npm/nigeria-state-lga-data@1.1.5/data/nigeria.json';
    var LOCATION_DATA = {
      Nigeria: {
        states: [
          ['abia', 'Abia (Umuahia)'], ['adamawa', 'Adamawa (Yola)'], ['akwa-ibom', 'Akwa Ibom (Uyo)'],
          ['anambra', 'Anambra (Awka)'], ['bauchi', 'Bauchi (Bauchi)'], ['bayelsa', 'Bayelsa (Yenagoa)'],
          ['benue', 'Benue (Makurdi)'], ['borno', 'Borno (Maiduguri)'], ['cross-river', 'Cross River (Calabar)'],
          ['delta', 'Delta (Asaba)'], ['ebonyi', 'Ebonyi (Abakaliki)'], ['edo', 'Edo (Benin City)'],
          ['ekiti', 'Ekiti (Ado-Ekiti)'], ['enugu', 'Enugu (Enugu)'], ['gombe', 'Gombe (Gombe)'],
          ['imo', 'Imo (Owerri)'], ['jigawa', 'Jigawa (Dutse)'], ['kaduna', 'Kaduna (Kaduna)'],
          ['kano', 'Kano (Kano)'], ['katsina', 'Katsina (Katsina)'], ['kebbi', 'Kebbi (Birnin Kebbi)'],
          ['kogi', 'Kogi (Lokoja)'], ['kwara', 'Kwara (Ilorin)'], ['lagos', 'Lagos (Ikeja)'],
          ['nasarawa', 'Nasarawa (Lafia)'], ['niger', 'Niger (Minna)'], ['ogun', 'Ogun (Abeokuta)'],
          ['ondo', 'Ondo (Akure)'], ['osun', 'Osun (Osogbo)'], ['oyo', 'Oyo (Ibadan)'],
          ['plateau', 'Plateau (Jos)'], ['rivers', 'Rivers (Port Harcourt)'], ['sokoto', 'Sokoto (Sokoto)'],
          ['taraba', 'Taraba (Jalingo)'], ['yobe', 'Yobe (Damaturu)'], ['zamfara', 'Zamfara (Gusau)'],
          ['fct', 'FCT (Abuja)']
        ],
        cities: {
          lagos: [['ikeja', 'Ikeja'], ['lekki', 'Lekki'], ['yaba', 'Yaba'], ['surulere', 'Surulere'], ['ikorodu', 'Ikorodu'], ['ajah', 'Ajah'], ['ikoyi', 'Ikoyi'], ['victoria-island', 'Victoria Island']],
          fct: [['abuja', 'Abuja'], ['gwarinpa', 'Gwarinpa'], ['maitama', 'Maitama'], ['wuse', 'Wuse'], ['gwagwalada', 'Gwagwalada']],
          abia: [['umuahia', 'Umuahia'], ['aba', 'Aba']], adamawa: [['yola', 'Yola'], ['mubi', 'Mubi']],
          'akwa-ibom': [['uyo', 'Uyo'], ['ikot-ekpene', 'Ikot Ekpene']], anambra: [['awka', 'Awka'], ['onitsha', 'Onitsha'], ['nnewi', 'Nnewi']],
          bauchi: [['bauchi', 'Bauchi'], ['azare', 'Azare']], bayelsa: [['yenagoa', 'Yenagoa'], ['brass', 'Brass']],
          benue: [['makurdi', 'Makurdi'], ['gboko', 'Gboko']], borno: [['maiduguri', 'Maiduguri'], ['bama', 'Bama']],
          'cross-river': [['calabar', 'Calabar'], ['ubo', 'Ugep']], delta: [['asaba', 'Asaba'], ['warri', 'Warri'], ['sapele', 'Sapele']],
          ebonyi: [['abakaliki', 'Abakaliki'], ['afikpo', 'Afikpo']], edo: [['benin-city', 'Benin City'], ['auchi', 'Auchi']],
          ekiti: [['ado-ekiti', 'Ado-Ekiti'], ['ikere', 'Ikere']], enugu: [['enugu', 'Enugu'], ['nsukka', 'Nsukka']],
          gombe: [['gombe', 'Gombe'], ['kaltungo', 'Kaltungo']], imo: [['owerri', 'Owerri'], ['orlu', 'Orlu']],
          jigawa: [['dutse', 'Dutse'], ['hadejia', 'Hadejia']], kaduna: [['kaduna', 'Kaduna'], ['zaria', 'Zaria']],
          kano: [['kano', 'Kano'], ['wudil', 'Wudil']], katsina: [['katsina', 'Katsina'], ['funtua', 'Funtua']],
          kebbi: [['birnin-kebbi', 'Birnin Kebbi'], ['argungu', 'Argungu']], kogi: [['lokoja', 'Lokoja'], ['okene', 'Okene']],
          kwara: [['ilorin', 'Ilorin'], ['offa', 'Offa']], nasarawa: [['lafia', 'Lafia'], ['keffi', 'Keffi']],
          niger: [['minna', 'Minna'], ['suleja', 'Suleja']], ogun: [['abeokuta', 'Abeokuta'], ['ijebu-ode', 'Ijebu-Ode'], ['ota', 'Ota']],
          ondo: [['akure', 'Akure'], ['ondo', 'Ondo']], osun: [['osogbo', 'Osogbo'], ['ile-ife', 'Ile-Ife'], ['ilesa', 'Ilesa']],
          oyo: [['ibadan', 'Ibadan'], ['oyo', 'Oyo'], ['ogbomoso', 'Ogbomoso']], plateau: [['jos', 'Jos'], ['bukuru', 'Bukuru']],
          rivers: [['port-harcourt', 'Port Harcourt'], ['obio-akpor', 'Obio-Akpor'], ['bonny', 'Bonny']],
          sokoto: [['sokoto', 'Sokoto'], ['tambuwal', 'Tambuwal']], taraba: [['jalingo', 'Jalingo'], ['wukari', 'Wukari']],
          yobe: [['damaturu', 'Damaturu'], ['potiskum', 'Potiskum']], zamfara: [['gusau', 'Gusau'], ['kaura-namoda', 'Kaura Namoda']]
        }
      }
    };

    function priceOptions() {
      var options = [];
      for (var value = PRICE_MIN; value <= PRICE_MAX; value += PRICE_STEP) {
        options.push([String(value), '₦' + value.toLocaleString('en-NG')]);
      }
      return options;
    }

    var definitions = [
      { key: 'country', title: 'Country', type: 'select', options: [['Nigeria', 'Nigeria']], placeholder: 'Select country' },
      { key: 'state', title: 'State', type: 'select', options: LOCATION_DATA.Nigeria.states, placeholder: 'Select state', disabled: true },
      { key: 'city', title: 'Local government / town / city', type: 'select', options: [], placeholder: 'Select a state first', disabled: true },
      { key: 'purpose', title: 'I want to', type: 'radio', options: [['rent', 'Rent'], ['buy', 'Buy'], ['short-let', 'Short let']] },
      { key: 'propertyType', title: 'Property type', type: 'checkbox', options: types.map(function (item) { return [item.value, item.label]; }) },
      { key: 'price', title: 'Budget range', type: 'range', options: [['min', 'Minimum budget'], ['max', 'Maximum budget']] },
      { key: 'bedrooms', title: 'Bedrooms', type: 'radio', options: [['any', 'Any'], ['1', '1 bedroom'], ['2', '2 bedrooms'], ['3', '3 bedrooms'], ['4', '4+ bedrooms']] },
      { key: 'bathrooms', title: 'Bathrooms', type: 'radio', options: [['any', 'Any'], ['1', '1 bathroom'], ['2', '2 bathrooms'], ['3', '3+ bathrooms']] },
      { key: 'furnishing', title: 'Furnishing', type: 'radio', options: [['any', 'Any'], ['furnished', 'Furnished'], ['semi', 'Semi-furnished'], ['unfurnished', 'Unfurnished']] },
      { key: 'amenities', title: 'Amenities and features', help: 'Select everything important to you.', type: 'checkbox', wide: true, options: [['parking', 'Parking space'], ['power', 'Steady power'], ['water', 'Water supply'], ['security', 'Estate security'], ['fenced', 'Fenced compound'], ['serviced', 'Serviced property'], ['pet', 'Pet friendly'], ['internet', 'Internet ready'], ['bq', 'Boys quarters'], ['balcony', 'Balcony'], ['pool', 'Swimming pool'], ['gym', 'Gym / fitness area']] },
      { key: 'availability', title: 'Availability', type: 'radio', options: [['any', 'Any time'], ['now', 'Available now'], ['soon', 'Available soon']] },
      { key: 'agent', title: 'Agent preference', type: 'checkbox', options: [['verified', 'Verified agents only']].concat(levels.map(function (level) { return [level, level + ' agents']; })) },
      { key: 'sort', title: 'Sort results by', type: 'select', options: [['newest', 'Newest listings'], ['price-low', 'Lowest price'], ['price-high', 'Highest price'], ['popular', 'Most popular']], placeholder: 'Choose sorting' }
    ];

    function escapeHTML(value) {
      return String(value).replace(/[&<>'"]/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]; });
    }

    function renderDropdown(key, placeholder, options, disabled) {
      return '<div class="dropdown filter-dropdown" data-filter-dropdown="' + key + '">' +
        '<button type="button" class="filter-dropdown-trigger dropdown-trigger" aria-haspopup="listbox" aria-expanded="false"' + (disabled ? ' disabled' : '') + '>' +
          '<span data-dropdown-label>' + escapeHTML(placeholder) + '</span>' +
          '<svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
        '</button>' +
        '<ul class="dropdown-panel" data-dropdown-panel role="listbox" aria-label="' + escapeHTML(placeholder) + '">' +
          '<li class="filter-dropdown-search"><input type="search" placeholder="Search options" aria-label="Search options" data-dropdown-search></li>' +
          '<li role="option" data-value="">' + escapeHTML(placeholder) + '</li>' +
          options.map(function (option) { return '<li role="option" data-value="' + escapeHTML(option[0]) + '">' + escapeHTML(option[1]) + '</li>'; }).join('') +
        '</ul>' +
        '<input type="hidden" data-filter-key="' + key + '" value="">' +
      '</div>';
    }

    function renderDefinition(definition) {
      var body = '';
      if (definition.type === 'select') {
        body = renderDropdown(definition.key, definition.placeholder, definition.options, definition.disabled);
      } else if (definition.type === 'range') {
        body = '<div class="filter-range">' + definition.options.map(function (option) {
          return renderDropdown(definition.key + '-' + option[0], option[1], priceOptions());
        }).join('') + '</div>' +
          '<div class="filter-price-slider" data-price-slider>' +
            '<div class="filter-price-track"></div>' +
            '<div class="filter-price-fill" data-price-fill></div>' +
            '<input type="range" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="' + PRICE_STEP + '" value="' + PRICE_MIN + '" data-price-range="min" aria-label="Minimum budget slider" />' +
            '<input type="range" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="' + PRICE_STEP + '" value="' + PRICE_MAX + '" data-price-range="max" aria-label="Maximum budget slider" />' +
          '</div>' +
          '<div class="filter-custom-price-grid">' +
            '<label>Custom minimum price<input type="number" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="1" placeholder="₦50,000" data-custom-price="min" /></label>' +
            '<label>Custom maximum price<input type="number" min="' + PRICE_MIN + '" max="' + PRICE_MAX + '" step="1" placeholder="₦10,000,000" data-custom-price="max" /></label>' +
          '</div>';
      } else {
        body = '<div class="filter-option-grid">' + definition.options.map(function (option) { return '<label class="filter-option"><input type="' + definition.type + '" name="' + definition.key + (definition.type === 'radio' ? '' : '[]') + '" data-filter-key="' + definition.key + '" value="' + escapeHTML(option[0]) + '"><span class="filter-option-mark"></span><span class="filter-option-copy">' + escapeHTML(option[1]) + '</span></label>'; }).join('') + '</div>';
      }
      return '<section class="filter-section' + (definition.wide ? ' filter-section--wide' : '') + '"><h3 class="filter-section-title">' + definition.title + '</h3>' + (definition.help ? '<p class="filter-section-help">' + definition.help + '</p>' : '') + body + '</section>';
    }

    sections.innerHTML = definitions.map(renderDefinition).join('');

    sections.querySelectorAll('[data-filter-dropdown]').forEach(function (dropdown) {
      Accoom.initDropdown(dropdown, {
        onSelect: function (value) {
          var input = dropdown.querySelector('input[data-filter-key]');
          if (input) input.value = value;
          if (dropdown.getAttribute('data-filter-dropdown') === 'country') enableStateDropdown(value);
          if (dropdown.getAttribute('data-filter-dropdown') === 'state') enableCityDropdown(value);
          updateSummary();
        }
      });

      var searchInput = dropdown.querySelector('[data-dropdown-search]');
      if (searchInput) {
        searchInput.addEventListener('input', function () {
          var query = searchInput.value.trim().toLowerCase();
          dropdown.querySelectorAll('[role="option"]').forEach(function (option) {
            option.hidden = !!query && option.textContent.toLowerCase().indexOf(query) === -1;
          });
        });
      }
    });

    function replaceDropdownOptions(key, placeholder, options, disabled) {
      var dropdown = sections.querySelector('[data-filter-dropdown="' + key + '"]');
      if (!dropdown) return;
      var panel = dropdown.querySelector('[data-dropdown-panel]');
      var trigger = dropdown.querySelector('.dropdown-trigger');
      var label = dropdown.querySelector('[data-dropdown-label]');
      var input = dropdown.querySelector('input[data-filter-key]');
      var search = dropdown.querySelector('[data-dropdown-search]');
      panel.querySelectorAll('[role="option"]').forEach(function (option) { option.remove(); });
      var placeholderOption = document.createElement('li');
      placeholderOption.setAttribute('role', 'option');
      placeholderOption.setAttribute('data-value', '');
      placeholderOption.textContent = placeholder;
      panel.appendChild(placeholderOption);
      options.forEach(function (option) {
        var item = document.createElement('li');
        item.setAttribute('role', 'option');
        item.setAttribute('data-value', option[0]);
        item.textContent = option[1];
        panel.appendChild(item);
      });
      if (search) search.value = '';
      if (label) label.textContent = placeholder;
      if (input) input.value = '';
      if (trigger) {
        trigger.disabled = !!disabled;
        trigger.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        trigger.setAttribute('aria-expanded', 'false');
      }
      panel.classList.remove('is-open');
    }

    function enableStateDropdown(country) {
      var states = country && LOCATION_DATA[country] ? LOCATION_DATA[country].states : [];
      replaceDropdownOptions('state', 'Select state', states, !states.length);
      replaceDropdownOptions('city', 'Select a state first', [], true);
    }

    function enableCityDropdown(state) {
      var cities = (LOCATION_DATA.Nigeria.cities[state] || []).slice();
      replaceDropdownOptions('city', cities.length ? 'Select town / city' : 'No towns added yet', cities, !cities.length);
    }

    function locationKey(value) {
      return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function mergeLocationOptions(values) {
      var seen = {};
      return values.filter(function (value) {
        var key = locationKey(value);
        if (!value || seen[key]) return false;
        seen[key] = true;
        return true;
      }).map(function (value) {
        return [locationKey(value), value];
      });
    }

    // The published nigeria-state-lga-data dataset supplies every state,
    // capital, LGA, town, and city. LGAs and towns intentionally share one
    // searchable dropdown because they are all valid property locations.
    fetch(NIGERIA_DATA_URL)
      .then(function (response) {
        if (!response.ok) throw new Error('Nigeria location data could not be loaded');
        return response.json();
      })
      .then(function (dataset) {
        var states = (dataset.states || []).map(function (state) {
          return [locationKey(state.name), state.name + ' (' + state.capital + ')'];
        });
        var cities = {};
        (dataset.states || []).forEach(function (state) {
          cities[locationKey(state.name)] = mergeLocationOptions((state.lgas || []).concat(state.towns || []));
        });
        if (!states.length) return;
        LOCATION_DATA.Nigeria.states = states;
        LOCATION_DATA.Nigeria.cities = cities;

        var countryInput = sections.querySelector('[data-filter-key="country"]');
        var selectedState = sections.querySelector('[data-filter-key="state"]');
        if (countryInput && countryInput.value === 'Nigeria') {
          enableStateDropdown('Nigeria');
          if (selectedState && selectedState.value) enableCityDropdown(selectedState.value);
        }
      })
      .catch(function () {
        // The bundled fallback above keeps the location flow usable offline.
      });

    var minPriceInput = sections.querySelector('[data-filter-key="price-min"]');
    var maxPriceInput = sections.querySelector('[data-filter-key="price-max"]');
    var minPriceSlider = sections.querySelector('[data-price-range="min"]');
    var maxPriceSlider = sections.querySelector('[data-price-range="max"]');
    var customMinPrice = sections.querySelector('[data-custom-price="min"]');
    var customMaxPrice = sections.querySelector('[data-custom-price="max"]');
    var priceFill = sections.querySelector('[data-price-fill]');

    function setPriceValue(which, value, snapToStep) {
      value = Number(value);
      if (snapToStep) value = Math.round(value / PRICE_STEP) * PRICE_STEP;
      value = Math.max(PRICE_MIN, Math.min(PRICE_MAX, value));
      var other = which === 'min' ? Number(maxPriceInput.value) || PRICE_MAX : Number(minPriceInput.value) || PRICE_MIN;
      if (which === 'min') value = Math.min(value, other);
      else value = Math.max(value, other);
      var hidden = which === 'min' ? minPriceInput : maxPriceInput;
      var slider = which === 'min' ? minPriceSlider : maxPriceSlider;
      var custom = which === 'min' ? customMinPrice : customMaxPrice;
      hidden.value = String(value);
      slider.value = String(snapToStep ? value : Math.round(value / PRICE_STEP) * PRICE_STEP);
      custom.value = String(value);
      var dropdown = sections.querySelector('[data-filter-dropdown="price-' + which + '"]');
      var dropdownLabel = dropdown && dropdown.querySelector('[data-dropdown-label]');
      if (dropdownLabel) dropdownLabel.textContent = '₦' + value.toLocaleString('en-NG');
      var minPercent = ((Number(minPriceInput.value || PRICE_MIN) - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
      var maxPercent = ((Number(maxPriceInput.value || PRICE_MAX) - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
      priceFill.style.left = minPercent + '%';
      priceFill.style.width = (maxPercent - minPercent) + '%';
      updateSummary();
    }

    if (minPriceInput && maxPriceInput && minPriceSlider && maxPriceSlider) {
      minPriceSlider.addEventListener('input', function () { setPriceValue('min', this.value, true); });
      maxPriceSlider.addEventListener('input', function () { setPriceValue('max', this.value, true); });
      customMinPrice.addEventListener('change', function () { setPriceValue('min', this.value || PRICE_MIN, false); });
      customMaxPrice.addEventListener('change', function () { setPriceValue('max', this.value || PRICE_MAX, false); });
      setPriceValue('min', PRICE_MIN, true);
      setPriceValue('max', PRICE_MAX, true);
    }

    function selectedValues(key) {
      return Array.prototype.slice.call(form.querySelectorAll('[data-filter-key="' + key + '"]:checked, input[type="hidden"][data-filter-key="' + key + '"]')).map(function (field) { return field.value; }).filter(Boolean);
    }

    function getState() {
      var state = {};
      definitions.forEach(function (definition) {
        if (definition.type === 'range') {
          state.priceMin = (form.querySelector('[data-filter-key="price-min"]') || {}).value || '';
          state.priceMax = (form.querySelector('[data-filter-key="price-max"]') || {}).value || '';
        } else if (definition.type === 'checkbox') {
          state[definition.key] = selectedValues(definition.key);
        } else {
          var field = form.querySelector('[data-filter-key="' + definition.key + '"]:checked, input[type="hidden"][data-filter-key="' + definition.key + '"]');
          state[definition.key] = field ? field.value : '';
        }
      });
      return state;
    }

    function matches(item, state) {
      if (state.propertyType && state.propertyType.length && state.propertyType.indexOf(item.typeKey) === -1) return false;
      if (state.city && item.location !== state.city) return false;
      if (state.priceMin && item.price < Number(state.priceMin)) return false;
      if (state.priceMax && item.price > Number(state.priceMax)) return false;
      if (state.bedrooms && state.bedrooms !== 'any' && (state.bedrooms === '4' ? item.beds < 4 : item.beds !== Number(state.bedrooms))) return false;
      if (state.agent && state.agent.length && state.agent.indexOf(item.agent.level) === -1 && !(state.agent.indexOf('verified') !== -1 && item.agent.verified)) return false;
      return true;
    }

    function updateSummary() {
      var state = getState();
      var result = all.filter(function (item) { return matches(item, state); });
      countEl.textContent = result.length;
      var chips = [];
      if (state.priceMin || state.priceMax) {
        var minimum = state.priceMin ? '₦' + Number(state.priceMin).toLocaleString('en-NG') : 'Any';
        var maximum = state.priceMax ? '₦' + Number(state.priceMax).toLocaleString('en-NG') : 'Any';
        chips.push('<span class="summary-chip summary-chip--range"><span>' + minimum + '</span><span class="summary-chip-dash">–</span><span>' + maximum + '</span></span>');
      }

      var labels = [];
      definitions.forEach(function (definition) {
        if (definition.type === 'range') return;
        var values = definition.type === 'range' ? [state.priceMin, state.priceMax] : (Array.isArray(state[definition.key]) ? state[definition.key] : [state[definition.key]]);
        values.filter(Boolean).forEach(function (value) {
          if (value === 'any') return;
          var option = definition.options && definition.options.reduce(function (found, item) { return found || (item[0] === value ? item : null); }, null);
          labels.push(option ? option[1] : value);
        });
      });
      chips = chips.concat(labels.slice(0, 8).map(function (label) { return '<span class="summary-chip">' + escapeHTML(label) + '</span>'; }));
      chipsEl.innerHTML = chips.join('');
    }

    function reset() {
      form.reset();
      sections.querySelectorAll('[data-filter-dropdown]').forEach(function (dropdown) {
        var input = dropdown.querySelector('input[data-filter-key]');
        var label = dropdown.querySelector('[data-dropdown-label]');
        var trigger = dropdown.querySelector('.dropdown-trigger');
        if (input) input.value = '';
        if (label) label.textContent = dropdown.querySelector('[role="option"]').textContent;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        dropdown.querySelector('[data-dropdown-panel]').classList.remove('is-open');
        dropdown.querySelectorAll('[role="option"]').forEach(function (option) { option.classList.remove('is-active'); });
      });
      enableStateDropdown('');
      if (minPriceInput && maxPriceInput) {
        minPriceInput.value = '';
        maxPriceInput.value = '';
        customMinPrice.value = '';
        customMaxPrice.value = '';
        minPriceSlider.value = PRICE_MIN;
        maxPriceSlider.value = PRICE_MAX;
        priceFill.style.left = '0%';
        priceFill.style.width = '100%';
      }
      updateSummary();
    }

    form.id = 'accommodation-filter-form';
    form.addEventListener('change', updateSummary);
    form.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
        event.preventDefault();
      }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.getAttribute('data-explicit-submit')) return;
      form.removeAttribute('data-explicit-submit');
      try { sessionStorage.setItem('accoom-filter-state', JSON.stringify(getState())); } catch (_) {}
      window.location.href = 'home.html#all-listings';
    });
    document.querySelectorAll('[data-filter-submit], [data-filter-summary-submit]').forEach(function (button) {
      button.addEventListener('click', function () {
        form.setAttribute('data-explicit-submit', 'true');
      });
    });
    document.querySelectorAll('[data-filter-reset]').forEach(function (button) { button.addEventListener('click', reset); });
    updateSummary();
  });
})(window.Accoom);
