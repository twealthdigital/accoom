/* ==========================================================================
   ACCOOM — Account Settings Page

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

    var page = document.querySelector('.profile-page');
    if (!page) return;

    // SWAP FOR BACKEND: replace with GET /api/account/me
    var user = Accoom.getStorage('accoom-user', null);
    if (!user) {
      window.location.href = 'auth.html';
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

    // ---- Sidebar hero ----
    var avatarSideEl = document.querySelector('[data-profile-avatar-side]');
    var avatarImgSideEl = document.querySelector('[data-profile-avatar-img-side]');
    var nameSideEl = document.querySelector('[data-profile-name-side]');
    var memberSideEl = document.querySelector('[data-profile-member-since-side]');

    if (nameSideEl) nameSideEl.textContent = firstName(user.name, user.email);
    if (memberSideEl) memberSideEl.textContent = memberSince(user.createdAt);

    function refreshSidebarAvatar() {
      var hasAvatar = !!user.avatar;
      if (avatarSideEl) avatarSideEl.textContent = initials(user.name, user.email);
      if (avatarImgSideEl) {
        avatarImgSideEl.src = hasAvatar ? user.avatar : '';
        avatarImgSideEl.hidden = !hasAvatar;
      }
    }
    refreshSidebarAvatar();

    // ---- Sign out ----
    var signoutBtn = document.querySelector('[data-profile-signout]');
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
    var progressLabel = document.querySelector('[data-as-progress-label]');
    var progressFill = document.querySelector('[data-as-progress-fill]');

    function refreshCompletion() {
      var filled = REQUIRED_FIELDS.filter(function (key) { return !!(user[key] && String(user[key]).trim()); }).length;
      var pct = Math.round((filled / REQUIRED_FIELDS.length) * 100);
      if (progressLabel) progressLabel.textContent = 'Your profile is ' + pct + '% complete';
      if (progressFill) progressFill.style.width = pct + '%';
    }

    // ----------------------------------------------------------------
    // Profile Information (read-only display) — reflects `user`.
    // ----------------------------------------------------------------
    var ROLE_LABEL = { customer: 'Buyer', agent: 'Agent' };

    function refreshInfoDisplay() {
      var setInfo = function (key, value) {
        var el = document.querySelector('[data-as-info="' + key + '"]');
        if (el) el.textContent = value;
      };
      setInfo('name', user.name || '\u2014');
      setInfo('email', user.email || '\u2014');
      setInfo('phone', user.phone ? ('+234 ' + user.phone) : 'Not added yet');
      setInfo('location', user.location || 'Not added yet');
      setInfo('accountType', ROLE_LABEL[user.role] || 'Buyer');
      setInfo('dateJoined', formatDate(user.createdAt));
      refreshCompletion();
    }
    refreshInfoDisplay();

    // ----------------------------------------------------------------
    // Avatar — upload now lives ONLY here (not on Overview).
    // SWAP FOR BACKEND: POST the file to your upload endpoint and save
    // the returned URL instead of a base64 string.
    // ----------------------------------------------------------------
    var asAvatarEl = document.querySelector('[data-as-avatar]');
    var asAvatarImgEl = document.querySelector('[data-as-avatar-img]');
    var asAvatarInput = document.querySelector('[data-as-avatar-input]');
    var asAvatarTrigger = document.querySelector('[data-as-avatar-trigger]');

    function refreshAsAvatar() {
      var hasAvatar = !!user.avatar;
      if (asAvatarEl) asAvatarEl.textContent = initials(user.name, user.email);
      if (asAvatarImgEl) {
        asAvatarImgEl.src = hasAvatar ? user.avatar : '';
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
    var editTrigger = document.querySelector('[data-as-edit-trigger]');
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
    var locationRoot = document.getElementById('as-location-dropdown');
    if (locationRoot) {
      Accoom.setDropdownOptions(locationRoot, Accoom.getStates('Nigeria'), user.location || '');
      Accoom.initDropdown(locationRoot);
    }

    // Prefill the editable fields from the current user record.
    Accoom.$$('[data-as-field]').forEach(function (field) {
      var key = field.getAttribute('data-as-field');
      if (field.type === 'hidden') return; // location's hidden input is set by setDropdownOptions above
      if (user[key]) field.value = user[key];
    });

    if (detailsForm) {
      Accoom.on(detailsForm, 'submit', function (e) {
        e.preventDefault();

        Accoom.$$('[data-as-field]', detailsForm).forEach(function (field) {
          var key = field.getAttribute('data-as-field');
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
    Accoom.$$('[data-as-toggle-password]').forEach(function (btn) {
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

        var current = document.getElementById('as-current-password').value;
        var next = document.getElementById('as-new-password').value;
        var confirm = document.getElementById('as-confirm-password').value;

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
    // Two-Factor Authentication toggle
    // SWAP FOR BACKEND: POST /api/account/2fa { enabled } here.
    // ----------------------------------------------------------------
    var twoFaToggle = document.querySelector('[data-2fa-toggle]');
    if (twoFaToggle) {
      twoFaToggle.checked = !!user.twoFactorEnabled;
      Accoom.on(twoFaToggle, 'change', function () {
        user.twoFactorEnabled = twoFaToggle.checked;
        Accoom.setStorage('accoom-user', user);
      });
    }

    // ----------------------------------------------------------------
    // Notification Settings — each toggle's state is persisted, keyed
    // by data-notif-key. SWAP FOR BACKEND: PATCH /api/account/notifications
    // with the whole `prefs` object instead of localStorage.
    // ----------------------------------------------------------------
    var NOTIF_KEY = 'accoom-notification-prefs';
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

    var loginModal = document.querySelector('[data-as-login-modal]');
    var loginModalList = document.querySelector('[data-as-login-list]');
    var loginModalClose = document.querySelector('[data-as-login-modal-close]');
    var loginActivityBtn = document.querySelector('[data-as-login-activity]');

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
        var confirmed = window.confirm('Delete your ACCOOM account? This cannot be undone.');
        if (!confirmed) return;
        Accoom.setStorage('accoom-user', null);
        Accoom.removeStorage('accoom-conversations');
        Accoom.removeStorage('accoom_saved_properties');
        Accoom.removeStorage('accoom-purchases-log');
        Accoom.removeStorage(NOTIF_KEY);
        window.location.href = 'home.html';
      });
    }

  });

})(window.Accoom);