/* ==========================================================================
   ACCOOM — Agent Dashboard
   No backend yet: reads the agent record from 'accoom-user' (same one
   agent-details.js writes) and their uploads from 'accoom-agent-listings'.
   Swap FOLDERS / ACTIVITY for real fetches once those endpoints exist —
   the render functions below already take a plain array.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.ag-dash-page');
    if (!page) return;

    var user = Accoom.getStorage('accoom-user', null);
    if (!user) {
      window.location.href = 'auth.html';
      return;
    }

    var AGENT_TYPE_LABEL = {
      landlord: 'Individual Landlord',
      manager: 'Property Manager',
      agency: 'Real Estate Agency',
      developer: 'Developer'
    };

    function initials(name, email) {
      var source = (name || '').trim();
      if (source) {
        var parts = source.split(/\s+/);
        var first = parts[0].charAt(0);
        var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
      }
      if (email) return email.charAt(0).toUpperCase();
      return 'AG';
    }

    function firstName(name, email) {
      if (name && name.trim()) return name.trim().split(/\s+/)[0];
      if (email) return email.split('@')[0];
      return 'there';
    }

    // ----------------------------------------------------------------
    // Identity — sidebar card + topbar greeting
    // ----------------------------------------------------------------
    var nameEl = document.querySelector('[data-ag-name]');
    var typeEl = document.querySelector('[data-ag-type]');
    var firstNameEl = document.querySelector('[data-ag-first-name]');
    var avatarEl = document.querySelector('[data-ag-avatar]');
    var avatarImgEl = document.querySelector('[data-ag-avatar-img]');
    var verifiedBadge = document.querySelector('[data-ag-verified-badge]');
    var verifyNotice = document.querySelector('[data-ag-verify-notice]');

    if (nameEl) nameEl.textContent = user.name || user.email || 'Agent';
    if (typeEl) typeEl.textContent = AGENT_TYPE_LABEL[user.agentType] || 'Agent';
    if (firstNameEl) firstNameEl.textContent = firstName(user.name, user.email);

    // Show the uploaded photo only — the initials circle is a fallback
    // for when there's no photo, not something layered underneath one.
    if (user.avatar && avatarImgEl) {
      avatarImgEl.src = user.avatar;
      avatarImgEl.hidden = false;
      if (avatarEl) avatarEl.hidden = true;
    } else if (avatarEl) {
      avatarEl.textContent = initials(user.name, user.email);
    }

    var ninVerified = user.ninVerified === true;
    if (verifiedBadge) verifiedBadge.hidden = !ninVerified;
    if (verifyNotice) verifyNotice.hidden = ninVerified;

    // ----------------------------------------------------------------
    // Uploads — one folder per property the agent has submitted.
    // Reads 'accoom-agent-listings' if the upload flow has written to
    // it; otherwise falls back to a small mock set so the layout has
    // something real to show. Swap this block for a fetch keyed on
    // the agent's id once listings have a backend.
    // ----------------------------------------------------------------
    var MOCK_FOLDERS = [
      {
        id: 'LST-1042',
        name: '2 Bedroom Detached Duplex',
        location: 'Lekki Phase 1, Lagos',
        status: 'available',
        cover: 'assets/images/home-properties/miniflat.png',
        price: 460000, beds: 2, baths: 3,
        photos: 8, videos: 1, documents: 1,
        updatedAt: '2026-09-18T10:00:00.000Z'
      },
      {
        id: 'LST-1043',
        name: 'Mini Flat Apartment',
        location: 'Ajah, Lagos',
        status: 'available',
        cover: 'assets/images/home-properties/selfcon1.png',
        price: 350000, beds: 1, baths: 1,
        photos: 6, videos: 0, documents: 1,
        updatedAt: '2026-09-17T10:00:00.000Z'
      },
      {
        id: 'LST-1041',
        name: 'Self-Contained Studio',
        location: 'Yaba, Lagos',
        status: 'in_progress',
        cover: 'assets/images/home-properties/selfcon1.png',
        price: 280000, beds: 1, baths: 1,
        photos: 5, videos: 0, documents: 1,
        updatedAt: '2026-09-15T10:00:00.000Z'
      },
      {
        id: 'LST-1040',
        name: 'Commercial Space, Ikeja',
        location: 'Ikeja, Lagos',
        status: 'in_progress',
        cover: 'assets/images/home-properties/commercialspace.png',
        price: 900000, beds: 0, baths: 2,
        photos: 3, videos: 0, documents: 0,
        updatedAt: '2026-09-10T10:00:00.000Z'
      },
      {
        id: 'LST-1035',
        name: '3 Bedroom Bungalow',
        location: 'Ikeja GRA, Lagos',
        status: 'sold',
        cover: 'assets/images/home-properties/miniflat.png',
        price: 700000, beds: 3, baths: 3,
        photos: 10, videos: 1, documents: 2,
        updatedAt: '2026-08-28T10:00:00.000Z'
      },
      {
        id: 'LST-1030',
        name: 'Self Contained Room',
        location: 'Egbeda, Lagos',
        status: 'delisted',
        cover: 'assets/images/home-properties/selfcon1.png',
        price: 280000, beds: 1, baths: 1,
        photos: 4, videos: 0, documents: 0,
        updatedAt: '2026-08-20T10:00:00.000Z'
      },
      {
        id: 'LST-1028',
        name: 'Duplex, Off Admiralty Way',
        location: 'Lekki Phase 1, Lagos',
        status: 'in_dispute',
        cover: 'assets/images/home-properties/miniflat.png',
        price: 1200000, beds: 4, baths: 4,
        photos: 7, videos: 0, documents: 3,
        updatedAt: '2026-08-15T10:00:00.000Z'
      },
      {
        id: 'LST-1022',
        name: '2 Bedroom Flat, Surulere',
        location: 'Surulere, Lagos',
        status: 'reported',
        cover: 'assets/images/home-properties/selfcon1.png',
        price: 400000, beds: 2, baths: 2,
        photos: 5, videos: 0, documents: 1,
        updatedAt: '2026-08-05T10:00:00.000Z'
      }
    ];

    var folders = Accoom.getStorage('accoom-agent-listings', null);
    if (!Array.isArray(folders) || !folders.length) folders = MOCK_FOLDERS;

    var STATUS_LABEL = {
      available: 'Available',
      in_progress: 'In Progress',
      sold: 'Sold',
      delisted: 'Delisted',
      in_dispute: 'In Dispute',
      reported: 'Reported'
    };
    function formatPrice(n) {
      return '₦' + Number(n || 0).toLocaleString('en-NG');
    }

    function timeAgo(iso) {
      var then = new Date(iso).getTime();
      if (isNaN(then)) return '';
      var days = Math.floor((Date.now() - then) / 86400000);
      if (days <= 0) return 'today';
      if (days === 1) return '1 day ago';
      if (days < 30) return days + ' days ago';
      var months = Math.floor(days / 30);
      return months === 1 ? '1 month ago' : months + ' months ago';
    }

    var folderGrid = document.querySelector('[data-ag-folders]');
    var folderEmpty = document.querySelector('[data-ag-folders-empty]');
    var listingTabsEl = document.querySelector('[data-ag-listing-tabs]');

    function renderFolders(list) {
      if (!folderGrid) return;
      if (!list || !list.length) {
        if (folderEmpty) folderEmpty.hidden = false;
        folderGrid.innerHTML = '';
        return;
      }
      if (folderEmpty) folderEmpty.hidden = true;

      var html = list.map(function (f) {
        var specsBits = [];
        if (f.beds) specsBits.push(f.beds + (f.beds === 1 ? ' Bed' : ' Beds'));
        if (f.baths) specsBits.push(f.baths + (f.baths === 1 ? ' Bath' : ' Baths'));

        return (
          '<a class="ag-dash-folder-card" href="property.html?id=' + encodeURIComponent(f.id) + '">' +
            '<div class="ag-dash-folder-cover">' +
              '<img src="' + f.cover + '" alt="" />' +
              '<button type="button" class="ag-dash-folder-share" aria-label="Share listing">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"></line><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"></line></svg>' +
              '</button>' +
            '</div>' +
            '<div class="ag-dash-folder-body">' +
              '<p class="ag-dash-folder-name">' + f.name + '</p>' +
              '<p class="ag-dash-folder-price">' + formatPrice(f.price) + ' <small>/ year</small></p>' +
              '<p class="ag-dash-folder-loc">' + f.location + '</p>' +
              (specsBits.length ? '<div class="ag-dash-folder-specs">' + specsBits.map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>' : '') +
            '</div>' +
          '</a>'
        );
      }).join('');

      folderGrid.innerHTML = html;
    }

    // ----------------------------------------------------------------
    // Status tabs — Available / In Progress / Sold are what buyers'
    // own filters map to; Delisted, In Dispute and Reported exist only
    // here, so an agent can see why a listing dropped off the public
    // site without a buyer ever encountering those states.
    // ----------------------------------------------------------------
    var listingState = { tab: 'available' };

    function updateListingCounts() {
      Object.keys(STATUS_LABEL).forEach(function (key) {
        var count = folders.filter(function (f) { return f.status === key; }).length;
        var el = document.querySelector('[data-ag-listing-count="' + key + '"]');
        if (el) el.textContent = count;
      });
    }

    function setListingTab(tab) {
      listingState.tab = tab;

      if (listingTabsEl) {
        listingTabsEl.querySelectorAll('[data-ag-listing-tab]').forEach(function (btn) {
          var isActive = btn.getAttribute('data-ag-listing-tab') === tab;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      }

      renderFolders(folders.filter(function (f) { return f.status === tab; }));
    }

    updateListingCounts();
    setListingTab(listingState.tab);

    if (listingTabsEl) {
      Accoom.on(listingTabsEl, 'click', function (e) {
        var tab = e.target.closest('[data-ag-listing-tab]');
        if (!tab) return;
        setListingTab(tab.getAttribute('data-ag-listing-tab'));
      });
    }

    // ----------------------------------------------------------------
    // Stats — derived straight from the folders above.
    // ----------------------------------------------------------------
    var stats = {
      total: folders.length,
      live: folders.filter(function (f) { return f.status === 'available'; }).length,
      pending: folders.filter(function (f) { return f.status === 'in_progress'; }).length
    };

    Accoom.$$('[data-ag-stat]').forEach(function (el) {
      var key = el.getAttribute('data-ag-stat');
      if (key === 'wallet') return; // handled by renderWalletStat() below
      el.textContent = stats[key] || 0;
    });

    // ----------------------------------------------------------------
    // Wallet balance — same account-wide balance the buyer view shows
    // (Accoom.getWalletBalance/WALLET_UPDATED_EVENT), so it carries
    // over untouched when a customer upgrades to agent, and stays in
    // sync live if it changes in another tab.
    // ----------------------------------------------------------------
    function renderWalletStat() {
      var el = document.querySelector('[data-ag-stat="wallet"]');
      if (el) el.textContent = Accoom.formatWalletAmount(Accoom.getWalletBalance());
    }
    renderWalletStat();
    document.addEventListener(Accoom.WALLET_UPDATED_EVENT, renderWalletStat);

    // ----------------------------------------------------------------
    // Recent activity — swap for a real activity feed once one exists.
    // Built from the same folders so it never contradicts what's above.
    // ----------------------------------------------------------------
    var activityList = document.querySelector('[data-ag-activity]');
    var activityEmpty = document.querySelector('[data-ag-activity-empty]');

    function renderActivity(items) {
      if (!activityList) return;
      if (!items || !items.length) {
        if (activityEmpty) activityEmpty.hidden = false;
        return;
      }
      if (activityEmpty) activityEmpty.hidden = true;

      activityList.innerHTML = items.map(function (i) {
        return (
          '<li class="ag-dash-activity-item">' +
            '<span class="ag-dash-activity-dot"></span>' +
            '<span class="ag-dash-activity-text">' + i.text + '</span>' +
            '<span class="ag-dash-activity-time">' + timeAgo(i.at) + '</span>' +
          '</li>'
        );
      }).join('');
    }

    var ACTIVITY_COPY = {
      available: function (f) { return f.name + ' went live on ACCOOM.'; },
      in_progress: function (f) { return f.name + ' was submitted and is awaiting review.'; },
      sold: function (f) { return f.name + ' was marked as sold.'; },
      delisted: function (f) { return f.name + ' was delisted.'; },
      in_dispute: function (f) { return f.name + ' was flagged as In Dispute.'; },
      reported: function (f) { return f.name + ' was reported and is under review.'; }
    };

    var activity = folders
      .slice()
      .sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); })
      .slice(0, 5)
      .map(function (f) {
        return { text: (ACTIVITY_COPY[f.status] || function () { return f.name + ' was updated.'; })(f), at: f.updatedAt };
      });

    renderActivity(activity);

    // ----------------------------------------------------------------
    // Nav items that don't have a page yet — keep them visible (so the
    // shape of the dashboard is clear) without sending anyone to a 404.
    // ----------------------------------------------------------------
    Accoom.$$('[data-ag-soon]').forEach(function (link) {
      Accoom.on(link, 'click', function (e) {
        e.preventDefault();
        if (Accoom.showToast) Accoom.showToast('This section is coming soon.');
      });
    });

    // ----------------------------------------------------------------
    // Mobile drawer — hamburger above the topbar slides the sidebar
    // in; a backdrop click or a leftward swipe on the panel both
    // close it. On desktop none of this does anything visible, since
    // the sidebar isn't positioned as a drawer above 899px.
    // ----------------------------------------------------------------
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

    // Click-out: the backdrop sits behind the drawer and in front of
    // everything else, so any tap outside the panel lands here.
    if (backdropEl) Accoom.on(backdropEl, 'click', closeDrawer);

    // Swipe-out: a leftward drag on the panel itself, measured start
    // to end, closes it — only counted when it's clearly horizontal
    // so it doesn't fight with vertical scrolling inside the nav.
    if (sidebarEl) {
      var touchStartX = 0;
      var touchStartY = 0;
      var SWIPE_CLOSE_THRESHOLD = 50;

      sidebarEl.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
      }, { passive: true });

      sidebarEl.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0];
        var deltaX = t.clientX - touchStartX;
        var deltaY = t.clientY - touchStartY;
        if (deltaX < -SWIPE_CLOSE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
          closeDrawer();
        }
      }, { passive: true });
    }

    // Picking any nav item (including Sign Out below) closes the
    // drawer too, so it's never left open behind a navigation.
    Accoom.$$('.ag-dash-nav-link').forEach(function (link) {
      Accoom.on(link, 'click', closeDrawer);
    });

    // ----------------------------------------------------------------
    // Sign out
    // ----------------------------------------------------------------
    var signoutBtn = document.querySelector('[data-ag-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

  });

})(window.Accoom);