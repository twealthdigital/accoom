/* ==========================================================================
   ACCOOM — Property Detail Page
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    // ============================================================
    // PROPERTY DATA
    // The single source of truth for this page. When wiring this up
    // to real navigation, populate this from the clicked listing
    // (e.g. via a query string) instead of the hardcoded fallback.
    // ============================================================
    var params = new URLSearchParams(window.location.search);
    var propId = params.get('id');

    var stored = Accoom.getStorage('accoom-active-listing', null);
    if (stored && propId && String(stored.id) !== String(propId)) stored = null;

    if (!stored && propId && Accoom.PropertyService && Accoom.PropertyService.getById) {
      stored = Accoom.PropertyService.getById(propId);
    }

    // A listing an agent created: the page shows ONLY what the agent entered (no sample text).
    var isAgent = !!(stored && (stored.agentListing || stored.schemaVersion));

    var defaultAgent = {
      name: 'David O.',
      avatar: 'assets/images/agent-images/agenticonimg.webp',
      verified: true,
      rating: 4.8,
      reviews: 120,
      online: true,
      level: 'AL5'
    };
    var resolvedAgent = stored && stored.agent
      ? Object.assign({}, defaultAgent, stored.agent)
      : defaultAgent;
    if (isAgent) {
      // Real agent: never fall back to the sample agent's rating, reviews or level.
      resolvedAgent = Object.assign({}, stored.agent || {}, { real: true, ownerId: stored.ownerId || '' });
      resolvedAgent.name = resolvedAgent.name || 'Agent';
      resolvedAgent.rating = resolvedAgent.rating || 0; resolvedAgent.reviews = resolvedAgent.reviews || 0;
      resolvedAgent.online = false; resolvedAgent.level = resolvedAgent.level || 'AL1';
    }
    if (!resolvedAgent.avatar) {
      resolvedAgent.avatar = 'assets/images/agent-images/agenticonimg.webp';
    }

    var property = {
      id: (stored && stored.id) || propId || 'ACCOM-24567',
      name: (stored && stored.name) || params.get('name') || '2 Bedroom Detached Duplex',
      location: stored ? stored.location : 'Lekki Phase 1, Lagos, Nigeria',
      // Customers only ever see the inclusive price (accommodation + service charge + legal fee + agency fee).
      // A record with no fee fields (catalogue, card price) is already inclusive.
      priceValue: stored ? ((Accoom.Pricing && Accoom.Pricing.finalPrice(stored)) || parseInt(String(stored.price).replace(/[^\d]/g, ''), 10) || 460000) : 460000,
      price: stored ? ((Accoom.Pricing && Accoom.Pricing.finalPrice(stored)) ? Accoom.Pricing.naira(Accoom.Pricing.finalPrice(stored)) : stored.price) : '\u20A6460,000',
      period: stored ? (stored.period || '') : '',
      beds: stored ? (isAgent ? (Number(stored.beds) || 0) : (stored.beds || 2)) : 2,
      baths: stored ? (isAgent ? (Number(stored.baths) || 0) : (stored.baths || 3)) : 3,
      furnishing: stored ? stored.furnishing : '',
      yearBuilt: stored ? stored.yearBuilt : '',
      category: stored ? (stored.category || stored.listingType) : '',
      typeLabel: stored ? (stored.typeLabel || 'Detached Duplex') : 'Detached Duplex',
      images: (stored && stored.images && stored.images.length) ? stored.images : [
        'assets/images/home-properties/miniflat1.webp',
        'assets/images/home-properties/miniflat.webp',
        'assets/images/home-properties/placeholder.webp',
        'assets/images/home-properties/miniflat.webp'
      ],
      video: stored ? stored.video : null,
      extraVideos: (stored && Array.isArray(stored.extraVideos)) ? stored.extraVideos
        : ((stored && Array.isArray(stored.videosAll))
          ? stored.videosAll.filter(function (v) { return v && v !== stored.video; }) : []),
      agent: resolvedAgent,
      agentListing: isAgent,
      ownerId: stored ? (stored.ownerId || '') : ''
    };

    // Suggested Agents are sample tiles: not shown on real agent listings.
    if (isAgent) {
      var sugg = document.querySelector('.pd-suggested');
      if (sugg && sugg.parentNode) sugg.parentNode.removeChild(sugg);
    }

    // Expose to other modules (e.g. main.js's View Profile handler),
    // since `property` above is scoped to this Accoom.ready callback.
    Accoom.currentProperty = property;

    // ============================================================
    // Apply dynamic property name across the page
    // ============================================================
    (function applyPropertyName() {
      var name = property.name;

      var breadcrumbEl = document.querySelector('[data-pd-breadcrumb-current]');
      if (breadcrumbEl) breadcrumbEl.textContent = name;

      var titleEl = document.querySelector('[data-pd-title]');
      if (titleEl) titleEl.textContent = name;

      var docTitleEl = document.querySelector('[data-pd-doctitle]');
      if (docTitleEl) {
        docTitleEl.textContent = name + ' \u2014 ACCOOM';
        document.title = name + ' \u2014 ACCOOM';
      }
    })();

    // ============================================================
    // Apply dynamic agent level (carried over from the home page card)
    // ============================================================
    (function applyAgentLevel() {
      var levelEl = document.querySelector('[data-pd-agent-level]');
      if (!levelEl) return;

      var level = property.agent.level;
      var rank = parseInt(level.replace('AL', ''), 10);

      levelEl.className = 'pd-agent-level pd-agent-level--al' + rank;

      var dots = levelEl.querySelectorAll('.pd-level-dot');
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-filled', i < rank);
      });

      levelEl.lastChild.textContent = ' ' + level;
    })();

    (function applyPropertyDetails() {
      var setText = function (selector, value) {
        var el = document.querySelector(selector);
        if (el) el.textContent = value;
      };

      setText('[data-pd-location-text]', property.location);
      setText('[data-pd-price]', property.price);
      setText('[data-pd-beds-tag]', property.beds ? property.beds + ' Beds' : '');
      setText('[data-pd-baths-tag]', property.baths ? property.baths + ' Baths' : '');
      setText('[data-pd-type-tag]', property.typeLabel);
      setText('[data-pd-overview-id]', property.id);
      setText('[data-pd-overview-type]', property.typeLabel);
      setText('[data-pd-overview-furnishing]', property.furnishing || 'N/A');
      if (isAgent) {
        var furnRow = document.querySelector('[data-pd-overview-furnishing-row]');
        if (furnRow) furnRow.style.display = property.furnishing ? '' : 'none';
      }

      var yearRow = document.querySelector('[data-pd-overview-year-row]');
      if (yearRow) {
        if (!property.yearBuilt || (!isAgent && property.category === 'rent')) {
          yearRow.style.display = 'none';
        } else {
          yearRow.style.display = '';
          setText('[data-pd-overview-year]', property.yearBuilt);
        }
      }

      // Counts (bedrooms, bathrooms, living rooms, kitchens, parking): show the
      // saved listing value, hide any that are 0. With no saved value the
      // existing page content is left as it was.
      var COUNT_LABELS = {
        beds: ['Bedroom', 'Bedrooms'],
        baths: ['Bathroom', 'Bathrooms'],
        livingRooms: ['Living Room', 'Living Rooms'],
        kitchens: ['Kitchen', 'Kitchens'],
        parking: ['Parking Space', 'Parking Spaces']
      };
      var savedCount = function (key) {
        if (!stored || stored[key] == null || stored[key] === '') return undefined;
        var n = parseInt(stored[key], 10);
        return isNaN(n) ? undefined : n;
      };
      Object.keys(COUNT_LABELS).forEach(function (key) {
        var factEl = document.querySelector('[data-pd-quickfact-' + key.toLowerCase() + ']');
        if (!factEl) return;
        var n = savedCount(key);
        if (n === undefined && (key === 'beds' || key === 'baths' || isAgent)) n = Number(property[key]) || 0;
        if (n === undefined) return;
        var container = factEl.closest('.pd-quickfact');
        if (container) container.style.display = n > 0 ? '' : 'none';
        if (n > 0) factEl.textContent = n + ' ' + COUNT_LABELS[key][n === 1 ? 0 : 1];
      });

      // Parking Space row in Property Overview
      var parkingRow = document.querySelector('[data-pd-overview-parking-row]');
      var parkingN = savedCount('parking');
      if (isAgent && parkingN === undefined) parkingN = 0;
      if (parkingRow && parkingN !== undefined) {
        parkingRow.style.display = parkingN > 0 ? '' : 'none';
        if (parkingN > 0) setText('[data-pd-overview-parking]', parkingN + (parkingN === 1 ? ' Car' : ' Cars'));
      }

      // Quick facts: the agent's selected + custom facts replace the sample ones
      if (stored && (isAgent || (Array.isArray(stored.quickFacts) && stored.quickFacts.length))) {
        var qfWrap = document.querySelector('.pd-quickfacts');
        if (qfWrap) {
          var QF_ICONS = {
            check: '<polyline points="20 6 9 17 4 12"></polyline>',
            shield: '<path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5l8-3z"></path>',
            bolt: '<polygon points="13 2 3 14 11 14 10 22 21 10 13 10 13 2"></polygon>',
            drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path>'
          };
          Array.prototype.slice.call(qfWrap.querySelectorAll('.pd-quickfact:not([data-pd-qf-count])')).forEach(function (el) {
            el.parentNode.removeChild(el);
          });
          var seenFacts = {};
          (Array.isArray(stored.quickFacts) ? stored.quickFacts : []).forEach(function (f) {
            var text = String((f && typeof f === 'object') ? f.text : f || '').trim();
            if (!text || seenFacts[text.toLowerCase()]) return;
            seenFacts[text.toLowerCase()] = true;
            var iconPath = QF_ICONS[(f && f.icon) || 'check'] || QF_ICONS.check;
            var chip = document.createElement('div');
            chip.className = 'pd-quickfact';
            chip.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + iconPath + '</svg>';
            chip.appendChild(document.createTextNode(text));
            qfWrap.appendChild(chip);
          });
        }
      }

      // ---- Content the agent entered: description, amenities, location, dates ----
      if (isAgent) {
        var aboutP = document.querySelector('.pd-about-text');
        if (aboutP && aboutP.parentNode) aboutP.parentNode.removeChild(aboutP); // the agent writes one description; it is shown below

        var paras = Array.isArray(stored.description) ? stored.description
          : String(stored.description || '').split(/\n{2,}/);
        paras = paras.map(function (t) { return String(t || '').trim(); }).filter(Boolean);
        var descBlock = document.querySelector('[data-pd-description-block]');
        if (descBlock) {
          Array.prototype.slice.call(descBlock.querySelectorAll('p')).forEach(function (el) { el.parentNode.removeChild(el); });
          paras.forEach(function (t) { var el = document.createElement('p'); el.textContent = t; descBlock.appendChild(el); });
          descBlock.style.display = paras.length ? '' : 'none';
        }

        var amBlock = document.querySelector('[data-pd-amenities-block]');
        var amGrid = document.querySelector('[data-pd-amenities-grid]');
        if (amBlock && amGrid) {
          var tick = amGrid.querySelector('.pd-amenity svg');
          var tickHtml = tick ? tick.outerHTML : '';
          var seen = {};
          var items = (Array.isArray(stored.amenities) ? stored.amenities : []).map(function (a) {
            return String((a && typeof a === 'object') ? (a.text || a.label || '') : a || '').trim();
          }).filter(function (t) { var k = t.toLowerCase(); if (!t || seen[k]) return false; seen[k] = true; return true; });
          amGrid.innerHTML = '';
          items.forEach(function (t) {
            var chip = document.createElement('span'); chip.className = 'pd-amenity'; chip.innerHTML = tickHtml;
            chip.appendChild(document.createTextNode(t)); amGrid.appendChild(chip);
          });
          amBlock.style.display = items.length ? '' : 'none';
        }

        var dateRow = document.querySelector('[data-pd-overview-date-row]');
        if (dateRow) { dateRow.style.display = stored.dateAdded ? '' : 'none'; setText('[data-pd-overview-date]', stored.dateAdded || ''); }
        setText('[data-pd-overview-views]', String(stored.views == null ? '0' : stored.views));
      }

      // Location: the map and address follow the listing (address + area/state), never the sample address.
      if (stored && (stored.location || stored.address)) {
        var where = [stored.address, stored.location || [stored.area, stored.state].filter(Boolean).join(', ')].filter(Boolean).join(', ');
        var frame = document.querySelector('[data-pd-map-iframe]');
        if (frame) frame.setAttribute('src', 'https://www.google.com/maps?q=' + encodeURIComponent(where) + '&output=embed');
        var addrEl = document.querySelector('[data-pd-map-address]');
        if (addrEl && addrEl.lastChild) addrEl.lastChild.textContent = ' ' + where + ' ';
        var mapLink = document.querySelector('[data-pd-map-link]');
        if (mapLink) mapLink.setAttribute('href', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(where));
      }

      var agent = property.agent;
      setText('[data-pd-agent-name-text]', agent.name || 'Agent');
      var avatarEl = document.querySelector('[data-pd-agent-avatar]');
      if (avatarEl && agent.avatar) avatarEl.setAttribute('src', agent.avatar);
      var badge = document.querySelector('[data-pd-agent-name] .pd-agent-verified-badge');
      if (badge) badge.classList.toggle('is-hidden', !agent.verified);
      if (isAgent) {
        var mine = (Accoom.PropertyService && Accoom.PropertyService.getAll ? Accoom.PropertyService.getAll() : []).filter(function (i) {
          return i.agentListing && String(i.ownerId) === String(stored.ownerId || '');
        }).length || 1;
        setText('[data-pd-agent-stats]', mine + (mine === 1 ? ' Property' : ' Properties'));
        setText('[data-pd-agent-rating]', agent.reviews ? agent.rating + ' (' + agent.reviews + ' reviews)' : 'No reviews yet');
      } else {
        setText('[data-pd-agent-stats]', Math.max(1, Math.round((agent.reviews || 0) / 10)) + ' Properties \u00B7 ' + (agent.reviews || 0) + ' Deals');
        setText('[data-pd-agent-rating]', (agent.rating || 0) + ' (' + (agent.reviews || 0) + ' reviews)');
      }

      // One inclusive price everywhere. Fees are never added again here and never shown as amounts.
      var total = property.priceValue;
      var words = Accoom.Pricing ? Accoom.Pricing.periodWords(property.period) : { per: 'Year', first: 'First Year', slash: 'year' };
      var naira = function (n) { return '\u20A6' + n.toLocaleString('en-NG'); };
      var rentLabel = document.querySelector('[data-pd-price-rent]');
      if (rentLabel && rentLabel.previousElementSibling) rentLabel.previousElementSibling.textContent = 'Rent (Per ' + words.per + ')';
      var totalLabel = document.querySelector('[data-pd-price-total]');
      if (totalLabel && totalLabel.previousElementSibling) totalLabel.previousElementSibling.textContent = 'Total (' + words.first + ')';
      var perEl = document.querySelector('[data-pd-price]');
      if (perEl && perEl.nextElementSibling && property.period) perEl.nextElementSibling.textContent = ' / ' + words.slash;
      setText('[data-pd-price-rent]', naira(total));
      setText('[data-pd-price-service]', 'Included');
      setText('[data-pd-price-legal]', 'Included');
      setText('[data-pd-price-agency]', 'Included');
      setText('[data-pd-price-total]', naira(total));
    })();

    // ============================================================
    // Button ripple animations (shared module)
    // ============================================================
    Accoom.initButtonAnimations();

    // ============================================================
    // GALLERY — main image / thumbnail switching
    // ============================================================
(function initGallery() {
      var gallery = document.querySelector('[data-pd-gallery]');
      if (!gallery) return;

      var mainImg = gallery.querySelector('[data-pd-main-img]');
      var mainVideo = gallery.querySelector('[data-pd-main-video]');
      var counter = gallery.querySelector('[data-pd-counter]');
      var thumbsWrap = gallery.querySelector('[data-pd-thumbs]');

      var slides = [];
      if (property.video) {
        slides.push({ type: 'video', src: property.video, poster: property.images[0] });
      }
      property.images.forEach(function (src) {
        slides.push({ type: 'image', src: src });
      });
      property.extraVideos.forEach(function (src) {
        slides.push({ type: 'video', src: src, poster: property.images[0] });
      });

      function renderThumbs() {
        thumbsWrap.innerHTML = slides.map(function (slide, i) {
          var poster = slide.type === 'video' ? slide.poster : slide.src;
          var playIcon = slide.type === 'video'
            ? '<span class="pd-thumb-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></span>'
            : '';
          return '<button type="button" class="pd-thumb" data-pd-thumb data-index="' + i + '" aria-label="' +
            (slide.type === 'video' ? 'Play video' : 'Photo ' + (i + 1)) + '">' +
            '<img src="' + poster + '" alt="" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.webp\';" />' +
            playIcon +
            '</button>';
        }).join('');
      }

      function setActive(index) {
        var slide = slides[index] || slides[0];
        if (!slide) return;
        

        if (slide.type === 'video') {
          mainImg.style.display = 'none';
          mainVideo.style.display = 'block';
          if (slide.poster) mainVideo.setAttribute('poster', slide.poster);
          if (mainVideo.getAttribute('src') !== slide.src) mainVideo.setAttribute('src', slide.src);
          mainVideo.play().catch(function () {});
        } else {
          mainVideo.pause();
          mainVideo.style.display = 'none';
          mainImg.style.display = 'block';
          mainImg.classList.add('is-swapping');
          setTimeout(function () {
            mainImg.src = slide.src;
            mainImg.classList.remove('is-swapping');
          }, 120);
        }

        Accoom.$$('[data-pd-thumb]', thumbsWrap).forEach(function (t) {
          t.classList.toggle('is-active', parseInt(t.getAttribute('data-index'), 10) === index);
        });

        if (counter) counter.textContent = (index + 1) + '/' + slides.length;
      }

      renderThumbs();
      setActive(0);

      Accoom.delegate(thumbsWrap, 'click', '[data-pd-thumb]', function () {
        setActive(parseInt(this.getAttribute('data-index'), 10));
      });


      // Zoom — left-click to zoom in, right-click to zoom out
      var mainFrame = gallery.querySelector('[data-pd-gallery-main]');
      var ZOOM_MIN = 1, ZOOM_MAX = 3, ZOOM_STEP = 0.5;
      var mainZoom = 1;

      function setMainZoom(level) {
        mainZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
        mainImg.style.transform = 'scale(' + mainZoom + ')';
        mainFrame.classList.toggle('is-zoomed', mainZoom > 1);
      }

      var resetBtn = gallery.querySelector('[data-pd-main-zoom-reset]');
      if (resetBtn) {
        Accoom.on(resetBtn, 'click', function (e) {
          e.stopPropagation();
          setMainZoom(1);
        });
      }

      Accoom.on(mainImg, 'click', function () {
        setMainZoom(mainZoom + ZOOM_STEP);
      });

      Accoom.on(mainImg, 'contextmenu', function (e) {
        e.preventDefault();
        setMainZoom(mainZoom - ZOOM_STEP);
      });

    })();

    // ============================================================
    // LIGHTBOX — full photo viewer
    // ============================================================
    var Lightbox = (function initLightbox() {
      // Same order as the gallery above: first video, every photo, then the other videos.
      var lbSlides = [];
      if (property.video) lbSlides.push({ type: 'video', src: property.video, poster: property.images[0] });
      property.images.forEach(function (src) { lbSlides.push({ type: 'image', src: src }); });
      property.extraVideos.forEach(function (src) { lbSlides.push({ type: 'video', src: src, poster: property.images[0] }); });
      var total = lbSlides.length;

      var slidesHtml = lbSlides.map(function (s) {
        if (s.type === 'video') {
          return '<div class="pd-lightbox-slide pd-lightbox-slide--video"><video src="' + s.src + '"' +
            (s.poster ? ' poster="' + s.poster + '"' : '') + ' controls playsinline preload="metadata"></video></div>';
        }
        return '<div class="pd-lightbox-slide"><img src="' + s.src + '" alt="' + property.name + '" draggable="false" /></div>';
      }).join('');

      var box = document.createElement('div');
      box.className = 'pd-lightbox';
      box.setAttribute('data-pd-lightbox', '');
      box.innerHTML =
        box.innerHTML =
        '<div class="pd-lightbox-stage">' +
          '<div class="pd-lightbox-frame" data-pd-lightbox-frame>' +
            '<div class="pd-lightbox-track" data-pd-lightbox-track>' + slidesHtml + '</div>' +
            '<div class="pd-lightbox-zoom-controls">' +
            '<button type="button" class="pd-lightbox-zoom-btn" data-pd-zoom-out aria-label="Zoom out">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.6" y2="16.6"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>' +
            '</button>' +
            '<button type="button" class="pd-lightbox-zoom-btn" data-pd-zoom-reset aria-label="Reset zoom">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>' +
            '</button>' +
            '<button type="button" class="pd-lightbox-zoom-btn" data-pd-zoom-in aria-label="Zoom in">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.6" y2="16.6"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>' +
            '</button>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="pd-lightbox-close" data-pd-lightbox-close aria-label="Close">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
          '<button type="button" class="pd-lightbox-nav pd-lightbox-prev" data-pd-lightbox-prev aria-label="Previous photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>' +
          '</button>' +
          '<button type="button" class="pd-lightbox-nav pd-lightbox-next" data-pd-lightbox-next aria-label="Next photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
          '</button>' +
          '<span class="pd-lightbox-counter" data-pd-lightbox-counter></span>' +
        '</div>';
      document.body.appendChild(box);

      var track = box.querySelector('[data-pd-lightbox-track]');
      var counter = box.querySelector('[data-pd-lightbox-counter]');
      var current = 0;

      function pauseVideos() {
        Array.prototype.forEach.call(track.querySelectorAll('video'), function (v) { if (v.pause) v.pause(); });
      }

      function render(instant) {
        pauseVideos();
        track.style.transition = instant ? 'none' : '';
        track.style.transform = 'translateX(' + (-current * 100) + '%)';
        counter.textContent = (current + 1) + ' / ' + total;
      }

      function open(index) {
        current = index || 0;
        box.classList.add('is-open');
        document.body.classList.add('no-scroll');
        setZoom(1);
        render(true);
      }

      function close() {
        pauseVideos();
        box.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
      }

      function next() {
        current = (current + 1) % total;
        setZoom(1);
        render();
      }

      function prev() {
        current = (current - 1 + total) % total;
        setZoom(1);
        render();
      }

      Accoom.on(box.querySelector('[data-pd-lightbox-close]'), 'click', close);
      Accoom.on(box.querySelector('[data-pd-lightbox-next]'), 'click', next);
      Accoom.on(box.querySelector('[data-pd-lightbox-prev]'), 'click', prev);

      Accoom.on(box, 'click', function (e) {
        if (e.target === box) close();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (!box.classList.contains('is-open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
      });

      // Touch / pointer swipe on the track itself
      var dragState = null;

      Accoom.on(track, 'pointerdown', function (e) {
        if (total < 2 || (e.target && e.target.closest && e.target.closest('video'))) return;
        dragState = { startX: e.clientX, dx: 0 };
        track.style.transition = 'none';
        track.setPointerCapture(e.pointerId);
      });

      Accoom.on(track, 'pointermove', function (e) {
        if (!dragState) return;
        dragState.dx = e.clientX - dragState.startX;
        var pct = (dragState.dx / track.clientWidth) * 100;
        track.style.transform = 'translateX(' + (-current * 100 + pct) + '%)';
      });

      function endDrag() {
        if (!dragState) return;
        var threshold = track.clientWidth * 0.16;
        if (dragState.dx < -threshold) next();
        else if (dragState.dx > threshold) prev();
        else render();
        dragState = null;
      }

      Accoom.on(track, 'pointerup', endDrag);
      Accoom.on(track, 'pointercancel', endDrag);

      // ============================================================
      // ZOOM — left-click to zoom in, right-click to zoom out,
      // +/- buttons and a reset button for mobile
      // ============================================================
      var ZOOM_MIN = 1;
      var ZOOM_MAX = 3;
      var ZOOM_STEP = 0.5;
      var zoomLevel = 1;
      var frame = box.querySelector('[data-pd-lightbox-frame]');

      function currentImg() {
        var slide = track.children[current];
        return slide ? slide.querySelector('img') : null;
      }

      function setZoom(level) {
        zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
        var img = currentImg();
        if (img) img.style.transform = 'scale(' + zoomLevel + ')';
        frame.classList.toggle('is-zoomed', zoomLevel > 1);
      }

      function zoomIn() { setZoom(zoomLevel + ZOOM_STEP); }
      function zoomOut() { setZoom(zoomLevel - ZOOM_STEP); }
      function zoomReset() { setZoom(1); }

      Accoom.on(frame, 'click', function () {
        if (dragState && Math.abs(dragState.dx) > 6) return;
        if (!currentImg()) return;
        zoomIn();
      });

      Accoom.on(frame, 'contextmenu', function (e) {
        e.preventDefault();
        zoomOut();
      });

      Accoom.on(box.querySelector('[data-pd-zoom-in]'), 'click', function (e) {
        e.stopPropagation();
        zoomIn();
      });

      Accoom.on(box.querySelector('[data-pd-zoom-out]'), 'click', function (e) {
        e.stopPropagation();
        zoomOut();
      });

      Accoom.on(box.querySelector('[data-pd-zoom-reset]'), 'click', function (e) {
        e.stopPropagation();
        zoomReset();
      });

      Accoom.delegate(document, 'click', '[data-pd-open-lightbox]', function (e) {
        e.preventDefault();
        var idx = parseInt(this.getAttribute('data-index'), 10);
        open(isNaN(idx) ? 0 : idx);
      });

      return { open: open, close: close };
    })();

    // ============================================================
    // SAVE / FAVORITE toggle
    // ============================================================
    (function initSave() {
      var btn = document.querySelector('[data-pd-save]');
      if (!btn) return;
      Accoom.on(btn, 'click', function () {
        Accoom.toggleClass(btn, 'is-active');
      });
    })();

    // ============================================================
    // MAKE PAYMENT — wallet-balance check + confirm/deposit dialog
    // (same visual/behavioral pattern as the Share modal above)
    // ============================================================
    (function initPayment() {
      var btn = document.querySelector('[data-pd-payment]');
      if (!btn) return;

      function parseAmount(str) {
        var n = parseFloat(String(str || '').replace(/[^0-9.]/g, ''));
        return isNaN(n) ? 0 : n;
      }

      // Wallet balance is the single source of truth in assets/js/core/wallet.js
      // (falls back to parsing the header figure if that script isn't loaded yet).
      function getWalletBalance() {
        if (Accoom.getWalletBalance) return Accoom.getWalletBalance();
        var el = document.querySelector('[data-balance-amount]');
        if (!el) return 0;
        return parseAmount(el.getAttribute('data-balance-raw') || el.textContent);
      }

      // The real payable figure is the "Total (First Year)" row, not
      // just the base rent — that's the actual amount being charged.
      function getPayableAmount() {
        var totalEl = document.querySelector('.pd-price-total span:last-child');
        var display = totalEl ? totalEl.textContent.trim() : property.price;
        return { display: display, value: parseAmount(display) };
      }

      var modal = document.createElement('div');
      modal.className = 'share-modal-overlay share-modal-overlay--pay';
      modal.setAttribute('data-pay-modal', '');
      modal.innerHTML =
        '<div class="share-modal share-modal--pay" role="dialog" aria-modal="true" aria-labelledby="pay-modal-title">' +
          '<button type="button" class="share-modal-close" data-pay-close aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
          '<div class="pay-modal-icon-wrap" data-pay-icon-wrap>' +
            '<svg data-pay-icon width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>' +
          '</div>' +
          '<div class="pay-modal-body-text">' +
            '<p class="share-modal-title" id="pay-modal-title" data-pay-title></p>' +
            '<p class="share-modal-subtitle" data-pay-subtitle></p>' +
          '</div>' +
          '<div class="pay-modal-amount-row">' +
            '<span>Amount Due</span>' +
            '<span data-pay-amount></span>' +
          '</div>' +
          '<div class="pay-modal-actions">' +
            '<button type="button" class="btn btn--ghost" data-pay-cancel>Cancel</button>' +
            '<button type="button" class="btn btn--primary" data-pay-confirm></button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);

      var iconWrap = modal.querySelector('[data-pay-icon-wrap]');
      var iconSvg = modal.querySelector('[data-pay-icon]');
      var titleEl = modal.querySelector('[data-pay-title]');
      var subtitleEl = modal.querySelector('[data-pay-subtitle]');
      var amountEl = modal.querySelector('[data-pay-amount]');
      var confirmBtn = modal.querySelector('[data-pay-confirm]');

      var ICON_WARN = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="13"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>';
      var ICON_OK = '<path d="M20 6 9 17l-5-5"></path>';

      var state = { hasFunds: false, payable: { display: '', value: 0 } };

      function openModal(hasFunds, payable) {
        state.hasFunds = hasFunds;
        state.payable = payable;

        iconWrap.className = 'pay-modal-icon-wrap ' + (hasFunds ? 'pay-modal-icon-wrap--ok' : 'pay-modal-icon-wrap--warn');
        iconSvg.innerHTML = hasFunds ? ICON_OK : ICON_WARN;

        titleEl.textContent = hasFunds ? 'Confirm Your Payment' : 'Insufficient Balance';
        subtitleEl.textContent = hasFunds
          ? 'Your wallet balance covers this payment. Review the amount below, then proceed to complete it securely.'
          : 'Your wallet balance is not enough to cover this payment. Deposit funds to continue.';

        amountEl.textContent = payable.display;
        confirmBtn.textContent = hasFunds ? 'Proceed' : 'Deposit';

        modal.classList.add('is-open');
        document.body.classList.add('no-scroll');
      }

      function closeModal() {
        modal.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
      }

      Accoom.on(btn, 'click', function () {
        var payable = getPayableAmount();
        var balance = getWalletBalance();
        openModal(payable.value > 0 && balance >= payable.value, payable);
      });

      Accoom.on(modal.querySelector('[data-pay-close]'), 'click', closeModal);
      Accoom.on(modal.querySelector('[data-pay-cancel]'), 'click', closeModal);

      Accoom.on(modal, 'click', function (e) {
        if (e.target === modal) closeModal();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
      });

      Accoom.on(confirmBtn, 'click', function () {
        // Deposit (insufficient funds) and Proceed (sufficient funds)
        // both hand off to payment.html; it reads `mode` to decide
        // whether to show the top-up step or go straight to checkout.
        var url = 'payment.html'
          + '?id=' + encodeURIComponent(property.id)
          + '&amount=' + encodeURIComponent(state.payable.value)
          + '&mode=' + (state.hasFunds ? 'checkout' : 'deposit')
          + '&return=contact-agent.html';
        window.location.href = url;
      });
    })();

    // ============================================================
    // SUGGESTED AGENTS — carousel prev/next
    // ============================================================
    (function initAgentsCarousel() {
      var track = document.querySelector('[data-pd-agents-track]');
      var prevBtn = document.querySelector('[data-pd-agents-prev]');
      var nextBtn = document.querySelector('[data-pd-agents-next]');
      if (!track) return;

      function scrollByTile(direction) {
        var tile = track.querySelector('.pd-agent-tile');
        var step = tile ? tile.getBoundingClientRect().width + 20 : 300;
        track.scrollBy({ left: direction * step, behavior: 'smooth' });
      }

      if (prevBtn) Accoom.on(prevBtn, 'click', function () { scrollByTile(-1); });
      if (nextBtn) Accoom.on(nextBtn, 'click', function () { scrollByTile(1); });
    })();

    // ============================================================
    // SHARE MODAL — bounce-in dialog, scoped to this property
    // (same visual/behavioral pattern used site-wide)
    // ============================================================
    (function initShareModal() {
      var modal = document.createElement('div');
      modal.className = 'share-modal-overlay';
      modal.setAttribute('data-share-modal', '');
      modal.innerHTML =
        '<div class="share-modal" role="dialog" aria-modal="true" aria-label="Share this property">' +
          '<button type="button" class="share-modal-close" data-share-close aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
          '<h3 class="share-modal-title">Share this property</h3>' +
          '<p class="share-modal-subtitle">Send this listing to someone who needs it.</p>' +
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
      var previewImg = modal.querySelector('[data-share-preview-img]');
      var previewName = modal.querySelector('[data-share-preview-name]');
      var previewMeta = modal.querySelector('[data-share-preview-meta]');
      var linkInput = modal.querySelector('[data-share-link-input]');
      var copyBtn = modal.querySelector('[data-share-copy]');
      var copyLabel = modal.querySelector('[data-share-copy-label]');

      function openModal() {
        previewImg.src = property.images[0];
        previewName.textContent = property.name;
        previewMeta.textContent = property.price + ' \u00B7 ' + property.location;

        var shareUrl = window.location.origin + window.location.pathname + '?id=' + encodeURIComponent(property.id);
        linkInput.value = shareUrl;

        var shareText = encodeURIComponent(property.name + ' - ' + property.price + ' \u00B7 ' + property.location);
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

      Accoom.delegate(document, 'click', '[data-pd-share-trigger]', function (e) {
        e.preventDefault();
        openModal();
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
    // CONTACT AGENT — create a chat for this agent and property
    // ============================================================
    (function initContactAgent() {
      var contactBtn = document.querySelector('[data-pd-contact-agent]') ||
                       document.querySelector('.pd-agent-actions a[href*="contact-agent"]');
      if (!contactBtn) return;

      Accoom.on(contactBtn, 'click', function (e) {
        e.preventDefault();
        var agent = property.agent || {};
        var agentAvatarEl = document.querySelector('[data-pd-agent-avatar]');
        var agentAvatar = (agentAvatarEl && agentAvatarEl.getAttribute('src')) || agent.avatar || 'assets/images/agent-images/agenticonimg.webp';

        var thisPropObj = {
          id: property.id,
          name: property.name,
          location: property.location || '',
          price: property.price || '',
          image: (property.images && property.images[0]) || 'assets/images/home-properties/placeholder.webp',
          beds: property.beds,
          baths: property.baths
        };

        // Gather all properties belonging to this agent
        var agentProps = [];
        if (Accoom.PropertyService && Accoom.PropertyService.getAll && agent.name) {
          var all = Accoom.PropertyService.getAll();
          agentProps = all.filter(function (item) {
            return item.agent && item.agent.name && item.agent.name.toLowerCase() === agent.name.toLowerCase();
          }).map(function (item) {
            return {
              id: item.id,
              name: item.name,
              location: item.location,
              price: typeof item.price === 'number' ? ('\u20A6' + item.price.toLocaleString('en-NG') + (item.priceLabel ? ' ' + item.priceLabel : '')) : item.price,
              image: (item.images && item.images[0]) || 'assets/images/home-properties/placeholder.webp',
              beds: item.beds,
              baths: item.baths
            };
          });
        }

        if (!agentProps.some(function (p) { return String(p.id) === String(thisPropObj.id); })) {
          agentProps.unshift(thisPropObj);
        }

        if (!Accoom.isLoggedIn()) { window.location.href = 'auth.html?mode=signup'; return; }

        Accoom.setStorage('accoom-contact-request', {
          agentName: agent.name || (agent.real ? 'Agent' : 'David O.'),
          agentAvatar: agentAvatar,
          verified: !!agent.verified,
          online: agent.real ? false : agent.online !== false,
          rating: agent.real ? (agent.rating || 0) : (agent.rating || 4.8),
          reviews: agent.real ? (agent.reviews || 0) : (agent.reviews || 120),
          level: agent.level || (agent.real ? 'AL1' : 'AL5'),
          property: thisPropObj,
          agentProperties: agentProps
        });

        window.location.href = 'contact-agent.html';
      });
    })();

    console.log('ACCOOM property page initialized');
  });

})(window.Accoom);