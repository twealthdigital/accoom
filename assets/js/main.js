/* ==========================================================================
   ACCOOM — Main Entry Point
   Load this first on all pages
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  // Page content that is already in the static HTML at parse time
  // (not shipped via a [data-partial]), so this can run on plain
  // Accoom.ready as before.
  Accoom.ready(function () {
    // Dark/light mode toggle — init here (not only in partials:ready)
    // so pages with no [data-partial] includes, like auth.html, still
    // get the click handler bound to their static toggle button.
    var earlyThemeToggles = document.querySelectorAll('[data-dark-toggle]');
    if (earlyThemeToggles.length) {
      Accoom.initThemeToggle(earlyThemeToggles);
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

    // VIEW PROFILE — send agent + property context to agent-profile.html
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

    console.log('ACCOOM initialized');
  });

  // Everything below touches markup that now ships via [data-partial]
  // (header.html, messages.html, notifications.html, footer.html, ...),
  // so it all has to wait for partials:ready instead of running on
  // plain Accoom.ready — otherwise it'd run before the fetch() calls
  // that inject that markup have resolved.
  Accoom.on(document, 'partials:ready', function () {

    // ---- GUEST GATE --------------------------------------------------
    // Nothing account-specific (balance, message/notification previews,
    // agent chat) may be visible to a signed-out visitor. Any control
    // that would normally open real data instead routes to signup.
    if (!Accoom.isLoggedIn()) {
      // Balance: hide the trigger entirely, not just the figure.
      Accoom.$$('[data-balance-toggle]').forEach(function (btn) {
        btn.classList.add('is-hidden');
      });

      // Guests have no messages or notifications yet — strip every
      // hardcoded preview item so both panels fall back to their
      // existing empty states ("No Messages" / "No Notifications").
      Accoom.$$('[data-msg-item]').forEach(function (item) { item.remove(); });
      Accoom.$$('[data-notif-item]').forEach(function (item) { item.remove(); });
      Accoom.$$('[data-msg-empty]').forEach(function (el) {
        el.textContent = 'Sign in to view your messages';
      });

      // Any entry point into real messaging — the messages/notif
      // triggers, a message-panel row, or any "Contact/Message Agent"
      // link anywhere on the page — sends guests to signup instead.
      Accoom.on(document, 'click', function (e) {
        var gated = e.target.closest('.msg-trigger, .panel-row--messages, a[href="contact-agent.html"]');
        if (!gated) return;
        e.preventDefault();
        window.location.href = 'auth.html?mode=signup';
      });
    }

    // Highlight the current page in the nav (desktop + mobile panel)
    (function () {
      var page = window.location.pathname.split('/').pop() || 'home.html';
      Accoom.$$('.nav-links a, .panel-nav a').forEach(function (link) {
        var href = link.getAttribute('href');
        if (!href || href === '#') return;
        var linkPage = href.split('/').pop().split('?')[0];
        link.classList.toggle('active', linkPage === page);
      });
    })();

    // Mobile search — commit query to the shared listings search
    Accoom.$$('.mobile-search').forEach(function (form) {
      Accoom.on(form, 'submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('[data-mobile-search-input]');
        var query = input ? input.value.trim() : '';
        if (!query) return;
        if (Accoom.setListingsSearch) {
          Accoom.setListingsSearch(query);
          var target = document.getElementById('all-listings');
          if (target) {
            var headerEl = document.querySelector('.site-header');
            var headerHeight = headerEl ? headerEl.offsetHeight : 0;
            var targetY = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;
            window.scrollTo({ top: Math.max(targetY, 0), behavior: 'smooth' });
          }
        } else {
          window.location.href = 'home.html?search=' + encodeURIComponent(query);
        }
      });
    });

    // Mobile search expand/collapse (phone-only visuals via CSS;
    // this JS just tracks state and is harmless on tablet/desktop
    // where the collapsed styles don't apply).
    Accoom.$$('[data-mobile-search]').forEach(function (form) {
      var toggleBtn = form.querySelector('[data-mobile-search-toggle]');
      var closeBtn = form.querySelector('[data-mobile-search-close]');
      var input = form.querySelector('[data-mobile-search-input]');
      var headerActions = form.closest('.header-actions');
      if (!toggleBtn || !closeBtn || !input) return;

      function expand() {
        form.classList.add('is-expanded');
        toggleBtn.setAttribute('aria-expanded', 'true');
        if (headerActions) headerActions.classList.add('search-expanded');
        input.focus();
      }

      function collapse() {
        form.classList.remove('is-expanded');
        toggleBtn.setAttribute('aria-expanded', 'false');
        if (headerActions) headerActions.classList.remove('search-expanded');
      }

      Accoom.on(toggleBtn, 'click', function (e) {
        e.preventDefault();
        expand();
      });

      Accoom.on(closeBtn, 'click', function (e) {
        e.preventDefault();
        input.value = '';
        collapse();
      });

      Accoom.on(document, 'click', function (e) {
        if (!form.classList.contains('is-expanded')) return;
        if (!form.contains(e.target)) collapse();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && form.classList.contains('is-expanded')) {
          collapse();
        }
      });
    });

    // Theme toggle for header/panel copies injected via partials
    // (auth.html's own toggle is already handled above in Accoom.ready,
    // since it ships as static HTML, not a partial).
    var themeToggles = document.querySelectorAll('[data-dark-toggle]');
    if (themeToggles.length) {
      Accoom.initThemeToggle(themeToggles);
    }

    // Initialize off-canvas panel (site-wide)
    var hamburgerBtn = document.querySelector('[data-panel-open]');
    var panelCloseBtn = document.querySelector('[data-panel-close]');
    var overlay = document.querySelector('[data-panel-overlay]');
    var panel = document.querySelector('[data-panel]');

    if (hamburgerBtn && panel && overlay) {
      Accoom.initOffCanvas(hamburgerBtn, panel, overlay, panelCloseBtn);
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

    // Mobile panel account
    var panelAccount = document.querySelector('.panel-account-dropdown');
    if (panelAccount) {
      Accoom.initDropdown(panelAccount);
    }

    // Account dropdown — "Sign in" / "Sign up" route to the auth page,
    // landing on the matching login/signup toggle state there.
    // Once signed in, the same slots become "Profile" / "Sign out".
    Accoom.$$('[aria-label="Account"]').forEach(function (accountPanel) {
      var dropdownEl = accountPanel.closest('.dropdown');
      if (!dropdownEl) return;
      Accoom.on(dropdownEl, 'dropdown:select', function (e) {
        var value = e.detail && e.detail.value;
        if (value === 'signup') {
          window.location.href = 'auth.html?mode=signup';
        } else if (value === 'signin') {
          window.location.href = 'auth.html';
        } else if (value === 'profile') {
          window.location.href = 'profile.html';
        } else if (value === 'signout') {
          Accoom.setStorage('accoom-user', null);
          window.location.href = 'home.html';
        }
      });
    });

    // Reflect logged-in state in every Account menu on the page (desktop
    // hamburger + mobile side panel both share this markup/data-value).
    (function updateAccountMenu() {
      var user = Accoom.getStorage('accoom-user', null);
      if (!user) return;

      var displayName = (user.name && user.name.trim()) || (user.email && user.email.trim()) || 'Account';

      var ICON_PROFILE = '<svg class="account-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
      var ICON_SIGNOUT = '<svg class="account-menu-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';

      Accoom.$$('[aria-label="Account"] [data-value="signin"] a').forEach(function (a) {
        a.closest('li').setAttribute('data-value', 'profile');
        a.setAttribute('href', 'profile.html');
        a.innerHTML = ICON_PROFILE + '<span class="account-menu-name">' + displayName + '</span>';
      });

      Accoom.$$('[aria-label="Account"] [data-value="signup"] a').forEach(function (a) {
        a.closest('li').setAttribute('data-value', 'signout');
        a.setAttribute('href', '#');
        a.innerHTML = ICON_SIGNOUT + '<span>Sign out</span>';
      });
    })();

    // Notifications dropdown + panel behavior (site-wide).
    Accoom.$$('.notif-dropdown').forEach(function (notifDropdown) {
      Accoom.initDropdown(notifDropdown);

      var trigger = notifDropdown.querySelector('.notif-trigger');
      var list = notifDropdown.querySelector('[data-notif-list]');
      if (!trigger || !list) return;

      var COLLAPSED_LINES = 2;

      var emptyState = list.querySelector('[data-notif-empty]');

      function refreshBadge() {
        var hasUnread = !!list.querySelector('.notif-item.is-unread');
        trigger.classList.toggle('has-unread', hasUnread);

        if (emptyState) {
          var hasItems = !!list.querySelector('[data-notif-item]');
          emptyState.classList.toggle('is-visible', !hasItems);
        }
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
          var toggleItem = markReadBtn.closest('[data-notif-item]');
          var nowRead = markReadBtn.classList.toggle('is-read');

          if (toggleItem) {
            toggleItem.classList.toggle('is-unread', !nowRead);
          }

          markReadBtn.setAttribute('aria-label', nowRead ? 'Mark as unread' : 'Mark as read');
          refreshBadge();
          return;
        }

        var notifCloseBtn = e.target.closest('[data-notif-close]');
        if (notifCloseBtn) {
          e.preventDefault();
          e.stopPropagation();
          var item = notifCloseBtn.closest('[data-notif-item]');
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

    // Messages dropdown + unread badge (site-wide).
    Accoom.$$('.msg-dropdown').forEach(function (msgDropdown) {
      Accoom.initDropdown(msgDropdown);

      var msgTrigger = msgDropdown.querySelector('.msg-trigger');
      var msgList = msgDropdown.querySelector('[data-msg-list]');
      if (!msgTrigger || !msgList) return;

      var msgEmptyState = msgList.querySelector('[data-msg-empty]');

      function refreshMsgBadge() {
        var hasUnread = !!msgList.querySelector('.notif-item.is-unread');
        msgTrigger.classList.toggle('has-unread', hasUnread);

        if (msgEmptyState) {
          var hasItems = !!msgList.querySelector('[data-msg-item]');
          msgEmptyState.classList.toggle('is-visible', !hasItems);
        }
      }

      refreshMsgBadge();
    });

    // Desktop menu dropdown (hamburger: Account / Location / Theme / Help)
    var desktopMenu = document.querySelector('.desktop-menu-dropdown');
    if (desktopMenu) {
      Accoom.initDropdown(desktopMenu);

      // Nested dropdowns inside it (Account sign in/up, Location/country)
      Accoom.$$('.desktop-menu-panel > .dropdown', desktopMenu).forEach(function (nestedDropdown) {
        Accoom.initDropdown(nestedDropdown);
      });
    }

    // Balance amount show/hide toggle (site-wide)
    Accoom.$$('[data-balance-toggle]').forEach(function (btn) {
      var amountEl = btn.querySelector('[data-balance-amount]');
      if (!amountEl) return;

      var realValue = amountEl.textContent;
      amountEl.setAttribute('data-balance-raw', realValue);
      var hidden = Accoom.getStorage('accoom-balance-hidden', false);

      function render() {
        amountEl.textContent = hidden ? '••••••' : realValue;
        btn.classList.toggle('is-balance-masked', hidden);
        btn.setAttribute('aria-label', hidden ? 'Show balance' : 'Hide balance');
      }

      Accoom.on(btn, 'click', function () {
        hidden = !hidden;
        Accoom.setStorage('accoom-balance-hidden', hidden);
        render();
      });

      render();
    });

  });

})(window.Accoom);