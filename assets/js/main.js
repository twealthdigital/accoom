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
        agent.property = {
          id: currentProperty.id || '',
          name: currentProperty.name || '',
          location: currentProperty.location || '',
          price: currentProperty.price || '',
          image: (currentProperty.images && currentProperty.images[0]) || ''
        };
        Accoom.setStorage('accoom-active-agent', agent);
        window.location.href = 'agent-profile.html';
      }

      var mainBtn = document.querySelector('[data-pd-view-profile]');
      if (mainBtn) {
        Accoom.on(mainBtn, 'click', function (e) {
          e.preventDefault();
          var agentNameEl   = document.querySelector('[data-pd-agent-name]');
          var agentAvatarEl = document.querySelector('[data-pd-agent-avatar]');
          var agentStatsEl  = document.querySelector('[data-pd-agent-stats]');
          var agentRatingEl = document.querySelector('[data-pd-agent-rating]');
          goToProfile({
            name:     agentNameEl   ? (agentNameEl.textContent   || '').trim() : '',
            avatar:   agentAvatarEl ? agentAvatarEl.getAttribute('src')        : '',
            verified: !!document.querySelector('[data-pd-agent-name] .pd-agent-verified-badge'),
            stats:    agentStatsEl  ? (agentStatsEl.textContent  || '').trim() : '',
            rating:   agentRatingEl ? (agentRatingEl.textContent || '').trim() : '',
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
      Accoom.$$('[data-balance-toggle], [data-private-balance]').forEach(function (btn) {
        btn.classList.add('is-hidden');
      });

      // These controls expose account-only information and actions.
      Accoom.$$('[data-private-messages], [data-private-notifications], .notif-dropdown').forEach(function (control) {
        control.classList.add('is-hidden');
      });

      // "Become an Agent" is a logged-in-customer upsell — a guest has no
      // account yet to upgrade, so hide it rather than send them into an
      // onboarding flow with no account behind it.
      Accoom.$$('[data-agent-cta]').forEach(function (el) {
        el.classList.add('is-hidden');
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
    } else if (
      Accoom.getStorage('accoom-user', {}).role === 'agent' &&
      Accoom.getStorage('accoom-user', {}).agentProfileCompleted
    ) {
      // role flips to 'agent' as soon as onboarding is picked, but the CTA
      // should only disappear once the agent-details page has actually been
      // filled in and confirmed — otherwise it vanishes before there's a
      // real agent profile behind it.
      Accoom.$$('[data-agent-cta]').forEach(function (el) {
        el.classList.add('is-hidden');
      });
    }

    // Highlight the current page in the nav (desktop + mobile panel)
    (function () {
      var page = window.location.pathname.split('/').pop() || 'home.html';
      Accoom.$$('.nav-links a, .panel-nav a, .footer-col a').forEach(function (link) {
        var href = link.getAttribute('href');
        if (!href || href === '#') return;
        var linkPage = href.split('/').pop().split('?')[0];
        link.classList.toggle('active', linkPage === page);
      });

      var homeLinks = Accoom.$$('.nav-links a[href="home.html"], .panel-nav a[href="home.html"]');
      var propertyLinks = Accoom.$$('[data-properties-nav]');
      var listingsSection = document.getElementById('all-listings');
      var onHome = window.location.pathname.endsWith('/home.html') || window.location.pathname.endsWith('/');

      function setSectionActive(isActive) {
        propertyLinks.forEach(function (link) { link.classList.toggle('active', isActive); });
        homeLinks.forEach(function (link) { link.classList.toggle('active', !isActive); });
      }

      function updateSectionActive() {
        if (!onHome || !listingsSection) return;
        var header = document.querySelector('.site-header');
        var topBoundary = (header ? header.offsetHeight : 0) + 8;
        var rect = listingsSection.getBoundingClientRect();
        setSectionActive(rect.top <= topBoundary && rect.bottom > topBoundary);
      }

      propertyLinks.forEach(function (link) {
        Accoom.on(link, 'click', function (event) {
          if (!onHome || !listingsSection) return;
          event.preventDefault();
          var header = document.querySelector('.site-header');
          var offset = header ? header.offsetHeight : 0;
          window.scrollTo({
            top: Math.max(listingsSection.getBoundingClientRect().top + window.pageYOffset - offset, 0),
            behavior: 'smooth'
          });
        });
      });

      if (onHome && listingsSection) {
        var sectionFrame = null;
        Accoom.on(window, 'scroll', function () {
          if (sectionFrame) return;
          sectionFrame = window.requestAnimationFrame(function () {
            sectionFrame = null;
            updateSectionActive();
          });
        }, { passive: true });
        Accoom.on(window, 'resize', updateSectionActive);
        updateSectionActive();
      }
    })();

    // The header search is the single property search entry point.
    Accoom.$$('.mobile-search').forEach(function (form) {
      var input = form.querySelector('[data-mobile-search-input]');
      var suggestions = form.querySelector('[data-header-search-suggestions]');

      function renderSuggestions(query) {
        if (!suggestions || !Accoom.PropertyService || !Accoom.PropertyService.searchList) return;
        var items = query
          ? Accoom.PropertyService.searchList(Accoom.PropertyService.getAll(), query).items.slice(0, 6)
          : [];

        suggestions.innerHTML = items.map(function (item) {
          var image = item.images && item.images[0] ? item.images[0] : '';
          return '<a class="header-search-suggestion" href="property.html?id=' + encodeURIComponent(item.id) + '&name=' + encodeURIComponent(item.name) + '" data-header-search-result="' + item.id + '">' +
            '<span class="header-search-suggestion-thumb" style="background-image:url(\'' + image + '\')"></span>' +
            '<span class="header-search-suggestion-copy"><strong>' + item.name + '</strong><small>' + item.location + ' &middot; &#8358;' + item.price.toLocaleString('en-NG') + '</small></span>' +
          '</a>';
        }).join('');
        suggestions.hidden = !items.length;
      }

      function commitSearch(query) {
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
      }

      if (input) {
        Accoom.on(input, 'input', Accoom.debounce(function () {
          var query = input.value.trim();
          renderSuggestions(query);
          if (Accoom.setListingsSearch) Accoom.setListingsSearch(query);
        }, 150));
        Accoom.on(input, 'focus', function () { renderSuggestions(input.value.trim()); });
      }

      if (suggestions) {
        Accoom.delegate(suggestions, 'click', '[data-header-search-result]', function () {
          var item = Accoom.PropertyService && Accoom.PropertyService.getById(this.getAttribute('data-header-search-result'));
          if (item) Accoom.setStorage('accoom-active-listing', item);
        });
      }

      Accoom.on(form, 'submit', function (e) {
        e.preventDefault();
        var query = input ? input.value.trim() : '';
        commitSearch(query);
        if (suggestions) suggestions.hidden = true;
      });
    });

    // Mobile search expansion keeps the header useful on narrow screens.
    Accoom.$$('[data-mobile-search]').forEach(function (form) {
      var input = form.querySelector('[data-mobile-search-input]');
      var headerActions = form.closest('.header-actions');
      if (!input || !headerActions) return;
      if (window.innerWidth > 767) return;

      function expand() {
        form.classList.add('is-expanded');
        headerActions.classList.add('search-expanded');
      }

      function collapse() {
        form.classList.remove('is-expanded');
        headerActions.classList.remove('search-expanded');
      }

      Accoom.on(input, 'focus', expand);

      Accoom.on(document, 'click', function (e) {
        if (!form.classList.contains('is-expanded')) return;
        if (!form.contains(e.target) && !e.target.closest('.msg-dropdown, .notif-dropdown')) collapse();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && form.classList.contains('is-expanded')) {
          collapse();
          input.blur();
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

    // Account sidebar — clear the "last active section" memory the
    // instant any link back to Overview is clicked, from ANY account
    // page (My Purchases, Saved Properties, Account Settings, the
    // mobile back arrow, etc). Without this, profile.js reads the
    // stale value on load and re-highlights whichever tab you came
    // from instead of Overview, until you click Overview a second time.
    Accoom.on(document, 'click', function (e) {
      var link = e.target.closest('a[href="profile.html"]');
      if (!link) return;
      try { sessionStorage.setItem('accoom-last-account-section', 'profile'); } catch (err) {}
    });

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
    // Notifications dropdown — renders from Accoom.NotificationService,
    // so every item's destination comes from real data (`link`), never
    // a hardcoded href baked into the markup.
    var NOTIF_ICON = {
      order: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="M3.3 7 12 12l8.7-5"></path><path d="M12 22V12"></path></svg>',
      message: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      accoom: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-6h6v6"></path></svg>'
    };

    function timeAgo(iso) {
      var diffMs = Date.now() - new Date(iso).getTime();
      var mins = Math.round(diffMs / 60000);
      if (mins < 60) return Math.max(mins, 1) + 'm ago';
      var hours = Math.round(mins / 60);
      if (hours < 24) return hours + 'h ago';
      var days = Math.round(hours / 24);
      if (days === 1) return 'Yesterday';
      if (days < 7) return days + ' days ago';
      return Math.round(days / 7) + 'w ago';
    }

    Accoom.$$('.notif-dropdown').forEach(function (notifDropdown) {
      Accoom.initDropdown(notifDropdown);

      var trigger = notifDropdown.querySelector('.notif-trigger');
      var list = notifDropdown.querySelector('[data-notif-list]');
      if (!trigger || !list) return;

      var COLLAPSED_LINES = 2;
      var countEl = notifDropdown.querySelector('[data-notif-count]');
      var emptyState = list.querySelector('[data-notif-empty]');

      function clampContent(content, btn) {
        var lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 18;
        var collapsedHeight = lineHeight * COLLAPSED_LINES;
        content.style.maxHeight = collapsedHeight + 'px';
        btn.textContent = 'more';
        btn.dataset.expanded = 'false';
        btn.classList.toggle('is-visible', content.scrollHeight > collapsedHeight + 1);
      }

      function refreshBadge(notifications) {
        var muted = Accoom.getStorage('accoom-notifications-muted', false);
        var unread = notifications.filter(function (n) { return !n.read; }).length;
        trigger.classList.toggle('has-unread', unread > 0 && !muted);
        if (countEl) countEl.textContent = muted ? 0 : unread;
        if (emptyState) emptyState.classList.toggle('is-visible', !notifications.length);
      }

      function renderNotifications() {
        if (!Accoom.NotificationService) return;
        var notifications = Accoom.NotificationService.getAll();

        list.querySelectorAll('[data-notif-item]').forEach(function (el) { el.remove(); });

        notifications.forEach(function (notif) {
          var item = document.createElement('div');
          item.className = 'notif-item' + (notif.read ? '' : ' is-unread');
          item.setAttribute('data-notif-item', '');
          item.setAttribute('data-notif-id', notif.id);
          item.setAttribute('data-notif-type', notif.type || 'accoom');

          var iconSvg = NOTIF_ICON[notif.type] || NOTIF_ICON.accoom;
          var bodyHtml =
            '<span class="notif-item-icon notif-item-icon--' + (notif.type || 'accoom') + '">' + iconSvg + '</span>' +
            '<span class="notif-item-body">' +
              '<span class="notif-item-top">' +
                '<span class="notif-item-title">' + notif.title + '</span>' +
                '<span class="notif-item-time">' + timeAgo(notif.time) + '</span>' +
              '</span>' +
            '<span class="notif-item-text">' +
                '<span class="notif-text-content" data-notif-content>' + notif.text + '</span>' +
              '</span>' +
              '<button type="button" class="notif-more-btn" data-notif-more>more</button>' +
            '</span>';

          var mainHtml = notif.link
            ? '<a href="' + notif.link + '" class="notif-item-main" data-notif-link>' + bodyHtml + '</a>'
            : '<div class="notif-item-main">' + bodyHtml + '</div>';

          item.innerHTML =
            mainHtml +
            '<div class="notif-item-actions">' +
              '<button type="button" class="notif-close" data-notif-close aria-label="Dismiss notification">' +
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
              '</button>' +
              '<button type="button" class="notif-item-msg-box ' + (notif.read ? 'is-read' : '') + '" data-notif-mark-read aria-label="' + (notif.read ? 'Mark as unread' : 'Mark as read') + '">' +
                '<svg class="notif-mail-icon notif-mail-icon--closed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 6 10-6"></path></svg>' +
                '<svg class="notif-mail-icon notif-mail-icon--open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v2l-8 6-8-6Z"></path><path d="M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-9.1 6.8a1.5 1.5 0 0 1-1.8 0Z"></path></svg>' +
              '</button>' +
            '</div>';

          list.insertBefore(item, emptyState.nextSibling);
        });

        list.querySelectorAll('[data-notif-content]').forEach(function (content) {
          var btn = content.closest('.notif-item-body').querySelector('[data-notif-more]');
          if (btn) clampContent(content, btn);
        });

        refreshBadge(notifications);
      }

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
          var toggleId = markReadBtn.closest('[data-notif-item]').getAttribute('data-notif-id');
          var currentlyRead = markReadBtn.classList.contains('is-read');
          Accoom.NotificationService.markRead(toggleId, !currentlyRead);
          renderNotifications();
          return;
        }

        var notifCloseBtn = e.target.closest('[data-notif-close]');
        if (notifCloseBtn) {
          e.preventDefault();
          e.stopPropagation();
          var closeItem = notifCloseBtn.closest('[data-notif-item]');
          if (!closeItem) return;
          var closeId = closeItem.getAttribute('data-notif-id');
          closeItem.classList.add('is-removing');
          setTimeout(function () {
            Accoom.NotificationService.dismiss(closeId);
            renderNotifications();
          }, 260);
          return;
        }

        // Clicking through to the notification's actual page marks it read.
        var navLink = e.target.closest('[data-notif-link]');
        if (navLink) {
          var navId = navLink.closest('[data-notif-item]').getAttribute('data-notif-id');
          Accoom.NotificationService.markRead(navId, true);
        }
      });

      Accoom.on(trigger, 'click', renderNotifications);
      Accoom.on(document, Accoom.NOTIFICATIONS_CHANGED_EVENT, renderNotifications);
      renderNotifications();
    });

    // Messages dropdown + unread badge (site-wide).
    // Renders straight from the same 'accoom-conversations' record
    // contact-agent.js reads/writes, so the dropdown is never a second,
    // separately-hardcoded copy of the chat data.
    Accoom.$$('.msg-dropdown').forEach(function (msgDropdown) {
      Accoom.initDropdown(msgDropdown);

      var msgTrigger = msgDropdown.querySelector('.msg-trigger');
      var msgList = msgDropdown.querySelector('[data-msg-list]');
      if (!msgTrigger || !msgList) return;

      var msgEmptyState = msgList.querySelector('[data-msg-empty]');
      var MSG_COLLAPSED_LINES = 2;

      function lastTimeLabel(msg) {
        if (!msg) return '';
        return msg.day && msg.day !== 'Today' ? msg.day : (msg.time || '');
      }

      function clampContent(content, btn) {
        var lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 18;
        var collapsedHeight = lineHeight * MSG_COLLAPSED_LINES;
        content.style.maxHeight = collapsedHeight + 'px';
        btn.textContent = 'more';
        btn.dataset.expanded = 'false';
        btn.classList.toggle('is-visible', content.scrollHeight > collapsedHeight + 1);
      }

      function refreshMsgBadge() {
        var hasUnread = !!msgList.querySelector('.notif-item.is-unread');
        msgTrigger.classList.toggle('has-unread', hasUnread);
      }

      // Rebuilds the list from scratch every time — one row per
      // conversation, always keyed to that conversation's LAST message
      // FROM THE AGENT (never one of "my" own sent messages), so nothing
      // can duplicate no matter how many times this runs.
      function lastIncomingMessage(conv) {
        for (var i = conv.messages.length - 1; i >= 0; i--) {
          if (conv.messages[i].from !== 'me') return conv.messages[i];
        }
        return null;
      }

      function renderMessages() {
        var conversations = Accoom.getStorage('accoom-conversations', []) || [];
        var withMessages = conversations.filter(function (c) {
          return c.property && lastIncomingMessage(c);
        });

        msgList.querySelectorAll('[data-msg-item]').forEach(function (el) { el.remove(); });

        withMessages.forEach(function (conv) {
          var last = lastIncomingMessage(conv);

          var item = document.createElement('div');
          item.className = 'notif-item' + (conv.unread ? ' is-unread' : '');
          item.setAttribute('data-msg-item', '');
          item.innerHTML =
            '<a href="contact-agent.html?open=' + encodeURIComponent(conv.property.id) + '" class="notif-item-main">' +
              '<span class="notif-item-icon notif-item-icon--message">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
              '</span>' +
              '<span class="notif-item-body">' +
                '<span class="notif-item-top">' +
                  '<span class="notif-item-title">' + conv.name + '</span>' +
                  '<span class="notif-item-time">' + lastTimeLabel(last) + '</span>' +
                '</span>' +
                '<span class="msg-item-property">' + conv.property.name + '</span>' +
                '<span class="notif-item-text">' +
                  '<span class="notif-text-content" data-notif-content>' + last.text + '</span>' +
                '</span>' +
                '<button type="button" class="notif-more-btn" data-notif-more>more</button>' +
              '</span>' +
            '</a>';
          msgList.appendChild(item);
        });

        if (msgEmptyState) msgEmptyState.classList.toggle('is-visible', !withMessages.length);

        msgList.querySelectorAll('[data-notif-content]').forEach(function (content) {
          var btn = content.closest('.notif-item-body').querySelector('[data-notif-more]');
          if (btn) clampContent(content, btn);
        });

        refreshMsgBadge();
      }

      // "more" / "show less" — identical mechanic to the notifications panel.
      msgList.addEventListener('click', function (e) {
        var moreBtn = e.target.closest('[data-notif-more]');
        if (!moreBtn) return;
        e.preventDefault();
        e.stopPropagation();

        var content = moreBtn.closest('.notif-item-body').querySelector('[data-notif-content]');
        var lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 18;
        var collapsedHeight = lineHeight * MSG_COLLAPSED_LINES;
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
      });

      // Re-render right before the panel opens, so a message sent/received
      // elsewhere on the same visit is never stale by the time it's checked.
      Accoom.on(msgTrigger, 'click', renderMessages);

      renderMessages();
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
    // The figure itself always comes from Accoom.getWalletBalance() (see
    // assets/js/core/wallet.js) so every page stays in sync with deposits
    // and payments — the eye toggle only controls masking, not the value.
    Accoom.$$('[data-balance-toggle]').forEach(function (btn) {
      var amountEl = btn.querySelector('[data-balance-amount]');
      if (!amountEl) return;

      var hidden = Accoom.getStorage('accoom-balance-hidden', false);

      function render() {
        var realValue = Accoom.formatWalletAmount(Accoom.getWalletBalance());
        amountEl.setAttribute('data-balance-raw', realValue);
        amountEl.textContent = hidden ? '••••••' : realValue;
        btn.classList.toggle('is-balance-masked', hidden);
        btn.setAttribute('aria-label', hidden ? 'Show balance' : 'Hide balance');
      }

      Accoom.on(btn, 'click', function () {
        hidden = !hidden;
        Accoom.setStorage('accoom-balance-hidden', hidden);
        render();
      });

      document.addEventListener(Accoom.WALLET_UPDATED_EVENT, render);

      render();
    });

  });

})(window.Accoom);