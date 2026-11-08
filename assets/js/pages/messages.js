/* ==========================================================================
   ACCOOM — Messages (chat only)
   Conversation list + chat view + sending a message. Nothing else yet.
   Conversations live in 'accoom-conversations' (the header messages
   dropdown reads the same record). A "Contact Agent" click on another page
   leaves an 'accoom-contact-request' behind; this page turns it into (or
   reopens) the conversation with that agent.

   Real agents (listings uploaded through ACCOOM) are reached through the test
   server (core/sync.js): the customer's message lands in that agent's inbox on
   this same page, and the agent's reply comes back. The agent sees the same
   screen with their customers in the list. Conversations with the sample
   (hardcoded) agents stay in this browser only.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  var KEY = 'accoom-conversations';
  var AVATAR = 'assets/images/agent-images/agenticonimg.webp';
  var MOBILE_MAX = 860;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  Accoom.ready(function () {

    // Signed-in only: guests go to signup and come back here.
    if (!Accoom.isLoggedIn()) {
      Accoom.removeStorage('accoom-contact-request');
      window.location.replace('auth.html?mode=signup&next=' + encodeURIComponent('messages.html' + location.search));
      return;
    }

    var layout = Accoom.$('[data-msgs-layout]');
    if (!layout) return;

    var els = {
      list: Accoom.$('[data-msgs-list]'),
      listEmpty: Accoom.$('[data-msgs-list-empty]'),
      chatEmpty: Accoom.$('[data-msgs-chat-empty]'),
      chat: Accoom.$('[data-msgs-chat]'),
      avatar: Accoom.$('[data-msgs-chat-avatar]'),
      name: Accoom.$('[data-msgs-chat-name]'),
      status: Accoom.$('[data-msgs-chat-status]'),
      back: Accoom.$('[data-msgs-back]'),
      thread: Accoom.$('[data-msgs-thread]'),
      composer: Accoom.$('[data-msgs-composer]'),
      input: Accoom.$('[data-msgs-input]'),
      send: Accoom.$('[data-msgs-send]')
    };

    var Sync = Accoom.Sync || null;
    var me = Sync ? Sync.userKey() : '';
    var myName = Sync ? Sync.userName() : '';
    var isAgent = !!(Sync && Sync.isAgent());
    var POLL_MS = 3000;

    var conversations = load();
    var activeId = null;

    if (isAgent) {
      var emptyTitle = els.listEmpty.querySelector('span');
      if (emptyTitle) emptyTitle.textContent = 'Customers who contact you about your listings will show up here.';
      var chatEmptyText = els.chatEmpty.querySelector('p');
      if (chatEmptyText) chatEmptyText.textContent = 'Choose a chat on the left to reply to a customer.';
      els.input.setAttribute('placeholder', 'Type a reply...');
    }

    function serverUp() { return !!(Sync && Sync.available); }
    function clean(v) { return String(v == null ? '' : v).replace(/[<>&"'`]/g, '').trim(); }

    /* ---------------- storage ---------------- */
    function load() {
      var stored = Accoom.getStorage(KEY, []);
      return Array.isArray(stored) ? stored.filter(function (c) {
        return c && c.id && Array.isArray(c.messages);
      }) : [];
    }

    function save() {
      Accoom.setStorage(KEY, conversations);
    }

    function find(id) {
      for (var i = 0; i < conversations.length; i++) {
        if (conversations[i].id === id) return conversations[i];
      }
      return null;
    }

    /* ---------------- time helpers ---------------- */
    function timeLabel(date) {
      var h = date.getHours();
      var m = date.getMinutes();
      var ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
    }

    function startOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    // Messages sent from here carry a timestamp so "Today" never goes stale.
    // Older messages only have a day label, which is used as it is.
    function dayLabel(msg) {
      if (!msg.ts) return msg.day || '';
      var diff = Math.round((startOfDay(new Date()) - startOfDay(new Date(msg.ts))) / 86400000);
      if (diff <= 0) return 'Today';
      if (diff === 1) return 'Yesterday';
      return new Date(msg.ts).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function lastMessage(conv) {
      return conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
    }

    /* ---------------- conversation list ---------------- */
    function renderList() {
      els.list.innerHTML = '';
      els.listEmpty.hidden = conversations.length > 0;

      conversations.forEach(function (conv) {
        var last = lastMessage(conv);
        var unread = conv.unread || 0;
        var preview = last ? ((last.from === 'me' ? 'You: ' : '') + (last.text || '')) : 'Start the conversation';

        var li = document.createElement('li');
        li.className = 'msgs-list-item' +
          (conv.id === activeId ? ' is-active' : '') +
          (unread ? ' is-unread' : '');
        li.setAttribute('data-conv-id', conv.id);
        li.innerHTML =
          '<span class="msgs-list-item-avatar">' +
            '<img src="' + esc(conv.avatar || AVATAR) + '" alt="" />' +
            (conv.online ? '<span class="msgs-list-item-online"></span>' : '') +
          '</span>' +
          '<span class="msgs-list-item-body">' +
            '<span class="msgs-list-item-top">' +
              '<span class="msgs-list-item-name">' + esc(conv.name) + '</span>' +
              '<span class="msgs-list-item-time">' + esc(last ? (last.ts ? timeLabel(new Date(last.ts)) : last.time) : '') + '</span>' +
            '</span>' +
            '<span class="msgs-list-item-bottom">' +
              '<span class="msgs-list-item-preview">' + esc(preview) + '</span>' +
              (unread ? '<span class="msgs-list-item-badge">' + unread + '</span>' : '') +
            '</span>' +
          '</span>';
        els.list.appendChild(li);
      });
    }

    /* ---------------- chat view ---------------- */
    function renderThread(conv) {
      els.thread.innerHTML = '';

      if (!conv.messages.length) {
        els.thread.innerHTML =
          '<div class="msgs-thread-empty"><p>No messages in this conversation</p>' +
          '<span>Start the conversation below.</span></div>';
        return;
      }

      var lastDay = null;
      conv.messages.forEach(function (msg) {
        var day = dayLabel(msg);
        if (day && day !== lastDay) {
          var divider = document.createElement('div');
          divider.className = 'msgs-day-divider';
          divider.innerHTML = '<span>' + esc(day) + '</span>';
          els.thread.appendChild(divider);
          lastDay = day;
        }

        var row = document.createElement('div');
        row.className = 'msgs-row msgs-row--' + (msg.from === 'me' ? 'me' : 'agent');
        row.innerHTML =
          '<div class="msgs-bubble">' + esc(msg.text) + '</div>' +
          '<span class="msgs-time">' + esc(msg.ts ? timeLabel(new Date(msg.ts)) : msg.time) + '</span>';
        els.thread.appendChild(row);
      });

      els.thread.scrollTop = els.thread.scrollHeight;
    }

    function renderHeader(conv) {
      els.avatar.src = conv.avatar || AVATAR;
      els.avatar.alt = conv.name || '';
      els.name.textContent = conv.name || 'Agent';
      els.status.textContent = conv.subtitle || (conv.online ? 'Online' : 'Offline');
      els.status.classList.toggle('is-online', !conv.subtitle && !!conv.online);
    }

    function showEmpty() {
      activeId = null;
      els.chat.hidden = true;
      els.chatEmpty.hidden = false;
      layout.removeAttribute('data-view');
      renderList();
    }

    function open(id) {
      var conv = find(id);
      if (!conv) return;

      activeId = id;
      if (conv.unread) {
        conv.unread = 0;
        save();
        markRead(conv);
      }

      els.chatEmpty.hidden = true;
      els.chat.hidden = false;
      layout.setAttribute('data-view', 'chat');

      renderHeader(conv);
      renderThread(conv);
      renderList();
    }

    /* ---------------- sending ---------------- */
    function resizeInput() {
      els.input.style.height = 'auto';
      els.input.style.height = Math.min(els.input.scrollHeight, 120) + 'px';
    }

    function sendMessage() {
      var conv = find(activeId);
      var text = els.input.value.trim();
      if (!conv || !text) return;

      var now = new Date();
      var sent = {
        id: 'm-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 6),
        from: 'me',
        ts: now.getTime(),
        day: 'Today',
        time: timeLabel(now),
        read: false,
        text: text
      };
      if (conv.remote) sent.pending = true;   // until the server has it
      conv.messages.push(sent);

      // Latest conversation goes to the top of the list.
      conversations = [conv].concat(conversations.filter(function (c) { return c.id !== conv.id; }));
      save();

      els.input.value = '';
      resizeInput();
      renderThread(conv);
      renderList();
      els.input.focus();
      if (conv.remote) postMessage(conv, sent);
    }

    Accoom.on(els.composer, 'submit', function (e) {
      e.preventDefault();
      sendMessage();
    });

    // Enter sends on a keyboard; Shift+Enter makes a new line. On touch
    // devices Enter stays a new line and the send button sends.
    Accoom.on(els.input, 'keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
      e.preventDefault();
      sendMessage();
    });

    Accoom.on(els.input, 'input', resizeInput);

    /* ---------------- shared with the test server ---------------- */
    // A conversation with a real agent (remote) lives on the server. This browser keeps a copy
    // in 'accoom-conversations' (the header dropdown reads it) seen from MY side:
    // my messages are from 'me', the other person's are not.
    function remoteView(rc) {
      var side = rc.agentKey === me ? 'agent' : 'customer';
      var other = side === 'agent' ? rc.customerName : rc.agentName;
      var old = find(rc.id);
      var msgs = rc.messages.map(function (m) {
        var d = new Date(m.ts);
        return { id: m.id, from: m.from === side ? 'me' : 'other', ts: m.ts, day: 'Today', time: timeLabel(d), read: true, text: m.text };
      });
      var known = {};
      msgs.forEach(function (m) { known[m.id] = true; });
      if (old) {
        old.messages.forEach(function (m) { if (m.pending && !known[m.id]) msgs.push(m); });
        msgs.sort(function (a, b) { return a.ts - b.ts; });
      }
      return {
        id: rc.id, remote: true, side: side,
        name: clean(other) || (side === 'agent' ? 'Customer' : 'Agent'),
        role: side === 'agent' ? 'Customer' : 'Real Estate Agent',
        avatar: (old && old.avatar) || AVATAR,
        online: false,
        verified: old ? !!old.verified : false,
        muted: old ? !!old.muted : false,
        subtitle: clean(rc.propertyName),
        agentKey: rc.agentKey, customerKey: rc.customerKey,
        property: (old && old.property && String(old.property.id) === String(rc.propertyId)) ? old.property : { id: rc.propertyId, name: clean(rc.propertyName) },
        unread: (rc.unread && rc.unread[side]) || 0,
        messages: msgs
      };
    }

    function postMessage(conv, msg) {
      if (!serverUp()) return Promise.resolve();
      var mine = conv.side === 'agent';
      return Sync.api('POST', '/api/conversations/' + encodeURIComponent(conv.id) + '/messages', {
        senderKey: me,
        message: { id: msg.id, text: msg.text, ts: msg.ts },
        meta: {
          propertyId: conv.property && conv.property.id,
          propertyName: (conv.property && conv.property.name) || '',
          agentKey: conv.agentKey, agentName: mine ? myName : conv.name,
          customerKey: conv.customerKey, customerName: mine ? conv.name : myName
        }
      }).then(function () {
        msg.pending = false;
        save();
      }, function () { /* stays pending, retried on the next sync */ });
    }

    function markRead(conv) {
      if (!conv.remote || !serverUp()) return;
      Sync.api('POST', '/api/conversations/' + encodeURIComponent(conv.id) + '/read', { key: me }).catch(function () {});
    }

    var syncing = false;
    var openedFromPage = false;   // set below when a Contact Agent / ?open= link chose the chat
    function syncDown() {
      if (!me || !serverUp() || syncing) return;
      syncing = true;

      // Messages that could not be sent yet.
      conversations.forEach(function (c) {
        if (!c.remote) return;
        c.messages.forEach(function (m) { if (m.pending) postMessage(c, m); });
      });

      Sync.api('GET', '/api/conversations?key=' + encodeURIComponent(me)).then(function (r) {
        var before = JSON.stringify(conversations);
        var current = activeId ? find(activeId) : null;
        var openCount = current ? current.messages.length : 0;

        (r.conversations || []).forEach(function (rc) {
          var next = remoteView(rc);
          if (next.id === activeId && next.unread) {            // I am looking at it right now
            next.unread = 0;
            Sync.api('POST', '/api/conversations/' + encodeURIComponent(next.id) + '/read', { key: me }).catch(function () {});
          }
          var idx = -1;
          for (var i = 0; i < conversations.length; i++) { if (conversations[i].id === next.id) { idx = i; break; } }
          if (idx === -1) conversations.push(next); else conversations[idx] = next;
        });

        // Newest activity first.
        conversations.sort(function (a, b) {
          var la = lastMessage(a), lb = lastMessage(b);
          return (lb ? lb.ts || 0 : 0) - (la ? la.ts || 0 : 0);
        });

        if (JSON.stringify(conversations) === before) return;
        save();
        // Desktop: first time the server's chats arrive, don't leave the chat panel blank.
        if (!activeId && !openedFromPage && window.innerWidth > MOBILE_MAX && conversations.length) {
          open(conversations[0].id);
          return;
        }
        var now = activeId ? find(activeId) : null;
        if (now && now.messages.length !== openCount) renderThread(now);
        if (now) renderHeader(now);
        renderList();
      }).catch(function (e) { if (window.console) console.warn("ACCOOM chat sync: " + (e && e.stack ? e.stack : e)); }).then(function () { syncing = false; });
    }

    window.setInterval(function () { if (!document.hidden) syncDown(); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) syncDown(); });
    window.addEventListener('focus', syncDown);

    /* ---------------- navigation ---------------- */
    Accoom.delegate(els.list, 'click', '.msgs-list-item', function () {
      open(this.getAttribute('data-conv-id'));
    });

    Accoom.on(els.back, 'click', function () {
      showEmpty();
    });

    // Another tab (or an agent reply landing in storage) updated the chats.
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY) return;
      conversations = load();
      var conv = activeId ? find(activeId) : null;
      if (conv) {
        renderHeader(conv);
        renderThread(conv);
      } else if (activeId) {
        showEmpty();
        return;
      }
      renderList();
    });

    /* ---------------- start from another page ---------------- */
    // "Contact Agent" on a property / agent card leaves this behind.
    function conversationFromRequest(request) {
      var prop = request.property;
      var agentName = request.agentName || 'Agent';

      // A real agent (listing uploaded through ACCOOM) is reached through the server.
      var item = (Accoom.PropertyService && Accoom.PropertyService.getById) ? Accoom.PropertyService.getById(prop.id) : null;
      var agentKey = item && item.agentListing && item.agentKey ? String(item.agentKey) : '';
      if (agentKey && me && agentKey !== me && serverUp()) {
        var rid = 'c-' + String(prop.id).replace(/[^A-Za-z0-9_.:-]/g, '') + '-' + me;
        var found = find(rid);
        if (found) { found.property = prop; return found; }
        var made = {
          id: rid, remote: true, side: 'customer', name: clean(agentName) || 'Agent', role: 'Real Estate Agent',
          avatar: request.agentAvatar || AVATAR, online: false, verified: !!request.verified, muted: false,
          subtitle: clean(prop.name), agentKey: agentKey, customerKey: me, property: prop, messages: []
        };
        conversations.unshift(made);
        return made;
      }

      var existing = conversations.filter(function (c) {
        if (c.remote) return false;
        return (c.property && String(c.property.id) === String(prop.id)) ||
               (c.name && c.name.toLowerCase() === agentName.toLowerCase());
      })[0];

      if (existing) {
        existing.property = prop;
        if (request.agentAvatar) existing.avatar = request.agentAvatar;
        if (request.verified !== undefined) existing.verified = !!request.verified;
        return existing;
      }

      var created = {
        id: 'conv-' + prop.id + '-' + Date.now().toString().slice(-4),
        name: agentName,
        role: 'Real Estate Agent',
        avatar: request.agentAvatar || AVATAR,
        online: request.online !== false,
        verified: !!request.verified,
        muted: false,
        property: prop,
        messages: []
      };
      conversations.unshift(created);
      return created;
    }

    /* ---------------- init ---------------- */
    var params = new URLSearchParams(window.location.search);
    var openProp = params.get('open');
    var request = Accoom.getStorage('accoom-contact-request', null);

    renderList();
    showEmpty();
    openedFromPage = !!((request && request.property && request.property.id) || openProp);

    if (request && request.property && request.property.id) {
      var conv = conversationFromRequest(request);
      save();
      Accoom.removeStorage('accoom-contact-request');
      open(conv.id);
      els.input.focus();
    } else if (openProp) {
      var sameProp = conversations.filter(function (c) {
        return c.property && String(c.property.id) === String(openProp);
      });
      var target = sameProp.filter(function (c) { return c.unread; })[0] || sameProp[0];
      if (target) open(target.id);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (window.innerWidth > MOBILE_MAX && conversations.length) {
      // Desktop: don't leave the chat panel blank.
      open(conversations[0].id);
    }

    syncDown();
  });

})(window.Accoom);
