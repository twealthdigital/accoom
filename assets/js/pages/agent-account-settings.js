/* ==========================================================================
   ACCOOM — Agent Account Settings Page (separate from the customer page)

   BACKEND INTEGRATION NOTES:
   Every mock/local-storage spot below is marked "SWAP FOR BACKEND" —
   search for that string to find every place a real endpoint needs to
   replace localStorage. The functions are already shaped so swapping
   the body for a fetch() call is the only change needed; nothing that
   calls these functions needs to know the difference.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.ag-dash-page');
    if (!page) return;

    // SWAP FOR BACKEND: replace with GET /api/account/me
    var user = Accoom.getStorage('accoom-user', null);
    if (!user) {
      window.location.href = 'auth.html?next=' + encodeURIComponent((location.pathname.split('/').pop() || 'home.html') + location.search + location.hash);
      return;
    }

    if (user.role !== 'agent') {
      window.location.replace(user.role === 'customer' ? 'account-settings.html' : 'onboarding.html');
      return;
    }

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    function initials(name, email) {
      var source = (name || '').trim();
      if (source) {
        var parts = source.split(/\s+/);
        var first = parts[0].charAt(0);
        var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
      }
      if (email) return email.charAt(0).toUpperCase();
      return 'AC';
    }

    function firstName(name, email) {
      if (name && name.trim()) return name.trim().split(/\s+/)[0];
      if (email) return email.split('@')[0];
      return 'there';
    }

    function formatDate(isoDate) {
      var date = isoDate ? new Date(isoDate) : null;
      if (!date || isNaN(date.getTime())) date = new Date();
      return MONTHS[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
    }

    function memberSince(isoDate) {
      var date = isoDate ? new Date(isoDate) : null;
      if (!date || isNaN(date.getTime())) date = new Date();
      return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    }

    // ---- Agent sidebar identity (same markup as the other agent pages) ----
    var AGENT_TYPE_LABEL = {
      landlord: 'Individual Landlord',
      manager: 'Property Manager',
      agency: 'Real Estate Agency',
      agent: 'Agent',
      developer: 'Developer'
    };
    var sideNameEl = document.querySelector('[data-ag-name]');
    var sideTypeEl = document.querySelector('[data-ag-type]');
    var sideAvatarEl = document.querySelector('[data-ag-avatar]');
    var sideAvatarImgEl = document.querySelector('[data-ag-avatar-img]');
    var sideVerifiedEl = document.querySelector('[data-ag-verified-badge]');

    function refreshSidebar() {
      var hasAvatar = !!user.avatar;
      if (sideNameEl) sideNameEl.textContent = user.name || user.email || 'Agent';
      if (sideTypeEl) sideTypeEl.textContent = AGENT_TYPE_LABEL[user.agentType] || 'Agent';
      if (sideVerifiedEl) sideVerifiedEl.hidden = user.ninVerified !== true;
      if (sideAvatarImgEl) {
        if (hasAvatar) sideAvatarImgEl.src = user.avatar; else sideAvatarImgEl.removeAttribute('src');
        sideAvatarImgEl.hidden = !hasAvatar;
        sideAvatarImgEl.style.display = hasAvatar ? '' : 'none';
      }
      if (sideAvatarEl) {
        sideAvatarEl.textContent = initials(user.name, user.email);
        sideAvatarEl.hidden = hasAvatar;
      }
    }
    var refreshSidebarAvatar = refreshSidebar;
    refreshSidebar();

    // ---- Mobile drawer ----
    var mobileToggle = document.querySelector('[data-ag-mobile-toggle]');
    var sidebarEl = document.querySelector('[data-ag-sidebar]');
    var backdropEl = document.querySelector('[data-ag-backdrop]');

    function openDrawer() {
      if (!sidebarEl || !backdropEl) return;
      sidebarEl.classList.add('is-open');
      backdropEl.hidden = false;
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      if (!sidebarEl || !backdropEl) return;
      sidebarEl.classList.remove('is-open');
      backdropEl.hidden = true;
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
    if (mobileToggle) Accoom.on(mobileToggle, 'click', openDrawer);
    if (backdropEl) Accoom.on(backdropEl, 'click', closeDrawer);
    Accoom.$$('.ag-dash-nav-link').forEach(function (link) { Accoom.on(link, 'click', closeDrawer); });

    // Sidebar items without a page yet
    Accoom.$$('[data-ag-soon]').forEach(function (link) {
      Accoom.on(link, 'click', function (e) {
        e.preventDefault();
        if (Accoom.showToast) Accoom.showToast('This section is coming soon.');
      });
    });

    // ---- Sign out ----
    var signoutBtn = document.querySelector('[data-ag-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

    // ----------------------------------------------------------------
    // Profile completion — recalculated any time a field is saved.
    // Swap the REQUIRED list for whatever fields the backend considers
    // "complete" — nothing else here needs to change.
    // ----------------------------------------------------------------
    var REQUIRED_FIELDS = ['name', 'email', 'phone', 'location', 'avatar'];
    var progressLabel = document.querySelector('[data-aas-progress-label]');
    var progressFill = document.querySelector('[data-aas-progress-fill]');

    function refreshCompletion() {
      var filled = REQUIRED_FIELDS.filter(function (key) { return !!(user[key] && String(user[key]).trim()); }).length;
      var pct = Math.round((filled / REQUIRED_FIELDS.length) * 100);
      if (progressLabel) progressLabel.textContent = 'Your profile is ' + pct + '% complete';
      if (progressFill) progressFill.style.width = pct + '%';
    }

    // ----------------------------------------------------------------
    // Profile Information (read-only display) — reflects `user`.
    // ----------------------------------------------------------------
    var ROLE_LABEL = { agent: 'Agent' };

    function refreshInfoDisplay() {
      var setInfo = function (key, value) {
        var el = document.querySelector('[data-aas-info="' + key + '"]');
        if (el) el.textContent = value;
      };
      setInfo('name', user.name || '\u2014');
      setInfo('email', user.email || '\u2014');
      setInfo('phone', user.phone ? ('+234 ' + user.phone) : 'Not added yet');
      setInfo('location', user.location || 'Not added yet');
      setInfo('accountType', ROLE_LABEL[user.role] || 'Agent');
      setInfo('dateJoined', formatDate(user.createdAt));
      refreshCompletion();
    }
    refreshInfoDisplay();

    // ----------------------------------------------------------------
    // Avatar — upload now lives ONLY here (not on Overview).
    // SWAP FOR BACKEND: POST the file to your upload endpoint and save
    // the returned URL instead of a base64 string.
    // ----------------------------------------------------------------
    var asAvatarEl = document.querySelector('[data-aas-avatar]');
    var asAvatarImgEl = document.querySelector('[data-aas-avatar-img]');
    var asAvatarInput = document.querySelector('[data-aas-avatar-input]');
    var asAvatarTrigger = document.querySelector('[data-aas-avatar-trigger]');

    function refreshAsAvatar() {
      var hasAvatar = !!user.avatar;
      if (asAvatarEl) asAvatarEl.textContent = initials(user.name, user.email);
      if (asAvatarImgEl) {
        if (hasAvatar) asAvatarImgEl.src = user.avatar; else asAvatarImgEl.removeAttribute('src');
        asAvatarImgEl.hidden = !hasAvatar;
      }
    }
    refreshAsAvatar();

    if (asAvatarTrigger && asAvatarInput) {
      Accoom.on(asAvatarTrigger, 'click', function () { asAvatarInput.click(); });
      Accoom.on(asAvatarInput, 'change', function () {
        var file = asAvatarInput.files && asAvatarInput.files[0];
        if (!file) return;
        Accoom.Avatar.fromFile(file, function (data) {
          if (!data) return;
          user.avatar = data;
          Accoom.setStorage('accoom-user', user);
          refreshAsAvatar();
          refreshSidebarAvatar();
          refreshCompletion();
          Accoom.Avatar.changed();
        });
        asAvatarInput.value = '';
      });
    }

    // ----------------------------------------------------------------
    // Agent Details (optional). Nothing here is required, nothing blocks
    // the agent account. Name, email, phone and photo are the account's
    // own identity and are edited in the cards above, not asked again.
    // ----------------------------------------------------------------
    (function () {
      var card = document.getElementById('agent-details');
      var form = document.querySelector('[data-agent-form]');
      if (!card || !form) return;
    


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
        refreshSidebar();
        refreshInfoDisplay();

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

    })();

  });

})(window.Accoom);