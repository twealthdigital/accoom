/* ==========================================================================
   ACCOOM — My Purchases Page
   No backend yet: reads the same 'accoom-user' record as profile.js for the
   sidebar hero, and renders from MOCK_PURCHASES below. Swap MOCK_PURCHASES
   for a real fetch (see the comment near the bottom) once the backend
   exists — everything else (tabs, filter dropdown, pagination) stays as is.
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
    // Sidebar hero — same fields profile.js fills in on the account page
    // ----------------------------------------------------------------
    var avatarSideEl = document.querySelector('[data-profile-avatar-side]');
    var avatarImgSideEl = document.querySelector('[data-profile-avatar-img-side]');
    var nameSideEl = document.querySelector('[data-profile-name-side]');
    var memberSideEl = document.querySelector('[data-profile-member-since-side]');

    if (avatarSideEl) avatarSideEl.textContent = initials(user.name, user.email);
    if (nameSideEl) nameSideEl.textContent = firstName(user.name, user.email);
    if (memberSideEl) memberSideEl.textContent = memberSince(user.createdAt);
    if (avatarImgSideEl && user.avatar) {
      avatarImgSideEl.src = user.avatar;
      avatarImgSideEl.hidden = false;
      if (avatarSideEl) avatarSideEl.hidden = true;
    }

    // ----------------------------------------------------------------
    // Sign out
    // ----------------------------------------------------------------
    var signoutBtn = document.querySelector('[data-purchases-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

    // ----------------------------------------------------------------
    // Mock purchases — swap this for a real fetch once the backend
    // exists, e.g.:
    //   fetch('/api/account/purchases')
    //     .then(function (res) { return res.json(); })
    //     .then(renderPage)
    //     .catch(function () { renderPage([]); });
    // Each status must be one of: upcoming, completed, cancelled.
    // ----------------------------------------------------------------
    var MOCK_PURCHASES = [
      { id: 'ACCOOM-2025-0008', name: '2 Bedroom Apartment', location: 'Lekki Phase 1, Lagos', dates: 'Aug 20 \u2013 Aug 25, 2025', guests: 2, amount: '\u20A6250,000', image: 'assets/images/home-properties/miniflat.png', status: 'upcoming' },
      { id: 'ACCOOM-2025-0007', name: 'Modern Detached Duplex', location: 'Ikoyi, Lagos', dates: 'Jul 10 \u2013 Jul 15, 2025', guests: 4, amount: '\u20A6450,000', image: 'assets/images/home-properties/hall2.png', status: 'completed' },
      { id: 'ACCOOM-2025-0006', name: '1 Bedroom Apartment', location: 'Victoria Island, Lagos', dates: 'Jun 25 \u2013 Jun 28, 2025', guests: 1, amount: '\u20A6120,000', image: 'assets/images/home-properties/bedroomflat3.png', status: 'completed' },
      { id: 'ACCOOM-2025-0005', name: 'Self-Contained Studio', location: 'Yaba, Lagos', dates: 'May 15 \u2013 May 18, 2025', guests: 1, amount: '\u20A680,000', image: 'assets/images/home-properties/selfcon1.png', status: 'cancelled' },
      { id: 'ACCOOM-2025-0004', name: '3 Bedroom Apartment', location: 'Lekki Phase 1, Lagos', dates: 'Apr 10 \u2013 Apr 15, 2025', guests: 3, amount: '\u20A6350,000', image: 'assets/images/home-properties/miniflat1.png', status: 'completed' },
      { id: 'ACCOOM-2025-0003', name: 'Mini Flat', location: 'Surulere, Lagos', dates: 'Mar 5 \u2013 Mar 8, 2025', guests: 2, amount: '\u20A6180,000', image: 'assets/images/home-properties/miniflat.png', status: 'completed' },
      { id: 'ACCOOM-2025-0002', name: '4 Bedroom Detached Duplex', location: 'Ajah, Lagos', dates: 'Feb 12 \u2013 Feb 17, 2025', guests: 5, amount: '\u20A6460,000', image: 'assets/images/home-properties/hall2.png', status: 'completed' },
      { id: 'ACCOOM-2025-0001', name: 'Self-Contained Studio', location: 'Yaba, Lagos', dates: 'Jan 3 \u2013 Jan 6, 2025', guests: 1, amount: '\u20A675,000', image: 'assets/images/home-properties/selfcon1.png', status: 'completed' }
    ];

    var STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };
    var STATUS_CLASS = { upcoming: 'purchase-status--upcoming', completed: 'purchase-status--completed', cancelled: 'purchase-status--cancelled' };
    var PAGE_SIZE = 5;

    var state = { status: 'all', page: 1 };

    var listEl = document.querySelector('[data-purchases-list]');
    var emptyEl = document.querySelector('[data-purchases-empty]');
    var tabsEl = document.querySelector('[data-purchases-tabs]');
    var statusLabelEl = document.querySelector('[data-purchases-status-label]');
    var statusDropdown = document.querySelector('.purchases-status-dropdown');
    var paginationEl = document.querySelector('[data-purchases-pagination]');
    var pageNumbersEl = document.querySelector('[data-purchases-page-numbers]');
    var prevBtn = document.querySelector('[data-purchases-prev]');
    var nextBtn = document.querySelector('[data-purchases-next]');

    function updateCounts() {
      ['upcoming', 'completed', 'cancelled'].forEach(function (key) {
        var count = MOCK_PURCHASES.filter(function (p) { return p.status === key; }).length;
        var el = document.querySelector('[data-purchases-count="' + key + '"]');
        if (el) el.textContent = count;
      });
    }

    function getFiltered() {
      if (state.status === 'all') return MOCK_PURCHASES;
      return MOCK_PURCHASES.filter(function (p) { return p.status === state.status; });
    }

    function renderCard(order) {
      var article = document.createElement('article');
      article.className = 'purchase-item';
      article.innerHTML =
        '<div class="purchase-thumb"><img src="' + order.image + '" alt="' + order.name + '" /></div>' +
        '<div class="purchase-info">' +
          '<h4>' + order.name + '</h4>' +
          '<div class="purchase-meta">' +
            '<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>' + order.location + '</span>' +
            '<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' + order.dates + '</span>' +
            '<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' + order.guests + (order.guests === 1 ? ' Guest' : ' Guests') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="purchase-order">' +
          '<span class="purchase-order-label">Order ID</span>' +
          '<span class="purchase-order-value">#' + order.id + '</span>' +
          '<span class="purchase-order-label">Amount</span>' +
          '<span class="purchase-amount-value">' + order.amount + '</span>' +
        '</div>' +
        '<div class="purchase-side">' +
          '<span class="purchase-status ' + STATUS_CLASS[order.status] + '">' + STATUS_LABEL[order.status] + '</span>' +
          '<a class="purchase-view-btn" href="purchase-details.html?id=' + encodeURIComponent(order.id) + '">' +
            'View Details' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
          '</a>' +
        '</div>';
      return article;
    }

    function renderPagination(totalPages) {
      if (!paginationEl) return;
      if (totalPages <= 1) {
        paginationEl.hidden = true;
        return;
      }
      paginationEl.hidden = false;

      if (prevBtn) prevBtn.disabled = state.page <= 1;
      if (nextBtn) nextBtn.disabled = state.page >= totalPages;

      if (pageNumbersEl) {
        pageNumbersEl.innerHTML = '';
        for (var i = 1; i <= totalPages; i++) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'purchases-page-number' + (i === state.page ? ' is-active' : '');
          btn.textContent = i;
          btn.setAttribute('data-purchases-page-number', i);
          pageNumbersEl.appendChild(btn);
        }
      }
    }

    function render() {
      if (!listEl) return;
      var filtered = getFiltered();
      var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      if (state.page > totalPages) state.page = totalPages;

      var start = (state.page - 1) * PAGE_SIZE;
      var pageItems = filtered.slice(start, start + PAGE_SIZE);

      listEl.querySelectorAll('.purchase-item').forEach(function (el) { el.remove(); });

      if (!pageItems.length) {
        if (emptyEl) emptyEl.hidden = false;
      } else {
        if (emptyEl) emptyEl.hidden = true;
        pageItems.forEach(function (order) {
          listEl.appendChild(renderCard(order));
        });
      }

      renderPagination(totalPages);
    }

    function moveIndicator(activeTab) {
      var indicator = document.querySelector('[data-purchases-indicator]');
      if (!indicator || !activeTab) return;
      indicator.style.transform = 'translateX(' + activeTab.offsetLeft + 'px)';
      indicator.style.width = activeTab.offsetWidth + 'px';
    }

    function setStatus(status) {
      state.status = status;
      state.page = 1;

      if (tabsEl) {
        tabsEl.querySelectorAll('[data-purchases-tab]').forEach(function (tab) {
          var isActive = tab.getAttribute('data-purchases-tab') === status;
          tab.classList.toggle('is-active', isActive);
          tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        moveIndicator(tabsEl.querySelector('.is-active'));
      }

      if (statusLabelEl) {
        var chevron = statusLabelEl.querySelector('.chevron');
        statusLabelEl.textContent = (status === 'all' ? 'All Status' : STATUS_LABEL[status]);
        if (chevron) statusLabelEl.appendChild(chevron);
      }

      render();
    }

    // Tabs
    if (tabsEl) {
      Accoom.on(tabsEl, 'click', function (e) {
        var tab = e.target.closest('[data-purchases-tab]');
        if (!tab) return;
        setStatus(tab.getAttribute('data-purchases-tab'));
      });
    }

    // "All Status" dropdown — open/close handled by the shared dropdown
    // module, onSelect just filters. No navigation, no label logic here.
    if (statusDropdown) {
      Accoom.initDropdown(statusDropdown, {
        onSelect: function (value) {
          setStatus(value);
        }
      });
    }

    // Pagination controls
    if (prevBtn) {
      Accoom.on(prevBtn, 'click', function () {
        if (state.page > 1) { state.page -= 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
    }
    if (nextBtn) {
      Accoom.on(nextBtn, 'click', function () {
        var totalPages = Math.max(1, Math.ceil(getFiltered().length / PAGE_SIZE));
        if (state.page < totalPages) { state.page += 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
    }
    if (pageNumbersEl) {
      Accoom.on(pageNumbersEl, 'click', function (e) {
        var btn = e.target.closest('[data-purchases-page-number]');
        if (!btn) return;
        state.page = parseInt(btn.getAttribute('data-purchases-page-number'), 10) || 1;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    updateCounts();
    render();
    if (tabsEl) moveIndicator(tabsEl.querySelector('.is-active'));

  });

})(window.Accoom);