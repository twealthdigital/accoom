/* ==========================================================================
   ACCOOM — Notifications Page
   Reads/writes exclusively through Accoom.NotificationService — no data
   of its own, so it always matches the header dropdown exactly.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.notif-page');
    if (!page) return;

    var NOTIF_ICON = {
      order: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="M3.3 7 12 12l8.7-5"></path><path d="M12 22V12"></path></svg>',
      message: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
      accoom: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 21v-6h6v6"></path></svg>'
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

    var listEl = document.querySelector('[data-notif-page-list]');
    var emptyEl = document.querySelector('[data-notif-page-empty]');
    var tabs = Accoom.$$('[data-notif-page-tab]');
    var state = { tab: 'all' };

    function render() {
      var all = Accoom.NotificationService.getAll();
      var items = state.tab === 'unread' ? all.filter(function (n) { return !n.read; }) : all;

      listEl.innerHTML = '';

      if (!items.length) {
        emptyEl.hidden = false;
        return;
      }
      emptyEl.hidden = true;

      items.forEach(function (notif) {
        var card = document.createElement('div');
        card.className = 'notif-page-item' + (notif.read ? '' : ' is-unread');
        card.setAttribute('data-notif-page-id', notif.id);

        var iconSvg = NOTIF_ICON[notif.type] || NOTIF_ICON.accoom;
        var innerHtml =
          '<span class="notif-page-icon notif-page-icon--' + (notif.type || 'accoom') + '">' + iconSvg + '</span>' +
          '<span class="notif-page-body">' +
            '<span class="notif-page-top">' +
              '<strong>' + notif.title + '</strong>' +
              '<span class="notif-page-time">' + timeAgo(notif.time) + '</span>' +
            '</span>' +
            '<p>' + notif.text + '</p>' +
          '</span>';

        card.innerHTML = notif.link
          ? '<a href="' + notif.link + '" class="notif-page-main" data-notif-page-link>' + innerHtml + '</a>'
          : '<div class="notif-page-main">' + innerHtml + '</div>';

        card.innerHTML +=
          '<button type="button" class="notif-page-dismiss" data-notif-page-dismiss aria-label="Dismiss notification">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>';

        listEl.appendChild(card);
      });
    }

    tabs.forEach(function (tab) {
      Accoom.on(tab, 'click', function () {
        state.tab = tab.getAttribute('data-notif-page-tab');
        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        render();
      });
    });

    listEl.addEventListener('click', function (e) {
      var link = e.target.closest('[data-notif-page-link]');
      if (link) {
        var id = link.closest('[data-notif-page-id]').getAttribute('data-notif-page-id') || link.closest('[data-notif-page-id]').dataset.notifPageId;
        Accoom.NotificationService.markRead(link.closest('[data-notif-page-id]').getAttribute('data-notif-page-id'), true);
        return; // let the navigation proceed
      }

      var dismissBtn = e.target.closest('[data-notif-page-dismiss]');
      if (dismissBtn) {
        e.preventDefault();
        var cardId = dismissBtn.closest('[data-notif-page-id]').getAttribute('data-notif-page-id');
        Accoom.NotificationService.dismiss(cardId);
        render();
      }
    });

    // Notification options menu — Mark as read / Mute, nothing else.
    var MUTE_KEY = 'accoom-notifications-muted';
    var optionsRoot = document.getElementById('notif-options-dropdown');
    var muteOption = document.querySelector('[data-notif-mute-option]');

    function refreshMuteLabel() {
      if (!muteOption) return;
      var muted = Accoom.getStorage(MUTE_KEY, false);
      muteOption.textContent = muted ? 'Unmute' : 'Mute';
    }
    refreshMuteLabel();

    if (optionsRoot) {
      Accoom.initDropdown(optionsRoot, {
        onSelect: function (value) {
          if (value === 'mark-all-read') {
            Accoom.NotificationService.markAllRead();
            render();
          } else if (value === 'mute') {
            var muted = Accoom.getStorage(MUTE_KEY, false);
            Accoom.setStorage(MUTE_KEY, !muted);
            refreshMuteLabel();
            Accoom.dispatch(document, Accoom.NOTIFICATIONS_CHANGED_EVENT);
          }
        }
      });
    }

    Accoom.on(document, Accoom.NOTIFICATIONS_CHANGED_EVENT, function () {
      refreshMuteLabel();
      render();
    });

    render();
  });

})(window.Accoom);