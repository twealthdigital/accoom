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
        name: '2 Bedroom Flat, Ojodu',
        location: 'Ojodu, Lagos',
        status: 'live',
        cover: 'assets/images/home-properties/miniflat.png',
        photos: 8, videos: 1, documents: 1,
        updatedAt: '2026-09-18T10:00:00.000Z'
      },
      {
        id: 'LST-1041',
        name: 'Self-Contained Studio',
        location: 'Yaba, Lagos',
        status: 'pending',
        cover: 'assets/images/home-properties/selfcon1.png',
        photos: 5, videos: 0, documents: 1,
        updatedAt: '2026-09-15T10:00:00.000Z'
      },
      {
        id: 'LST-1040',
        name: 'Commercial Space, Ikeja',
        location: 'Ikeja, Lagos',
        status: 'draft',
        cover: 'assets/images/home-properties/commercialspace.png',
        photos: 3, videos: 0, documents: 0,
        updatedAt: '2026-09-10T10:00:00.000Z'
      }
    ];

    var folders = Accoom.getStorage('accoom-agent-listings', null);
    if (!Array.isArray(folders) || !folders.length) folders = MOCK_FOLDERS;

    var STATUS_LABEL = { live: 'Live', pending: 'Pending review', draft: 'Draft' };
    var STATUS_CLASS = {
      live: 'ag-dash-folder-status--live',
      pending: 'ag-dash-folder-status--pending',
      draft: 'ag-dash-folder-status--draft'
    };

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

    function renderFolders(list) {
      if (!folderGrid) return;
      if (!list || !list.length) {
        if (folderEmpty) folderEmpty.hidden = false;
        return;
      }
      if (folderEmpty) folderEmpty.hidden = true;

      var html = list.map(function (f) {
        var fileBits = [];
        if (f.photos) fileBits.push(f.photos + (f.photos === 1 ? ' photo' : ' photos'));
        if (f.videos) fileBits.push(f.videos + (f.videos === 1 ? ' video' : ' videos'));
        if (f.documents) fileBits.push(f.documents + (f.documents === 1 ? ' document' : ' documents'));
        var fileLabel = fileBits.length ? fileBits.join(' · ') : 'No files yet';

        return (
          '<a class="ag-dash-folder-card" href="property.html?id=' + encodeURIComponent(f.id) + '">' +
            '<div class="ag-dash-folder-cover">' +
              '<img src="' + f.cover + '" alt="" />' +
              '<span class="ag-dash-folder-status ' + (STATUS_CLASS[f.status] || '') + '">' + (STATUS_LABEL[f.status] || f.status) + '</span>' +
            '</div>' +
            '<div class="ag-dash-folder-body">' +
              '<p class="ag-dash-folder-name">' + f.name + '</p>' +
              '<p class="ag-dash-folder-loc">' + f.location + '</p>' +
              '<div class="ag-dash-folder-meta">' +
                '<span>' + fileLabel + '</span>' +
                '<span>' + timeAgo(f.updatedAt) + '</span>' +
              '</div>' +
            '</div>' +
          '</a>'
        );
      }).join('');

      folderGrid.innerHTML = html;
    }

    renderFolders(folders);

    // ----------------------------------------------------------------
    // Stats — derived straight from the folders above.
    // ----------------------------------------------------------------
    var stats = {
      total: folders.length,
      live: folders.filter(function (f) { return f.status === 'live'; }).length,
      pending: folders.filter(function (f) { return f.status === 'pending'; }).length
    };

    Accoom.$$('[data-ag-stat]').forEach(function (el) {
      var key = el.getAttribute('data-ag-stat');
      el.textContent = stats[key] || 0;
    });

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
      live: function (f) { return f.name + ' went live on ACCOOM.'; },
      pending: function (f) { return f.name + ' was submitted and is awaiting review.'; },
      draft: function (f) { return f.name + ' was saved as a draft.'; }
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