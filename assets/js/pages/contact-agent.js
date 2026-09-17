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
    trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    file: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>'
  };

    var AVATAR = 'assets/images/agent-images/agenticonimg.webp';

  // Touch/mobile devices reply by swiping a message right instead of
  // using the "Reply" item in the 3-dot menu (desktop-only from here on).
  var IS_TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  var DRAG_REPLY_MAX = 64;
  var DRAG_REPLY_THRESHOLD = 46;
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
          image: 'assets/images/home-properties/miniflat1.png',
          beds: 2,
          baths: 3,
          parking: true,
          furnished: true,
          description: 'Spacious and well finished 2 bedroom detached duplex in a secure estate with 24/7 security, steady power supply and good road network.'
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
          image: 'assets/images/home-properties/miniflat.png',
          beds: 2,
          baths: 2,
          parking: true,
          furnished: false,
          description: 'Modern 2 bedroom apartment close to the island business district, with reliable power and a resident security team.'
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
      },
      {
        id: 'grace-o',
        name: 'Grace O.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: true,
        verified: true,
        muted: false,
        property: {
          id: 'ACCOM-40122',
          name: '3 Bedroom Terrace',
          location: 'Gwarinpa, Abuja',
          price: '\u20A6900,000 / year',
          image: 'assets/images/home-properties/hall2.png',
          beds: 3, baths: 3, parking: true, furnished: false,
          description: 'Roomy 3 bedroom terrace in a quiet estate with tarred road access and constant water supply.'
        },
        messages: [
          { id: 'g1', from: 'agent', day: 'Monday', time: '9:15 AM',
            text: 'Good day! The terrace in Gwarinpa is now open for viewing, would you like to book a slot?' },
          { id: 'g2', from: 'me', day: 'Monday', time: '9:30 AM', read: true,
            text: 'Yes, this weekend works for me.' },
          { id: 'g3', from: 'agent', day: 'Monday', time: '9:32 AM',
            text: "Great, I'll pencil you in for Saturday 11am." }
        ]
      },
      {
        id: 'daniel-k',
        name: 'Daniel K.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: false,
        verified: false,
        muted: false,
        property: {
          id: 'ACCOM-40530',
          name: 'Mini Flat',
          location: 'Yaba, Lagos',
          price: '\u20A6520,000 / year',
          image: 'assets/images/home-properties/miniflat.png',
          beds: 1, baths: 1, parking: false, furnished: true,
          description: 'Newly renovated mini flat close to major tech hubs in Yaba, fully furnished and net-ready.'
        },
        messages: [
          { id: 'd1', from: 'me', day: 'Tuesday', time: '1:05 PM', read: true,
            text: 'Is the mini flat in Yaba still up?' },
          { id: 'd2', from: 'agent', day: 'Tuesday', time: '2:00 PM',
            text: 'Yes it is, rent is negotiable for a 2 year upfront payment.' }
        ]
      },
      {
        id: 'blessing-u',
        name: 'Blessing U.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: true,
        verified: true,
        muted: true,
        property: {
          id: 'ACCOM-41087',
          name: '4 Bedroom Semi-Detached',
          location: 'Ikoyi, Lagos',
          price: '\u20A63,200,000 / year',
          image: 'assets/images/home-properties/bedroomflat3.png',
          beds: 4, baths: 5, parking: true, furnished: true,
          description: 'Luxury 4 bedroom semi-detached duplex with BQ, generator house, and 24/7 estate security in Ikoyi.'
        },
        messages: [
          { id: 'b1', from: 'agent', day: 'Wednesday', time: '10:00 AM',
            text: "Good morning, I have the Ikoyi listing you requested. It's fully serviced." },
          { id: 'b2', from: 'me', day: 'Wednesday', time: '10:20 AM', read: true,
            text: 'Noted, let me discuss with my partner and get back to you.' }
        ]
      },
      {
        id: 'emeka-n',
        name: 'Emeka N.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: false,
        verified: true,
        muted: false,
        property: {
          id: 'ACCOM-41560',
          name: 'Self-Contained Room',
          location: 'Uyo, Akwa Ibom',
          price: '\u20A6180,000 / year',
          image: 'assets/images/home-properties/selfcon1.png',
          beds: 1, baths: 1, parking: false, furnished: false,
          description: 'Affordable self-contained room in a residential neighbourhood, walking distance to the market.'
        },
        messages: [
          { id: 'n1', from: 'me', day: 'Last week', time: '5:45 PM', read: true,
            text: 'Good evening, does the price include agency fees?' },
          { id: 'n2', from: 'agent', day: 'Last week', time: '6:10 PM',
            text: 'No, agency and legal fees are 10% combined, paid separately.' }
        ]
      },
      {
        id: 'ruth-a',
        name: 'Ruth A.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: true,
        verified: true,
        muted: false,
        property: {
          id: 'ACCOM-42011',
          name: '2 Bedroom Flat',
          location: 'Port Harcourt, Rivers',
          price: '\u20A6600,000 / year',
          image: 'assets/images/home-properties/hall2.png',
          beds: 2, baths: 2, parking: true, furnished: false,
          description: 'Well-maintained 2 bedroom flat in a gated compound with borehole water and a caretaker on site.'
        },
        messages: [
          { id: 'r1', from: 'agent', day: 'Last week', time: '3:00 PM',
            text: 'Hello, following up — are you still interested in the PH flat?' }
        ]
      },
      {
        id: 'tunde-b',
        name: 'Tunde B.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: false,
        verified: false,
        muted: false,
        property: {
          id: 'ACCOM-42480',
          name: 'Duplex with BQ',
          location: 'Magodo, Lagos',
          price: '\u20A61,800,000 / year',
          image: 'assets/images/home-properties/bedroomflat3.png',
          beds: 3, baths: 4, parking: true, furnished: false,
          description: 'Solidly built duplex with a boys quarters, private compound, and good drainage in Magodo Phase 2.'
        },
        messages: [
          { id: 't1', from: 'me', day: '2 weeks ago', time: '12:00 PM', read: true,
            text: 'Can we do a video tour before I travel down for the physical viewing?' },
          { id: 't2', from: 'agent', day: '2 weeks ago', time: '1:15 PM',
            text: 'Sure, send me a good time and I will set it up.' }
        ]
      },
      {
        id: 'faith-e',
        name: 'Faith E.',
        role: 'Real Estate Agent',
        avatar: AVATAR,
        online: true,
        verified: true,
        muted: false,
        property: {
          id: 'ACCOM-42890',
          name: 'Serviced Apartment',
          location: 'Wuse 2, Abuja',
          price: '\u20A61,100,000 / year',
          image: 'assets/images/home-properties/miniflat1.png',
          beds: 2, baths: 2, parking: true, furnished: true,
          description: 'Fully serviced 2 bedroom apartment with 24hr power, gym access, and a resident concierge in Wuse 2.'
        },
        messages: [
          { id: 'f1', from: 'me', day: '3 weeks ago', time: '8:30 AM', read: true,
            text: 'Does the service charge cover electricity too?' },
          { id: 'f2', from: 'agent', day: '3 weeks ago', time: '9:00 AM',
            text: 'Yes, electricity, water, and security are all covered in the service charge.' }
        ]
      }
    ];
  }

  Accoom.ready(function () {

    // Guests can't view real conversations — bounce straight to signup,
    // but allow demo guest sessions if arriving from a listing's Contact Agent.
    if (!Accoom.isLoggedIn()) {
      if (Accoom.getStorage('accoom-contact-request', null)) {
        Accoom.setStorage('accoom-user', {
          name: 'Guest User',
          email: 'guest@accoom.ng',
          role: 'customer'
        });
      } else {
        window.location.href = 'auth.html?mode=signup';
        return;
      }
    }

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
      msgSelectionBar: Accoom.$('[data-msgs-msg-selection-bar]'),
      msgSelectionCount: Accoom.$('[data-msgs-msg-selection-count]'),
      msgSelectionCancel: Accoom.$('[data-msgs-msg-selection-cancel]'),

      propCard: Accoom.$('[data-msgs-property-card]'),
      propImg: Accoom.$('[data-msgs-property-img]'),
      propName: Accoom.$('[data-msgs-property-name]'),
      propLocText: Accoom.$('[data-msgs-property-loc-text]'),
      propPrice: Accoom.$('[data-msgs-property-price]'),
      propPayBtn: Accoom.$('[data-msgs-property-pay-btn]'),
      propApproveBtn: Accoom.$('[data-msgs-property-approve-btn]'),
      propApproveLabel: Accoom.$('[data-msgs-approve-btn-label]'),
      propDeclineBtn: Accoom.$('[data-msgs-property-decline-btn]'),
      propDeclineLabel: Accoom.$('[data-msgs-decline-btn-label]'),
      propReviewBtn: Accoom.$('[data-msgs-property-review-btn]'),
      propStatus: Accoom.$('[data-msgs-property-status]'),
      propStatusIcon: Accoom.$('[data-msgs-property-status-icon]'),
      propStatusLabel: Accoom.$('[data-msgs-property-status-label]'),

      chatTabs: Accoom.$$('[data-msgs-chat-tab]'),
      blockedBar: Accoom.$('[data-msgs-blocked-bar]'),
      unblockBtn: Accoom.$('[data-msgs-unblock]'),
      payBtn: Accoom.$('[data-msgs-pay-btn]'),
      lightbox: Accoom.$('[data-msgs-lightbox]'),
      lightboxStage: Accoom.$('[data-msgs-lightbox-stage]'),
      lightboxCounter: Accoom.$('[data-msgs-lightbox-counter]'),
      lightboxPrev: Accoom.$('[data-msgs-lightbox-prev]'),
      lightboxNext: Accoom.$('[data-msgs-lightbox-next]'),
      lightboxClose: Accoom.$('[data-msgs-lightbox-close]'),
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
      send: Accoom.$('[data-msgs-send]'),

      propsDropdown: Accoom.$('[data-msgs-props-dropdown]'),
      propsDropdownBtn: Accoom.$('[data-msgs-props-btn]'),
      propsCount: Accoom.$('[data-msgs-props-count]'),
      propsAgentName: Accoom.$('[data-msgs-props-agent-name]'),
      propsList: Accoom.$('[data-msgs-props-list]')
    };

    Accoom.$$('.msgs-menu').forEach(function (menu) {
      Accoom.initDropdown(menu);
    });

    var storedConvs = Accoom.getStorage('accoom-conversations', null);
    var state = {
      conversations: (Array.isArray(storedConvs) && storedConvs.length) ? storedConvs : seedConversations(),
      activeId: null,
      activeChatTab: 'messages',
      listTab: 'all',
      query: '',
      selectMode: false,
      selected: {},
      replyTo: null,
      savedConversations: [],
      msgSelectMode: false,
      msgSelected: {}
    };

    function saveConversations() {
      try {
        Accoom.setStorage('accoom-conversations', state.conversations);
      } catch (e) {
        console.warn('Could not save conversations to localStorage', e);
      }
    }

    /* ---------------- MESSAGE LONG-PRESS SELECT (touch) ---------------- */
    function updateMsgSelectionBar() {
      if (!els.msgSelectionBar) return;
      var count = Object.keys(state.msgSelected).length;
      if (state.msgSelectMode && count > 0) {
        els.msgSelectionBar.classList.remove('is-hidden');
        if (els.msgSelectionCount) {
          els.msgSelectionCount.textContent = count + (count === 1 ? ' selected' : ' selected');
        }
      } else {
        els.msgSelectionBar.classList.add('is-hidden');
      }
    }

    function enterMsgSelectMode(id, conv) {
      state.msgSelectMode = true;
      state.msgSelected = {};
      state.msgSelected[id] = true;
      renderThread(conv);
      renderSavedThread(conv);
      updateMsgSelectionBar();
    }

    function toggleMsgSelect(id, conv) {
      if (state.msgSelected[id]) {
        delete state.msgSelected[id];
      } else {
        state.msgSelected[id] = true;
      }
      if (!Object.keys(state.msgSelected).length) {
        state.msgSelectMode = false;
      }
      renderThread(conv);
      renderSavedThread(conv);
      updateMsgSelectionBar();
    }

    function exitMsgSelectMode(conv) {
      state.msgSelectMode = false;
      state.msgSelected = {};
      if (conv) {
        renderThread(conv);
        renderSavedThread(conv);
      }
      updateMsgSelectionBar();
    }

    if (els.msgSelectionCancel) {
      Accoom.on(els.msgSelectionCancel, 'click', function () {
        exitMsgSelectMode(findConv(state.activeId));
      });
    }

    /* ---------------- helpers ---------------- */
    function findConv(id) {
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === id) return state.conversations[i];
      }
      for (var j = 0; j < state.savedConversations.length; j++) {
        if (state.savedConversations[j].id === id) return state.savedConversations[j];
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
      var source = state.listTab === 'saved' ? state.savedConversations : state.conversations;
      var list = source.filter(function (c) {
        if (state.listTab === 'unread' && unreadCount(c) === 0 && c.id !== state.keepUnreadId) return false;
        if (q && c.name.toLowerCase().indexOf(q) === -1) return false;
        return true;
      });

      return list;
    }

    function renderList() {
      var items = visibleConversations();
      els.list.innerHTML = '';

      if (!items.length) {
        els.listEmpty.classList.remove('is-hidden');
        if (els.listEmptyTitle && els.listEmptyText) {
          if (state.listTab === 'unread') {
            els.listEmptyTitle.textContent = 'No unread messages yet';
            els.listEmptyText.textContent = 'Unread conversations with agents will show up here.';
          } else if (state.listTab === 'saved') {
            els.listEmptyTitle.textContent = 'No saved messages yet';
            els.listEmptyText.textContent = 'Saved conversations with agents will show up here.';
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
        var preview = '';
        if (conv.draft) {
          preview = '<span style="color: #e5484d; font-weight: 600;">Draft:</span> ' + conv.draft;
        } else {
          preview = previewText(msg);
        }
        void 0; // placeholder, spawnRipple defined below renderList

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
              '<span class="msgs-list-item-preview">' + preview + '</span>' +
              (unread ? '<span class="msgs-list-item-badge">' + unread + '</span>' : '') +
            '</span>' +
          '</span>' +
          '<span class="msgs-list-item-menu">' +
            '<button type="button" class="msgs-icon-btn" data-conv-delete aria-label="Delete conversation">' + ICONS.trash + '</button>' +
          '</span>';

        Accoom.on(li, 'click', function (e) {
          if (!e.target.closest('[data-conv-delete]')) spawnRipple(li, e);

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
      var list = state.conversations.some(function (c) { return c.id === id; })
        ? state.conversations
        : state.savedConversations;
      var idx = list.findIndex(function (c) { return c.id === id; });

      if (list === state.conversations) {
        state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
      } else {
        state.savedConversations = state.savedConversations.filter(function (c) { return c.id !== id; });
      }
      delete state.selected[id];
      saveConversations();

      if (wasActive) {
        var remaining = visibleConversations();
        if (remaining.length) {
          // Prefer the conversation that slid up into this row's spot;
          // fall back to the one above it if we deleted the last row.
          var nextIdx = idx < remaining.length ? idx : remaining.length - 1;
          openConversation(remaining[nextIdx].id);
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

    Accoom.on(Accoom.$('[data-msgs-mark-read]'), 'click', function () {
      state.conversations.forEach(function (c) { c.unread = 0; });
      renderList();
    });

    Accoom.on(Accoom.$('[data-msgs-mark-unread]'), 'click', function () {
      state.conversations.forEach(function (c) { c.unread = c.unread || 1; });
      renderList();
    });

    var moveSavedBtn = Accoom.$('[data-msgs-move-saved]');
    var moveSavedLabel = moveSavedBtn ? moveSavedBtn.querySelector('span') : null;

    function updateMoveSavedLabel() {
      if (!moveSavedLabel) return;
      moveSavedLabel.textContent = state.listTab === 'saved' ? 'Remove Saved' : 'Move to Saved';
    }

    if (moveSavedBtn) {
      Accoom.on(moveSavedBtn, 'click', function () {
        if (state.listTab === 'saved') {
          // Reverse: put everything back where it came from, exactly as
          // it was (unread counts, etc. are untouched by the move).
          state.conversations = state.conversations.concat(state.savedConversations);
          state.savedConversations = [];
        } else {
          state.savedConversations = (state.savedConversations || []).concat(state.conversations);
          state.conversations = [];
        }
        state.activeId = null;
        state.selected = {};
        showChatEmpty(true);
        renderList();
        updateSelectionBar();
      });
    }

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
        state.keepUnreadId = null;
        setActiveTabUI(key);
        updateMoveSavedLabel();

        // Jumping into Unread or Saved should never leave a previously-open
        // chat sitting on the right — force a pick from the filtered list.
    els.tabs.forEach(function (tab) {
      Accoom.on(tab, 'click', function () {
       var key = tab.getAttribute('data-msgs-tab');
        state.listTab = key;
        state.keepUnreadId = null;
        setActiveTabUI(key);
        updateMoveSavedLabel();

        renderList();
      });
    });

        renderList();
      });
    });

    function spawnRipple(el, e) {
      var rect = el.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      var x = (e.clientX || (rect.left + rect.width / 2)) - rect.left - size / 2;
      var y = (e.clientY || (rect.top + rect.height / 2)) - rect.top - size / 2;

      var ripple = document.createElement('span');
      ripple.className = 'msgs-ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';

      el.appendChild(ripple);
      ripple.addEventListener('animationend', function () {
        ripple.remove();
      });
    }

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

      els.chatEmptyTitle.textContent = 'No saved Chats';
      els.chatEmptyText.textContent = 'Chats you saved will appear here.';
    }

    var MOBILE_QUERY = '(max-width: 860px)';

    function isMobileView() {
      return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
    }

    function openConversation(id) {
      if (state.activeId && els.input) {
        var currentConv = findConv(state.activeId);
        if (currentConv) currentConv.draft = els.input.value;
      }

      var conv = findConv(id);
      if (!conv) return;

      // On mobile, opening a chat is a "navigation" into a sub-view.
      // Push a history entry so the phone's back button returns to the
      // list instead of leaving the page, but only when we're actually
      // coming from the list (avoid stacking entries when switching
      // between chats while already inside the chat view).
      if (isMobileView() && layout.getAttribute('data-view') !== 'chat') {
        history.pushState({ msgsView: 'chat' }, '', location.href);
      }

      applyBlockedState(conv);

      var wasUnread = unreadCount(conv) > 0;

      // If a different chat was being "held" visible in the Unread tab
      // after being read, opening a new one lets it finally drop out.
      if (state.keepUnreadId && state.keepUnreadId !== id) {
        state.keepUnreadId = null;
      }

      conv.unread = 0;
      state.activeId = id;
      state.activeChatTab = 'messages';
      state.replyTo = null;
      state.msgSelectMode = false;
      state.msgSelected = {};
      if (els.input) els.input.value = conv.draft || '';
      updateMsgSelectionBar();

      // Stay on the Unread tab after reading it — it keeps showing until
      // another chat is opened or the tab is switched manually.
      if (wasUnread && state.listTab === 'unread') {
        state.keepUnreadId = id;
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

    function getPropertiesForAgent(agentName, currentProp) {
      var list = [];
      if (currentProp && currentProp.id) {
        list.push(currentProp);
      }
      if (Accoom.PropertyService && Accoom.PropertyService.getAll && agentName) {
        var all = Accoom.PropertyService.getAll();
        all.forEach(function (item) {
          if (item.agent && item.agent.name && item.agent.name.toLowerCase() === agentName.toLowerCase()) {
            if (!list.some(function (p) { return String(p.id) === String(item.id); })) {
              list.push({
                id: item.id,
                name: item.name,
                location: item.location,
                price: typeof item.price === 'number' ? ('\u20A6' + item.price.toLocaleString('en-NG') + (item.priceLabel ? ' ' + item.priceLabel : '')) : item.price,
                image: (item.images && item.images[0]) || 'assets/images/home-properties/placeholder.png',
                beds: item.beds,
                baths: item.baths
              });
            }
          }
        });
      }
      return list;
    }

    function renderAgentPropsDropdown(conv) {
      if (!els.propsDropdown || !els.propsList) return;

      var allProps = conv.allProperties && conv.allProperties.length
        ? conv.allProperties
        : getPropertiesForAgent(conv.name, conv.property);

      conv.allProperties = allProps;

      if (allProps.length <= 1) {
        els.propsDropdown.classList.add('is-hidden');
        return;
      }

      els.propsDropdown.classList.remove('is-hidden');
      if (els.propsCount) els.propsCount.textContent = allProps.length + ' Properties';
      if (els.propsAgentName) els.propsAgentName.textContent = conv.name + '\u2019s Properties';

      els.propsList.innerHTML = allProps.map(function (item) {
        var isCurrent = String(item.id) === String(conv.property.id);
        return '<li class="msgs-props-item' + (isCurrent ? ' is-active' : '') + '" data-prop-id="' + item.id + '">' +
          '<img class="msgs-props-item-img" src="' + (item.image || 'assets/images/home-properties/placeholder.png') + '" alt="" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.png\';" />' +
          '<div class="msgs-props-item-text">' +
            '<p class="msgs-props-item-name">' + item.name + '</p>' +
            '<p class="msgs-props-item-meta">' +
              '<span>' + (item.location || '') + '</span>' +
              '<span class="msgs-props-item-price">' + (item.price || '') + '</span>' +
            '</p>' +
          '</div>' +
          (isCurrent ? '<span class="msgs-props-badge">Active</span>' : '') +
        '</li>';
      }).join('');

      Accoom.$$('.msgs-props-item', els.propsList).forEach(function (el) {
        Accoom.on(el, 'click', function (e) {
          e.preventDefault();
          var propId = this.getAttribute('data-prop-id');
          var selected = allProps.filter(function (p) { return String(p.id) === String(propId); })[0];
          if (selected && String(selected.id) !== String(conv.property.id)) {
            conv.property = selected;
            renderPropertyCard(conv);

            els.propsDropdown.classList.remove('is-open');
            var panel = els.propsDropdown.querySelector('[data-dropdown-panel]');
            if (panel) panel.classList.remove('is-open');

            saveConversations();
          }
        });
      });
    }

    function renderPropertyCard(conv) {
      var p = conv.property;
      if (els.propImg) {
        els.propImg.src = p.image || 'assets/images/home-properties/placeholder.png';
        els.propImg.alt = p.name || 'Property';
      }
      if (els.propName) els.propName.textContent = p.name || 'Property';
      if (els.propLocText) els.propLocText.textContent = p.location || '';
      if (els.propPrice) els.propPrice.textContent = p.price || '';

      Accoom.$$('[data-msgs-property-link]').forEach(function (link) {
        link.href = 'property.html?id=' + encodeURIComponent(p.id) +
          (p.name ? '&name=' + encodeURIComponent(p.name) : '');
      });

      renderPaymentState(conv);
      renderAgentPropsDropdown(conv);
    }

    // Per-property payment/dispute state — an agent conversation can have
    // several properties (see the Properties dropdown), and each one needs
    // its own independent status. Nothing here is keyed by the
    // conversation itself; it's always looked up by that property's id, so
    // switching the active property never carries another property's
    // status along with it.
    function getPropState(conv, propId) {
      if (!conv.propertyState) conv.propertyState = {};
      var key = String(propId);
      if (!conv.propertyState[key]) {
        conv.propertyState[key] = { paymentStatus: 'idle', disputed: false, purchaseOrderId: null };
      }
      return conv.propertyState[key];
    }

    // Shorthand for "the state of whichever property this conversation is
    // currently showing" — the dropdown swaps conv.property, this always
    // follows it.
    function activePropState(conv) {
      return getPropState(conv, conv.property.id);
    }

    // Single source of truth for "what state is this property in right
    // now" — anything that changes paymentStatus or disputed just needs
    // to call renderPaymentState(conv) again, no separate wiring needed.
    // A real backend only has to keep these two fields accurate; this
    // function does the rest.
    var PROPERTY_STATUS_ICONS = {
      available: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="8 12.5 11 15.5 16 9"></polyline></svg>',
      pending: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>',
      sold: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 12.7 12.7 20.6a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1-.6-1.4V4a2 2 0 0 1 2-2h7.3c.5 0 1 .2 1.4.6l8 8a2 2 0 0 1 0 2.8Z"></path><circle cx="7" cy="7" r="1"></circle></svg>',
      dispute: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 1 21h22L12 2z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    };
    var PROPERTY_STATUS_LABELS = { available: 'Available', pending: 'Pending', sold: 'Sold', dispute: 'In Dispute' };

    function getPropertyStatusKey(conv) {
      var propState = activePropState(conv);
      if (propState.disputed) return 'dispute';
      var status = propState.paymentStatus || 'idle';
      if (status === 'approved') return 'sold';
      if (status === 'review') return 'pending';
      return 'available'; // idle (never paid) or declined (payment released back)
    }

    function renderPropertyStatus(conv) {
      if (!els.propStatus) return;
      var key = getPropertyStatusKey(conv);
      els.propStatus.className = 'msgs-property-status msgs-property-status--' + key;
      if (els.propStatusIcon) els.propStatusIcon.innerHTML = PROPERTY_STATUS_ICONS[key];
      if (els.propStatusLabel) els.propStatusLabel.textContent = PROPERTY_STATUS_LABELS[key];
    }

    function renderPaymentState(conv) {
      var status = activePropState(conv).paymentStatus || 'idle';

      renderPropertyStatus(conv);

      if (els.propPayBtn) els.propPayBtn.classList.toggle('is-hidden', status !== 'idle');
      if (els.propApproveBtn) {
        els.propApproveBtn.classList.remove('is-loading');
        els.propApproveBtn.classList.toggle('is-hidden', status !== 'review' && status !== 'approved');
        els.propApproveBtn.disabled = status === 'approved';
        if (els.propApproveLabel) els.propApproveLabel.textContent = status === 'approved' ? 'Payment Approved' : 'Approve Payment';
      }
      if (els.propDeclineBtn) {
        els.propDeclineBtn.classList.remove('is-loading');
        els.propDeclineBtn.classList.toggle('is-hidden', status !== 'review' && status !== 'declined');
        els.propDeclineBtn.disabled = status === 'declined';
        if (els.propDeclineLabel) els.propDeclineLabel.textContent = status === 'declined' ? 'Declined' : 'Decline Payment';
      }
      if (status === 'approved' && els.propDeclineBtn) els.propDeclineBtn.classList.add('is-hidden');
      if (status === 'declined' && els.propApproveBtn) els.propApproveBtn.classList.add('is-hidden');
    }

    /* ---------------- CHAT TABS (Messages / Saved) ---------------- */
    els.chatTabs.forEach(function (tab) {
      Accoom.on(tab, 'click', function () {
        switchChatTab(tab.getAttribute('data-msgs-chat-tab'));
      });
    });

    function switchChatTab(key) {
      state.msgSelectMode = false;
      state.msgSelected = {};
      updateMsgSelectionBar();
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
      row.className = 'msgs-row msgs-row--' + (msg.from === 'me' ? 'me' : 'agent') +
        (state.msgSelected[msg.id] ? ' is-msg-selected' : '');
      row.setAttribute('data-msg-id', msg.id);

      var avatarHtml = msg.from === 'agent'
        ? '<img class="msgs-row-avatar" src="' + conv.avatar + '" alt="" />'
        : '<span class="msgs-row-avatar"></span>';

      var replyHtml = '';
      if (msg.replyTo) {
        replyHtml = '<div class="msgs-reply-quote"><b>' + msg.replyTo.name + '</b><span>' + msg.replyTo.text + '</span></div>';
      }

      var bubbleInner = '';
      if (msg.photos) {
        bubbleInner = '<div class="msgs-bubble-photos">' +
          msg.photos.map(function (src) { return '<img src="' + src + '" alt="" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.png\';" />'; }).join('') +
          '<span class="msgs-bubble-photos-count">' + msg.photos.length + ' Photos</span>' +
          '</div>';
      } else {
        if (msg.attachments && msg.attachments.length) {
          bubbleInner += buildAttachmentsBubble(msg.attachments);
        }
        if (msg.text) {
          bubbleInner += '<div class="msgs-bubble">' + escapeHtml(msg.text) + (msg.saved ? '<span class="msgs-bubble-saved">' + ICONS.star + '</span>' : '') + '</div>';
        }
      }

      var metaHtml = '<div class="msgs-meta-row' + (msg.from === 'me' && msg.read ? ' is-read' : '') + '">' +
        '<span>' + msg.time + '</span>' +
        (msg.from === 'me' ? (msg.read ? ICONS.doubleCheck : ICONS.check) : '') +
        '</div>';

      var menuItems = '';
      if (!conv.blocked) {
        if (!isSavedView && !IS_TOUCH) {
          menuItems += '<li role="option" data-row-reply>' + ICONS.reply + ' <span style="margin-left:6px;">Reply</span></li>';
        }
        menuItems += '<li role="option" data-row-save>' + ICONS.star + ' <span style="margin-left:6px;">' + (msg.saved ? 'Unsave' : 'Save') + '</span></li>';
      }
      // Individual messages are intentionally NOT deletable — chats can
      // serve as evidence for both the client and the agent. Whole
      // conversations can still be removed from the list.

      var actionHtml =
        '<div class="msgs-row-menu">' +
          '<button type="button" class="msgs-row-action" data-row-action aria-label="Message options">' + ICONS.dots + '</button>' +
          '<ul class="dropdown-panel" data-row-menu-panel>' + menuItems + '</ul>' +
        '</div>';

      var dragHintHtml = (!isSavedView && IS_TOUCH) ? '<div class="msgs-drag-reply-hint">' + ICONS.reply + '</div>' : '';

      row.innerHTML =
        avatarHtml +
        '<div class="msgs-bubble-col">' + dragHintHtml + replyHtml + bubbleInner + actionHtml + metaHtml + '</div>';

      var actionBtn = row.querySelector('[data-row-action]');
      var panel = row.querySelector('[data-row-menu-panel]');
      var scrollHost = isSavedView ? els.savedThread : els.thread;

      if (msg.attachments && msg.attachments.length) {
        row.querySelectorAll('[data-sent-attach-index]').forEach(function (node) {
          Accoom.on(node, 'click', function () {
            openLightbox(msg.attachments, parseInt(node.getAttribute('data-sent-attach-index'), 10));
          });
        });
      }

      if (msg.photos && msg.photos.length) {
        var photoItems = msg.photos.map(function (src) {
          return { kind: 'image', url: src, name: src.split('/').pop() };
        });
        row.querySelectorAll('.msgs-bubble-photos img').forEach(function (img, index) {
          Accoom.on(img, 'click', function () {
            openLightbox(photoItems, index);
          });
        });
      }

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

      // Long-press (touch only) to select a message and reveal its dot;
      // once in select mode, a plain tap on any other message toggles it
      // too, instead of needing another long press each time.
      var longPressTimer = null;
      var longPressFired = false;
      var dragStartX = 0;
      var dragStartY = 0;
      var dragX = 0;
      var isReplyDragging = false;
      var dragAxisLocked = null;
      var canSwipeReply = !isSavedView && IS_TOUCH;

      Accoom.on(row, 'touchstart', function (e) {
        if (e.target.closest('.msgs-row-menu')) return;
        var t = e.touches[0];
        dragStartX = t.clientX;
        dragStartY = t.clientY;
        dragX = 0;
        isReplyDragging = false;
        dragAxisLocked = null;
        longPressFired = false;
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(function () {
          longPressFired = true;
          enterMsgSelectMode(msg.id, conv);
        }, 550);
      });

      Accoom.on(row, 'touchmove', function (e) {
        if (!canSwipeReply) {
          clearTimeout(longPressTimer);
          return;
        }
        var t = e.touches[0];
        var deltaX = t.clientX - dragStartX;
        var deltaY = t.clientY - dragStartY;

        if (!dragAxisLocked && (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8)) {
          dragAxisLocked = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        }

        if (dragAxisLocked !== 'x' || deltaX <= 0) {
          clearTimeout(longPressTimer);
          return;
        }

        clearTimeout(longPressTimer);
        isReplyDragging = true;
        dragX = Math.min(deltaX, DRAG_REPLY_MAX);
        row.classList.add('is-dragging');
        row.style.setProperty('--drag-x', dragX + 'px');
        row.classList.toggle('is-reply-ready', dragX >= DRAG_REPLY_THRESHOLD);
      });

      Accoom.on(row, 'touchend', function () {
        clearTimeout(longPressTimer);
        if (isReplyDragging) {
          if (dragX >= DRAG_REPLY_THRESHOLD) {
            setReply(msg, conv);
          }
          row.classList.remove('is-dragging');
          row.classList.remove('is-reply-ready');
          row.style.removeProperty('--drag-x');
          isReplyDragging = false;
          dragX = 0;
          longPressFired = true;
        }
      });

      Accoom.on(row, 'click', function (e) {
        if (longPressFired) {
          // Swallow the synthetic click some browsers fire right after
          // a long-press touch, so it doesn't immediately deselect.
          longPressFired = false;
          e.stopPropagation();
          return;
        }
        if (state.msgSelectMode) {
          e.stopPropagation();
          toggleMsgSelect(msg.id, conv);
        }
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

    function attachmentsLabel(attachments) {
      var count = attachments.length;
      var allImages = attachments.every(function (a) { return a.kind === 'image'; });
      var allVideos = attachments.every(function (a) { return a.kind === 'video'; });
      if (allImages) return count + (count === 1 ? ' Photo' : ' Photos');
      if (allVideos) return count + (count === 1 ? ' Video' : ' Videos');
      return count + (count === 1 ? ' File' : ' Files');
    }

    function buildAttachmentsBubble(attachments) {
      var thumbs = attachments.map(function (att, index) {
        if (att.kind === 'image') {
          return '<img src="' + att.url + '" alt="' + escapeHtml(att.name) + '" data-sent-attach-index="' + index + '" />';
        }
        if (att.kind === 'video') {
          return '<video src="' + att.url + '" muted data-sent-attach-index="' + index + '"></video>';
        }
        return '<span class="msgs-bubble-photos-file" data-sent-attach-index="' + index + '">' + ICONS.file + '</span>';
      }).join('');

      return '<div class="msgs-bubble-photos">' +
        thumbs +
        '<span class="msgs-bubble-photos-count">' + attachmentsLabel(attachments) + '</span>' +
        '</div>';
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
      if (els.input) {
        Accoom.on(els.input, 'input', function () {
          var conv = findConv(state.activeId);
          if (conv) {
            conv.draft = els.input.value;
            renderList();
          }
        });
        Accoom.on(els.input, 'keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (els.send) {
              els.send.click();
            } else {
              els.composer.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
          }
        });
      }

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
          read: false
        };
        if (text) msg.text = text;
        if (state.replyTo) {
          msg.replyTo = state.replyTo;
        }
        
        conv.messages.push(msg);
        els.input.value = '';
        conv.draft = '';
        hideReplyPreview();
        
        renderThread(conv);
        renderList();
        saveConversations();
        
        if (els.thread) els.thread.scrollTop = els.thread.scrollHeight;

        // Simulate the agent reading + replying, like the reference chat.
        setTimeout(function () {
          msg.read = true;
          renderThread(conv);
          saveConversations();
        }, 900);
      });
    }

    /* ---------------- ATTACHMENTS ---------------- */
    /* ---------------- PAYMENT ---------------- */
    /* ---------------- PAYMENT ---------------- */
    function parsePaymentAmount(value) {
      var amount = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
      return isNaN(amount) ? 0 : amount;
    }

    function getBalance() {
      var balanceEl = Accoom.$('[data-balance-amount]');
      if (!balanceEl) return 0;
      return parsePaymentAmount(balanceEl.getAttribute('data-balance-raw') || balanceEl.textContent);
    }

    var paymentModal = document.createElement('div');
    paymentModal.className = 'msgs-payment-modal-overlay';
    paymentModal.setAttribute('aria-hidden', 'true');
    paymentModal.innerHTML =
      '<div class="msgs-payment-modal" role="dialog" aria-modal="true" aria-labelledby="msgs-payment-title">' +
        '<div class="msgs-payment-icon" data-msgs-payment-icon></div>' +
        '<h2 id="msgs-payment-title" data-msgs-payment-title></h2>' +
        '<p data-msgs-payment-copy></p>' +
        '<div class="msgs-payment-amount"><span>Amount due</span><strong data-msgs-payment-amount></strong></div>' +
        '<div class="msgs-payment-actions">' +
          '<button type="button" class="btn btn--ghost" data-msgs-payment-cancel>Cancel</button>' +
          '<button type="button" class="btn btn--primary" data-msgs-payment-confirm></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(paymentModal);

    var paymentTitle = paymentModal.querySelector('[data-msgs-payment-title]');
    var paymentCopy = paymentModal.querySelector('[data-msgs-payment-copy]');
    var paymentAmount = paymentModal.querySelector('[data-msgs-payment-amount]');
    var paymentIcon = paymentModal.querySelector('[data-msgs-payment-icon]');
    var paymentConfirm = paymentModal.querySelector('[data-msgs-payment-confirm]');
    var paymentCancel = paymentModal.querySelector('[data-msgs-payment-cancel]');
    var paymentTarget = null;

    var paymentProcessing = false;

    function closePaymentModal() {
      if (paymentProcessing) return;
      paymentModal.classList.remove('is-open');
      paymentModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
    }

    function openPaymentModal(conv) {
      var amount = parsePaymentAmount(conv.property.price);
      var balance = getBalance();
      var hasFunds = balance >= amount && amount > 0;
      paymentTarget = { id: conv.property.id, property: conv.property, amount: amount, mode: hasFunds ? 'checkout' : 'deposit', convId: conv.id };

      paymentIcon.className = 'msgs-payment-icon ' + (hasFunds ? 'is-confirm' : 'is-warning');
      paymentIcon.innerHTML = hasFunds
        ? '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>'
        : '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="8" x2="12" y2="13"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      paymentTitle.textContent = hasFunds ? 'Your balance covers this payment' : 'Insufficient balance';
      paymentCopy.textContent = hasFunds
        ? 'Your available balance is enough to cover this property. You can proceed to complete the payment securely.'
        : 'Your available balance is not enough to make this payment. Deposit funds to continue.';
      paymentAmount.textContent = '\u20A6' + amount.toLocaleString('en-NG');
      paymentConfirm.textContent = hasFunds ? 'Proceed' : 'Deposit';

      paymentModal.classList.add('is-open');
      paymentModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      paymentConfirm.focus();
    }

    function goToCheckout() {
      var conv = findConv(state.activeId);
      if (!conv) return;
      openPaymentModal(conv);
    }

    if (els.payBtn) Accoom.on(els.payBtn, 'click', goToCheckout);
    if (els.propPayBtn) Accoom.on(els.propPayBtn, 'click', goToCheckout);

    Accoom.on(paymentModal.querySelector('[data-msgs-payment-cancel]'), 'click', closePaymentModal);
    Accoom.on(paymentModal, 'click', function (e) {
      if (e.target === paymentModal) closePaymentModal();
    });
    Accoom.on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && paymentModal.classList.contains('is-open')) closePaymentModal();
    });
    Accoom.on(paymentConfirm, 'click', function () {
      if (!paymentTarget) return;

      if (paymentTarget.mode === 'checkout') {
        var payingConv = findConv(paymentTarget.convId);
        paymentProcessing = true;
        paymentConfirm.classList.add('is-loading');
        paymentConfirm.disabled = true;
        if (paymentCancel) paymentCancel.disabled = true;

        window.setTimeout(function () {
          Accoom.debitWallet(paymentTarget.amount);
          paymentProcessing = false;
          paymentConfirm.classList.remove('is-loading');
          paymentConfirm.disabled = false;
          if (paymentCancel) paymentCancel.disabled = false;
          closePaymentModal();

          if (payingConv) {
            getPropState(payingConv, paymentTarget.id).paymentStatus = 'review';
            upsertPurchaseRecord(payingConv, paymentTarget.property, 'upcoming');
            if (state.activeId === payingConv.id && String(payingConv.property.id) === String(paymentTarget.id)) {
              renderPaymentState(payingConv);
            }
          }
        }, 3000);
        return;
      }

      window.location.href = 'payment.html?id=' + encodeURIComponent(paymentTarget.id)
        + '&amount=' + encodeURIComponent(paymentTarget.amount)
        + '&mode=' + paymentTarget.mode
        + '&return=contact-agent.html';
    });

    if (els.propReviewBtn) {
      Accoom.on(els.propReviewBtn, 'click', function () {
        var conv = findConv(state.activeId);
        if (!conv) return;
        // A report flips this property's status to "In Dispute" right
        // away. A real backend can set/clear conv.disputed independently —
        // renderPaymentState() will always reflect whatever it's set to.
        activePropState(conv).disputed = true;
        renderPaymentState(conv);
        // TODO: wire to real "request a review" flow using conv.property.id
        window.location.href = 'review-request.html?property=' + encodeURIComponent(conv.property.id);
      });
    }

    // Logs (or updates) this conversation's purchase record so purchases.html
    // (My Purchases) shows it under the right tab with correct counts. The
    // same record follows the property from 'upcoming' (paid, awaiting the
    // agent's decision) through to 'completed'/'cancelled' — never
    // duplicated, just moved between tabs by updating its status.
    function upsertPurchaseRecord(conv, property, status) {
      var propState = getPropState(conv, property.id);
      var log = Accoom.getStorage('accoom-purchases-log', []);
      if (!Array.isArray(log)) log = [];

      if (propState.purchaseOrderId) {
        var existing = log.filter(function (r) { return r.id === propState.purchaseOrderId; })[0];
        if (existing) {
          existing.status = status;
          Accoom.setStorage('accoom-purchases-log', log);
          return;
        }
      }

      var orderId = 'ACCOOM-' + Date.now();
      propState.purchaseOrderId = orderId;
      log.unshift({
        id: orderId,
        name: property.name,
        location: property.location,
        dates: new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }),
        guests: property.beds || 1,
        amount: property.price,
        image: property.image,
        status: status
      });
      Accoom.setStorage('accoom-purchases-log', log);
    }

    if (els.propApproveBtn) {
      Accoom.on(els.propApproveBtn, 'click', function () {
        var conv = findConv(state.activeId);
        if (!conv) return;
        var targetProperty = conv.property;
        var propState = getPropState(conv, targetProperty.id);
        if (propState.paymentStatus !== 'review') return;
        els.propApproveBtn.classList.add('is-loading');
        els.propApproveBtn.disabled = true;
        if (els.propDeclineBtn) els.propDeclineBtn.disabled = true;

        window.setTimeout(function () {
          propState.paymentStatus = 'approved';
          upsertPurchaseRecord(conv, targetProperty, 'completed');
          if (state.activeId === conv.id && String(conv.property.id) === String(targetProperty.id)) {
            renderPaymentState(conv);
          }
        }, 2000);
      });
    }

    if (els.propDeclineBtn) {
      Accoom.on(els.propDeclineBtn, 'click', function () {
        var conv = findConv(state.activeId);
        if (!conv) return;
        var targetProperty = conv.property;
        var propState = getPropState(conv, targetProperty.id);
        if (propState.paymentStatus !== 'review') return;
        els.propDeclineBtn.classList.add('is-loading');
        els.propDeclineBtn.disabled = true;
        if (els.propApproveBtn) els.propApproveBtn.disabled = true;

        window.setTimeout(function () {
          propState.paymentStatus = 'declined';
          Accoom.creditWallet(parsePaymentAmount(targetProperty.price));
          upsertPurchaseRecord(conv, targetProperty, 'cancelled');
          if (state.activeId === conv.id && String(conv.property.id) === String(targetProperty.id)) {
            renderPaymentState(conv);
          }
        }, 2000);
      });
    }


    /* ---------------- LIGHTBOX ---------------- */
    state.lightboxIndex = 0;
    state.lightboxItems = [];

    function openLightbox(items, index) {
      if (!els.lightbox || !items || !items.length) return;
      state.lightboxItems = items;
      state.lightboxIndex = index;
      els.lightbox.classList.remove('is-hidden');
      renderLightbox();
    }

    function openPendingLightbox(index) {
      openLightbox(state.pendingAttachments, index);
    }

    function closeLightbox() {
      if (!els.lightbox) return;
      els.lightbox.classList.add('is-hidden');
      state.lightboxItems = [];
    }

    function renderLightbox() {
      var items = state.lightboxItems;
      if (!items.length) { closeLightbox(); return; }

      if (state.lightboxIndex < 0) state.lightboxIndex = 0;
      if (state.lightboxIndex > items.length - 1) state.lightboxIndex = items.length - 1;

      var att = items[state.lightboxIndex];
      var stageHtml;
      if (att.kind === 'image') {
        stageHtml = '<img src="' + att.url + '" alt="' + escapeHtml(att.name) + '" />';
      } else if (att.kind === 'video') {
        stageHtml = '<video src="' + att.url + '" controls autoplay></video>';
      } else if (att.kind === 'audio') {
        stageHtml = '<div class="msgs-lightbox-stage-file">' + ICONS.file + '<span>' + escapeHtml(att.name) + '</span><audio src="' + att.url + '" controls></audio></div>';
      } else {
        stageHtml = '<div class="msgs-lightbox-stage-file">' + ICONS.file + '<span>' + escapeHtml(att.name) + '</span></div>';
      }

      els.lightboxStage.innerHTML = stageHtml;
      if (els.lightboxCounter) {
        els.lightboxCounter.textContent = (state.lightboxIndex + 1) + ' / ' + items.length;
      }
      if (els.lightboxPrev) els.lightboxPrev.disabled = items.length < 2;
      if (els.lightboxNext) els.lightboxNext.disabled = items.length < 2;
    }

    if (els.lightboxClose) {
      Accoom.on(els.lightboxClose, 'click', closeLightbox);
    }

    if (els.lightbox) {
      Accoom.on(els.lightbox, 'click', function (e) {
        if (e.target === els.lightbox) closeLightbox();
      });
    }

    if (els.lightboxPrev) {
      Accoom.on(els.lightboxPrev, 'click', function () {
        state.lightboxIndex -= 1;
        if (state.lightboxIndex < 0) state.lightboxIndex = state.lightboxItems.length - 1;
        renderLightbox();
      });
    }

    if (els.lightboxNext) {
      Accoom.on(els.lightboxNext, 'click', function () {
        state.lightboxIndex += 1;
        if (state.lightboxIndex > state.lightboxItems.length - 1) state.lightboxIndex = 0;
        renderLightbox();
      });
    }

    Accoom.on(document, 'keydown', function (e) {
      if (!els.lightbox || els.lightbox.classList.contains('is-hidden')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft' && els.lightboxPrev) els.lightboxPrev.click();
      if (e.key === 'ArrowRight' && els.lightboxNext) els.lightboxNext.click();
    });

    /* ---------------- COMPOSER TEXTAREA (auto-grow once + Enter for newline) ---------------- */
    var INPUT_EXPANDED_HEIGHT = 64; // grows to this once a 2nd line appears, then just scrolls
    var inputSingleLineHeight = null;

    function getSingleLineHeight() {
      if (inputSingleLineHeight || !els.input) return inputSingleLineHeight;
      var prevValue = els.input.value;
      var prevHeight = els.input.style.height;
      els.input.value = 'x';
      els.input.style.height = 'auto';
      inputSingleLineHeight = els.input.scrollHeight;
      els.input.value = prevValue;
      els.input.style.height = prevHeight;
      return inputSingleLineHeight;
    }

    function autoGrowInput() {
      if (!els.input) return;
      var base = getSingleLineHeight() || 40;
      els.input.style.height = 'auto';
      var needsExpand = els.input.scrollHeight > base + 2; // +2px rounding tolerance
      els.input.style.height = (needsExpand ? INPUT_EXPANDED_HEIGHT : base) + 'px';
    }

    if (els.input) {
      Accoom.on(els.input, 'input', autoGrowInput);

      var isTouchDevice = (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

      Accoom.on(els.input, 'keydown', function (e) {
        // Desktop: plain Enter sends, Shift+Enter makes a new line.
        // Touch devices (mobile/tablet): Enter always makes a new line; use the send button.
        if (isTouchDevice) return;

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (els.composer && els.composer.requestSubmit) {
            els.composer.requestSubmit();
          } else if (els.send) {
            els.send.click();
          }
        }
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
        // Go through history.back() so it stays in sync with the
        // phone's own back gesture/button (handled by popstate below).
        if (isMobileView() && history.state && history.state.msgsView === 'chat') {
          history.back();
        } else {
          layout.setAttribute('data-view', 'list');
        }
      });
    }

    Accoom.on(window, 'popstate', function () {
      if (isMobileView() && layout.getAttribute('data-view') === 'chat') {
        layout.setAttribute('data-view', 'list');
      }
    });

    /* ---------------- CHAT MENU (clear / mute / block) ---------------- */
    /* ---------------- CHAT MENU (mute / block) ---------------- */
    var muteChatBtn = Accoom.$('[data-msgs-mute-chat]');
    var blockBtn = Accoom.$('[data-msgs-block]');

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
        var conv = findConv(state.activeId);
        if (!conv) return;
        conv.blocked = !conv.blocked;
        applyBlockedState(conv);
      });
    }

    if (els.unblockBtn) {
      Accoom.on(els.unblockBtn, 'click', function () {
        var conv = findConv(state.activeId);
        if (!conv) return;
        conv.blocked = false;
        applyBlockedState(conv);
      });
    }

    function applyBlockedState(conv) {
      var blocked = !!conv.blocked;
      if (blockBtn) {
        var label = blockBtn.querySelector('span');
        if (label) label.textContent = blocked ? 'Unblock Agent' : 'Block Agent';
      }
      if (els.composer) els.composer.classList.toggle('is-hidden', blocked);
      if (els.blockedBar) els.blockedBar.classList.toggle('is-hidden', !blocked);
      if (blocked) hideReplyPreview();

      if (els.payBtn) els.payBtn.disabled = blocked;
      if (els.propPayBtn) els.propPayBtn.disabled = blocked;
      if (els.propApproveBtn) els.propApproveBtn.disabled = blocked || activePropState(conv).paymentStatus === 'approved';
      if (els.propDeclineBtn) els.propDeclineBtn.disabled = blocked || activePropState(conv).paymentStatus === 'declined';
      if (els.propReviewBtn) {
        els.propReviewBtn.style.pointerEvents = blocked ? 'none' : '';
        els.propReviewBtn.style.opacity = blocked ? '0.45' : '';
      }

    }

    /* ---------------- INIT ---------------- */
    updateMoveSavedLabel();
    renderList();
    showChatEmpty();
    Accoom.initButtonAnimations();

    // Coming back from a wallet deposit made mid-checkout: payment.js
    // already covered and paid for the property, so land on that chat
    // straight into the Approve/Decline state.
    var justPaidId = new URLSearchParams(window.location.search).get('paid');
    var justPaidConv = justPaidId ? state.conversations.filter(function (c) {
      return String(c.property.id) === String(justPaidId);
    })[0] : null;

    // Coming back from payment.html's "Back to chat" / "Cancel" link
    // without actually finishing the payment — just reopen the exact
    // chat/property/agent, no paymentStatus change.
    var reopenId = new URLSearchParams(window.location.search).get('open');
    var reopenConv = reopenId ? state.conversations.filter(function (c) {
      return c.property.id === reopenId;
    })[0] : null;

    // Coming from a property page's "Contact Agent" button: open (or
    // create) the conversation for THAT exact property and agent.
    var contactRequest = Accoom.getStorage('accoom-contact-request', null);

    if (justPaidConv) {
      getPropState(justPaidConv, justPaidId).paymentStatus = 'review';
      upsertPurchaseRecord(justPaidConv, justPaidConv.property, 'upcoming');
      openConversation(justPaidConv.id);
      if (window.innerWidth <= 860) layout.setAttribute('data-view', 'chat');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (reopenConv) {
      openConversation(reopenConv.id);
      if (window.innerWidth <= 860) layout.setAttribute('data-view', 'chat');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (contactRequest && contactRequest.property && contactRequest.property.id) {
      var reqProp = contactRequest.property;
      var agentName = contactRequest.agentName || 'Agent';

      var allProps = (contactRequest.agentProperties && contactRequest.agentProperties.length)
        ? contactRequest.agentProperties
        : getPropertiesForAgent(agentName, reqProp);

      if (!allProps.some(function (p) { return String(p.id) === String(reqProp.id); })) {
        allProps.unshift(reqProp);
      }

      // Match existing conversation by property id or agent name
      var existingConv = state.conversations.filter(function (c) {
        return (c.property && String(c.property.id) === String(reqProp.id)) ||
               (c.name && c.name.toLowerCase() === agentName.toLowerCase());
      })[0];

      if (existingConv) {
        existingConv.property = reqProp;
        existingConv.allProperties = allProps;
        if (contactRequest.agentAvatar) existingConv.avatar = contactRequest.agentAvatar;
        if (contactRequest.verified !== undefined) existingConv.verified = !!contactRequest.verified;

        // If it's a new contact request for this agent/property, ensure a clean new chat
        existingConv.messages = [];

        // Move to the top
        state.conversations = [existingConv].concat(
          state.conversations.filter(function (c) { return c.id !== existingConv.id; })
        );
      } else {
        existingConv = {
          id: 'conv-' + reqProp.id + '-' + Date.now().toString().slice(-4),
          name: agentName,
          role: 'Real Estate Agent',
          avatar: contactRequest.agentAvatar || AVATAR,
          online: contactRequest.online !== false,
          verified: !!contactRequest.verified,
          muted: false,
          property: reqProp,
          allProperties: allProps,
          messages: []
        };
        state.conversations.unshift(existingConv);
      }

      saveConversations();
      Accoom.removeStorage('accoom-contact-request');
      renderList();
      openConversation(existingConv.id);
      layout.setAttribute('data-view', 'chat');
    } else if (window.innerWidth > 860 && state.conversations.length) {
      // Auto-open the first conversation on desktop so the chat panel
      // isn't blank on load (matches the reference screenshot).
      openConversation(state.conversations[0].id);
    }

    console.log('ACCOOM contact-agent (messages) page initialized');
  });

})(window.Accoom);