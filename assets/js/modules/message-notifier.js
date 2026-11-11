/* ==========================================================================
   ACCOOM: Global message notifier (every page, agents and customers)
   --------------------------------------------------------------------------
   Reuses the existing messaging data. Nothing here sends or stores chats.

     - Local chats:   localStorage 'accoom-conversations' (written by contact-agent.js,
                      which is also messages.html for agents)
     - Server chats:  GET /api/conversations?key=<me> (only where the chat page is NOT
                      open, because the chat page already polls and writes the local copy)

   What it does
     1. Gold dot on the header message icon while any chat is unread.
     2. A sliding toast (sender name + short preview + View) when a NEW message arrives.
     3. View opens the exact conversation (?chat=<conversation key>).
     4. Stays in step across pages and tabs (storage event + same tab write hook + polling).
     5. Reading a chat clears the dot and closes its toast.
     6. A message is announced once (shared registry per signed in person), never for
        my own messages, never for a chat with myself, never for muted chats.

   Accoom.MessageNotifier.refresh()          recompute now
   Accoom.MessageNotifier.remoteOnlyItems()  unread chats the server knows but this browser has not stored yet
   Accoom.MessageNotifier.chatLink(key)      URL that opens that exact chat
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var CONV_KEY = 'accoom-conversations';
  var SEEN_PREFIX = 'accoom-msg-notified:';
  var HIDDEN_KEY = 'accoom-hidden-chats';
  var POLL_MS = 4000;
  var SEEN_CAP = 400;
  var PREVIEW_MAX = 90;
  var CHANGED_EVENT = 'accoom:messages-changed';

  var remote = [];            // last server snapshot (items), empty on the chat page
  var lastSignature = '';
  var queue = [];             // toasts waiting for the current one to close
  var active = null;          // { key, handle }
  var timer = null;
  var scheduled = false;
  var started = false;
  var primed = false;         // first server pull finished (no old unread message is announced before it)

  /* ------------------------------------------------------------ helpers */
  function sync() { return Accoom.Sync || null; }
  function me() { var s = sync(); return s && s.userKey ? s.userKey() : ''; }
  function signedIn() { return !!(Accoom.isLoggedIn && Accoom.isLoggedIn()); }
  function onChatPage() { return !!document.querySelector('[data-msgs-layout]'); }
  function str(v) { return String(v == null ? '' : v); }
  function unreadOf(v) { var n = Number(v); return n > 0 ? n : (v === true ? 1 : 0); }

  function chatPage() {
    var s = sync();
    return s && s.isAgent && s.isAgent() ? 'messages.html' : 'contact-agent.html';
  }

  function chatLink(key) { return chatPage() + '?chat=' + encodeURIComponent(key); }

  function stripId(id) { return str(id).replace(/^r-/, ''); }

  function preview(text) {
    var t = str(text).replace(/\s+/g, ' ').trim();
    if (!t) return 'Sent you a message';
    return t.length > PREVIEW_MAX ? t.slice(0, PREVIEW_MAX - 1).replace(/\s+$/, '') + '\u2026' : t;
  }

  function isSelf(conv) {
    if (!conv) return true;
    if (conv.agentKey && conv.customerKey && str(conv.agentKey) === str(conv.customerKey)) return true;
    return !!(Accoom.Ownership && Accoom.Ownership.isSelfConversation && Accoom.Ownership.isSelfConversation(conv));
  }

  function clockOf(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() !== now.toDateString()) {
      var days = Math.round((now - d) / 86400000);
      return days <= 1 ? 'Yesterday' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /* ----------------------------------------------------- local snapshot */
  function localItems() {
    var list = Accoom.getStorage(CONV_KEY, []);
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (conv) {
      if (!conv || !Array.isArray(conv.messages) || isSelf(conv)) return;
      var key = str(conv.remoteId || conv.id);
      if (!key) return;
      var incoming = [];
      conv.messages.forEach(function (m, i) {
        if (!m || m.from === 'me' || !str(m.text).trim()) return;
        var id = m.id ? stripId(m.id) : (str(m.ts) + ':' + i + ':' + str(m.text).slice(0, 40));
        incoming.push({ id: id, text: m.text, ts: m.ts || 0, order: i, label: (m.day && m.day !== 'Today') ? m.day : str(m.time) });
      });
      out.push({
        key: key, name: str(conv.name) || 'New message', property: conv.property || null,
        unread: unreadOf(conv.unread), muted: !!conv.muted, incoming: incoming, local: true, conv: conv
      });
    });
    return out;
  }

  /* ---------------------------------------------------- server snapshot */
  function hiddenMap() { return Accoom.getStorage(HIDDEN_KEY, {}) || {}; }

  function remoteItemsFrom(conversations, myKey) {
    var hidden = hiddenMap();
    var out = [];
    (conversations || []).forEach(function (rc) {
      if (!rc || !Array.isArray(rc.messages) || rc.agentKey === rc.customerKey) return;
      var side = rc.agentKey === myKey ? 'agent' : (rc.customerKey === myKey ? 'customer' : null);
      if (!side) return;
      if (hidden[rc.id] && rc.updatedAt <= hidden[rc.id]) return;
      var other = side === 'agent'
        ? (str(rc.customerName) || (rc.customerRole === 'agent' ? 'Agent' : 'Customer'))
        : (str(rc.agentName) || 'Agent');
      var incoming = [];
      rc.messages.forEach(function (m, i) {
        if (!m || m.from === side || !str(m.text).trim()) return;
        incoming.push({ id: stripId(m.id), text: m.text, ts: m.ts || 0, order: i, label: clockOf(m.ts) });
      });
      out.push({
        key: str(rc.id), name: other, property: { id: rc.propertyId, name: str(rc.propertyName) },
        unread: unreadOf(rc.unread && rc.unread[side]), muted: false, incoming: incoming, local: false
      });
    });
    return out;
  }

  function pollRemote() {
    var s = sync(), myKey = me();
    if (!s || !myKey || !signedIn() || onChatPage() || s.available !== true) { remote = []; return Promise.resolve(); }
    return s.api('GET', '/api/conversations?key=' + encodeURIComponent(myKey), undefined, 5000).then(function (r) {
      remote = remoteItemsFrom(r && r.conversations, myKey);
    }).catch(function () { /* server away: keep the last snapshot */ });
  }

  /* ------------------------------------------------------------- merging */
  function snapshot() {
    var byKey = {}, order = [];
    localItems().concat(remote).forEach(function (it) {
      var cur = byKey[it.key];
      if (!cur) { byKey[it.key] = it; order.push(it.key); return; }
      // same chat known locally and on the server: keep local details, take the larger unread
      // count, and the union of incoming messages (same ids collapse)
      var seen = {};
      cur.incoming.forEach(function (m) { seen[m.id] = true; });
      it.incoming.forEach(function (m) { if (!seen[m.id]) cur.incoming.push(m); });
      cur.unread = Math.max(cur.unread, it.unread);
      cur.muted = cur.muted || it.muted;
      if (!cur.local && it.local) { cur.name = it.name; cur.property = it.property; cur.local = true; }
    });
    return order.map(function (k) { return byKey[k]; });
  }

  /* ---------------------------------------------------------- the dot */
  function paintDot(items) {
    var unreadChats = items.filter(function (it) { return it.unread > 0; });
    var total = unreadChats.reduce(function (n, it) { return n + it.unread; }, 0);
    var on = signedIn() && unreadChats.length > 0;
    Array.prototype.forEach.call(document.querySelectorAll('.msg-trigger'), function (btn) {
      btn.classList.toggle('has-unread', on);
      btn.setAttribute('data-unread', on ? String(total) : '0');
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-msg-count]'), function (el) {
      el.textContent = on ? (total > 99 ? '99+' : String(total)) : '0';
    });
  }

  /* --------------------------------------------- once only announcements */
  function seenKey() { return SEEN_PREFIX + me(); }

  function loadSeen() {
    var s = Accoom.getStorage(seenKey(), null);
    return s && typeof s === 'object' && s.ids ? s : null;
  }

  // Re-reads the shared registry right before writing, so two tabs never announce the same message.
  function claim(ids) {
    var cur = loadSeen() || { ids: {} };
    var fresh = ids.filter(function (id) { return !cur.ids[id]; });
    if (!fresh.length) return [];
    var now = Date.now();
    fresh.forEach(function (id) { cur.ids[id] = now; });
    var keys = Object.keys(cur.ids);
    if (keys.length > SEEN_CAP) {
      keys.sort(function (a, b) { return cur.ids[a] - cur.ids[b]; });
      keys.slice(0, keys.length - SEEN_CAP).forEach(function (k) { delete cur.ids[k]; });
    }
    Accoom.setStorage(seenKey(), cur);
    return fresh;
  }

  function announcedIds(item) { return item.incoming.map(function (m) { return item.key + ':' + m.id; }); }

  /* -------------------------------------------------------------- toast */
  function latest(msgs) {
    var best = null;
    msgs.forEach(function (m) { if (!best || (m.ts || 0) > (best.ts || 0) || ((m.ts || 0) === (best.ts || 0) && m.order > best.order)) best = m; });
    return best;
  }

  function showNext() {
    if (active || !queue.length || typeof Accoom.showToast !== 'function') return;
    var job = queue.shift();
    var link = chatLink(job.key);
    var handle = Accoom.showToast({
      title: job.name,
      message: job.text,
      link: link,
      linkLabel: 'View',
      variant: 'message',
      duration: 9000,
      onClose: function () { active = null; window.setTimeout(showNext, 350); },
      onLinkClick: function (e) {
        // already on the chat page: open the chat in place instead of reloading the page
        if (!onChatPage()) return;
        var detail = { key: job.key, handled: false };
        var ev;
        try { ev = new CustomEvent('accoom:open-chat', { detail: detail }); } catch (err) { return; }
        document.dispatchEvent(ev);
        if (detail.handled) e.preventDefault();
      }
    });
    active = { key: job.key, handle: handle };
  }

  function enqueue(item, msg) {
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].key === item.key) { queue[i].text = preview(msg.text); queue[i].name = item.name; return; }
    }
    if (active && active.key === item.key) {
      // same chat already on screen: replace it with the newer preview
      active.handle.close();
    }
    queue.push({ key: item.key, name: item.name, text: preview(msg.text) });
  }

  function dropReadToasts(items) {
    var unreadKeys = {};
    items.forEach(function (it) { if (it.unread > 0) unreadKeys[it.key] = true; });
    queue = queue.filter(function (j) { return unreadKeys[j.key]; });
    if (active && !unreadKeys[active.key]) active.handle.close();
  }

  /* ----------------------------------------------------------- evaluate */
  function evaluate() {
    scheduled = false;
    if (!signedIn() || !me()) { paintDot([]); return; }
    var items = snapshot();
    paintDot(items);
    if (!primed) return;

    var first = loadSeen() === null;
    var visible = !document.hidden;
    var chatOpen = onChatPage();

    items.forEach(function (it) {
      var ids = announcedIds(it);
      var unseen = it.incoming.filter(function (m, i) { return ids[i] && !(loadSeen() || { ids: {} }).ids[ids[i]]; });
      if (!unseen.length) return;
      // a hidden tab leaves unread messages for whichever tab the person looks at next
      var eligible = !first && it.unread > 0 && !it.muted && visible;
      if (!eligible) {
        if (first || it.unread <= 0 || it.muted) claim(unseen.map(function (m) { return it.key + ':' + m.id; }));
        return;
      }
      var won = claim(unseen.map(function (m) { return it.key + ':' + m.id; }));
      if (!won.length) return;                        // another tab announced it
      var wonSet = {}; won.forEach(function (id) { wonSet[id] = true; });
      var fresh = unseen.filter(function (m) { return wonSet[it.key + ':' + m.id]; });
      var msg = latest(fresh);
      if (msg) enqueue(it, msg);
    });

    if (first) claim(['__baseline__']);

    dropReadToasts(items);
    showNext();

    var sig = JSON.stringify(items.map(function (it) {
      var last = latest(it.incoming);
      return [it.key, it.unread, last ? last.id : ''];
    }));
    if (sig !== lastSignature) {
      lastSignature = sig;
      Accoom.dispatch(document, CHANGED_EVENT);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(evaluate, 0);
  }

  function tick() {
    pollRemote().then(function () { primed = true; evaluate(); });
  }

  /* ---------------------------------------------------------- public API */
  // Every chat that has something from the other person, local and server merged, newest first.
  // The header dropdown renders from this, so a new message in a chat this browser already stores
  // shows up exactly like the first one did.
  function viewItems() {
    var out = [];
    snapshot().forEach(function (it) {
      if (!it.incoming.length) return;
      var last = latest(it.incoming);
      out.push({
        key: it.key, name: it.name, property: it.property, unread: it.unread, muted: it.muted,
        text: last ? last.text : '', label: last ? last.label : '', ts: last ? (last.ts || 0) : 0, order: last ? last.order : 0
      });
    });
    out.sort(function (a, b) { return (b.ts - a.ts) || (b.order - a.order); });
    return out;
  }

  // Mark one chat read / unread from anywhere (header dropdown). Local copy, server copy, and the
  // chat page's in-memory copy are all kept in step so nothing flips back on the next poll.
  function setUnread(key, unread) {
    key = str(key);
    if (!key) return;
    var count = unread ? 1 : 0;
    var handled = false;
    try {
      var detail = { key: key, unread: count, handled: false };
      document.dispatchEvent(new CustomEvent('accoom:set-chat-unread', { detail: detail }));
      handled = !!detail.handled;
    } catch (err) { /* old browser: fall through to storage */ }
    if (!handled) {
      var list = Accoom.getStorage(CONV_KEY, []);
      if (Array.isArray(list)) {
        var changed = false;
        list.forEach(function (conv) {
          if (!conv || str(conv.remoteId || conv.id) !== key) return;
          var next = count ? Math.max(1, unreadOf(conv.unread)) : 0;
          if (unreadOf(conv.unread) !== next) { conv.unread = next; changed = true; }
        });
        if (changed) Accoom.setStorage(CONV_KEY, list);
      }
    }
    remote.forEach(function (it) { if (it.key === key) it.unread = count ? Math.max(1, it.unread) : 0; });
    var s = sync(), myKey = me();
    if (s && myKey && s.available === true) {
      s.api('POST', '/api/conversations/' + encodeURIComponent(key) + (count ? '/unread' : '/read'), { key: myKey }, 5000).catch(function () {});
    }
    evaluate();
  }

  Accoom.MessageNotifier = {
    refresh: function () { evaluate(); },
    items: viewItems,
    markRead: function (key) { setUnread(key, false); },
    markUnread: function (key) { setUnread(key, true); },
    chatLink: chatLink,
    remoteOnlyItems: function () {
      var localKeys = {};
      localItems().forEach(function (it) { localKeys[it.key] = true; });
      return remote.filter(function (it) { return !localKeys[it.key] && it.incoming.length; }).map(function (it) {
        var last = latest(it.incoming);
        return { key: it.key, name: it.name, property: it.property, unread: it.unread, text: last ? last.text : '', ts: last ? last.ts : 0 };
      });
    }
  };

  /* --------------------------------------------------------------- start */
  function start() {
    if (started) return;
    started = true;

    // other tabs and pages
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key === CONV_KEY || e.key === HIDDEN_KEY || e.key === 'accoom-user') schedule();
    });

    // the same tab: every write of the chats (contact-agent.js saves after each change)
    if (window.Storage && window.Storage.prototype && !window.Storage.prototype.__accoomMsgHook) {
      var setItem = window.Storage.prototype.setItem;
      var removeItem = window.Storage.prototype.removeItem;
      window.Storage.prototype.setItem = function (k) {
        var out = setItem.apply(this, arguments);
        if (k === CONV_KEY && this === window.localStorage) schedule();
        return out;
      };
      window.Storage.prototype.removeItem = function (k) {
        var out = removeItem.apply(this, arguments);
        if (k === CONV_KEY && this === window.localStorage) schedule();
        return out;
      };
      window.Storage.prototype.__accoomMsgHook = true;
    }

    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    document.addEventListener('partials:ready', schedule);

    tick();
    timer = window.setInterval(function () { if (!document.hidden) tick(); }, POLL_MS);
    schedule();
  }

  if (typeof Accoom.ready === 'function') Accoom.ready(function () {
    // wait for the first pull of the sync layer, so Sync.available is known
    var s = sync();
    if (s && s.ready && s.ready.then) s.ready.then(start, start); else start();
  });
  else start();
})(window.Accoom);
