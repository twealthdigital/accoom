/* ==========================================================================
   ACCOOM — Messages (chat only)
   Conversation list + chat view + sending a message. Nothing else yet.
   Conversations live in 'accoom-conversations' (the header messages
   dropdown reads the same record). A "Contact Agent" click on another page
   leaves an 'accoom-contact-request' behind; this page turns it into (or
   reopens) the conversation with that agent.
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

    var conversations = load();
    var activeId = null;

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
      els.status.textContent = conv.online ? 'Online' : 'Offline';
      els.status.classList.toggle('is-online', !!conv.online);
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
      conv.messages.push({
        id: 'm-' + now.getTime(),
        from: 'me',
        ts: now.getTime(),
        day: 'Today',
        time: timeLabel(now),
        read: false,
        text: text
      });

      // Latest conversation goes to the top of the list.
      conversations = [conv].concat(conversations.filter(function (c) { return c.id !== conv.id; }));
      save();

      els.input.value = '';
      resizeInput();
      renderThread(conv);
      renderList();
      els.input.focus();
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

      var existing = conversations.filter(function (c) {
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

    if (request && request.property && request.property.id) {
      var conv = conversationFromRequest(request);
      save();
      Accoom.removeStorage('accoom-contact-request');
      open(conv.id);
      els.input.focus();
    } else if (openProp) {
      var target = conversations.filter(function (c) {
        return c.property && String(c.property.id) === String(openProp);
      })[0];
      if (target) open(target.id);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (window.innerWidth > MOBILE_MAX && conversations.length) {
      // Desktop: don't leave the chat panel blank.
      open(conversations[0].id);
    }
  });

})(window.Accoom);
