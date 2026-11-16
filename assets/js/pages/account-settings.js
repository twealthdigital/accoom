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
      window.location.href = 'auth.html?next=' + encodeURIComponent((location.pathname.split('/').pop() || 'home.html') + location.search + location.hash);
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


  });

})(window.Accoom);