/* ==========================================================================
   ACCOOM — Deals: sold properties + the money side of an approved sale
   --------------------------------------------------------------------------
   Accoom.Deals.isSold(id)          true once a payment for that property was approved
   Accoom.Deals.markSold(id)        remember it in this browser (hides it from the marketplace)
   Accoom.Deals.syncSold(ids)       merge the server's sold list
   Accoom.Deals.process(convs, me)  read deal events in server chats:
                                      - any 'approved' event  -> that property is sold
                                      - SELLER side, 'approved' event from the payer -> credit the
                                        seller's wallet ONCE (idempotent by message id) and mark the
                                        seller's own listing 'sold'
   Swap the localStorage reads for API calls once there is a backend.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var SOLD_KEY = 'accoom-sold-properties';
  var LISTINGS_KEY = 'accoom-agent-listings';

  function readJson(key, fallback) {
    try { var v = JSON.parse(window.localStorage.getItem(key)); return v && typeof v === 'object' ? v : fallback; }
    catch (e) { return fallback; }
  }
  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function money(n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); }

  var Deals = Accoom.Deals = {};

  function soldMap() { var m = readJson(SOLD_KEY, {}); return Array.isArray(m) ? {} : m; }

  Deals.isSold = function (id) { return id != null && !!soldMap()[String(id)]; };

  Deals.markSold = function (id) {
    if (id == null || id === '') return false;
    var m = soldMap();
    if (m[String(id)]) return false;
    m[String(id)] = Date.now();
    writeJson(SOLD_KEY, m);
    return true;
  };

  Deals.syncSold = function (ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    var m = soldMap(), changed = false;
    ids.forEach(function (id) { if (!m[String(id)]) { m[String(id)] = Date.now(); changed = true; } });
    if (changed) writeJson(SOLD_KEY, m);
  };

  // The seller's own listing flips to 'sold' (the server copy is already marked by the server).
  function markOwnListingSold(id) {
    var list = readJson(LISTINGS_KEY, null);
    if (!Array.isArray(list)) return;
    var hit = false;
    list.forEach(function (l) {
      if (l && String(l.id) === String(id) && l.status !== 'sold') { l.status = 'sold'; l.soldAt = new Date().toISOString(); hit = true; }
    });
    if (hit) writeJson(LISTINGS_KEY, list);
  }

  function appliedKey(me) { return 'accoom-deal-applied:' + me; }

  function notify(title, text, link) {
    try { if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: title, text: text, link: link || 'payout.html' }); }
    catch (e) { /* never blocks the sale */ }
  }

  Deals.process = function (conversations, me) {
    if (!me || !Array.isArray(conversations)) return false;
    var applied = readJson(appliedKey(me), {});
    var changed = false;
    conversations.forEach(function (rc) {
      if (!rc || !Array.isArray(rc.messages) || !rc.agentKey || rc.agentKey === rc.customerKey) return;
      var iAmSeller = rc.agentKey === me, iAmPayer = rc.customerKey === me;
      if (!iAmSeller && !iAmPayer) return;
      rc.messages.forEach(function (m) {
        if (!m || !m.kind || !m.data) return;
        var pid = String(m.data.propertyId || rc.propertyId || '');
        if (m.kind === 'approved') {
          if (Deals.markSold(pid)) changed = true;
          if (iAmSeller && m.from === 'customer' && !applied[m.id] && Accoom.creditWallet) {
            var amount = Number(m.data.amount);
            if (amount > 0) {
              Accoom.creditWallet(amount, 'Property sale: ' + (rc.propertyName || 'property'), { category: 'sale', propertyId: pid });
              applied[m.id] = Date.now();
              markOwnListingSold(pid);
              notify('Payment approved', money(amount) + ' for ' + (rc.propertyName || 'your property') + ' was added to your balance.');
              changed = true;
            }
          }
        } else if (m.kind === 'paid' && iAmSeller && m.from === 'customer' && !applied[m.id]) {
          applied[m.id] = Date.now();
          notify('Paid, pending your approval', money(m.data.amount) + ' paid for ' + (rc.propertyName || 'your property') + '.', 'messages.html?chat=' + encodeURIComponent(rc.id));
          changed = true;
        }
      });
    });
    if (changed) writeJson(appliedKey(me), applied);
    return changed;
  };

  Deals.money = money;
})(window.Accoom);
