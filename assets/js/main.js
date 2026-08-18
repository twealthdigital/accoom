/* ==========================================================================
   ACCOOM — Main Entry Point
   Load this first on all pages
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    // Mobile search — stop page reload on submit
    Accoom.$$('.mobile-search').forEach(function (form) {
      Accoom.on(form, 'submit', function (e) {
        e.preventDefault();
      });
    });
    // Initialize theme toggle (site-wide)
    var themeToggles = document.querySelectorAll('[data-dark-toggle]');
    if (themeToggles.length) {
      Accoom.initThemeToggle(themeToggles);
    }

    // Initialize off-canvas panel (site-wide)
    var hamburgerBtn = document.querySelector('[data-panel-open]');
    var closeBtn = document.querySelector('[data-panel-close]');
    var overlay = document.querySelector('[data-panel-overlay]');
    var panel = document.querySelector('[data-panel]');

    if (hamburgerBtn && panel && overlay) {
      Accoom.initOffCanvas(hamburgerBtn, panel, overlay, closeBtn);
    }

    // Initialize location dropdowns (site-wide) - FIXED
    // Desktop location
    var desktopLocation = document.querySelector('.location-dropdown');
    if (desktopLocation) {
      Accoom.initLocationDropdown(desktopLocation);
    }

// Mobile panel location
    var panelLocation = document.querySelector('.panel-location-dropdown');
    if (panelLocation) {
      Accoom.initLocationDropdown(panelLocation);
    }

// Listings filters/sort dropdowns
    var listingsFilters = document.querySelector('.listings-filter-dropdown');
    if (listingsFilters) {
      Accoom.initDropdown(listingsFilters);
    }

    var listingsSort = document.querySelector('.listings-sort-dropdown');
    if (listingsSort) {
      Accoom.initDropdown(listingsSort);
    }

    // Notifications dropdown + panel behavior (site-wide).
    // Markup now ships via the partials/notifications.html partial on
    // every page, so this has to wait for the partial to actually be
    // in the DOM instead of running on plain Accoom.ready.
    Accoom.on(document, 'partials:ready', function () {
      var notifDropdown = document.querySelector('.notif-dropdown');
      if (notifDropdown) {
        Accoom.initDropdown(notifDropdown);
      }

      var trigger = document.querySelector('.notif-trigger');
      var list = document.querySelector('[data-notif-list]');
      if (!trigger || !list) return;

      var COLLAPSED_LINES = 2;

      function refreshBadge() {
        var hasUnread = !!list.querySelector('.notif-item.is-unread');
        trigger.classList.toggle('has-unread', hasUnread);
      }

      list.querySelectorAll('[data-notif-content]').forEach(function (content) {
        var btn = content.closest('.notif-item-body').querySelector('[data-notif-more]');
        if (!btn) return;

        var lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 18;
        var collapsedHeight = lineHeight * COLLAPSED_LINES;
        content.style.maxHeight = collapsedHeight + 'px';

        if (content.scrollHeight > collapsedHeight + 1) {
          btn.classList.add('is-visible');
        }
      });

      list.addEventListener('click', function (e) {
        var moreBtn = e.target.closest('[data-notif-more]');
        if (moreBtn) {
          e.preventDefault();
          e.stopPropagation();

          var content = moreBtn.closest('.notif-item-body').querySelector('[data-notif-content]');
          var lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 18;
          var collapsedHeight = lineHeight * COLLAPSED_LINES;
          var isExpanded = moreBtn.dataset.expanded === 'true';

          if (isExpanded) {
            content.style.maxHeight = collapsedHeight + 'px';
            moreBtn.textContent = 'more';
            moreBtn.dataset.expanded = 'false';
          } else {
            content.style.maxHeight = content.scrollHeight + 'px';
            moreBtn.textContent = 'show less';
            moreBtn.dataset.expanded = 'true';
          }
          return;
        }

        var markReadBtn = e.target.closest('[data-notif-mark-read]');
        if (markReadBtn) {
          e.preventDefault();
          e.stopPropagation();
          var readItem = markReadBtn.closest('[data-notif-item]');
          if (readItem) readItem.classList.remove('is-unread');
          markReadBtn.classList.add('is-read');
          markReadBtn.setAttribute('aria-label', 'Marked as read');
          refreshBadge();
          return;
        }

        var closeBtn = e.target.closest('[data-notif-close]');
        if (closeBtn) {
          e.preventDefault();
          e.stopPropagation();
          var item = closeBtn.closest('[data-notif-item]');
          if (!item) return;
          item.classList.add('is-removing');
          setTimeout(function () {
            item.remove();
            refreshBadge();
          }, 260);
        }
      });

      refreshBadge();
    });

    // Desktop menu dropdown (hamburger: Account / Location / Theme / Help)
    var desktopMenu = document.querySelector('.desktop-menu-dropdown');
    if (desktopMenu) {
      Accoom.initDropdown(desktopMenu);

      // Nested dropdowns inside it (Account sign in/up, Location/country)
      Accoom.$$('.desktop-menu-panel > .dropdown', desktopMenu).forEach(function (nestedDropdown) {
        Accoom.initDropdown(nestedDropdown);
      });

      // ============================================================
    // VIEW PROFILE — send agent + property context to agent-profile.html
    // ============================================================
    (function initViewProfile() {
      function goToProfile(agent) {
        var currentProperty = Accoom.currentProperty || {};
        agent.property = { id: currentProperty.id || '', name: currentProperty.name || '' };
        Accoom.setStorage('accoom-active-agent', agent);
        window.location.href = 'agent-profile.html';
      }

      var mainBtn = document.querySelector('[data-pd-view-profile]');
      if (mainBtn) {
        Accoom.on(mainBtn, 'click', function (e) {
          e.preventDefault();
          goToProfile({
            name: (document.querySelector('[data-pd-agent-name]').textContent || '').trim(),
            avatar: document.querySelector('[data-pd-agent-avatar]').getAttribute('src'),
            verified: !!document.querySelector('[data-pd-agent-name] .pd-agent-verified-badge'),
            stats: (document.querySelector('[data-pd-agent-stats]').textContent || '').trim(),
            rating: (document.querySelector('[data-pd-agent-rating]').textContent || '').trim(),
            level: (Accoom.currentProperty && Accoom.currentProperty.agent) ? Accoom.currentProperty.agent.level : 'AL5'
          });
        });
      }

      Accoom.delegate(document, 'click', '.pd-agent-tile .btn', function (e) {
        e.preventDefault();
        var tile = this.closest('.pd-agent-tile');
        goToProfile({
          name: (tile.querySelector('.pd-agent-name').textContent || '').trim(),
          avatar: tile.querySelector('.pd-agent-tile-avatar').getAttribute('src'),
          verified: !!tile.querySelector('.pd-agent-verified-badge'),
          stats: (tile.querySelector('.pd-agent-tile-stats').textContent || '').trim(),
          rating: (tile.querySelector('.pd-agent-tile-rating').textContent || '').trim(),
          level: 'AL5'
        });
      });
    })();
    }

    console.log('ACCOOM initialized');
  });

})(window.Accoom);