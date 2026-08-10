/* ==========================================================================
   ACCOOM — Contact Agent (Messages / Chat)
   Renders the conversation list + chat thread and wires up every control
   already present in contact-agent.html (search, tabs, reply, save,
   read receipts, property card, chat menu, mobile back button, etc).
   ========================================================================== */

(function (Accoom) {
  'use strict';

  var ICONS = {
    check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    doubleCheck: '<svg width="15" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="19 6 8 17 3 12"></polyline><polyline points="24 6 13 17"></polyline></svg>',
    star: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7-6.2-3.4L5.8 21 7 14 2 9.1l7-.9L12 2z"></path></svg>',
    reply: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>',
    dots: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
  };

  var AVATAR = 'assets/images/agent-images/agenticonimg.webp';

  /* ============================================================
     MOCK DATA — replace with your real API / backend later.
     Each conversation carries its own message thread.
     ============================================================ */
  function seedConversations() {
    return [
      {
        id: 'david-o',
        name: 'David O.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: true,
        verified: true,
        muted: false,
        unread: 2,
        property: {
          id: 'ACCOM-24567',
          name: '2 Bedroom Detached Duplex',
          location: 'Lekki Phase 1, Lagos',
          price: '\u20A6460,000 / year',
          image: 'assets/images/home-properties/miniflat1.png'
        },
        messages: [
          { id: 'm1', from: 'me', day: 'Today', time: '2:27 PM', read: true,
            text: 'Hello David, I saw the 2 bedroom duplex on your profile. Is it still available?' },
          { id: 'm2', from: 'agent', day: 'Today', time: '2:28 PM',
            text: "Hi there! Yes, it's still available. Would you like more details about it?" },
          { id: 'm3', from: 'me', day: 'Today', time: '2:28 PM', read: true,
            text: 'Yes please. Can I get more pictures of the living room and kitchen?' },
          { id: 'm4', from: 'agent', day: 'Today', time: '2:30 PM',
            text: "Sure, I'll send them right away." },
          { id: 'm5', from: 'agent', day: 'Today', time: '2:30 PM',
            photos: [
              'assets/images/home-properties/hall2.png',
              'assets/images/home-properties/bedroomflat3.png',
              'assets/images/home-properties/miniflat.png'
            ] },
          { id: 'm6', from: 'agent', day: 'Today', time: '2:30 PM',
            text: 'Hi, is the apartment still available?' }
        ]
      },
      {
        id: 'sarah-a',
        name: 'Sarah A.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: true,
        verified: true,
        muted: false,
        unread: 1,
        property: {
          id: 'ACCOM-30988',
          name: '2 Bedroom Apartment',
          location: 'Victoria Island, Lagos',
          price: '\u20A6325,000 / year',
          image: 'assets/images/home-properties/miniflat.png'
        },
        messages: [
          { id: 's1', from: 'agent', day: 'Today', time: '11:20 AM',
            text: "Good morning! Following up on the apartment you asked about." },
          { id: 's2', from: 'me', day: 'Today', time: '11:40 AM', read: true,
            text: 'Morning Sarah, yes I am still interested.' },
          { id: 's3', from: 'agent', day: 'Today', time: '11:45 AM',
            text: 'Thanks for getting back to me, I can schedule a viewing this weekend.' }
        ]
      },
      {
        id: 'michael-e',
        name: 'Michael E.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: false,
        verified: true,
        muted: false,
        property: {
          id: 'ACCOM-31210',
          name: 'Self-Contained Studio',
          location: 'Ikeja GRA, Lagos',
          price: '\u20A6280,000 / year',
          image: 'assets/images/home-properties/selfcon1.png'
        },
        messages: [
          { id: 'e1', from: 'me', day: 'Yesterday', time: '4:02 PM', read: true,
            text: "I'd like to schedule a viewing." },
          { id: 'e2', from: 'agent', day: 'Yesterday', time: '4:40 PM',
            text: "I'll like to schedule a viewing." }
        ]
      }
    ];
  }

  Accoom.ready(function () {

    var layout = Accoom.$('[data-msgs-layout]');
    if (!layout) return;

    var els = {
      list: Accoom.$('[data-msgs-list]'),
      listEmpty: Accoom.$('[data-msgs-list-empty]'),
      listEmptyTitle: Accoom.$('[data-msgs-list-empty-title]'),
      listEmptyText: Accoom.$('[data-msgs-list-empty-text]'),
      search: Accoom.$('[data-msgs-search]'),
      tabs: Accoom.$$('[data-msgs-tab]'),

      selectionBar: Accoom.$('[data-msgs-selection-bar]'),
      selectionCount: Accoom.$('[data-msgs-selection-count]'),

      chatPanel: Accoom.$('[data-msgs-chat-panel]'),
      chatEmpty: Accoom.$('[data-msgs-chat-empty]'),
      chat: Accoom.$('[data-msgs-chat]'),
      chatEmptyTitle: Accoom.$('[data-msgs-chat-empty-title]'),
      chatEmptyText: Accoom.$('[data-msgs-chat-empty-text]'),
      chatAvatar: Accoom.$('[data-msgs-chat-avatar]'),
      chatName: Accoom.$('[data-msgs-chat-name]'),
      chatStatus: Accoom.$('[data-msgs-chat-status]'),
      viewProfile: Accoom.$('[data-msgs-view-profile]'),
      backBtn: Accoom.$('[data-msgs-back]'),

      propCard: Accoom.$('[data-msgs-property-card]'),
      propImg: Accoom.$('[data-msgs-property-img]'),
      propName: Accoom.$('[data-msgs-property-name]'),
      propLocText: Accoom.$('[data-msgs-property-loc-text]'),
      propPrice: Accoom.$('[data-msgs-property-price]'),

      chatTabs: Accoom.$$('[data-msgs-chat-tab]'),
      thread: Accoom.$('[data-msgs-thread]'),
      savedThread: Accoom.$('[data-msgs-saved-thread]'),
      threadEmpty: Accoom.$('[data-msgs-thread-empty]'),
      savedEmpty: Accoom.$('[data-msgs-saved-empty]'),

      replyPreview: Accoom.$('[data-msgs-reply-preview]'),
      replyPreviewName: Accoom.$('[data-msgs-reply-preview-name]'),
      replyPreviewText: Accoom.$('[data-msgs-reply-preview-text]'),
      replyCancel: Accoom.$('[data-msgs-reply-cancel]'),

      composer: Accoom.$('[data-msgs-composer]'),
      input: Accoom.$('[data-msgs-input]'),
      send: Accoom.$('[data-msgs-send]')
    };

    var state = {
      conversations: seedConversations(),
      activeId: null,
      activeChatTab: 'messages',
      listTab: 'all',
      query: '',
      selectMode: false,
      selected: {},
      replyTo: null
    };

    /* ---------------- helpers ---------------- */
    function findConv(id) {
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === id) return state.conversations[i];
      }
      return null;
    }

    function lastMessage(conv) {
      return conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
    }

    function unreadCount(conv) {
      return conv.unread || 0;
    }

    function previewText(msg) {
      if (!msg) return 'Start the conversation';
      if (msg.photos) return (msg.from === 'me' ? 'You: ' : '') + msg.photos.length + ' Photos';
      return (msg.from === 'me' ? 'You: ' : '') + msg.text;
    }

    function closeAllRowMenus() {
      Accoom.$$('.msgs-row-menu .dropdown-panel.is-open').forEach(function (p) {
        p.classList.remove('is-open');
        p.classList.remove('msgs-row-menu-panel--below');
      });
    }

    Accoom.on(document, 'click', function () { closeAllRowMenus(); });

    /* ---------------- LIST RENDER ---------------- */
    function visibleConversations() {
      var q = state.query.trim().toLowerCase();
      var list = state.conversations.filter(function (c) {
        if (state.listTab === 'unread' && unreadCount(c) === 0) return false;
        if (q && c.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });

      // In the All tab, unread conversations always float to the top,
      // above everything already read. Sort is stable, so read/unread
      // groups otherwise keep their existing relative order.
      if (state.listTab === 'all') {
        list = list.slice().sort(function (a, b) {
          var aUnread = unreadCount(a) > 0 ? 0 : 1;
          var bUnread = unreadCount(b) > 0 ? 0 : 1;
          return aUnread - bUnread;
        });
      }

      return list;
    }

    function renderList() {
      var items = visibleConversations();
      els.list.innerHTML = '';

      if (!items.length) {
        els.listEmpty.classList.remove('is-hidden');
        if (els.listEmptyTitle && els.listEmptyText) {
          if (state.listTab === 'unread') {
            els.listEmptyTitle.textContent = 'No unread messages';
            els.listEmptyText.textContent = "You're all caught up. New messages will show up here.";
          } else if (state.query.trim()) {
            els.listEmptyTitle.textContent = 'No matches found';
            els.listEmptyText.textContent = 'Try a different name or keyword.';
          } else {
            els.listEmptyTitle.textContent = 'No messages yet';
            els.listEmptyText.textContent = 'Conversations with agents will show up here.';
          }
        }
      } else {
        els.listEmpty.classList.add('is-hidden');
      }

      items.forEach(function (conv) {
        var msg = lastMessage(conv);
        var unread = unreadCount(conv);

        var li = document.createElement('li');
        li.className = 'msgs-list-item' +
          (conv.id === state.activeId ? ' is-active' : '') +
          (unread ? ' is-unread' : '') +
          (state.selectMode ? ' is-selecting' : '') +
          (state.selected[conv.id] ? ' is-checked' : '');
        li.setAttribute('data-conv-id', conv.id);

        li.innerHTML =
          '<span class="msgs-list-item-check">' + (state.selected[conv.id] ? ICONS.check : '') + '</span>' +
          '<span class="msgs-list-item-avatar">' +
            '<img src="' + conv.avatar + '" alt="' + conv.name + '" />' +
            (conv.online ? '<span class="msgs-list-item-online"></span>' : '') +
          '</span>' +
          '<span class="msgs-list-item-body">' +
            '<span class="msgs-list-item-top">' +
              '<span class="msgs-list-item-name">' + conv.name + '</span>' +
              '<span class="msgs-list-item-time">' + (msg ? msg.time : '') + '</span>' +
            '</span>' +
            '<span class="msgs-list-item-bottom">' +
              '<span class="msgs-list-item-preview">' + previewText(msg) + '</span>' +
              (unread ? '<span class="msgs-list-item-badge">' + unread + '</span>' : '') +
            '</span>' +
          '</span>' +
          '<span class="msgs-list-item-menu">' +
            '<button type="button" class="msgs-icon-btn" data-conv-delete aria-label="Delete conversation">' + ICONS.trash + '</button>' +
          '</span>';

        Accoom.on(li, 'click', function (e) {
          if (e.target.closest('[data-conv-delete]')) {
            e.stopPropagation();
            deleteConversation(conv.id);
            return;
          }
          if (state.selectMode) {
            toggleSelect(conv.id);
            return;
          }
          openConversation(conv.id);
        });

        els.list.appendChild(li);
      });
    }

    function toggleSelect(id) {
      state.selected[id] = !state.selected[id];
      updateSelectionBar();
      renderList();
    }

    function updateSelectionBar() {
      var count = Object.keys(state.selected).filter(function (k) { return state.selected[k]; }).length;
      if (state.selectMode && count > 0) {
        els.selectionBar.classList.remove('is-hidden');
        els.selectionCount.textContent = count + ' selected';
      } else {
        els.selectionBar.classList.add('is-hidden');
      }
    }

    function deleteConversation(id) {
      var wasActive = state.activeId === id;
      var idx = state.conversations.findIndex(function (c) { return c.id === id; });

      state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
      delete state.selected[id];

      if (wasActive) {
        if (state.conversations.length) {
          // Prefer the conversation that slid up into this row's spot;
          // fall back to the one above it if we deleted the last row.
          var nextIdx = idx < state.conversations.length ? idx : state.conversations.length - 1;
          openConversation(state.conversations[nextIdx].id);
        } else {
          state.activeId = null;
          showChatEmpty(true);
        }
      }

      renderList();
      updateSelectionBar();
    }

    /* ---------------- LIST HEADER MENU ---------------- */
    Accoom.on(Accoom.$('[data-msgs-select-all]'), 'click', function () {
      state.selectMode = true;
      visibleConversations().forEach(function (c) { state.selected[c.id] = true; });
      updateSelectionBar();
      renderList();
    });

    Accoom.on(Accoom.$('[data-msgs-deselect-all]'), 'click', function () {
      state.selectMode = false;
      state.selected = {};
      updateSelectionBar();
      renderList();
    });

    Accoom.on(Accoom.$('[data-msgs-delete-all]'), 'click', function () {
      state.conversations = [];
      state.activeId = null;
      state.selected = {};
      showChatEmpty(true);
      renderList();
      updateSelectionBar();
    });

    Accoom.on(Accoom.$('[data-msgs-delete-selected]'), 'click', function () {
      var ids = Object.keys(state.selected).filter(function (k) { return state.selected[k]; });
      ids.forEach(deleteConversation);
      state.selectMode = false;
      state.selected = {};
      updateSelectionBar();
      renderList();
    });

    Accoom.on(Accoom.$('[data-msgs-cancel-selection]'), 'click', function () {
      state.selectMode = false;
      state.selected = {};
      updateSelectionBar();
      renderList();
    });

    /* ---------------- SEARCH + TABS ---------------- */
    if (els.search) {
      Accoom.on(els.search, 'input', Accoom.debounce(function () {
        state.query = els.search.value;
        renderList();
      }, 120));
    }

    function setActiveTabUI(key) {
      els.tabs.forEach(function (t) {
        var active = t.getAttribute('data-msgs-tab') === key;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    els.tabs.forEach(function (tab) {
      Accoom.on(tab, 'click', function () {
        var key = tab.getAttribute('data-msgs-tab');
        state.listTab = key;
        setActiveTabUI(key);

        // Jumping into Unread should never leave a previously-open chat
        // sitting on the right — force a pick from the filtered list.
        if (key === 'unread') {
          state.activeId = null;
          showChatEmpty();
        }

        renderList();
      });
    });

    /* ---------------- OPEN CONVERSATION ---------------- */
    function showChatEmpty(noConversations) {
      els.chat.classList.add('is-hidden');
      els.chatEmpty.classList.remove('is-hidden');
      layout.setAttribute('data-view', 'list');

      if (!els.chatEmptyTitle || !els.chatEmptyText) return;

      if (noConversations) {
        els.chatEmptyTitle.textContent = 'No conversations yet';
        els.chatEmptyText.textContent = "You haven't messaged any agents yet. Start a chat and it'll show up here.";
        return;
      }

      if (state.listTab === 'unread') {
        var hasUnread = state.conversations.some(function (c) { return unreadCount(c) > 0; });
        if (hasUnread) {
          els.chatEmptyTitle.textContent = 'Select an unread conversation';
          els.chatEmptyText.textContent = 'Pick one of your unread chats on the left to read it.';
        } else {
          els.chatEmptyTitle.textContent = 'No unread messages';
          els.chatEmptyText.textContent = "You're all caught up. New messages will show up here.";
        }
        return;
      }

      els.chatEmptyTitle.textContent = 'Select a conversation';
      els.chatEmptyText.textContent = 'Choose a chat on the left to start messaging an agent.';
    }

    function openConversation(id) {
      var conv = findConv(id);
      if (!conv) return;

      var wasUnread = unreadCount(conv) > 0;
      conv.unread = 0;
      state.activeId = id;
      state.activeChatTab = 'messages';
      state.replyTo = null;

      // Reading a chat bumps it to the front — matches "becoming the
      // first message" once it lands (read) in the All tab.
      var idx = state.conversations.indexOf(conv);
      if (idx > 0) {
        state.conversations.splice(idx, 1);
        state.conversations.unshift(conv);
      }

      // Opened it from the Unread tab? Smoothly hand control back to All
      // — the pill transition is already animated via .msgs-tab's CSS.
      if (wasUnread && state.listTab === 'unread') {
        state.listTab = 'all';
        setActiveTabUI('all');
      }

      els.chatEmpty.classList.add('is-hidden');
      els.chat.classList.remove('is-hidden');
      layout.setAttribute('data-view', 'chat');

      renderChatHeader(conv);
      renderPropertyCard(conv);
      switchChatTab('messages');
      renderThread(conv);
      renderSavedThread(conv);
      hideReplyPreview();
      renderList();
    }

    function renderChatHeader(conv) {
      els.chatAvatar.src = conv.avatar;
      els.chatAvatar.alt = conv.name;
      els.chatName.textContent = conv.name;
      els.chatStatus.textContent = conv.muted ? 'Muted' : (conv.online ? 'Online' : 'Offline \u00B7 ' + conv.role);
      els.chatStatus.classList.toggle('is-online', conv.online && !conv.muted);

      if (els.viewProfile) {
        Accoom.on(els.viewProfile, 'click', function (e) {
          e.preventDefault();
          Accoom.setStorage('accoom-active-agent', {
            name: conv.name,
            avatar: conv.avatar,
            verified: conv.verified,
            stats: '',
            rating: '',
            level: 'AL5',
            property: { id: conv.property.id, name: conv.property.name }
          });
          window.location.href = 'agent-profile.html';
        });
      }
    }

    function renderPropertyCard(conv) {
      els.propImg.src = conv.property.image;
      els.propImg.alt = conv.property.name;
      els.propName.textContent = conv.property.name;
      els.propLocText.textContent = conv.property.location;
      els.propPrice.textContent = conv.property.price;
    }

    /* ---------------- CHAT TABS (Messages / Saved) ---------------- */
    els.chatTabs.forEach(function (tab) {
      Accoom.on(tab, 'click', function () {
        switchChatTab(tab.getAttribute('data-msgs-chat-tab'));
      });
    });

    function switchChatTab(key) {
      state.activeChatTab = key;
      els.chatTabs.forEach(function (t) {
        var active = t.getAttribute('data-msgs-chat-tab') === key;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      els.thread.hidden = key !== 'messages';
      els.savedThread.hidden = key !== 'saved';

      // Re-check which empty-state (if any) should show for the tab
      // we just switched to — this is what was leaking through before.
      var conv = findConv(state.activeId);
      if (conv) {
        renderThread(conv);
        renderSavedThread(conv);
      }
    }

    /* ---------------- THREAD RENDER ---------------- */
    function renderThread(conv) {
      els.thread.innerHTML = '';
      var hasMessages = conv.messages.length > 0;
      els.threadEmpty.classList.toggle('is-hidden', hasMessages || state.activeChatTab !== 'messages');
      if (!hasMessages) {
        return;
      }

      var lastDay = null;
      conv.messages.forEach(function (msg) {
        if (msg.day !== lastDay) {
          var divider = document.createElement('div');
          divider.className = 'msgs-day-divider';
          divider.innerHTML = '<span>' + msg.day + '</span>';
          els.thread.appendChild(divider);
          lastDay = msg.day;
        }
        els.thread.appendChild(buildRow(msg, conv));
      });

      els.thread.scrollTop = els.thread.scrollHeight;
    }

    function renderSavedThread(conv) {
      var saved = conv.messages.filter(function (m) { return m.saved; });
      els.savedThread.innerHTML = '';
      var hasSaved = saved.length > 0;
      els.savedEmpty.classList.toggle('is-hidden', hasSaved || state.activeChatTab !== 'saved');
      if (!hasSaved) {
        return;
      }
      saved.forEach(function (msg) {
        els.savedThread.appendChild(buildRow(msg, conv, true));
      });
    }

    function buildRow(msg, conv, isSavedView) {
      var row = document.createElement('div');
      row.className = 'msgs-row msgs-row--' + (msg.from === 'me' ? 'me' : 'agent');
      row.setAttribute('data-msg-id', msg.id);

      var avatarHtml = msg.from === 'agent'
        ? '<img class="msgs-row-avatar" src="' + conv.avatar + '" alt="" />'
        : '<span class="msgs-row-avatar"></span>';

      var replyHtml = '';
      if (msg.replyTo) {
        replyHtml = '<div class="msgs-reply-quote"><b>' + msg.replyTo.name + '</b><span>' + msg.replyTo.text + '</span></div>';
      }

      var bubbleInner;
      if (msg.photos) {
        bubbleInner = '<div class="msgs-bubble-photos">' +
          msg.photos.map(function (src) { return '<img src="' + src + '" alt="" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.png\';" />'; }).join('') +
          '<span class="msgs-bubble-photos-count">' + msg.photos.length + ' Photos</span>' +
          '</div>';
      } else {
        bubbleInner = '<div class="msgs-bubble">' + escapeHtml(msg.text) + (msg.saved ? '<span class="msgs-bubble-saved">' + ICONS.star + '</span>' : '') + '</div>';
      }

      var metaHtml = '<div class="msgs-meta-row' + (msg.from === 'me' && msg.read ? ' is-read' : '') + '">' +
        '<span>' + msg.time + '</span>' +
        (msg.from === 'me' ? (msg.read ? ICONS.doubleCheck : ICONS.check) : '') +
        '</div>';

      var menuItems = '';
      if (!isSavedView) {
        menuItems += '<li role="option" data-row-reply>' + ICONS.reply + ' <span style="margin-left:6px;">Reply</span></li>';
      }
      menuItems += '<li role="option" data-row-save>' + ICONS.star + ' <span style="margin-left:6px;">' + (msg.saved ? 'Unsave' : 'Save') + '</span></li>';
      // Individual messages are intentionally NOT deletable — chats can
      // serve as evidence for both the client and the agent. Whole
      // conversations can still be removed from the list.

      var actionHtml =
        '<div class="msgs-row-menu">' +
          '<button type="button" class="msgs-row-action" data-row-action aria-label="Message options">' + ICONS.dots + '</button>' +
          '<ul class="dropdown-panel" data-row-menu-panel>' + menuItems + '</ul>' +
        '</div>';

      row.innerHTML =
        avatarHtml +
        actionHtml +
        '<div class="msgs-bubble-col">' + replyHtml + bubbleInner + metaHtml + '</div>';

      var actionBtn = row.querySelector('[data-row-action]');
      var panel = row.querySelector('[data-row-menu-panel]');
      var scrollHost = isSavedView ? els.savedThread : els.thread;

      Accoom.on(actionBtn, 'click', function (e) {
        e.stopPropagation();
        var wasOpen = panel.classList.contains('is-open');
        closeAllRowMenus();
        if (!wasOpen) {
          positionRowMenu(actionBtn, panel, scrollHost);
          panel.classList.add('is-open');
        }
      });

      var replyOption = row.querySelector('[data-row-reply]');
      if (replyOption) {
        Accoom.on(replyOption, 'click', function (e) {
          e.stopPropagation();
          setReply(msg, conv);
          panel.classList.remove('is-open');
        });
      }

      Accoom.on(row.querySelector('[data-row-save]'), 'click', function (e) {
        e.stopPropagation();
        msg.saved = !msg.saved;
        panel.classList.remove('is-open');
        renderThread(conv);
        renderSavedThread(conv);
      });

      return row;
    }

    // Flips the row menu below its trigger when there isn't enough room
    // above it inside the scrollable thread (fixes it getting clipped
    // near the top of the conversation).
    function positionRowMenu(trigger, panel, scrollContainer) {
      panel.classList.remove('msgs-row-menu-panel--below');
      if (!scrollContainer) return;

      var triggerRect = trigger.getBoundingClientRect();
      var containerRect = scrollContainer.getBoundingClientRect();
      var panelHeight = panel.offsetHeight;
      var spaceAbove = triggerRect.top - containerRect.top;

      if (spaceAbove < panelHeight + 10) {
        panel.classList.add('msgs-row-menu-panel--below');
      }
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    }

    /* ---------------- REPLY PREVIEW ---------------- */
    function setReply(msg, conv) {
      state.replyTo = {
        name: msg.from === 'me' ? 'You' : conv.name,
        text: msg.photos ? (msg.photos.length + ' Photos') : msg.text
      };
      els.replyPreviewName.textContent = state.replyTo.name;
      els.replyPreviewText.textContent = state.replyTo.text;
      els.replyPreview.classList.remove('is-hidden');
      els.input.focus();
    }

    function hideReplyPreview() {
      state.replyTo = null;
      els.replyPreview.classList.add('is-hidden');
    }

    if (els.replyCancel) {
      Accoom.on(els.replyCancel, 'click', hideReplyPreview);
    }

    /* ---------------- COMPOSER ---------------- */
    if (els.composer) {
      Accoom.on(els.composer, 'submit', function (e) {
        e.preventDefault();
        var conv = findConv(state.activeId);
        if (!conv) return;

        var text = els.input.value.trim();
        if (!text) return;

        var msg = {
          id: 'u' + Date.now(),
          from: 'me',
          day: 'Today',
          time: formatNow(),
          read: false,
          text: text
        };
        if (state.replyTo) {
          msg.replyTo = state.replyTo;
        }

        conv.messages.push(msg);
        els.input.value = '';
        hideReplyPreview();
        renderThread(conv);
        renderList();

        // Simulate the agent reading + replying, like the reference chat.
        setTimeout(function () {
          msg.read = true;
          renderThread(conv);
        }, 900);
      });
    }

    function formatNow() {
      var d = new Date();
      var h = d.getHours();
      var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12; if (h === 0) h = 12;
      m = m < 10 ? '0' + m : m;
      return h + ':' + m + ' ' + ampm;
    }

    /* ---------------- MOBILE BACK ---------------- */
    if (els.backBtn) {
      Accoom.on(els.backBtn, 'click', function () {
        layout.setAttribute('data-view', 'list');
      });
    }

    /* ---------------- CHAT MENU (clear / mute / block) ---------------- */
    var clearChatBtn = Accoom.$('[data-msgs-clear-chat]');
    var muteChatBtn = Accoom.$('[data-msgs-mute-chat]');
    var blockBtn = Accoom.$('[data-msgs-block]');

    if (clearChatBtn) {
      Accoom.on(clearChatBtn, 'click', function () {
        var conv = findConv(state.activeId);
        if (!conv) return;
        conv.messages = [];
        renderThread(conv);
        renderSavedThread(conv);
        renderList();
      });
    }

    if (muteChatBtn) {
      Accoom.on(muteChatBtn, 'click', function () {
        var conv = findConv(state.activeId);
        if (!conv) return;
        conv.muted = !conv.muted;
        muteChatBtn.querySelector('span') && (muteChatBtn.querySelector('span').textContent = conv.muted ? 'Unmute Notifications' : 'Mute Notifications');
        muteChatBtn.textContent = conv.muted ? 'Unmute Notifications' : 'Mute Notifications';
        renderChatHeader(conv);
      });
    }

    if (blockBtn) {
      Accoom.on(blockBtn, 'click', function () {
        if (!state.activeId) return;
        deleteConversation(state.activeId);
      });
    }

    /* ---------------- INIT ---------------- */
    renderList();
    showChatEmpty();
    Accoom.initButtonAnimations();

    // Auto-open the first conversation on desktop so the chat panel
    // isn't blank on load (matches the reference screenshot).
    if (window.innerWidth > 860 && state.conversations.length) {
      openConversation(state.conversations[0].id);
    }

    console.log('ACCOOM contact-agent (messages) page initialized');
  });

})(window.Accoom);