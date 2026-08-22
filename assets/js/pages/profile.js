/* ==========================================================================
   ACCOOM — Profile Page
   No backend yet: everything here reads from the same 'accoom-user' record
   main.js/auth.js already write to storage. Order/stat rendering is wired
   up so it's a one-line swap once real data exists.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.profile-page');
    if (!page) return;

    var user = Accoom.getStorage('accoom-user', null);

    // Belt-and-braces: the inline <head> script already bounces guests
    // before paint, this just covers it if storage changed mid-session.
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

    function memberSince(isoDate) {
      var date = isoDate ? new Date(isoDate) : null;
      if (!date || isNaN(date.getTime())) date = new Date();
      return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    }

    // ----------------------------------------------------------------
    // Populate hero + info card from the stored user
    // ----------------------------------------------------------------
    var avatarEl = document.querySelector('[data-profile-avatar]');
    var nameEl = document.querySelector('[data-profile-name]');
    var memberEl = document.querySelector('[data-profile-member-since]');
    var emailEl = document.querySelector('[data-profile-email]');
    var avatarSideEl = document.querySelector('[data-profile-avatar-side]');
    var nameSideEl = document.querySelector('[data-profile-name-side]');
    var memberSideEl = document.querySelector('[data-profile-member-since-side]');
    var descSideEl = document.querySelector('[data-profile-desc-side]');

    if (avatarEl) avatarEl.textContent = initials(user.name, user.email);
    if (nameEl) nameEl.textContent = firstName(user.name, user.email);
    if (memberEl) memberEl.textContent = memberSince(user.createdAt);
    if (emailEl) emailEl.textContent = user.email || 'Not added yet';

    if (avatarSideEl) avatarSideEl.textContent = initials(user.name, user.email);
    if (nameSideEl) nameSideEl.textContent = firstName(user.name, user.email);
    if (memberSideEl) memberSideEl.textContent = memberSince(user.createdAt);

    // ----------------------------------------------------------------
    // Avatar upload — stored as base64 on the same user record.
    // ----------------------------------------------------------------
    var avatarImgEl = document.querySelector('[data-profile-avatar-img]');
    var avatarImgSideEl = document.querySelector('[data-profile-avatar-img-side]');
    var avatarInput = document.querySelector('[data-profile-avatar-input]');
    var avatarAddBtn = document.querySelector('[data-profile-avatar-add]');
    var avatarEditBtn = document.querySelector('[data-profile-avatar-edit]');
    var avatarDeleteBtn = document.querySelector('[data-profile-avatar-delete]');

    function refreshAvatarButtons() {
      var hasAvatar = !!user.avatar;
      if (avatarImgEl) {
        avatarImgEl.src = hasAvatar ? user.avatar : '';
        avatarImgEl.hidden = !hasAvatar;
      }
      if (avatarImgSideEl) {
        avatarImgSideEl.src = hasAvatar ? user.avatar : '';
        avatarImgSideEl.hidden = !hasAvatar;
      }
      if (avatarAddBtn) avatarAddBtn.hidden = hasAvatar;
      if (avatarEditBtn) avatarEditBtn.hidden = !hasAvatar;
      if (avatarDeleteBtn) avatarDeleteBtn.hidden = !hasAvatar;
    }

    refreshAvatarButtons();

    function openAvatarPicker() {
      if (avatarInput) avatarInput.click();
    }

    if (avatarAddBtn) Accoom.on(avatarAddBtn, 'click', openAvatarPicker);
    if (avatarEditBtn) Accoom.on(avatarEditBtn, 'click', openAvatarPicker);

    if (avatarInput) {
      Accoom.on(avatarInput, 'change', function () {
        var file = avatarInput.files && avatarInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          user.avatar = reader.result;
          Accoom.setStorage('accoom-user', user);
          refreshAvatarButtons();
        };
        reader.readAsDataURL(file);
        avatarInput.value = '';
      });
    }

    if (avatarDeleteBtn) {
      Accoom.on(avatarDeleteBtn, 'click', function () {
        user.avatar = null;
        Accoom.setStorage('accoom-user', user);
        refreshAvatarButtons();
      });
    }

    // ----------------------------------------------------------------
    // Edit profile: name + description, one button toggles both
    // ----------------------------------------------------------------
    var DESC_MAX = 150;
    var NAME_MAX = 30;

    var heroEditBtn = document.querySelector('[data-profile-edit-toggle]');
    var editIcon = document.querySelector('[data-profile-edit-icon]');
    var saveIcon = document.querySelector('[data-profile-save-icon]');
    var editLabel = document.querySelector('[data-profile-edit-label]');

    var nameDisplay = document.querySelector('[data-profile-name]');
    var nameInput = document.querySelector('[data-profile-name-input]');
    var nameCounter = document.querySelector('[data-profile-name-counter]');

    var descDisplay = document.querySelector('[data-profile-desc]');
    var descEditWrap = document.querySelector('[data-profile-desc-edit]');
    var descInput = document.querySelector('[data-profile-desc-input]');
    var descCounter = document.querySelector('[data-profile-desc-counter]');

    if (descDisplay && user.bio) descDisplay.textContent = user.bio;
    if (descSideEl && user.bio) descSideEl.textContent = user.bio;

    var isEditingProfile = false;

    function updateDescCounter() {
      if (!descCounter || !descInput) return;
      var len = descInput.value.length;
      descCounter.textContent = len + '/' + DESC_MAX;
      descCounter.classList.toggle('is-near-limit', len >= DESC_MAX * 0.85 && len < DESC_MAX);
      descCounter.classList.toggle('is-at-limit', len >= DESC_MAX);
    }

    function updateNameCounter() {
      if (!nameCounter || !nameInput) return;
      var len = nameInput.value.length;
      nameCounter.textContent = len + '/' + NAME_MAX;
      nameCounter.classList.toggle('is-near-limit', len >= NAME_MAX * 0.85 && len < NAME_MAX);
      nameCounter.classList.toggle('is-at-limit', len >= NAME_MAX);
    }

    function enterProfileEdit() {
      isEditingProfile = true;
      nameInput.value = nameDisplay.textContent.trim();
      descInput.value = descDisplay.textContent.trim();
      updateDescCounter();
      updateNameCounter();

      nameDisplay.hidden = true;
      nameInput.hidden = false;
      if (nameCounter) nameCounter.hidden = false;
      descDisplay.hidden = true;
      descEditWrap.hidden = false;

      if (editIcon) editIcon.style.setProperty('display', 'none', 'important');
      if (saveIcon) saveIcon.style.setProperty('display', 'inline-block', 'important');
      if (editLabel) editLabel.textContent = 'Save Edits';
      heroEditBtn.classList.add('is-editing');

      nameInput.focus();
    }

    function exitProfileEdit() {
      isEditingProfile = false;
      nameDisplay.hidden = false;
      nameInput.hidden = true;
      if (nameCounter) nameCounter.hidden = true;
      descDisplay.hidden = false;
      descEditWrap.hidden = true;

      if (editIcon) editIcon.style.setProperty('display', 'inline-block', 'important');
      if (saveIcon) saveIcon.style.setProperty('display', 'none', 'important');
      if (editLabel) editLabel.textContent = 'Edit Profile';
      heroEditBtn.classList.remove('is-editing');
    }

    function saveProfileEdit() {
      var newName = nameInput.value.trim().slice(0, NAME_MAX);
      var newDesc = descInput.value.trim().slice(0, DESC_MAX);

      if (newName) {
        nameDisplay.textContent = newName;
        if (nameSideEl) nameSideEl.textContent = newName;
        user.name = newName;
      }
      descDisplay.textContent = newDesc;
      if (descSideEl) descSideEl.textContent = newDesc;
      user.bio = newDesc;

      Accoom.setStorage('accoom-user', user);
      exitProfileEdit();
    }

    if (heroEditBtn) {
      Accoom.on(heroEditBtn, 'click', function () {
        if (isEditingProfile) {
          saveProfileEdit();
        } else {
          enterProfileEdit();
        }
      });
    }

    if (descInput) {
      Accoom.on(descInput, 'input', updateDescCounter);
    }

    if (nameInput) {
      Accoom.on(nameInput, 'input', updateNameCounter);
    }

    if (nameInput) {
      Accoom.on(nameInput, 'keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveProfileEdit();
        }
        if (e.key === 'Escape') exitProfileEdit();
      });
    }

    // ----------------------------------------------------------------
    // Stats — plug real counts in here once orders/saved/addresses/
    // payments have somewhere to live. Left at 0 until then.
    // ----------------------------------------------------------------
    var stats = { orders: 0, saved: 0, addresses: 0, payments: 0 };
    Accoom.$$('[data-profile-stat]').forEach(function (el) {
      var key = el.getAttribute('data-profile-stat');
      el.textContent = stats[key] || 0;
    });

    // ----------------------------------------------------------------
    // Orders — renders rows if any exist, otherwise keeps the empty state
    // already in the markup. Call renderOrders([...]) once real data exists.
    // ----------------------------------------------------------------
    var ordersList = document.querySelector('[data-profile-orders]');
    var ordersEmpty = document.querySelector('[data-profile-orders-empty]');

    var STATUS_CLASS = {
      completed: 'profile-order-status--completed',
      processing: 'profile-order-status--processing',
      shipped: 'profile-order-status--shipped'
    };

    function renderOrders(orders) {
      if (!ordersList) return;
      if (!orders || !orders.length) {
        if (ordersEmpty) ordersEmpty.hidden = false;
        return;
      }
      if (ordersEmpty) ordersEmpty.hidden = true;

      orders.forEach(function (order) {
        var li = document.createElement('li');
        li.className = 'profile-order-item';
        li.innerHTML =
          '<a class="profile-order-link" href="property.html?id=' + encodeURIComponent(order.id) + '&name=' + encodeURIComponent(order.name) + '">' +
            '<div class="profile-order-thumb"><img src="' + order.image + '" alt="' + order.name + '" /></div>' +
            '<div class="profile-order-body">' +
              '<h4>' + order.name + '</h4>' +
              '<p class="profile-order-price">' + order.price + '<span> / year</span></p>' +
            '</div>' +
          '</a>' +
          '<button type="button" class="profile-order-more" aria-label="More options">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>' +
          '</button>';
        ordersList.insertBefore(li, ordersEmpty);
      });
    }

    // ----------------------------------------------------------------
    // Mock purchases — swap this for a real fetch once the backend
    // exists, e.g.:
    //   fetch('/api/account/purchases')
    //     .then(function (res) { return res.json(); })
    //     .then(renderOrders)
    //     .catch(function () { renderOrders([]); });
    // renderOrders([]) (no arg / empty array) shows the empty state.
    // ----------------------------------------------------------------
    var MOCK_PURCHASES = [
      { id: 'ACCOM-30021', name: '4 Bedroom Detached Duplex', price: '\u20A6460,000', image: 'assets/images/home-properties/miniflat1.png' },
      { id: 'ACCOM-30022', name: '2 Bedroom Apartment', price: '\u20A6325,000', image: 'assets/images/home-properties/miniflat.png' },
      { id: 'ACCOM-30023', name: 'Self-Contained Studio', price: '\u20A6280,000', image: 'assets/images/home-properties/selfcon1.png' },
      { id: 'ACCOM-30024', name: '3 Bedroom Flat', price: '\u20A6550,000', image: 'assets/images/home-properties/hall2.png' },
      { id: 'ACCOM-30025', name: 'Mini Flat', price: '\u20A6310,000', image: 'assets/images/home-properties/bedroomflat3.png' }
    ];

    renderOrders(MOCK_PURCHASES);

    // ----------------------------------------------------------------
    // Sidebar tabs — the other pages aren't built yet, so clicking just
    // marks the tab active. No navigation, nothing else changes.
    // ----------------------------------------------------------------
    var navLinks = Accoom.$$('[data-profile-link]');
    var mainTitleEl = document.querySelector('[data-profile-main-title]');
    var backBtn = document.querySelector('[data-profile-back-btn]');

    navLinks.forEach(function (link) {
      Accoom.on(link, 'click', function (e) {
        e.preventDefault();
        navLinks.forEach(function (l) { l.classList.remove('is-active'); });
        this.classList.add('is-active');

        // Mobile: the sidebar is a menu list — tapping a row opens the
        // detail view. No-op on desktop, where both panes already show.
        if (window.matchMedia('(max-width: 899px)').matches) {
          page.classList.add('is-detail-open');
          if (mainTitleEl) {
            var titleEl = this.querySelector('.profile-nav-link-title');
            mainTitleEl.textContent = titleEl ? titleEl.textContent.trim() : this.textContent.trim();
          }
          window.scrollTo(0, 0);
        }
      });
    });

    if (backBtn) {
      Accoom.on(backBtn, 'click', function () {
        page.classList.remove('is-detail-open');
      });
    }

    // ----------------------------------------------------------------
    // Sign out (sidebar button — the header Account menu already has
    // its own Sign out entry wired up in main.js)
    // ----------------------------------------------------------------
    var signoutBtn = document.querySelector('[data-profile-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

  });

})(window.Accoom);