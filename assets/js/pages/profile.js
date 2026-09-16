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
    // Display only — uploading/changing the photo now lives on Account
    // Settings. This just reflects whatever's already stored, and picks
    // up a change instantly if it happens there in another tab.
    var avatarImgEl = document.querySelector('[data-profile-avatar-img]');
    var avatarImgSideEl = document.querySelector('[data-profile-avatar-img-side]');

    function refreshAvatarDisplay() {
      var hasAvatar = !!user.avatar;
      if (avatarImgEl) {
        avatarImgEl.src = hasAvatar ? user.avatar : '';
        avatarImgEl.hidden = !hasAvatar;
      }
      if (avatarImgSideEl) {
        avatarImgSideEl.src = hasAvatar ? user.avatar : '';
        avatarImgSideEl.hidden = !hasAvatar;
      }
    }

    refreshAvatarDisplay();

    // ----------------------------------------------------------------
    // Deposit button — sends the buyer to the wallet top-up step on the
    // payment page (no property/amount context, so the page asks the
    // user how much to add). context=wallet is what tells payment.js
    // this is a plain top-up and not a property checkout.
    // ----------------------------------------------------------------
    var depositBtn = document.querySelector('[data-profile-deposit-btn]');
    if (depositBtn) {
      Accoom.on(depositBtn, 'click', function () {
        window.location.href = 'payment.html?context=wallet&mode=deposit&return=profile.html';
      });
    }

    // ----------------------------------------------------------------
    // Stats — balance comes from the shared wallet module and stays in
    // sync live (e.g. right after a deposit lands, or in another tab).
    // Plug real counts in for purchases/orders/saved once they have
    // somewhere to live; left at 0 until then.
    // ----------------------------------------------------------------
    var DASHBOARD_LOG = Accoom.getStorage('accoom-purchases-log', []);
    if (!Array.isArray(DASHBOARD_LOG)) DASHBOARD_LOG = [];

    var stats = {
      purchases: DASHBOARD_LOG.filter(function (p) { return p.status === 'completed'; }).length,
      orders: 0,
      saved: 0
    };
    function renderBalanceStat() {
      var el = document.querySelector('[data-profile-stat="balance"]');
      if (el) el.textContent = Accoom.formatWalletAmount(Accoom.getWalletBalance());
    }
    renderBalanceStat();
    document.addEventListener(Accoom.WALLET_UPDATED_EVENT, renderBalanceStat);

    Accoom.$$('[data-profile-stat]').forEach(function (el) {
      var key = el.getAttribute('data-profile-stat');
      if (key === 'balance') {
        return; // handled by renderBalanceStat() above
      } else {
        el.textContent = stats[key] || 0;
      }
    });

    // ----------------------------------------------------------------
    // Orders — renders rows if any exist, otherwise keeps the empty state
    // already in the markup. Call renderOrders([...]) once real data exists.
    // ----------------------------------------------------------------
    var ordersList = document.querySelector('[data-profile-orders]');
    var ordersEmpty = document.querySelector('[data-profile-orders-empty]');

    var STATUS_CLASS = {
      upcoming: 'profile-order-status--upcoming',
      completed: 'profile-order-status--completed',
      cancelled: 'profile-order-status--cancelled'
    };
    var STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };

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
        li.dataset.orderId = order.id;
        li.dataset.orderName = order.name;
        li.dataset.orderPrice = order.price;
        li.dataset.orderImage = order.image;
        var statusBadge = order.status
          ? '<span class="profile-order-status ' + (STATUS_CLASS[order.status] || '') + '">' + (STATUS_LABEL[order.status] || order.status) + '</span>'
          : '';
        li.innerHTML =
          '<a class="profile-order-link" href="property.html?id=' + encodeURIComponent(order.id) + '&name=' + encodeURIComponent(order.name) + '">' +
            '<div class="profile-order-thumb"><img src="' + order.image + '" alt="' + order.name + '" /></div>' +
            '<div class="profile-order-body">' +
              '<h4>' + order.name + '</h4>' +
              '<p class="profile-order-price">' + order.price + '<span> / year</span></p>' +
            '</div>' +
          '</a>' +
          statusBadge +
          '<button type="button" class="profile-order-more" aria-label="More options">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>' +
          '</button>';
        ordersList.insertBefore(li, ordersEmpty);
      });
    }

    // ----------------------------------------------------------------
    // Order item menu (⋮) — Save Property / Remove
    // Menu is a single node appended to <body> and repositioned with
    // getBoundingClientRect() each time it opens, so it's never clipped
    // by the scrolling order list and works in any layout/viewport.
    // ----------------------------------------------------------------
    var orderMenu = null;
    var orderMenuActiveLi = null;
    var orderMenuActiveBtn = null;

    function buildOrderMenu() {
      if (orderMenu) return orderMenu;
      orderMenu = document.createElement('div');
      orderMenu.className = 'profile-order-menu';
      orderMenu.innerHTML =
        '<button type="button" class="profile-order-menu-item" data-order-action="save">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>' +
          '<span>Save Property</span>' +
        '</button>' +
        '<button type="button" class="profile-order-menu-item profile-order-menu-item--danger" data-order-action="remove">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>' +
          '<span>Remove</span>' +
        '</button>';
      document.body.appendChild(orderMenu);
      return orderMenu;
    }

    function closeOrderMenu() {
      if (orderMenu) orderMenu.classList.remove('is-open');
      if (orderMenuActiveBtn) orderMenuActiveBtn.classList.remove('is-active');
      orderMenuActiveLi = null;
      orderMenuActiveBtn = null;
    }

    function positionOrderMenu(btn) {
      var rect = btn.getBoundingClientRect();
      var menu = orderMenu;
      menu.style.visibility = 'hidden';
      menu.classList.add('is-open');

      var menuW = menu.offsetWidth;
      var menuH = menu.offsetHeight;
      var vw = window.innerWidth;
      var vh = window.innerHeight;

      var left = rect.right - menuW;
      if (left < 8) left = rect.left;
      if (left + menuW > vw - 8) left = vw - menuW - 8;

      var top = rect.bottom + 6;
      if (top + menuH > vh - 8) top = rect.top - menuH - 6;
      if (top < 8) top = 8;

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.style.visibility = 'visible';
    }

    function openOrderMenu(btn, li) {
      var menu = buildOrderMenu();
      var reopening = orderMenuActiveLi === li && menu.classList.contains('is-open');
      closeOrderMenu();
      if (reopening) return;
      orderMenuActiveLi = li;
      orderMenuActiveBtn = btn;
      btn.classList.add('is-active');
      positionOrderMenu(btn);
    }

    function saveOrderToSavedProperties(li) {
      var property = {
        id: li.dataset.orderId,
        name: li.dataset.orderName,
        price: li.dataset.orderPrice,
        image: li.dataset.orderImage
      };
      var saved = JSON.parse(localStorage.getItem('accoom_saved_properties') || '[]');
      var exists = saved.some(function (p) { return p.id === property.id; });
      if (!exists) {
        saved.push(property);
        localStorage.setItem('accoom_saved_properties', JSON.stringify(saved));
      }
      // No Saved Properties panel yet — this just persists the data under
      // 'accoom_saved_properties' so that panel can read it once it exists.
    }

    function removeOrder(li) {
      li.remove();
      if (ordersList && !ordersList.querySelector('.profile-order-item')) {
        if (ordersEmpty) ordersEmpty.hidden = false;
      }
    }

    if (ordersList) {
      Accoom.on(ordersList, 'click', function (e) {
        var moreBtn = e.target.closest('.profile-order-more');
        if (!moreBtn) return;
        e.stopPropagation();
        openOrderMenu(moreBtn, moreBtn.closest('.profile-order-item'));
      });
    }

    document.addEventListener('click', function (e) {
      var action = e.target.closest('[data-order-action]');
      if (action && orderMenuActiveLi) {
        var li = orderMenuActiveLi;
        if (action.dataset.orderAction === 'save') saveOrderToSavedProperties(li);
        if (action.dataset.orderAction === 'remove') removeOrder(li);
        closeOrderMenu();
        return;
      }
      if (orderMenu && orderMenu.classList.contains('is-open') && !orderMenu.contains(e.target)) {
        closeOrderMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeOrderMenu();
    });

    window.addEventListener('scroll', closeOrderMenu, true);
    window.addEventListener('resize', closeOrderMenu);

    // ----------------------------------------------------------------
    // Mock purchases — swap this for a real fetch once the backend
    // exists, e.g.:
    //   fetch('/api/account/purchases')
    //     .then(function (res) { return res.json(); })
    //     .then(renderOrders)
    //     .catch(function () { renderOrders([]); });
    // renderOrders([]) (no arg / empty array) shows the empty state.
    // ----------------------------------------------------------------
    // Same combined data set purchases.js renders (mock catalogue +
    // anything logged from the chat's payment flow), so a status here —
    // upcoming, completed, or cancelled — always matches what's on the
    // My Purchases page instead of a separate hardcoded, status-less list.
    var MOCK_PURCHASES = [
      { id: 'ACCOOM-2025-0008', name: '2 Bedroom Apartment', price: '\u20A6250,000', image: 'assets/images/home-properties/miniflat.png', status: 'upcoming' },
      { id: 'ACCOOM-2025-0007', name: 'Modern Detached Duplex', price: '\u20A6450,000', image: 'assets/images/home-properties/hall2.png', status: 'completed' },
      { id: 'ACCOOM-2025-0006', name: '1 Bedroom Apartment', price: '\u20A6120,000', image: 'assets/images/home-properties/bedroomflat3.png', status: 'completed' },
      { id: 'ACCOOM-2025-0005', name: 'Self-Contained Studio', price: '\u20A680,000', image: 'assets/images/home-properties/selfcon1.png', status: 'cancelled' },
      { id: 'ACCOOM-2025-0004', name: '3 Bedroom Apartment', price: '\u20A6350,000', image: 'assets/images/home-properties/miniflat1.png', status: 'completed' },
      { id: 'ACCOOM-2025-0003', name: 'Mini Flat', price: '\u20A6180,000', image: 'assets/images/home-properties/miniflat.png', status: 'completed' },
      { id: 'ACCOOM-2025-0002', name: '4 Bedroom Detached Duplex', price: '\u20A6460,000', image: 'assets/images/home-properties/hall2.png', status: 'completed' },
      { id: 'ACCOOM-2025-0001', name: 'Self-Contained Studio', price: '\u20A675,000', image: 'assets/images/home-properties/selfcon1.png', status: 'completed' }
    ];

    if (Array.isArray(DASHBOARD_LOG) && DASHBOARD_LOG.length) {
      MOCK_PURCHASES = DASHBOARD_LOG.concat(MOCK_PURCHASES);
    }

    // Overview only ever needs the 3 most recent, whatever their status.
    renderOrders(MOCK_PURCHASES.slice(0, 3));

    // ----------------------------------------------------------------
    // Sidebar tabs — the other pages aren't built yet, so clicking just
    // marks the tab active. No navigation, nothing else changes.
    // ----------------------------------------------------------------
    var navLinks = Accoom.$$('[data-profile-link]');
    var mainTitleEl = document.querySelector('[data-profile-main-title]');
    var backBtn = document.querySelector('[data-profile-back-btn]');

    // Real sub-pages (My Purchases, Saved Properties, Account Settings)
    // navigate away entirely, so when the user hits the back arrow on one
    // of them, this page does a full fresh load — the markup's hardcoded
    // "Overview" is-active is all it has to go on. We remember which row
    // was actually tapped so the mobile menu list can restore it instead
    // of always snapping back to Overview.
    var LAST_SECTION_KEY = 'accoom-last-account-section';

    function sectionKeyFromHref(href) {
      return (!href || href === '#') ? 'profile' : href.replace('.html', '');
    }

    (function restoreLastActiveSection() {
      var saved = null;
      try { saved = sessionStorage.getItem(LAST_SECTION_KEY); } catch (err) {}
      if (!saved || saved === 'profile') return;

      var savedLink = navLinks.filter(function (l) {
        return sectionKeyFromHref(l.getAttribute('href')) === saved;
      })[0];
      if (!savedLink) return;

      navLinks.forEach(function (l) { l.classList.remove('is-active'); });
      savedLink.classList.add('is-active');
    })();

    navLinks.forEach(function (link) {
      Accoom.on(link, 'click', function (e) {
        var href = this.getAttribute('href');

        try { sessionStorage.setItem(LAST_SECTION_KEY, sectionKeyFromHref(href)); } catch (err) {}

        if (href && href !== '#') {
          return; // real page link (e.g. My Purchases) — let it navigate, its own page sets the active state
        }

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

