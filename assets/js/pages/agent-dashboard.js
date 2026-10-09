/* ==========================================================================
   ACCOOM — Agent Dashboard
   No backend yet: reads the agent record from 'accoom-user' (same one
   agent-details.js writes) and their uploads from 'accoom-agent-listings'.
   Swap FOLDERS / ACTIVITY for real fetches once those endpoints exist —
   the render functions below already take a plain array.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.ag-dash-page');
    if (!page) return;

    var user = Accoom.getStorage('accoom-user', null);
    if (!user) {
      window.location.href = 'auth.html';
      return;
    }

    var AGENT_TYPE_LABEL = {
      landlord: 'Individual Landlord',
      manager: 'Property Manager',
      agency: 'Real Estate Agency',
      developer: 'Developer'
    };

    function initials(name, email) {
      var source = (name || '').trim();
      if (source) {
        var parts = source.split(/\s+/);
        var first = parts[0].charAt(0);
        var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
      }
      if (email) return email.charAt(0).toUpperCase();
      return 'AG';
    }

    function firstName(name, email) {
      if (name && name.trim()) return name.trim().split(/\s+/)[0];
      if (email) return email.split('@')[0];
      return 'there';
    }

    // ----------------------------------------------------------------
    // Identity — sidebar card + topbar greeting
    // ----------------------------------------------------------------
    var nameEl = document.querySelector('[data-ag-name]');
    var typeEl = document.querySelector('[data-ag-type]');
    var firstNameEl = document.querySelector('[data-ag-first-name]');
    var avatarEl = document.querySelector('[data-ag-avatar]');
    var avatarImgEl = document.querySelector('[data-ag-avatar-img]');
    var verifiedBadge = document.querySelector('[data-ag-verified-badge]');
    var verifyNotice = document.querySelector('[data-ag-verify-notice]');

    if (nameEl) nameEl.textContent = user.name || user.email || 'Agent';
    if (typeEl) typeEl.textContent = AGENT_TYPE_LABEL[user.agentType] || 'Agent';
    if (firstNameEl) firstNameEl.textContent = firstName(user.name, user.email);

    // Show the uploaded photo only — the initials circle is a fallback
    // for when there's no photo, not something layered underneath one.
    if (user.avatar && avatarImgEl) {
      avatarImgEl.src = user.avatar;
      avatarImgEl.hidden = false;
      if (avatarEl) avatarEl.hidden = true;
    } else if (avatarEl) {
      avatarEl.textContent = initials(user.name, user.email);
    }

    var ninVerified = user.ninVerified === true;
    if (verifiedBadge) verifiedBadge.hidden = !ninVerified;
    if (verifyNotice) verifyNotice.hidden = ninVerified;

    // ----------------------------------------------------------------
    // Uploads — one folder per property the agent has submitted.
    // Reads 'accoom-agent-listings' if the upload flow has written to
    // it; an empty array is shown until listings have been submitted.
    // Swap this block for a fetch keyed on the agent's id once listings
    // have a backend.
    // ----------------------------------------------------------------
    var folders = Accoom.getStorage('accoom-agent-listings', null);
    if (!Array.isArray(folders)) folders = [];
    // Strip permanently deleted listings — they should never come back after refresh
    folders = folders.filter(function (f) { return f.status !== 'deleted'; });

    var STATUS_LABEL = {
      available: 'Available',
      in_progress: 'In Progress',
      sold: 'Sold',
      delisted: 'Delisted',
      in_dispute: 'In Dispute',
      reported: 'Reported',
      hold: 'Hold'
    };
    function formatPrice(n) {
      return '₦' + Number(n || 0).toLocaleString('en-NG');
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function timeAgo(iso) {
      var then = new Date(iso).getTime();
      if (isNaN(then)) return '';
      var days = Math.floor((Date.now() - then) / 86400000);
      if (days <= 0) return 'today';
      if (days === 1) return '1 day ago';
      if (days < 30) return days + ' days ago';
      var months = Math.floor(days / 30);
      return months === 1 ? '1 month ago' : months + ' months ago';
    }

    function localTime(iso) {
      var date = new Date(iso);
      return isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    function localDate(iso) {
      var date = new Date(iso);
      return isNaN(date.getTime()) ? null : date;
    }

    var folderGrid = document.querySelector('[data-ag-folders]');
    var folderEmpty = document.querySelector('[data-ag-folders-empty]');
    var listingTabsEl = document.querySelector('[data-ag-listing-tabs]');
    var listingTable = document.querySelector('[data-ag-listing-table]');
    var listingPagination = document.querySelector('[data-ag-listing-pagination]');

    function renderFolders(list) {
      if (!folderGrid) return;
      var pageSize = getListingPageSize();
      var totalPages = Math.max(1, Math.ceil(list.length / pageSize));
      if (listingState.page > totalPages) listingState.page = totalPages;
      if (!list || !list.length) {
        if (folderEmpty) folderEmpty.hidden = false;
        folderGrid.innerHTML = '';
        renderListingPagination(0);
        return;
      }
      if (folderEmpty) folderEmpty.hidden = true;
      var pageItems = list.slice((listingState.page - 1) * pageSize, listingState.page * pageSize);
      renderListingPagination(totalPages);

      if (listingTable) {
        folderGrid.innerHTML = pageItems.map(function (f) {
          var kind = f.category === 'sale' ? 'sale' : 'rent';
          var status = STATUS_LABEL[f.status] || 'Available';
          var cover = f.cover || 'assets/images/home-properties/placeholder.png';
          return (
            '<tr class="ag-dash-listing-row" data-ag-listing-row data-listing-id="' + escapeHtml(String(f.id || '')) + '" data-name="' + escapeHtml(f.name || 'Untitled property') + '" data-location="' + escapeHtml(f.location || '') + '">' +
              '<td class="ag-dash-property-cell" data-label="Property">' +
                '<img class="ag-dash-property-thumb" src="' + escapeHtml(cover) + '" alt="" loading="lazy" />' +
                '<span><strong>' + escapeHtml(f.name || 'Untitled property') + '</strong><small>' + escapeHtml(f.location || '') + '</small></span>' +
              '</td>' +
              '<td data-label="Type">' + (kind === 'sale' ? 'For sale' : 'For rent') + '</td>' +
              '<td data-label="Price">' + formatPrice(f.price) + (kind === 'sale' ? '' : ' / ' + escapeHtml(f.period || 'year')) + '</td>' +
              '<td data-label="Status"><span class="ag-dash-table-status ag-dash-table-status--' + escapeHtml(f.status || 'available') + '">' + escapeHtml(status) + '</span></td>' +
              '<td data-label="Listed">' + escapeHtml(f.dateAdded || timeAgo(f.updatedAt) || '—') + '</td>' +
              '<td class="ag-dash-row-actions" data-label="">' +
                '<div class="lax-controls"></div>' +
              '</td>' +
            '</tr>'
          );
        }).join('');
        return;
      }

      var html = pageItems.map(function (f) {
        var specsBits = [];
        if (f.beds) specsBits.push(f.beds + (f.beds === 1 ? ' Bed' : ' Beds'));
        if (f.baths) specsBits.push(f.baths + (f.baths === 1 ? ' Bath' : ' Baths'));
        var kind = f.category === 'sale' ? 'sale' : 'rent';

        return (
          '<a class="ag-dash-folder-card" href="property.html?id=' + encodeURIComponent(f.id) + '">' +
            '<div class="ag-dash-folder-cover">' +
              '<img src="' + f.cover + '" alt="" />' +
              '<span class="ag-dash-folder-kind ag-dash-folder-kind--' + kind + '">' + (kind === 'sale' ? 'For Sale' : 'For Rent') + '</span>' +
              '<button type="button" class="ag-dash-folder-share" aria-label="Share listing">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="10.6" x2="15.4" y2="6.4"></line><line x1="8.6" y1="13.4" x2="15.4" y2="17.6"></line></svg>' +
              '</button>' +
            '</div>' +
            '<div class="ag-dash-folder-body">' +
              '<p class="ag-dash-folder-name">' + f.name + '</p>' +
              '<p class="ag-dash-folder-price">' + formatPrice(f.price) + (kind === 'sale' ? '' : ' <small>/ ' + (f.period || 'year') + '</small>') + '</p>' +
              '<p class="ag-dash-folder-loc">' + f.location + '</p>' +
              (specsBits.length ? '<div class="ag-dash-folder-specs">' + specsBits.map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>' : '') +
            '</div>' +
          '</a>'
        );
      }).join('');

      folderGrid.innerHTML = html;
    }

    // ----------------------------------------------------------------
    // Status tabs — Available / In Progress / Sold are what buyers'
    // own filters map to; Delisted, In Dispute and Reported exist only
    // here, so an agent can see why a listing dropped off the public
    // site without a buyer ever encountering those states.
    // ----------------------------------------------------------------
    var listingState = { tab: 'available', kind: 'all', page: 1 };
    var requestedListingId = '';
    var requestedListingView = false;
    (function readLandingParams() {
      var q = window.location.search;
      var t = /[?&]tab=([a-z_]+)/.exec(q);
      var k = /[?&]kind=(rent|sale)/.exec(q);
      var params = new URLSearchParams(q);
      requestedListingId = params.get('id') || '';
      requestedListingView = params.get('view') === '1';
      if (t && ['available', 'in_progress', 'sold', 'delisted', 'in_dispute', 'reported', 'hold'].indexOf(t[1]) !== -1) listingState.tab = t[1];
      if (k && listingState.tab === 'available') listingState.kind = k[1];
      var requestedListing = folders.filter(function (folder) { return String(folder.id) === requestedListingId; })[0];
      if (requestedListing) {
        if (STATUS_LABEL[requestedListing.status]) listingState.tab = requestedListing.status;
        if (listingState.tab === 'available') listingState.kind = requestedListing.category === 'sale' ? 'sale' : 'rent';
        var requestedListings = folders.filter(function (folder) {
          return folder.status === listingState.tab &&
            (listingState.tab !== 'available' || (folder.category === 'sale' ? 'sale' : 'rent') === listingState.kind);
        });
        var listingIndex = requestedListings.findIndex(function (folder) { return String(folder.id) === requestedListingId; });
        if (listingIndex >= 0) listingState.page = Math.floor(listingIndex / getListingPageSize()) + 1;
      }
    })();

    function getListingPageSize() {
      if (window.matchMedia('(max-width: 640px)').matches) return 5;
      if (window.matchMedia('(max-width: 899px)').matches) return 10;
      return 15;
    }

    function getListingPageNumbers(current, total) {
      if (total <= 7) {
        return Array.from({ length: total }, function (_, index) { return index + 1; });
      }
      var pages = [1];
      var start = Math.max(2, current - 1);
      var end = Math.min(total - 1, current + 1);
      if (start > 2) pages.push('…');
      for (var pageNumber = start; pageNumber <= end; pageNumber++) pages.push(pageNumber);
      if (end < total - 1) pages.push('…');
      pages.push(total);
      return pages;
    }

    function renderListingPagination(totalPages) {
      if (!listingPagination) return;
      listingPagination.innerHTML = '';
      listingPagination.hidden = totalPages <= 1;
      if (totalPages <= 1) return;

      function addButton(label, target, disabled, active, accessibleLabel) {
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('data-listing-page', target);
        if (accessibleLabel) button.setAttribute('aria-label', accessibleLabel);
        if (active) {
          button.className = 'is-active';
          button.setAttribute('aria-current', 'page');
        }
        button.disabled = !!disabled;
        listingPagination.appendChild(button);
      }

      addButton('‹', 'prev', listingState.page === 1, false, 'Previous page');
      getListingPageNumbers(listingState.page, totalPages).forEach(function (entry) {
        if (entry === '…') {
          var ellipsis = document.createElement('span');
          ellipsis.className = 'ag-dash-pagination-ellipsis';
          ellipsis.textContent = entry;
          ellipsis.setAttribute('aria-hidden', 'true');
          listingPagination.appendChild(ellipsis);
          return;
        }
        addButton(String(entry), String(entry), false, entry === listingState.page);
      });
      addButton('›', 'next', listingState.page === totalPages, false, 'Next page');
    }

    if (listingPagination) {
      Accoom.on(listingPagination, 'click', function (event) {
        var button = event.target.closest('[data-listing-page]');
        if (!button || button.disabled) return;
        var target = button.getAttribute('data-listing-page');
        var totalPages = Math.max(1, Math.ceil(getCurrentFilteredListings().length / getListingPageSize()));
        if (target === 'prev') listingState.page = Math.max(1, listingState.page - 1);
        else if (target === 'next') listingState.page = Math.min(totalPages, listingState.page + 1);
        else listingState.page = Number(target) || 1;
        setListingTab(listingState.tab);
        var tableTop = document.querySelector('.ag-dash-table-wrap');
        if (tableTop) {
          var header = document.querySelector('.site-header');
          var offset = header ? header.offsetHeight : 0;
          window.scrollTo({ top: Math.max(0, tableTop.getBoundingClientRect().top + window.pageYOffset - offset - 12), behavior: 'smooth' });
        }
      });
    }

    function getCurrentFilteredListings() {
      return folders.filter(function (f) {
        if (f.status !== listingState.tab) return false;
        if (listingState.tab !== 'available' || listingState.kind === 'all') return true;
        return (f.category === 'sale' ? 'sale' : 'rent') === listingState.kind;
      });
    }

    // Re-read the listings from storage so Delete / Hold / Make Available
    // (done by listing-actions.js) show up in every tab without a reload.
    function syncFolders() {
      var fresh = Accoom.getStorage('accoom-agent-listings', null);
      if (!Array.isArray(fresh)) fresh = [];
      folders = fresh.filter(function (f) { return f.status !== 'deleted'; });
    }

    document.addEventListener('accoom:listing-action', function () {
      syncFolders();
      updateKindCounts();
      setListingTab(listingState.tab);
      renderDashboardStats();
      renderActivity();
      renderPortfolioChart(activeChartType);
    });

    function updateListingCounts() {
      Object.keys(STATUS_LABEL).forEach(function (key) {
        var count = folders.filter(function (f) { return f.status === key; }).length;
        var el = document.querySelector('[data-ag-listing-count="' + key + '"]');
        if (el) el.textContent = count;
      });
    }

    function setListingTab(tab) {
      syncFolders();
      if (tab !== listingState.tab) listingState.page = 1;
      updateKindCounts();
      updateListingCounts();
      listingState.tab = tab;

      if (listingTabsEl) {
        listingTabsEl.querySelectorAll('[data-ag-listing-tab]').forEach(function (btn) {
          var isActive = btn.getAttribute('data-ag-listing-tab') === tab;
          btn.classList.toggle('is-active', isActive);
          btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      }

      if (requestedListingId && requestedListingView) {
        window.setTimeout(function () {
          var row = Array.prototype.slice.call(document.querySelectorAll('[data-ag-listing-row]')).filter(function (item) {
            return item.getAttribute('data-listing-id') === requestedListingId;
          })[0];
          var more = row && row.querySelector('.lax-more');
          if (!more) return;
          more.click();
          window.setTimeout(function () {
            var viewAction = document.querySelector('.lax-menu [data-lax-action="view"]');
            if (viewAction) viewAction.click();
          }, 80);
        }, 100);
      }

      var kindTabsEl = document.querySelector('[data-ag-kind-tabs]');
      if (kindTabsEl) kindTabsEl.hidden = tab !== 'available';

      renderFolders(folders.filter(function (f) {
        if (f.status !== tab) return false;
        if (tab !== 'available' || listingState.kind === 'all') return true;
        return (f.category === 'sale' ? 'sale' : 'rent') === listingState.kind;
      }));
    }

    function updateKindCounts() {
      var live = folders.filter(function (f) { return f.status === 'available'; });
      var counts = { all: live.length, rent: 0, sale: 0 };
      live.forEach(function (f) { counts[f.category === 'sale' ? 'sale' : 'rent']++; });
      Object.keys(counts).forEach(function (k) {
        var el = document.querySelector('[data-ag-kind-count="' + k + '"]');
        if (el) el.textContent = counts[k];
      });
    }

    var kindTabs = document.querySelector('[data-ag-kind-tabs]');
    if (kindTabs) {
      Accoom.on(kindTabs, 'click', function (e) {
        var b = e.target.closest('[data-ag-kind]');
        if (!b) return;
        listingState.kind = b.getAttribute('data-ag-kind');
        listingState.page = 1;
        kindTabs.querySelectorAll('[data-ag-kind]').forEach(function (x) {
          var on = x === b;
          x.classList.toggle('is-active', on);
          x.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        setListingTab(listingState.tab);
      });
    }

    if (kindTabs) {
      kindTabs.querySelectorAll('[data-ag-kind]').forEach(function (x) {
        var on = x.getAttribute('data-ag-kind') === listingState.kind;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    updateKindCounts();
    updateListingCounts();
    setListingTab(listingState.tab);

    var previousPageSize = getListingPageSize();
    window.addEventListener('resize', function () {
      var pageSize = getListingPageSize();
      if (pageSize !== previousPageSize) {
        previousPageSize = pageSize;
        listingState.page = 1;
        setListingTab(listingState.tab);
      }
    });

    if (listingTabsEl) {
      Accoom.on(listingTabsEl, 'click', function (e) {
        var tab = e.target.closest('[data-ag-listing-tab]');
        if (!tab) return;
        setListingTab(tab.getAttribute('data-ag-listing-tab'));
      });
    }

    // ----------------------------------------------------------------
    // Stats — derived straight from the folders above.
    // ----------------------------------------------------------------
    renderDashboardStats();

    // ----------------------------------------------------------------
    // Today's uploads and account transactions.
    // ----------------------------------------------------------------
    var activityList = document.querySelector('[data-ag-activity]');
    var activityEmpty = document.querySelector('[data-ag-activity-empty]');
    var activityRefreshTimer = null;

    function getCreatedAt(folder) {
      var date = localDate(folder.createdAt);
      if (date) return date;
      if (!folder.dateAdded) return null;
      date = localDate(folder.dateAdded);
      if (!date) return null;
      date.setHours(0, 0, 0, 0);
      return date;
    }

    function renderActivity() {
      if (!activityList) return;
      var now = new Date();
      var uploadsToday = folders.map(function (folder) {
        return { folder: folder, createdAt: getCreatedAt(folder) };
      }).filter(function (item) {
        var date = item.createdAt;
        return date && date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
      }).sort(function (a, b) {
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
      var hasAnyActivity = folders.some(function (folder) {
        return !!getCreatedAt(folder) ||
          (Array.isArray(folder.activityHistory) && folder.activityHistory.length > 0) ||
          (Array.isArray(folder.statusHistory) && folder.statusHistory.length > 0);
      });
      if (activityEmpty) activityEmpty.hidden = hasAnyActivity;
      if (!uploadsToday.length) {
        activityList.innerHTML = '';
        return;
      }

      activityList.innerHTML = uploadsToday.slice(0, 10).map(function (item) {
        var folder = item.folder;
        var kind = folder.category === 'sale' ? 'sale' : 'rent';
        var query = '?id=' + encodeURIComponent(folder.id) +
          '&tab=' + encodeURIComponent(STATUS_LABEL[folder.status] ? folder.status : 'available') +
          '&kind=' + kind + '&view=1';
        return (
          '<li><a class="ag-dash-activity-item" href="my-listings.html' + query + '">' +
            '<span class="ag-dash-activity-dot"></span>' +
            '<span class="ag-dash-activity-text">' + escapeHtml(folder.name || 'Property') + ' was uploaded.<small>Open listing</small></span>' +
            '<time class="ag-dash-activity-time" datetime="' + item.createdAt.toISOString() + '">' + localTime(item.createdAt) + '</time>' +
          '</a></li>'
        );
      }).join('');
    }

    function scheduleActivityRefresh() {
      if (activityRefreshTimer) window.clearTimeout(activityRefreshTimer);
      var now = new Date();
      var nextLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      activityRefreshTimer = window.setTimeout(function () {
        renderActivity();
        scheduleActivityRefresh();
      }, Math.max(1000, nextLocalDay.getTime() - now.getTime()));
    }

    function renderDashboardStats() {
      var stats = {
        total: folders.length,
        live: folders.filter(function (f) { return f.status === 'available'; }).length,
        pending: folders.filter(function (f) { return f.status === 'in_progress'; }).length,
        sold: folders.filter(function (f) { return f.status === 'sold'; }).length
      };
      Accoom.$$('[data-ag-stat]').forEach(function (el) {
        var key = el.getAttribute('data-ag-stat');
        if (key !== 'wallet') el.textContent = stats[key] || 0;
      });
    }

    function renderEarnings() {
      var summary = Accoom.AgentDashboardData.getEarningsSummary();
      Object.keys(summary).forEach(function (period) {
        var el = document.querySelector('[data-ag-earning="' + period + '"]');
        if (el) el.textContent = Accoom.formatWalletAmount(summary[period]);
      });
    }

    function renderTransactions() {
      var list = document.querySelector('[data-ag-transactions]');
      var empty = document.querySelector('[data-ag-transactions-empty]');
      if (!list) return;

      var transactions = Accoom.AgentDashboardData.getTransactions().slice(0, 6);
      if (!transactions.length) {
        list.innerHTML = '';
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      list.innerHTML = transactions.map(function (transaction) {
        var isCredit = transaction.type === 'credit';
        var description = (transaction.description || (isCredit ? 'Account credit' : 'Account payment'))
          .replace(/\bwallet\b/gi, 'account');
        return (
          '<li class="ag-dash-transaction">' +
            '<span class="ag-dash-transaction-mark ' + (isCredit ? 'is-credit' : 'is-debit') + '" aria-hidden="true">' + (isCredit ? '+' : '−') + '</span>' +
            '<span class="ag-dash-transaction-copy"><strong>' + escapeHtml(description) + '</strong><small>' + escapeHtml(localTime(transaction.createdAt)) + ' · ' + escapeHtml(new Date(transaction.createdAt).toLocaleDateString()) + '</small></span>' +
            '<strong class="ag-dash-transaction-amount ' + (isCredit ? 'is-credit' : 'is-debit') + '">' + (isCredit ? '+' : '−') + Accoom.formatWalletAmount(transaction.amount) + '</strong>' +
          '</li>'
        );
      }).join('');
    }

    var activeChartType = 'line';
    function renderPortfolioChart(type) {
      var chart = document.querySelector('[data-ag-chart]');
      if (!chart) return;

      var description = document.querySelector('[data-ag-chart-description]');
      var series = Accoom.AgentDashboardData.getPerformanceSeries();
      var chartNote = document.querySelector('[data-ag-chart-note]');
      if (chartNote) chartNote.hidden = !series.some(function (point) { return point.demo; });

      if (type === 'pie') {
        if (description) description.textContent = 'Earnings, pending amounts and payments.';
        var breakdown = Accoom.AgentDashboardData.getTransactionBreakdown();
        var slices = [
          { label: 'Earnings', amount: breakdown.earnings || 0, color: 'earnings' },
          { label: 'Pending', amount: breakdown.pending || 0, color: 'pending' },
          { label: 'Payments', amount: breakdown.payments || 0, color: 'payments' }
        ].filter(function (item) { return item.amount > 0; });
        var totalAmount = slices.reduce(function (sum, item) { return sum + item.amount; }, 0);
        var circumference = 2 * Math.PI * 54;
        var offset = 0;
        var rings = slices.map(function (item) {
          var length = circumference * item.amount / totalAmount;
          var ring = '<circle class="ag-dash-pie-' + item.color + '" cx="80" cy="80" r="54" stroke-dasharray="' +
            length + ' ' + circumference + '" stroke-dashoffset="-' + offset + '" data-chart-label="' +
            escapeHtml(item.label) + '" data-chart-amount="' + item.amount + '" tabindex="0" role="img" aria-label="' +
            escapeHtml(item.label + ': ' + Accoom.formatWalletAmount(item.amount)) + '"><title>' + escapeHtml(item.label) +
            ': ' + Accoom.formatWalletAmount(item.amount) + '</title></circle>';
          offset += length;
          return ring;
        }).join('');
        chart.innerHTML = slices.length
          ? '<div class="ag-dash-pie-layout"><svg viewBox="0 0 160 160" aria-label="Transaction amount breakdown">' +
              '<circle class="ag-dash-pie-track" cx="80" cy="80" r="54"></circle>' +
              rings + '<text x="80" y="76" text-anchor="middle">' + slices.length + '</text><text class="ag-dash-pie-label" x="80" y="96" text-anchor="middle">types</text></svg>' +
              '<ul class="ag-dash-chart-legend">' + slices.map(function (item) {
                return '<li><i class="is-' + item.color + '"></i> ' + escapeHtml(item.label) + '<strong>' + Accoom.formatWalletAmount(item.amount) + '</strong></li>';
              }).join('') + '</ul></div>'
          : '<p class="ag-dash-chart-empty">No transaction amounts to show yet.</p>';
        return;
      }

      if (description) description.textContent = 'Recorded income movement over time.';
      var max = Math.max(1, Math.max.apply(Math, series.map(function (point) { return point.amount; })));
      var points = series.map(function (point, index) {
        return {
          x: 56 + index * (620 / Math.max(series.length - 1, 1)),
          y: 174 - point.amount / max * 132,
          amount: point.amount,
          label: point.label,
          status: point.status || 'settled'
        };
      });
      var svg = '<svg viewBox="0 0 720 220" role="img" aria-label="Transaction amounts over time">';
      [0, 1, 2, 3, 4].forEach(function (index) {
        var y = 174 - index * 33;
        svg += '<line class="ag-dash-chart-gridline" x1="42" y1="' + y + '" x2="690" y2="' + y + '"></line>';
      });
      if (type === 'bar') {
        points.forEach(function (point, index) {
          var trend = point.status === 'pending' ? 'pending' : index === 0 ? 'steady' :
            point.amount > points[index - 1].amount ? 'up' :
            point.amount < points[index - 1].amount ? 'down' : 'steady';
          svg += '<rect class="ag-dash-chart-bar ag-dash-chart-' + trend + '" x="' + (point.x - 12) + '" y="' + point.y +
            '" width="24" height="' + Math.max(0, 174 - point.y) + '" rx="4" data-chart-index="' + index +
            '" tabindex="0" role="img"><title>' + escapeHtml(point.label) + ': ' + Accoom.formatWalletAmount(point.amount) + '</title></rect>';
        });
      } else {
        points.slice(1).forEach(function (point, index) {
          var previous = points[index];
          var trend = point.status === 'pending' || previous.status === 'pending' ? 'pending' :
            point.amount > previous.amount ? 'up' :
            point.amount < previous.amount ? 'down' : 'steady';
          svg += '<line class="ag-dash-chart-segment ag-dash-chart-' + trend + '" x1="' + previous.x + '" y1="' +
            previous.y + '" x2="' + point.x + '" y2="' + point.y + '"></line>';
        });
        points.forEach(function (point, index) {
          svg += '<circle class="ag-dash-chart-point ag-dash-chart-point--' + (point.status === 'pending' ? 'pending' : 'normal') +
            '" cx="' + point.x + '" cy="' + point.y + '" r="4" data-chart-index="' + index +
            '" tabindex="0" role="img"><title>' + escapeHtml(point.label) + ': ' +
            Accoom.formatWalletAmount(point.amount) + (point.status === 'pending' ? ' (pending)' : '') + '</title></circle>';
        });
      }
      points.forEach(function (point, index) {
        if (index % 2 === 0 || index === points.length - 1) {
          svg += '<text class="ag-dash-chart-label" x="' + point.x + '" y="204" text-anchor="middle">' + escapeHtml(point.label) + '</text>';
        }
      });
      chart.innerHTML = svg + '</svg><div class="ag-dash-chart-tooltip" data-ag-chart-tooltip role="status" hidden></div>';
    }

    var chartSwitch = document.querySelector('.ag-dash-chart-switch');
    if (chartSwitch) {
      Accoom.on(chartSwitch, 'click', function (event) {
        var button = event.target.closest('[data-ag-chart-type]');
        if (!button) return;
        activeChartType = button.getAttribute('data-ag-chart-type');
        chartSwitch.querySelectorAll('[data-ag-chart-type]').forEach(function (item) {
          var active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        renderPortfolioChart(activeChartType);
      });
    }

    var chartEl = document.querySelector('[data-ag-chart]');
    if (chartEl) {
      function showChartTooltip(target, pointerEvent) {
        var tooltip = chartEl.querySelector('[data-ag-chart-tooltip]');
        if (!tooltip || !target) return;
        var label = target.getAttribute('data-chart-label') || '';
        var amount = Number(target.getAttribute('data-chart-amount'));
        if (!label && target.hasAttribute('data-chart-index')) {
          var point = Accoom.AgentDashboardData.getPerformanceSeries()[Number(target.getAttribute('data-chart-index'))];
          if (!point) return;
          label = point.label + (point.status === 'pending' ? ' · Pending' : '');
          amount = point.amount;
        }
        if (!label || !isFinite(amount)) return;
        tooltip.textContent = label + ' · ' + Accoom.formatWalletAmount(amount);
        tooltip.hidden = false;
        var chartRect = chartEl.getBoundingClientRect();
        var targetRect = target.getBoundingClientRect();
        var x = pointerEvent && typeof pointerEvent.clientX === 'number'
          ? pointerEvent.clientX - chartRect.left + 10
          : targetRect.left - chartRect.left + targetRect.width / 2;
        var y = pointerEvent && typeof pointerEvent.clientY === 'number'
          ? pointerEvent.clientY - chartRect.top - 42
          : targetRect.top - chartRect.top - 42;
        tooltip.style.left = Math.max(4, Math.min(x, chartRect.width - tooltip.offsetWidth - 4)) + 'px';
        tooltip.style.top = Math.max(4, y) + 'px';
      }

      chartEl.addEventListener('pointerover', function (event) {
        var target = event.target.closest('[data-chart-index], [data-chart-label]');
        if (target) showChartTooltip(target, event);
      });
      chartEl.addEventListener('pointermove', function (event) {
        var target = event.target.closest('[data-chart-index], [data-chart-label]');
        if (target) showChartTooltip(target, event);
      });
      chartEl.addEventListener('pointerout', function (event) {
        if (event.relatedTarget && chartEl.contains(event.relatedTarget)) return;
        var tooltip = chartEl.querySelector('[data-ag-chart-tooltip]');
        if (tooltip) tooltip.hidden = true;
      });
      chartEl.addEventListener('focusin', function (event) {
        var target = event.target.closest('[data-chart-index], [data-chart-label]');
        if (target) showChartTooltip(target);
      });
      chartEl.addEventListener('focusout', function () {
        var tooltip = chartEl.querySelector('[data-ag-chart-tooltip]');
        if (tooltip) tooltip.hidden = true;
      });
    }

    renderActivity();
    scheduleActivityRefresh();
    renderEarnings();
    renderTransactions();
    renderPortfolioChart(activeChartType);
    document.addEventListener(Accoom.WALLET_UPDATED_EVENT, function () {
      renderEarnings();
      renderTransactions();
      renderPortfolioChart(activeChartType);
    });

    // ----------------------------------------------------------------
    // Nav items that don't have a page yet — keep them visible (so the
    // shape of the dashboard is clear) without sending anyone to a 404.
    // ----------------------------------------------------------------
    Accoom.$$('[data-ag-soon]').forEach(function (link) {
      Accoom.on(link, 'click', function (e) {
        e.preventDefault();
        if (Accoom.showToast) Accoom.showToast('This section is coming soon.');
      });
    });

    // ----------------------------------------------------------------
    // Mobile drawer — hamburger above the topbar slides the sidebar
    // in; a backdrop click or a leftward swipe on the panel both
    // close it. On desktop none of this does anything visible, since
    // the sidebar isn't positioned as a drawer above 899px.
    // ----------------------------------------------------------------
    var mobileToggle = document.querySelector('[data-ag-mobile-toggle]');
    var sidebarEl = document.querySelector('[data-ag-sidebar]');
    var backdropEl = document.querySelector('[data-ag-backdrop]');

    function openDrawer() {
      if (!sidebarEl || !backdropEl) return;
      sidebarEl.classList.add('is-open');
      backdropEl.hidden = false;
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      if (!sidebarEl || !backdropEl) return;
      sidebarEl.classList.remove('is-open');
      backdropEl.hidden = true;
      if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    if (mobileToggle) Accoom.on(mobileToggle, 'click', openDrawer);

    // Click-out: the backdrop sits behind the drawer and in front of
    // everything else, so any tap outside the panel lands here.
    if (backdropEl) Accoom.on(backdropEl, 'click', closeDrawer);

    // Swipe-out: a leftward drag on the panel itself, measured start
    // to end, closes it — only counted when it's clearly horizontal
    // so it doesn't fight with vertical scrolling inside the nav.
    if (sidebarEl) {
      var touchStartX = 0;
      var touchStartY = 0;
      var SWIPE_CLOSE_THRESHOLD = 50;

      sidebarEl.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
      }, { passive: true });

      sidebarEl.addEventListener('touchend', function (e) {
        var t = e.changedTouches[0];
        var deltaX = t.clientX - touchStartX;
        var deltaY = t.clientY - touchStartY;
        if (deltaX < -SWIPE_CLOSE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
          closeDrawer();
        }
      }, { passive: true });
    }

    // Picking any nav item (including Sign Out below) closes the
    // drawer too, so it's never left open behind a navigation.
    Accoom.$$('.ag-dash-nav-link').forEach(function (link) {
      Accoom.on(link, 'click', closeDrawer);
    });

    // ----------------------------------------------------------------
    // Sign out
    // ----------------------------------------------------------------
    var signoutBtn = document.querySelector('[data-ag-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

  });

})(window.Accoom);