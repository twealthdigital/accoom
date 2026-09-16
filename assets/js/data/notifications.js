/* ==========================================================================
   ACCOOM — Notifications Data Service

   Single source of truth for notifications, same pattern as
   PropertyService in properties.js. Both the header dropdown (main.js)
   and notifications.html read/write through this file only — swap the
   bodies below for real API calls (GET/PATCH/DELETE /api/notifications)
   and nothing else in the app needs to change.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var STORAGE_KEY = 'accoom-notifications';

  // Seed data only — each notification's `link` is where clicking it goes.
  // A notification with no real destination (e.g. a pure heads-up) can
  // simply omit `link`; the rendering code already handles that case.
  function seedNotifications() {
    return [
      {
        id: 'notif-1',
        type: 'order',
        title: 'Booking order confirmed',
        text: 'Your order #ACC-4821 for the self-contained apartment in Maitama has been confirmed by the agent.',
        link: 'purchase-details.html?id=ACCOOM-2025-0008',
        time: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        read: false
      },
      {
        id: 'notif-2',
        type: 'accoom',
        title: 'Accoom',
        text: 'Complete your profile verification to unlock direct chat with agents and priority replies.',
        link: 'account-settings.html',
        time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        read: false
      },
      {
        id: 'notif-3',
        type: 'message',
        title: 'David O. replied',
        text: 'I hope to hear from you soon, and I will deliver my best to get you the apartment you want.',
        link: 'contact-agent.html?open=ACCOM-24567',
        time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        read: true
      },
      {
        id: 'notif-4',
        type: 'order',
        title: 'Order delivered',
        text: 'Your agent visit request has been completed and marked as closed.',
        link: 'purchase-details.html?id=ACCOOM-2025-0007',
        time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        read: true
      },
      {
        id: 'notif-5',
        type: 'accoom',
        title: 'Accoom',
        text: 'Thanks for verifying your account, you now have full access to chat with agents.',
        link: 'account-settings.html',
        time: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        read: true
      },
      {
        id: 'notif-6',
        type: 'message',
        title: 'Sarah A. replied',
        text: 'Sorry, no need for now. I already found a place closer to my office.',
        link: 'contact-agent.html?open=ACCOM-30988',
        time: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        read: true
      }
    ];
  }

  function readAll() {
    return Accoom.getStorage(STORAGE_KEY, null) || seedNotifications();
  }

  function writeAll(list) {
    Accoom.setStorage(STORAGE_KEY, list);
  }

  var NotificationService = {};

  // All notifications, newest first. Empty for a guest — a real backend
  // would 401/require auth for this endpoint anyway.
  NotificationService.getAll = function () {
    if (!Accoom.isLoggedIn()) return [];
    return readAll().slice().sort(function (a, b) {
      return new Date(b.time) - new Date(a.time);
    });
  };

  NotificationService.getById = function (id) {
    return readAll().filter(function (n) { return n.id === id; })[0] || null;
  };

  NotificationService.unreadCount = function () {
    return NotificationService.getAll().filter(function (n) { return !n.read; }).length;
  };

  var CHANGED_EVENT = 'accoom:notifications-changed';

  function broadcast() {
    Accoom.dispatch(document, CHANGED_EVENT);
  }

  NotificationService.markRead = function (id, read) {
    var list = readAll();
    var target = list.filter(function (n) { return n.id === id; })[0];
    if (!target) return;
    target.read = read !== false;
    writeAll(list);
    broadcast();
  };

  NotificationService.markAllRead = function () {
    var list = readAll();
    list.forEach(function (n) { n.read = true; });
    writeAll(list);
    broadcast();
  };

  NotificationService.dismiss = function (id) {
    writeAll(readAll().filter(function (n) { return n.id !== id; }));
    broadcast();
  };

  Accoom.NOTIFICATIONS_CHANGED_EVENT = CHANGED_EVENT;

  Accoom.NotificationService = NotificationService;

})(window.Accoom);