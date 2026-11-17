/* ==========================================================================
   ACCOOM — Agent dashboard: My Purchases, Purchase details, Saved Properties
   One script for the three agent pages (agent-purchases.html,
   agent-purchase-details.html, agent-saved-properties.html). Each page sets
   data-agx-page on <main>, and only that part runs.

   The look matches the customer pages (it reuses their stylesheets); the data
   is the agent's own:
     purchases  'accoom-purchases-log' rows where payerKey is THIS agent. That
                is the record the chat payment flow already writes when an
                agent pays another agent for a property.
     saved      Accoom.SavedProperties (a separate list for agents).
   There are no demo rows: an agent with no purchases sees an empty state.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('[data-agx-page]');
    if (!page) return;
    var which = page.getAttribute('data-agx-page');

    var user = Accoom.getStorage('accoom-user', null);
    if (!user) {
      window.location.href = 'auth.html?next=' + encodeURIComponent((location.pathname.split('/').pop() || 'home.html') + location.search + location.hash);
      return;
    }
    if (user.role !== 'agent') {
      window.location.href = user.role ? 'home.html' : 'onboarding.html';
      return;
    }

    /* ------------------------------------------------------------ helpers */
    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function initials(name, email) {
      var source = (name || '').trim();
      if (source) {
        var parts = source.split(/\s+/);
        return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
      }
      return email ? email.charAt(0).toUpperCase() : 'AG';
    }

    function money(value) {
      if (value == null || value === '') return '—';
      if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
        return '₦' + Number(value).toLocaleString('en-NG');
      }
      return String(value);
    }

    var PIN_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>';
    var CAL_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
    var BED_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"></path><path d="M2 16h20"></path><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"></path></svg>';
    var CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    /* ------------------------------------------------- sidebar: identity */
    var AGENT_TYPE_LABEL = {
      landlord: 'Individual Landlord',
      manager: 'Property Manager',
      agency: 'Real Estate Agency',
      developer: 'Developer'
    };
    var nameEl = document.querySelector('[data-ag-name]');
    var typeEl = document.querySelector('[data-ag-type]');
    var avatarEl = document.querySelector('[data-ag-avatar]');
    var avatarImgEl = document.querySelector('[data-ag-avatar-img]');
    var verifiedBadge = document.querySelector('[data-ag-verified-badge]');
    var displayName = user.name || user.fullName || user.email || 'Agent';

    if (nameEl) nameEl.textContent = displayName;
    if (typeEl) typeEl.textContent = AGENT_TYPE_LABEL[user.agentType] || 'Agent';
    if (user.avatar && avatarImgEl) {
      avatarImgEl.src = user.avatar;
      avatarImgEl.hidden = false;
      if (avatarEl) avatarEl.hidden = true;
    } else if (avatarEl) {
      avatarEl.textContent = initials(displayName, user.email);
    }
    if (verifiedBadge) verifiedBadge.hidden = user.ninVerified !== true;

    /* -------------------------------------------- sidebar: sign out, soon */
    var signoutBtn = document.querySelector('[data-ag-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }
    Accoom.$$('[data-ag-soon]').forEach(function (link) {
      Accoom.on(link, 'click', function (e) {
        e.preventDefault();
        if (Accoom.showToast) Accoom.showToast('This section is coming soon.');
      });
    });

    /* ------------------------------------------- sidebar: mobile drawer */
    var mobileToggle = document.querySelector('[data-ag-mobile-toggle]');
    var sidebarEl = document.querySelector('[data-ag-sidebar]');
    var backdropEl = document.querySelector('[data-ag-backdrop]');

    function setDrawer(open) {
      if (!sidebarEl || !backdropEl) return;
      sidebarEl.classList.toggle('is-open', open);
      backdropEl.hidden = !open;
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    }
    if (mobileToggle) Accoom.on(mobileToggle, 'click', function () { setDrawer(true); });
    if (backdropEl) Accoom.on(backdropEl, 'click', function () { setDrawer(false); });
    if (sidebarEl) {
      var startX = 0, startY = 0;
      sidebarEl.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      }, { passive: true });
      sidebarEl.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0];
        var dx = t.clientX - startX, dy = t.clientY - startY;
        if (dx < -50 && Math.abs(dx) > Math.abs(dy)) setDrawer(false);
      }, { passive: true });
    }

    /* ======================================================== purchases */
    var STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };
    var LIST_STATUS_CLASS = { upcoming: 'purchase-status--upcoming', completed: 'purchase-status--completed', cancelled: 'purchase-status--cancelled' };
    var POD_STATUS_CLASS = { upcoming: 'pod-status-badge--upcoming', completed: 'pod-status-badge--completed', cancelled: 'pod-status-badge--cancelled' };

    function statusLabel(s) { return STATUS_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Pending'); }

    // Only this agent's own payments. Rows with no payerKey are never shown
    // here: they predate payer tracking and could belong to anyone.
    function myPurchases() {
      var me = (Accoom.Sync && Accoom.Sync.userKey && Accoom.Sync.userKey()) || '';
      var log = Accoom.getStorage('accoom-purchases-log', []);
      if (!me || !Array.isArray(log)) return [];
      return log.filter(function (r) { return r && r.id && r.payerKey === me; });
    }

    function initPurchases() {
      var PAGE_SIZE = 5;
      var all = myPurchases();
      var state = { status: 'all', page: 1 };

      var listEl = document.querySelector('[data-purchases-list]');
      var emptyEl = document.querySelector('[data-purchases-empty]');
      var tabsEl = document.querySelector('[data-purchases-tabs]');
      var statusLabelEl = document.querySelector('[data-purchases-status-label]');
      var statusDropdown = document.querySelector('.purchases-status-dropdown');
      var paginationEl = document.querySelector('[data-purchases-pagination]');
      var pageNumbersEl = document.querySelector('[data-purchases-page-numbers]');
      var prevBtn = document.querySelector('[data-purchases-prev]');
      var nextBtn = document.querySelector('[data-purchases-next]');

      function filtered() {
        return state.status === 'all' ? all : all.filter(function (p) { return p.status === state.status; });
      }

      function updateCounts() {
        ['upcoming', 'completed', 'cancelled'].forEach(function (key) {
          var el = document.querySelector('[data-purchases-count="' + key + '"]');
          if (el) el.textContent = all.filter(function (p) { return p.status === key; }).length;
        });
      }

      function card(order) {
        var beds = Number(order.guests) || 1;
        var el = document.createElement('article');
        el.className = 'purchase-item';
        el.innerHTML =
          '<div class="purchase-thumb">' + (order.image ? '<img src="' + esc(order.image) + '" alt="' + esc(order.name) + '" />' : '') + '</div>' +
          '<div class="purchase-info">' +
            '<h4>' + esc(order.name) + '</h4>' +
            '<div class="purchase-meta">' +
              (order.location ? '<span>' + PIN_ICON + esc(order.location) + '</span>' : '') +
              (order.dates ? '<span>' + CAL_ICON + esc(order.dates) + '</span>' : '') +
              '<span>' + BED_ICON + beds + (beds === 1 ? ' Bed' : ' Beds') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="purchase-order">' +
            '<span class="purchase-order-label">Order ID</span>' +
            '<span class="purchase-order-value">#' + esc(order.id) + '</span>' +
            '<span class="purchase-order-label">Amount</span>' +
            '<span class="purchase-amount-value">' + esc(money(order.amount)) + '</span>' +
          '</div>' +
          '<div class="purchase-side">' +
            '<span class="purchase-status ' + (LIST_STATUS_CLASS[order.status] || '') + '">' + esc(statusLabel(order.status)) + '</span>' +
            '<a class="purchase-view-btn" href="agent-purchase-details.html?id=' + encodeURIComponent(order.id) + '">View Details' + CHEVRON + '</a>' +
          '</div>';
        return el;
      }

      function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }

      function pageList(current, total) {
        var mobile = window.matchMedia('(max-width: 640px)').matches;
        var edge = mobile ? 1 : 2, sib = mobile ? 0 : 1;
        if (total <= edge * 2 + sib * 2 + 1) return range(1, total);
        var pages = range(1, edge);
        var from = Math.max(edge + 1, current - sib), to = Math.min(total - edge, current + sib);
        if (from > edge + 1) pages.push('...');
        pages = pages.concat(range(from, to));
        if (to < total - edge) pages.push('...');
        return pages.concat(range(total - edge + 1, total));
      }

      function renderPagination(totalPages) {
        if (!paginationEl) return;
        // purchases.css gives the pager display:flex, which beats the
        // `hidden` attribute, so hide it with an inline style as well.
        if (totalPages <= 1) { paginationEl.hidden = true; paginationEl.style.display = 'none'; return; }
        paginationEl.hidden = false;
        paginationEl.style.display = '';
        if (prevBtn) prevBtn.disabled = state.page <= 1;
        if (nextBtn) nextBtn.disabled = state.page >= totalPages;
        if (!pageNumbersEl) return;
        pageNumbersEl.innerHTML = '';
        pageList(state.page, totalPages).forEach(function (entry) {
          if (entry === '...') {
            var gap = document.createElement('span');
            gap.className = 'purchases-page-ellipsis';
            gap.textContent = '...';
            gap.setAttribute('aria-hidden', 'true');
            pageNumbersEl.appendChild(gap);
            return;
          }
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'purchases-page-number' + (entry === state.page ? ' is-active' : '');
          btn.textContent = entry;
          btn.setAttribute('data-purchases-page-number', entry);
          pageNumbersEl.appendChild(btn);
        });
      }

      function render() {
        if (!listEl) return;
        var rows = filtered();
        var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
        if (state.page > totalPages) state.page = totalPages;
        listEl.querySelectorAll('.purchase-item').forEach(function (el) { el.remove(); });

        if (!rows.length) {
          if (emptyEl) {
            emptyEl.hidden = false;
            emptyEl.textContent = all.length
              ? 'No purchases match this filter.'
              : 'You haven’t purchased any property yet. When you pay for a property, it will show up here.';
          }
        } else {
          if (emptyEl) emptyEl.hidden = true;
          rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE).forEach(function (o) { listEl.appendChild(card(o)); });
        }
        renderPagination(totalPages);
      }

      function setStatus(status) {
        state.status = status;
        state.page = 1;
        if (tabsEl) {
          tabsEl.querySelectorAll('[data-purchases-tab]').forEach(function (tab) {
            var on = tab.getAttribute('data-purchases-tab') === status;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        }
        if (statusLabelEl) {
          var chevron = statusLabelEl.querySelector('.chevron');
          statusLabelEl.textContent = status === 'all' ? 'All Status' : STATUS_LABEL[status];
          if (chevron) statusLabelEl.appendChild(chevron);
        }
        render();
      }

      if (tabsEl) Accoom.on(tabsEl, 'click', function (e) {
        var tab = e.target.closest('[data-purchases-tab]');
        if (tab) setStatus(tab.getAttribute('data-purchases-tab'));
      });
      if (statusDropdown) Accoom.initDropdown(statusDropdown, { onSelect: setStatus });
      if (prevBtn) Accoom.on(prevBtn, 'click', function () {
        if (state.page > 1) { state.page -= 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
      if (nextBtn) Accoom.on(nextBtn, 'click', function () {
        var total = Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));
        if (state.page < total) { state.page += 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      });
      if (pageNumbersEl) Accoom.on(pageNumbersEl, 'click', function (e) {
        var btn = e.target.closest('[data-purchases-page-number]');
        if (!btn) return;
        state.page = parseInt(btn.getAttribute('data-purchases-page-number'), 10) || 1;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      var mobileMQ = window.matchMedia('(max-width: 640px)');
      var wasMobile = mobileMQ.matches;
      window.addEventListener('resize', function () {
        if (mobileMQ.matches !== wasMobile) { wasMobile = mobileMQ.matches; render(); }
      });

      updateCounts();
      render();
    }

    /* ================================================== purchase details */
    function initPurchaseDetails() {
      var podPage = document.querySelector('[data-pod-page]');
      var notFound = document.querySelector('[data-pod-not-found]');
      var id = new URLSearchParams(window.location.search).get('id');
      var order = id ? myPurchases().filter(function (r) { return r.id === id; })[0] : null;

      if (!order) { if (notFound) notFound.hidden = false; return; }

      var set = function (sel, value) { var el = document.querySelector(sel); if (el) el.textContent = value; };
      var beds = Number(order.guests) || 1;
      var total = money(order.amount);

      document.title = order.name + ' — ACCOOM';
      var img = document.querySelector('[data-pod-image]');
      if (img && order.image) { img.src = order.image; img.alt = order.name; }

      set('[data-pod-name]', order.name || 'Property');
      set('[data-pod-location]', order.location || '—');
      set('[data-pod-dates]', order.dates || '—');
      set('[data-pod-beds]', beds + (beds === 1 ? ' Bed' : ' Beds'));
      set('[data-pod-order-id]', '#' + order.id);
      set('[data-pod-total]', total);
      set('[data-pod-date-detail]', order.dates || '—');
      set('[data-pod-beds-detail]', String(beds));
      set('[data-pod-location-detail]', order.location || '—');
      set('[data-pod-status-detail]', statusLabel(order.status));
      set('[data-pod-property-price]', total);
      set('[data-pod-total-2]', total);
      set('[data-pod-service-fee]', 'Included');

      var badge = document.querySelector('[data-pod-status]');
      if (badge) {
        badge.textContent = statusLabel(order.status);
        badge.className = 'pod-status-badge ' + (POD_STATUS_CLASS[order.status] || '');
      }

      var when = order.dates || '';
      var steps = [{ title: 'Payment Successful', desc: 'Your payment for this property was received.', date: when, state: 'done' }];
      if (order.status === 'completed') {
        steps.push({ title: 'Purchase Confirmed', desc: 'The seller confirmed this purchase.', date: '', state: 'done' });
      } else if (order.status === 'cancelled') {
        steps.push({ title: 'Purchase Cancelled', desc: 'This purchase was declined or cancelled.', date: '', state: 'done' });
      } else {
        steps.push({ title: 'Awaiting Seller Confirmation', desc: 'The seller is reviewing your payment.', date: '', state: 'current' });
      }
      var tl = document.querySelector('[data-pod-timeline]');
      if (tl) {
        tl.innerHTML = '';
        steps.forEach(function (step) {
          var li = document.createElement('li');
          li.className = 'pod-timeline-item pod-timeline-item--' + step.state;
          li.innerHTML =
            '<span class="pod-timeline-dot">' + (step.state === 'done'
              ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : '') + '</span>' +
            '<div class="pod-timeline-body"><h4>' + esc(step.title) + '</h4><p>' + esc(step.desc) + '</p></div>' +
            '<span class="pod-timeline-date">' + esc(step.date) + '</span>';
          tl.appendChild(li);
        });
      }
      if (podPage) podPage.hidden = false;
    }

    /* ================================================ saved properties */
    function initSaved() {
      var listEl = document.querySelector('[data-saved-list]');
      var emptyEl = document.querySelector('[data-saved-empty]');
      var countEl = document.querySelector('[data-saved-count]');
      if (!listEl || !Accoom.SavedProperties) return;

      function card(p) {
        var specs = [];
        if (p.beds) specs.push(p.beds + (Number(p.beds) === 1 ? ' Bed' : ' Beds'));
        if (p.baths) specs.push(p.baths + (Number(p.baths) === 1 ? ' Bath' : ' Baths'));
        if (p.sqm) specs.push(p.sqm + ' sqm');
        var specsHtml = specs.map(function (s, i) {
          return '<span>' + (i > 0 ? '<span aria-hidden="true">|</span> ' : '') + esc(s) + '</span>';
        }).join('');

        var el = document.createElement('article');
        el.className = 'saved-item';
        el.innerHTML =
          '<a class="saved-thumb" href="property.html?id=' + encodeURIComponent(p.id) + '&name=' + encodeURIComponent(p.name || '') + '">' +
            (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" />' : '') +
          '</a>' +
          '<div class="saved-info">' +
            '<h4>' + esc(p.name) + '</h4>' +
            (p.location ? '<p class="saved-loc">' + PIN_ICON + esc(p.location) + '</p>' : '') +
            (specs.length ? '<div class="saved-specs">' + specsHtml + '</div>' : '') +
          '</div>' +
          '<div class="saved-price-block">' +
            '<span class="saved-price">' + esc(p.price || '') + '</span>' +
            (p.priceUnit ? '<span class="saved-price-unit">' + esc(p.priceUnit) + '</span>' : '') +
          '</div>' +
          '<button type="button" class="saved-remove-btn" data-saved-remove="' + esc(p.id) + '" aria-label="Remove ' + esc(p.name) + ' from saved properties">' +
            '<span class="saved-remove-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-6.7-4.3-9.3-8.2C1.1 10.3 1.6 6.8 4.3 5.1c2.2-1.4 5-.9 6.7 1.1l1 1.2 1-1.2c1.7-2 4.5-2.5 6.7-1.1 2.7 1.7 3.2 5.2 1.6 7.7C18.7 16.7 12 21 12 21z"></path></svg></span>' +
            '<span class="saved-remove-label">Remove</span>' +
          '</button>';
        return el;
      }

      function render() {
        var items = Accoom.SavedProperties.list();
        listEl.innerHTML = '';
        if (countEl) countEl.textContent = items.length + (items.length === 1 ? ' Saved Property' : ' Saved Properties');
        if (emptyEl) emptyEl.hidden = items.length > 0;
        items.forEach(function (p) { listEl.appendChild(card(p)); });
      }

      Accoom.on(listEl, 'click', function (e) {
        var btn = e.target.closest('[data-saved-remove]');
        if (!btn) return;
        e.preventDefault();
        Accoom.SavedProperties.remove(btn.getAttribute('data-saved-remove'));
        render();
      });

      render();
    }

    if (which === 'purchases') initPurchases();
    else if (which === 'purchase-details') initPurchaseDetails();
    else if (which === 'saved') initSaved();
  });

})(window.Accoom);
