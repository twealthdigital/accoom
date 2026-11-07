/* ==========================================================================
   ACCOOM — Agent Profile Page
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    // ============================================================
    // AGENT DATA — set by the page that linked here (View Profile),
    // falling back to a default so this page also works stand-alone.
    // ============================================================
    var stored = Accoom.getStorage('accoom-active-agent', null);

    if (location.hash === '#reviews') {
      setTimeout(function () {
        var el = document.getElementById('reviews');
        if (el) el.scrollIntoView();
      }, 600);
    }

    var agent = {
      name: stored ? stored.name : 'David O.',
      avatar: stored ? stored.avatar : 'assets/images/agent-images/agenticonimg.webp',
      verified: stored ? !!stored.verified : true,
      stats: stored ? stored.stats : '12 Properties \u00B7 24 Deals',
      rating: stored ? stored.rating : '4.8 (120 reviews)',
      level: stored ? stored.level : 'AL5',
      about: stored && stored.about ? stored.about :
        'Dedicated to helping you find a safe, comfortable home without stress. Verified and active on ACCOOM, responding to enquiries fast.',
      property: stored && stored.property ? stored.property : { id: 'ACCOM-30021', name: 'Hall, Ajah, Lagos' }
    };

    // ============================================================
    // Apply agent data to the page
    // ============================================================
    (function applyAgent() {
      var nameEl = document.querySelector('[data-ap-name]');
      if (nameEl) nameEl.textContent = agent.name;

      var avatarEl = document.querySelector('[data-ap-avatar]');
      if (avatarEl) avatarEl.setAttribute('src', agent.avatar);

      var verifiedEl = document.querySelector('[data-ap-verified-badge]');
      if (verifiedEl) verifiedEl.style.display = agent.verified ? '' : 'none';

      var statsEl = document.querySelector('[data-ap-stats]');
      if (statsEl) statsEl.textContent = agent.stats;

      var ratingEl = document.querySelector('[data-ap-rating]');
      if (ratingEl) ratingEl.textContent = agent.rating;

      var aboutEl = document.querySelector('[data-ap-about]');
      if (aboutEl) aboutEl.textContent = agent.about;

      var levelEl = document.querySelector('[data-ap-level]');
      if (levelEl) {
        var rank = parseInt(agent.level.replace('AL', ''), 10) || 5;
        levelEl.className = 'pd-agent-level pd-agent-level--al' + rank;
        var dots = levelEl.querySelectorAll('.pd-level-dot');
        dots.forEach(function (dot, i) { dot.classList.toggle('is-filled', i < rank); });
        levelEl.lastChild.textContent = ' ' + agent.level;
      }

      var docTitleEl = document.querySelector('[data-ap-doctitle]');
      if (docTitleEl) {
        docTitleEl.textContent = agent.name + ' \u2014 Agent Profile \u2014 ACCOOM';
        document.title = agent.name + ' \u2014 Agent Profile \u2014 ACCOOM';
      }
    })();

    // ============================================================
    // REAL AGENT (someone who listed through ACCOOM): show only what is
    // really known. No sample rating, bio, reviews or sample listing cards.
    // The 25 hardcoded sample agents/properties keep their guideline content.
    // ============================================================
    (function applyRealAgent() {
      if (!stored || !stored.real) return;

      function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
      function hideRow(el) { var r = el && (el.closest('.ap-detail-row') || el); if (r) r.style.display = 'none'; }
      function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }

      var all = (Accoom.PropertyService && Accoom.PropertyService.getAll) ? Accoom.PropertyService.getAll() : [];
      var mine = all.filter(function (i) { return i.agentListing && String(i.ownerId) === String(stored.ownerId || ''); });

      // Agent's own registration details (only when the signed-in agent is this agent)
      var me = null;
      try { me = JSON.parse(window.localStorage.getItem('accoom-user')); } catch (e) { me = null; }
      var isMe = !!(me && me.role === 'agent' && String(me.id || me.userId || me.agentId || 'local-agent') === String(stored.ownerId || 'local-agent'));
      var about = isMe && me.about ? String(me.about).trim() : '';
      var langs = isMe && Array.isArray(me.languages) ? me.languages.filter(Boolean) : [];

      // Header
      var statsEl = document.querySelector('[data-ap-stats]');
      if (statsEl) statsEl.textContent = (mine.length || 1) + ((mine.length || 1) === 1 ? ' Property' : ' Properties');
      var ratingEl = document.querySelector('[data-ap-rating]');
      if (ratingEl) ratingEl.textContent = 'No reviews yet';
      var aboutEl = document.querySelector('[data-ap-about]');
      if (aboutEl) { if (about) aboutEl.textContent = about; else aboutEl.style.display = 'none'; }
      var titleEl = document.querySelector('[data-ap-about-title]');
      if (titleEl) titleEl.textContent = 'About ' + agent.name;

      // About card: only rows that have real data
      var bioEl = document.querySelector('[data-ap-bio]');
      if (bioEl) { if (about) bioEl.textContent = about; else bioEl.style.display = 'none'; }
      var spec = document.querySelector('[data-ap-specialization]');
      var types = uniq(mine.map(function (i) { return i.typeLabel; }));
      if (spec) { if (types.length) spec.textContent = types.join(', '); else hideRow(spec); }
      var areasEl = document.querySelector('[data-ap-areas]');
      var areas = uniq(mine.map(function (i) { return i.area || i.location; }));
      if (areasEl) { if (areas.length) areasEl.textContent = areas.join(', '); else hideRow(areasEl); }
      var langEl = document.querySelector('[data-ap-languages]');
      if (langEl) { if (langs.length) langEl.textContent = langs.join(', '); else hideRow(langEl); }
      hideRow(document.querySelector('[data-ap-availability]'));

      // Reviews: none yet
      var list = document.querySelector('.ap-reviews-list');
      if (list) list.innerHTML = '<p class="ap-bio-text">No reviews yet.</p>';

      // Listings: this agent's real public listings only
      function card(i) {
        var price = typeof i.price === 'number' ? '&#8358;' + i.price.toLocaleString('en-NG') : esc(i.price);
        var suffix = i.priceLabel ? ' <small>' + esc(i.priceLabel) + '</small>' : '';
        var img = (i.images && i.images[0]) || 'assets/images/home-properties/placeholder.webp';
        var meta = (i.beds ? '<span>' + i.beds + ' Bed</span>' : '') + (i.baths ? '<span>' + i.baths + ' Bath</span>' : '');
        return '<article class="listing-card ap-listing-card"><div class="listing-card-media">' +
          '<img src="' + esc(img) + '" alt="' + esc(i.name) + '" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.webp\';" />' +
          '<span class="listing-tag ap-status-tag ap-status-tag--available">Available</span>' +
          '<button type="button" class="ap-card-share-btn" data-ap-card-share aria-label="Share this property"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line></svg></button>' +
          '</div><div class="listing-card-body"><p class="listing-name">' + esc(i.name) + '</p>' +
          '<p class="listing-price">' + price + suffix + '</p><p class="listing-location">' + esc(i.location) + '</p>' +
          (meta ? '<div class="listing-meta">' + meta + '</div>' : '') +
          '<a href="property.html?id=' + encodeURIComponent(i.id) + '&name=' + encodeURIComponent(i.name) + '" class="btn btn--ghost btn--sm ap-card-link">View Property</a></div></article>';
      }
      var empty = function (t) { return '<p class="ap-bio-text">' + t + '</p>'; };
      var panels = { available: mine.length ? '<div class="ap-listing-scroll">' + mine.map(card).join('') + '</div>' : empty('No available properties yet.'),
                     inprogress: empty('Nothing in progress.'), sold: empty('No sold properties yet.') };
      Object.keys(panels).forEach(function (k) {
        var panel = document.querySelector('[data-ap-panel="' + k + '"]');
        if (panel) panel.innerHTML = panels[k];
      });
    })();

    // ============================================================
    // Breadcrumb — Home > [Property Name] > Agent Profile
    // ============================================================
    (function applyBreadcrumb() {
      var propLink = document.querySelector('[data-ap-breadcrumb-property]');
      if (!propLink) return;
      propLink.textContent = agent.property.name;
      propLink.setAttribute('href', 'property.html?id=' + encodeURIComponent(agent.property.id) +
        '&name=' + encodeURIComponent(agent.property.name));
    })();

    // ============================================================
    // Button ripple animations (shared module)
    // ============================================================
    Accoom.initButtonAnimations();

    // ============================================================
    // TABS — Available / In Progress / Sold
    // ============================================================
    (function initTabs() {
      var tabsContainer = Accoom.$('[data-ap-tabs]');
      var tabs = Accoom.$$('[data-ap-tab]');
      var panels = Accoom.$$('[data-ap-panel]');
      if (!tabs.length) return;

      // Count cards actually present in each panel — never hardcoded,
      // so it stays correct whether there are 7 or 7 million.
      panels.forEach(function (panel) {
        var key = panel.getAttribute('data-ap-panel');
        var count = Accoom.$$('.ap-listing-card', panel).length;
        var countEl = document.querySelector('[data-ap-tab-count="' + key + '"]');
        if (countEl) countEl.textContent = count;
      });

      tabs.forEach(function (tab) {
        Accoom.on(tab, 'click', function () {
          var target = this.getAttribute('data-ap-tab');

          tabs.forEach(function (t) {
            t.classList.toggle('is-active', t === tab);
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
          });

          panels.forEach(function (p) {
            p.classList.toggle('is-active', p.getAttribute('data-ap-panel') === target);
          });
        });
      });
    })();

    // ============================================================
    // WISHLIST — save/unsave this agent (local toggle for now)
    // ============================================================
    (function initWishlist() {
      var btn = document.querySelector('[data-ap-wishlist]');
      if (!btn) return;
      Accoom.on(btn, 'click', function (e) {
        e.preventDefault();
        var isActive = btn.classList.toggle('is-active');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    })();

    // ============================================================
    // SHARE MODAL — bounce-in dialog (same pattern used site-wide
    // on property.html / home.html), scoped to this agent
    // ============================================================
    (function initShareModal() {
      var trigger = document.querySelector('[data-ap-share]');
      if (!trigger) return;

      var modal = document.createElement('div');
      modal.className = 'share-modal-overlay';
      modal.setAttribute('data-share-modal', '');
      modal.innerHTML =
        '<div class="share-modal" role="dialog" aria-modal="true" aria-label="Share this agent profile">' +
          '<button type="button" class="share-modal-close" data-share-close aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
          '<h3 class="share-modal-title">Share this agent</h3>' +
          '<p class="share-modal-subtitle">Send this profile to someone who needs an agent.</p>' +
          '<div class="share-modal-preview">' +
            '<img data-share-preview-img src="" alt="" />' +
            '<div class="share-modal-preview-text">' +
              '<p data-share-preview-name class="share-modal-preview-name"></p>' +
              '<p data-share-preview-meta class="share-modal-preview-meta"></p>' +
            '</div>' +
          '</div>' +
          '<div class="share-modal-options">' +
            '<a class="share-option" data-share-whatsapp target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.2 3.3 5.3 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z"/><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg></span>' +
              '<span>WhatsApp</span>' +
            '</a>' +
            '<a class="share-option" data-share-twitter target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7.1l-5.6-6.9L4 22H1l8.1-9.3L1 2h7.3l5 6.3L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg></span>' +
              '<span>X</span>' +
            '</a>' +
            '<a class="share-option" data-share-facebook target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.6 1.6-1.6h1.7V3.2C16.5 3.1 15.4 3 14.2 3c-2.6 0-4.4 1.6-4.4 4.5V9.8H7v3.2h2.8v8h3.7z"/></svg></span>' +
              '<span>Facebook</span>' +
            '</a>' +
            '<a class="share-option" data-share-telegram target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.7 11.6c-1 .4-1 1.6.1 1.9l4.9 1.5 1.9 5.8c.2.7 1.1.9 1.6.3l2.6-2.8 5 3.7c.7.5 1.7.2 1.9-.7l3.2-15c.2-.9-.7-1.6-1.5-1.3zM8.6 14l9.4-5.8c.2-.1.4.1.2.3l-7.6 6.9-.3 3.2-1.4-4.1z"/></svg></span>' +
              '<span>Telegram</span>' +
            '</a>' +
            '<a class="share-option" data-share-email>' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 6 10-6"></path></svg></span>' +
              '<span>Email</span>' +
            '</a>' +
          '</div>' +
          '<div class="share-modal-link">' +
            '<input type="text" readonly data-share-link-input />' +
            '<button type="button" data-share-copy>' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
              '<span data-share-copy-label>Copy</span>' +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);

      var closeBtn = modal.querySelector('[data-share-close]');
      var modalTitle = modal.querySelector('.share-modal-title');
      var modalSubtitle = modal.querySelector('.share-modal-subtitle');
      var previewImg = modal.querySelector('[data-share-preview-img]');
      var previewName = modal.querySelector('[data-share-preview-name]');
      var previewMeta = modal.querySelector('[data-share-preview-meta]');
      var linkInput = modal.querySelector('[data-share-link-input]');
      var copyBtn = modal.querySelector('[data-share-copy]');
      var copyLabel = modal.querySelector('[data-share-copy-label]');

      function openModal(subject) {
        subject = subject || { img: agent.avatar, name: agent.name, meta: agent.stats, url: window.location.href };

        modalTitle.textContent = subject.title || 'Share this agent';
        modalSubtitle.textContent = subject.subtitle || 'Send this profile to someone who needs an agent.';
        previewImg.src = subject.img;
        previewName.textContent = subject.name;
        previewMeta.textContent = subject.meta;

        var shareUrl = subject.url;
        linkInput.value = shareUrl;

        var shareText = encodeURIComponent(subject.name + ' \u2014 ACCOOM \u00B7 ' + subject.meta);
        var encodedUrl = encodeURIComponent(shareUrl);

        modal.querySelector('[data-share-whatsapp]').href = 'https://wa.me/?text=' + shareText + '%20' + encodedUrl;
        modal.querySelector('[data-share-twitter]').href = 'https://twitter.com/intent/tweet?text=' + shareText + '&url=' + encodedUrl;
        modal.querySelector('[data-share-facebook]').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl;
        modal.querySelector('[data-share-telegram]').href = 'https://t.me/share/url?url=' + encodedUrl + '&text=' + shareText;
        modal.querySelector('[data-share-email]').href = 'mailto:?subject=' + shareText + '&body=' + encodedUrl;

        modal.classList.add('is-open');
        document.body.classList.add('no-scroll');
      }

      function closeModal() {
        modal.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
      }

      Accoom.on(trigger, 'click', function (e) {
        e.preventDefault();
        openModal();
      });

      // Per-property share buttons on the Available Properties cards
      document.querySelectorAll('.ap-card-share-btn').forEach(function (btn) {
        Accoom.on(btn, 'click', function (e) {
          e.preventDefault();
          e.stopPropagation();

          var card = btn.closest('.ap-listing-card');
          if (!card) return;

          var img = card.querySelector('img');
          var name = card.querySelector('.listing-name');
          var price = card.querySelector('.listing-price');
          var location = card.querySelector('.listing-location');
          var link = card.querySelector('a.ap-card-link');

          openModal({
            img: img ? img.src : '',
            name: name ? name.textContent.trim() : 'Property on ACCOOM',
            meta: (price ? price.textContent.trim() : '') + (location ? ' \u00B7 ' + location.textContent.trim() : ''),
            url: link ? new URL(link.getAttribute('href'), window.location.href).href : window.location.href,
            title: 'Share this property',
            subtitle: 'Send this listing to someone looking for a home.'
          });
        });
      });

      Accoom.on(closeBtn, 'click', closeModal);

      Accoom.on(modal, 'click', function (e) {
        if (e.target === modal) closeModal();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
      });

      Accoom.on(copyBtn, 'click', function () {
        linkInput.select();
        navigator.clipboard && navigator.clipboard.writeText(linkInput.value).then(function () {
          copyLabel.textContent = 'Copied!';
          setTimeout(function () { copyLabel.textContent = 'Copy'; }, 1800);
        });
      });
    })();

    // ============================================================
    // CONTACT AGENT — carry this exact agent + property into
    // contact-agent.html instead of leaving it a dead link.
    // ============================================================
    (function initContact() {
      var contactBtn = document.querySelector('[data-ap-contact]');
      if (!contactBtn) return;

      Accoom.on(contactBtn, 'click', function (e) {
        e.preventDefault();
        if (!Accoom.isLoggedIn()) { window.location.href = 'auth.html?mode=signup'; return; }
        Accoom.setStorage('accoom-contact-request', {
          agentName: agent.name,
          agentAvatar: agent.avatar,
          verified: agent.verified,
          property: {
            id: agent.property.id,
            name: agent.property.name,
            location: agent.property.location || '',
            price: agent.property.price || '',
            image: agent.property.image || ''
          }
        });
        window.location.href = 'contact-agent.html';
      });
    })();

    console.log('ACCOOM agent profile page initialized');
  });

})(window.Accoom);


