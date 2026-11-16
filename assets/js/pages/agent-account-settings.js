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
        var reader = new FileReader();
        reader.onload = function () {
          user.avatar = reader.result;
          Accoom.setStorage('accoom-user', user);
          refreshAsAvatar();
          refreshSidebarAvatar();
          refreshCompletion();
        };
        reader.readAsDataURL(file);
        asAvatarInput.value = '';
      });
    }

    // "Edit" on the Profile Information card just jumps down to the
    // actual editable Personal Details form below it.
    var editTrigger = document.querySelector('[data-aas-edit-trigger]');
    var detailsForm = document.querySelector('[data-details-form]');
    if (editTrigger && detailsForm) {
      Accoom.on(editTrigger, 'click', function () {
        detailsForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var firstField = detailsForm.querySelector('input');
        if (firstField) firstField.focus();
      });
    }

    // ----------------------------------------------------------------
    // Personal Details form — Location dropdown (Nigeria states),
    // populated from the same shared data source used everywhere else.
    // ----------------------------------------------------------------
    var locationRoot = document.getElementById('aas-location-dropdown');
    if (locationRoot) {
      Accoom.setDropdownOptions(locationRoot, Accoom.getStates('Nigeria'), user.location || '');
      Accoom.initDropdown(locationRoot);
    }

    // Prefill the editable fields from the current user record.
    Accoom.$$('[data-aas-field]').forEach(function (field) {
      var key = field.getAttribute('data-aas-field');
      if (field.type === 'hidden') return; // location's hidden input is set by setDropdownOptions above
      if (user[key]) field.value = user[key];
    });

    if (detailsForm) {
      Accoom.on(detailsForm, 'submit', function (e) {
        e.preventDefault();

        Accoom.$$('[data-aas-field]', detailsForm).forEach(function (field) {
          var key = field.getAttribute('data-aas-field');
          user[key] = field.value.trim ? field.value.trim() : field.value;
        });

        // SWAP FOR BACKEND: PATCH /api/account/me with `user` here.
        Accoom.setStorage('accoom-user', user);

        refreshInfoDisplay();
        refreshSidebarAvatar();
      });
    }

    // ----------------------------------------------------------------
    // Password visibility toggles
    // ----------------------------------------------------------------
    Accoom.$$('[data-aas-toggle-password]').forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        var input = btn.previousElementSibling;
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
      });
    });

    // ----------------------------------------------------------------
    // Change Password — client-side validation only until a real auth
    // backend exists. SWAP FOR BACKEND: POST current/new password to
    // /api/account/password and surface its error response instead of
    // the inline checks below.
    // ----------------------------------------------------------------
    var passwordForm = document.querySelector('[data-password-form]');
    var passwordError = document.querySelector('[data-password-error]');
    var passwordSuccess = document.querySelector('[data-password-success]');

    if (passwordForm) {
      Accoom.on(passwordForm, 'submit', function (e) {
        e.preventDefault();
        passwordError.hidden = true;
        passwordSuccess.hidden = true;

        var current = document.getElementById('aas-current-password').value;
        var next = document.getElementById('aas-new-password').value;
        var confirm = document.getElementById('aas-confirm-password').value;

        if (!current || !next || !confirm) {
          passwordError.textContent = 'Please fill in all three fields.';
          passwordError.hidden = false;
          return;
        }
        if (next.length < 8) {
          passwordError.textContent = 'New password must be at least 8 characters.';
          passwordError.hidden = false;
          return;
        }
        if (next !== confirm) {
          passwordError.textContent = 'New password and confirmation don\u2019t match.';
          passwordError.hidden = false;
          return;
        }

        passwordForm.reset();
        passwordSuccess.hidden = false;
      });
    }

    // ----------------------------------------------------------------
    // Two-Factor Authentication — pops the same dialog style used for
    // Login Activity above, and walks through the real enable/disable
    // flow. The toggle never flips on its own; it only reflects the
    // outcome of the modal. Every call below is mocked and marked.
    // SWAP FOR BACKEND:
    //   - POST /api/account/2fa/send-code     (enable step 1, on open, and on Resend)
    //   - POST /api/account/2fa/verify { code } -> { success }  (enable step 2)
    //   - POST /api/account/2fa/disable { }   -> { success }    (disable confirm)
    // ----------------------------------------------------------------
    // SWAP FOR BACKEND: remove this — the real /verify endpoint replaces it.
    var MOCK_2FA_CODE = '123456';

    var twoFaToggle = document.querySelector('[data-2fa-toggle]');
    var twoFaModal = document.querySelector('[data-aas-2fa-modal]');
    var twoFaModalBody = document.querySelector('[data-aas-2fa-modal-body]');
    var twoFaModalClose = document.querySelector('[data-aas-2fa-modal-close]');

    if (twoFaToggle) {
      twoFaToggle.checked = !!user.twoFactorEnabled;
    }

    function open2faModal() {
      if (!twoFaModal) return;
      twoFaModal.classList.add('is-open');
      document.body.classList.add('no-scroll');
    }

    function close2faModal() {
      if (!twoFaModal) return;
      twoFaModal.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    }

    function render2faEnableStep() {
      if (!twoFaModalBody) return;

      // SWAP FOR BACKEND: POST /api/account/2fa/send-code — fire this
      // the moment the step renders, since that's the real "code sent" moment.

      twoFaModalBody.innerHTML =
        '<h3>Set Up Two-Factor Authentication</h3>' +
        '<p class="aas-modal-sub">We\u2019ve sent a 6-digit code to your registered phone/email. Enter it below to turn 2FA on.</p>' +
        '<form data-2fa-verify-form novalidate>' +
          '<div class="aas-field">' +
            '<label for="aas-2fa-code">Verification Code</label>' +
            '<input class="input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="aas-2fa-code" autocomplete="one-time-code" placeholder="Enter Code" required />' +
          '</div>' +
          '<p class="aas-error" data-2fa-error hidden>That code didn\u2019t match. Try again.</p>' +
          '<button type="submit" class="btn btn--primary aas-submit">Verify &amp; Enable</button>' +
          '<button type="button" class="aas-modal-link" data-2fa-resend>Resend code</button>' +
        '</form>';

      var form = twoFaModalBody.querySelector('[data-2fa-verify-form]');
      var codeInput = twoFaModalBody.querySelector('#aas-2fa-code');
      var errorEl = twoFaModalBody.querySelector('[data-2fa-error]');
      var resendBtn = twoFaModalBody.querySelector('[data-2fa-resend]');
      var submitBtn = form.querySelector('.aas-submit');

      Accoom.on(form, 'submit', function (e) {
        e.preventDefault();
        errorEl.hidden = true;
        submitBtn.disabled = true;

        // SWAP FOR BACKEND: POST /api/account/2fa/verify { code: codeInput.value }
        // Replace this whole setTimeout with the real fetch() call — keep the
        // success/error branches inside it, just drive them off the response
        // instead of MOCK_2FA_CODE.
        setTimeout(function () {
          if (codeInput.value.trim() !== MOCK_2FA_CODE) {
            errorEl.hidden = false;
            submitBtn.disabled = false;
            return;
          }

          user.twoFactorEnabled = true;
          Accoom.setStorage('accoom-user', user);
          twoFaToggle.checked = true;
          render2faSuccessStep();
        }, 900);
      });

      Accoom.on(resendBtn, 'click', function () {
        resendBtn.textContent = 'Sending...';
        resendBtn.disabled = true;

        // SWAP FOR BACKEND: POST /api/account/2fa/send-code — replace this
        // setTimeout with the real fetch() call; move the "Code sent!" block
        // into its success handler.
        setTimeout(function () {
          resendBtn.textContent = 'Code sent!';
          setTimeout(function () {
            resendBtn.textContent = 'Resend code';
            resendBtn.disabled = false;
          }, 2000);
        }, 800);
      });
    }

    function render2faSuccessStep() {
      if (!twoFaModalBody) return;
      twoFaModalBody.innerHTML =
        '<div class="aas-2fa-success">' +
          '<span class="aas-2fa-success-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>' +
          '<h3>Two-Factor Authentication Enabled</h3>' +
          '<p class="aas-modal-sub">Your account now needs a verification code at every sign-in.</p>' +
          '<button type="button" class="btn btn--primary aas-submit" data-2fa-done>Done</button>' +
        '</div>';

      Accoom.on(twoFaModalBody.querySelector('[data-2fa-done]'), 'click', close2faModal);
    }

    function render2faDisableStep() {
      if (!twoFaModalBody) return;
      twoFaModalBody.innerHTML =
        '<h3>Turn Off Two-Factor Authentication?</h3>' +
        '<p class="aas-modal-sub">Your account will only need a password to sign in. This makes it easier to access, but less secure.</p>' +
        '<div class="aas-2fa-confirm-actions">' +
          '<button type="button" class="btn btn--ghost aas-submit" data-2fa-cancel>Keep it on</button>' +
          '<button type="button" class="aas-danger-btn" data-2fa-confirm-disable>Turn Off</button>' +
        '</div>';

      Accoom.on(twoFaModalBody.querySelector('[data-2fa-cancel]'), 'click', function () {
        twoFaToggle.checked = true;
        close2faModal();
      });

      Accoom.on(twoFaModalBody.querySelector('[data-2fa-confirm-disable]'), 'click', function () {
        // SWAP FOR BACKEND: POST /api/account/2fa/disable
        user.twoFactorEnabled = false;
        Accoom.setStorage('accoom-user', user);
        twoFaToggle.checked = false;
        close2faModal();
      });
    }

    if (twoFaToggle) {
      Accoom.on(twoFaToggle, 'change', function () {
        if (twoFaToggle.checked) {
          // Hold the switch off visually until a code is actually verified.
          twoFaToggle.checked = false;
          render2faEnableStep();
          open2faModal();
        } else {
          // It was on — confirm before actually turning it off.
          twoFaToggle.checked = true;
          render2faDisableStep();
          open2faModal();
        }
      });
    }

    if (twoFaModalClose) Accoom.on(twoFaModalClose, 'click', close2faModal);
    if (twoFaModal) {
      Accoom.on(twoFaModal, 'click', function (e) {
        if (e.target === twoFaModal) close2faModal();
      });
    }
    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && twoFaModal && twoFaModal.classList.contains('is-open')) close2faModal();
    });

    // ----------------------------------------------------------------
    // Notification Settings — each toggle's state is persisted, keyed
    // by data-notif-key. SWAP FOR BACKEND: PATCH /api/account/notifications
    // with the whole `prefs` object instead of localStorage.
    // ----------------------------------------------------------------
    var NOTIF_KEY = 'accoom-agent-notification-prefs';
    var notifPrefs = Accoom.getStorage(NOTIF_KEY, {
      propertyMatches: true, messages: true, bookings: true, priceChanges: true, promotions: true
    });

    Accoom.$$('[data-notif-key]').forEach(function (row) {
      var key = row.getAttribute('data-notif-key');
      var input = row.querySelector('input[type="checkbox"]');
      if (!input) return;
      input.checked = notifPrefs[key] !== false;
      Accoom.on(input, 'change', function () {
        notifPrefs[key] = input.checked;
        Accoom.setStorage(NOTIF_KEY, notifPrefs);
      });
    });

    // ----------------------------------------------------------------
    // Login Activity modal
    // SWAP FOR BACKEND: replace MOCK_LOGINS with a GET to
    // /api/account/login-activity and render whatever it returns.
    // ----------------------------------------------------------------
    var MOCK_LOGINS = [
      { device: 'Chrome on Windows', location: 'Lagos, Nigeria', time: 'Just now (this device)' },
      { device: 'Safari on iPhone', location: 'Lagos, Nigeria', time: '2 days ago' },
      { device: 'Chrome on Android', location: 'Abuja, Nigeria', time: '1 week ago' }
    ];

    var loginModal = document.querySelector('[data-aas-login-modal]');
    var loginModalList = document.querySelector('[data-aas-login-list]');
    var loginModalClose = document.querySelector('[data-aas-login-modal-close]');
    var loginActivityBtn = document.querySelector('[data-aas-login-activity]');

    function openLoginModal() {
      if (!loginModal) return;
      if (loginModalList) {
        loginModalList.innerHTML = MOCK_LOGINS.map(function (entry) {
          return '<li>' + entry.device + '<small>' + entry.location + ' \u00B7 ' + entry.time + '</small></li>';
        }).join('');
      }
      loginModal.classList.add('is-open');
      document.body.classList.add('no-scroll');
    }

    function closeLoginModal() {
      if (!loginModal) return;
      loginModal.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
    }

    if (loginActivityBtn) Accoom.on(loginActivityBtn, 'click', openLoginModal);
    if (loginModalClose) Accoom.on(loginModalClose, 'click', closeLoginModal);
    if (loginModal) {
      Accoom.on(loginModal, 'click', function (e) {
        if (e.target === loginModal) closeLoginModal();
      });
    }
    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && loginModal && loginModal.classList.contains('is-open')) closeLoginModal();
    });

    // ----------------------------------------------------------------
    // Delete Account
    // SWAP FOR BACKEND: DELETE /api/account/me, then clear local
    // session state exactly as below once that call succeeds.
    // ----------------------------------------------------------------
    var deleteBtn = document.querySelector('[data-delete-account]');
    if (deleteBtn) {
      Accoom.on(deleteBtn, 'click', function () {
        var confirmed = window.confirm('Delete your ACCOOM agent account? This cannot be undone.');
        if (!confirmed) return;
        Accoom.setStorage('accoom-user', null);
        Accoom.removeStorage('accoom-conversations');
                Accoom.removeStorage(NOTIF_KEY);
        window.location.href = 'home.html';
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