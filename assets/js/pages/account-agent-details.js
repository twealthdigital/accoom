/* ==========================================================================
   ACCOOM, Agent Details (inside Account Settings)

   Replaces the old agent-details.html screen. Nothing here is compulsory:
   an agent signs in, lands on their agent account straight away, and can
   fill this in whenever they like. Name, email, phone and photo are NOT
   asked again, they come from the account the agent signed in with and are
   edited in the Personal Details card above.

   Saves onto the same 'accoom-user' record the old page used, so
   agent-profile and the dashboard keep reading the same fields.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    var card = document.querySelector('[data-agent-only]');
    var form = document.querySelector('[data-agent-form]');
    if (!card || !form) return;

    var user = Accoom.getStorage('accoom-user', null);
    if (!user || user.role !== 'agent') return; // customers never see this card

    card.hidden = false;

    // ---- Dropdowns ----
    var stateRoot = document.getElementById('aad-state');
    var languagesRoot = document.getElementById('aad-languages');

    function loadLanguagesFor(state, selectedList) {
      if (!languagesRoot) return;
      Accoom.setDropdownOptions(languagesRoot, Accoom.getLanguages('Nigeria', state), selectedList || []);
    }

    var savedState = user.state || '';
    if (stateRoot) Accoom.setDropdownOptions(stateRoot, Accoom.getStates('Nigeria'), savedState);
    loadLanguagesFor(savedState, user.languages || []);

    // Regional languages depend on the state, so refresh them when it changes.
    if (stateRoot) {
      Accoom.on(stateRoot, 'dropdown:select', function (e) {
        loadLanguagesFor(e.detail.value, []);
      });
    }

    ['aad-business-type', 'aad-experience', 'aad-state', 'aad-languages'].forEach(function (id) {
      var root = document.getElementById(id);
      if (root) Accoom.initDropdown(root);
    });

    // ---- Prefill from what the agent already has on their account ----
    Accoom.$$('[data-aad-field]', form).forEach(function (field) {
      var key = field.getAttribute('data-aad-field');
      var val = user[key];
      if (val === undefined || val === null || val === '') return;
      if (key === 'languages' || key === 'state') return; // painted by setDropdownOptions above
      field.value = val;
    });

    // Business type and experience use static options, so paint their label.
    ['aad-business-type', 'aad-experience'].forEach(function (id) {
      var root = document.getElementById(id);
      var hidden = root && root.querySelector('input[type="hidden"][data-aad-field]');
      var label = root && root.querySelector('[data-dropdown-label]');
      if (!hidden || !hidden.value) return;
      var options = Accoom.$$('[role="option"]', root);
      options.forEach(function (li) { li.classList.remove('is-active'); });
      var match = options.filter(function (li) { return li.getAttribute('data-value') === hidden.value; })[0];
      if (match) {
        if (label) label.textContent = match.textContent.trim();
        match.classList.add('is-active');
      }
    });

    // ---- NIN verification (still a mock until a backend exists) ----
    // Real NIN checks must run server-side (provider secret keys cannot live
    // in the browser). Point this at a backend endpoint that returns
    // { valid: boolean } when one exists.
    var ninInput = form.querySelector('[data-aad-field="nin"]');
    var ninVerifyBtn = form.querySelector('[data-aad-nin-verify]');
    var ninStatus = form.querySelector('[data-aad-nin-status]');
    var ninVerified = user.ninVerified === true;
    var savedNin = user.nin || '';

    function setNinStatus(message, isError) {
      if (!ninStatus) return;
      ninStatus.textContent = message;
      ninStatus.classList.toggle('aad-hint--error', !!isError);
      ninStatus.classList.toggle('aad-hint--success', !isError && !!message);
    }

    if (ninVerified && ninInput && ninInput.value === savedNin) setNinStatus('NIN verified.', false);

    if (ninInput) {
      Accoom.on(ninInput, 'input', function () {
        // Changing a verified NIN means it has to be verified again.
        ninVerified = ninInput.value.trim() === savedNin && user.ninVerified === true;
        setNinStatus(ninVerified ? 'NIN verified.' : '', false);
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

        // TEMP MOCK: no backend yet, so any 11-digit NIN is accepted.
        setTimeout(function () {
          ninVerified = true;
          setNinStatus('NIN verified. Save to keep it.', false);
          ninVerifyBtn.disabled = false;
          ninVerifyBtn.textContent = 'Verify';
        }, 500);
      });
    }

    // ---- Save (nothing is required) ----
    var successEl = form.querySelector('[data-aad-success]');
    var successTimer = null;

    Accoom.on(form, 'submit', function (e) {
      e.preventDefault();

      Accoom.$$('[data-aad-field]', form).forEach(function (field) {
        var key = field.getAttribute('data-aad-field');
        if (key === 'languages') {
          user.languages = field.value ? field.value.split(',').filter(Boolean) : [];
        } else {
          user[key] = field.value.trim ? field.value.trim() : field.value;
        }
      });

      // Only a NIN that was actually verified (and not edited since) counts.
      user.ninVerified = ninVerified && /^\d{11}$/.test(user.nin || '');
      savedNin = user.nin || '';

      // Legacy flag other code may still read; saving details marks it done.
      user.agentProfileCompleted = true;
      user.agentProfileCompletedAt = new Date().toISOString();

      Accoom.setStorage('accoom-user', user);

      if (successEl) {
        successEl.hidden = false;
        clearTimeout(successTimer);
        successTimer = setTimeout(function () { successEl.hidden = true; }, 3000);
      }
    });

    // Arriving from the dashboard's "Verify now" link: bring the card into view.
    if (window.location.hash === '#agent-details') {
      setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150);
    }
  });

})(window.Accoom);
