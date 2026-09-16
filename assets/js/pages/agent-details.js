/* ==========================================================================
   ACCOOM — Agent Details (agent profile setup form)

   Route guard, same soft client-side-only caveat as elsewhere in this
   prototype (no server/session backend — see the other page scripts for
   the full note). Beyond that, this file:
     1. Autofills every field it can from the existing account record
        (name/email from signup, agentType from onboarding, anything
        already added on the profile page) — all of it stays editable.
     2. Keeps the "Profile Preview" sidebar in sync as the person types.
     3. Handles the profile-photo upload.
     4. Validates and saves on submit, setting agentProfileCompleted —
        the flag main.js checks before it hides "Become an Agent".
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    Accoom.initHeroAnimations({ selector: '.ad-hero', offset: 50 });

    var user = Accoom.getStorage('accoom-user', null);

    if (!user || !user.email) {
      window.location.replace('auth.html');
      return;
    }
    if (!user.role) {
      window.location.replace('onboarding.html');
      return;
    }
    if (user.role === 'customer') {
      window.location.replace('home.html');
      return;
    }

    var form = document.querySelector('[data-agent-details-form]');
    if (!form) return;

    var errorEl = document.querySelector('[data-agent-details-error]');
    var confirmCheckbox = document.querySelector('[data-agent-details-confirm]');

    // ---- State dropdown: populated from locations.js data, not hardcoded HTML.
    // Country is fixed to Nigeria (plain input in the HTML, not a dropdown).
    var stateRoot = document.getElementById('ad-state');

    function loadStatesFor(country, selected) {
      if (!stateRoot) return;
      Accoom.setDropdownOptions(stateRoot, Accoom.getStates('Nigeria'), selected || '');
    }

    // Languages field: a custom multi-select .dropdown, driven by
    // Accoom.getLanguages(country, state) — common languages first,
    // state-specific ones appended once a state is known.
    var languagesRoot = document.getElementById('ad-languages');

    function loadLanguagesFor(country, state, selectedList) {
      if (!languagesRoot) return;
      Accoom.setDropdownOptions(languagesRoot, Accoom.getLanguages(country, state), selectedList || []);
    }

    loadStatesFor('Nigeria', user.state || '');
    loadLanguagesFor('Nigeria', user.state || '', user.languages || []);

    // Re-populate languages whenever the state selection changes, since
    // the old state's regional languages no longer apply.
    if (stateRoot) {
      Accoom.on(stateRoot, 'dropdown:select', function (e) {
        loadLanguagesFor('Nigeria', e.detail.value, []);
      });
    }

    // ---- Init the custom searchable dropdowns ----
    ['ad-contact-method', 'ad-business-type', 'ad-experience', 'ad-state', 'ad-languages'].forEach(function (id) {
      var root = document.getElementById(id);
      if (root) Accoom.initDropdown(root);
    });

    // ---- Autofill every field we already have a value for ----
    Accoom.$$('[data-field]').forEach(function (field) {
      var key = field.getAttribute('data-field');
      var val = user[key];
      if (val === undefined || val === null || val === '') return;
      if (key === 'languages') return; // handled by loadLanguagesFor() above
      if (field.multiple && Array.isArray(val)) {
        Array.prototype.forEach.call(field.options, function (opt) {
          opt.selected = val.indexOf(opt.value) !== -1;
        });
      } else {
        field.value = val;
      }
    });

    // Gender/contact-method/business-type/experience use static HTML
    // options, so paint their label + active option to match whatever
    // was just autofilled (country/state already handled themselves,
    // since setDropdownOptions() above sets the label as it builds them).
    Accoom.$$('[data-dropdown-panel]').forEach(function (panel) {
      var root = panel.closest('.dropdown');
      var hidden = root && root.querySelector('input[type="hidden"][data-field]');
      var label = root && root.querySelector('[data-dropdown-label]');
      if (!hidden || !hidden.value) return;
      var match = panel.querySelector('[role="option"][data-value="' + hidden.value + '"]');
      if (match) {
        if (label) label.textContent = match.textContent.trim();
        Accoom.$$('[role="option"]', panel).forEach(function (li) { li.classList.remove('is-active'); });
        match.classList.add('is-active');
      }
    });

    // ---- Live "Profile Preview" sidebar ----
    var previewOut = {};
    Accoom.$$('[data-preview-out]').forEach(function (el) {
      previewOut[el.getAttribute('data-preview-out')] = { el: el, fallback: el.textContent };
    });

    function setPreview(key, value) {
      var target = previewOut[key];
      if (!target) return;
      target.el.textContent = (value && String(value).trim()) || target.fallback;
    }

    function syncLocationPreview() {
      var city = form.querySelector('[data-preview="city"]');
      var state = form.querySelector('[data-preview="state"]');
      var parts = [city ? city.value.trim() : '', state ? state.value.trim() : ''].filter(Boolean);
      setPreview('location', parts.join(', '));
    }

    function syncLanguagesPreview() {
      var field = form.querySelector('input[type="hidden"][data-preview="languages"]');
      if (!field) return;
      setPreview('languages', field.value.split(',').filter(Boolean).join(', '));
    }

    Accoom.$$('[data-preview]').forEach(function (field) {
      var key = field.getAttribute('data-preview');
      var eventName = (field.tagName === 'SELECT' || field.type === 'date' || key === 'languages') ? 'change' : 'input';

      Accoom.on(field, eventName, function () {
        if (key === 'city' || key === 'state') {
          syncLocationPreview();
        } else if (key === 'languages') {
          syncLanguagesPreview();
        } else {
          setPreview(key, field.value);
        }
      });

      // Paint whatever autofill already put in the field before any typing.
      if (key === 'city' || key === 'state') {
        syncLocationPreview();
      } else if (key === 'languages') {
        syncLanguagesPreview();
      } else if (field.value) {
        setPreview(key, field.value);
      }
    });

    // ---- Profile photo upload ----
    var photoInput = document.querySelector('[data-agent-photo-input]');
    var photoPreviews = Accoom.$$('[data-agent-photo-preview]');
    var photoPlaceholders = Accoom.$$('[data-agent-photo-placeholder]');
    var photoLabel = document.querySelector('[data-agent-photo-label]');

    function paintPhoto() {
      var hasPhoto = !!user.avatar;
      photoPreviews.forEach(function (el) {
        el.src = hasPhoto ? user.avatar : '';
        el.hidden = !hasPhoto;
        el.style.display = hasPhoto ? 'block' : 'none';
      });
      photoPlaceholders.forEach(function (el) {
        el.hidden = hasPhoto;
        el.style.display = hasPhoto ? 'none' : 'flex';
      });
      if (photoLabel) photoLabel.textContent = hasPhoto ? 'Change photo' : 'Click to upload';
    }
    paintPhoto();

    Accoom.$$('[data-agent-photo-trigger]').forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        if (photoInput) photoInput.click();
      });
    });

    if (photoInput) {
      Accoom.on(photoInput, 'change', function () {
        var file = photoInput.files && photoInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          user.avatar = reader.result;
          paintPhoto();
        };
        reader.readAsDataURL(file);
        photoInput.value = '';
      });
    }

    // ---- NIN verification ----
    // Real NIN checks have to happen server-side: providers like NIMC's
    // partners (YouVerify, Prembly/QoreID, VerifyMe, etc.) require a secret
    // API key and don't allow direct browser calls. Point this at a backend
    // endpoint you control that proxies to one of those providers and
    // returns { valid: boolean, name?: string }.
    var ninInput = document.querySelector('[data-field="nin"]');
    var ninVerifyBtn = document.querySelector('[data-nin-verify]');
    var ninStatus = document.querySelector('[data-nin-status]');
    var ninVerified = false;

    function setNinStatus(message, isError) {
      if (!ninStatus) return;
      ninStatus.textContent = message;
      ninStatus.classList.toggle('ad-hint--error', !!isError);
      ninStatus.classList.toggle('ad-hint--success', !isError && !!message);
    }

    if (ninInput) {
      Accoom.on(ninInput, 'input', function () {
        ninVerified = false;
        setNinStatus('');
      });
    }

    if (ninVerifyBtn) {
      Accoom.on(ninVerifyBtn, 'click', function () {
        var nin = (ninInput && ninInput.value || '').trim();
        if (!/^\d{11}$/.test(nin)) {
          ninVerified = false;
          setNinStatus('Enter a valid 11-digit NIN before verifying.', true);
          return;
        }

        ninVerifyBtn.disabled = true;
        ninVerifyBtn.textContent = 'Verifying…';
        setNinStatus('Verifying with NIMC…');

        fetch('/api/verify-nin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nin: nin })
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            ninVerified = !!data.valid;
            setNinStatus(
              ninVerified ? 'NIN verified' + (data.name ? ' — ' + data.name : '') + '.' : 'We couldn\u2019t verify that NIN.',
              !ninVerified
            );
          })
          .catch(function () {
            ninVerified = false;
            setNinStatus('Verification service unavailable. Please try again.', true);
          })
          .finally(function () {
            ninVerifyBtn.disabled = false;
            ninVerifyBtn.textContent = 'Verify';
          });
      });
    }

    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearError() {
      if (!errorEl) return;
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    // ---- Save on submit ----
    Accoom.on(form, 'submit', function (e) {
      e.preventDefault();
      clearError();

      if (!user.avatar) {
        showError('Please upload a profile photo.');
        return;
      }
      if (!ninVerified) {
        showError('Please verify your NIN before continuing.');
        return;
      }
      // Native "required" on every visible field covers most of this
      // form. Languages is now a custom dropdown (hidden input), so it
      // needs its own required check below alongside the other dropdowns.
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      if (confirmCheckbox && !confirmCheckbox.checked) {
        showError('Please confirm the information you\u2019ve entered is accurate.');
        return;
      }

      // Hidden inputs (our custom dropdowns) are barred from native
      // constraint validation, so "required" has to be checked by hand.
      var requiredDropdowns = {
        preferredContact: 'preferred contact method',
        agentType: 'business type',
        state: 'state',
        country: 'country',
        yearsExperience: 'years of experience',
        languages: 'at least one language'
      };
      for (var key in requiredDropdowns) {
        var hiddenField = form.querySelector('input[type="hidden"][data-field="' + key + '"]');
        if (hiddenField && !hiddenField.value) {
          showError('Please select your ' + requiredDropdowns[key] + '.');
          return;
        }
      }

      Accoom.$$('[data-field]').forEach(function (field) {
        var key = field.getAttribute('data-field');
        if (key === 'languages') {
          user[key] = field.value ? field.value.split(',').filter(Boolean) : [];
        } else if (field.multiple) {
          user[key] = Array.prototype.filter.call(field.options, function (o) { return o.selected; })
            .map(function (o) { return o.value; });
        } else {
          user[key] = field.value.trim ? field.value.trim() : field.value;
        }
      });

      // This is the flag main.js checks before hiding "Become an Agent" —
      // it only gets set here, once the form is actually confirmed.
      user.agentProfileCompleted = true;
      user.agentProfileCompletedAt = new Date().toISOString();

      Accoom.setStorage('accoom-user', user);
      window.location.replace('home.html');
    });
  });

})(window.Accoom);