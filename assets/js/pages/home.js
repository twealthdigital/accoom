/* ==========================================================================
   ACCOOM — Home Page
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    // Initialize hero animations
    Accoom.initHeroAnimations({
      offset: 50
    });

    // Initialize button animations
    Accoom.initButtonAnimations();

    // Initialize hero search dropdown
    var dropdown = document.querySelector('.hero-search-field .dropdown[data-dropdown]');
    if (dropdown) {
      Accoom.initDropdown(dropdown, {
        onSelect: function (value, text) {
          // Update hidden input
          var hidden = dropdown.querySelector('input[type="hidden"]');
          if (hidden) hidden.value = value;
        }
      });
    }

    // Location buttons (geolocation)
    var locateBtns = Accoom.$$('.hero-locate-btn');
    locateBtns.forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        Accoom.getUserLocation()
          .then(function (position) {
            // Handle location - update UI
            console.log('Location:', position);
          })
          .catch(function (error) {
            console.warn('Location error:', error.message);
          });
      });
    });

    // Quick search form
    var quickSearch = document.querySelector('.quick-search-bar');
    if (quickSearch) {
      Accoom.on(quickSearch, 'submit', function (e) {
        e.preventDefault();
        var input = this.querySelector('input');
        if (input && input.value.trim()) {
          // Handle search
          console.log('Search:', input.value.trim());
        }
      });
    }

    // Hero search form
    var heroSearch = document.querySelector('.hero-search');
    if (heroSearch) {
      Accoom.on(heroSearch, 'submit', function (e) {
        e.preventDefault();
        var location = this.querySelector('#hs-location');
        var type = this.querySelector('#hs-type');
        // Handle search
        console.log('Search:', {
          location: location ? location.value : '',
          type: type ? type.value : ''
        });
      });
    }


    // Popular accommodation scroll fade
    Accoom.$$('.popular-scroll').forEach(function (el) {
      Accoom.on(el, 'scroll', function () {
        el.classList.toggle('has-scrolled-left', el.scrollLeft > 4);
      });
    });

    // Popular search pills
    Accoom.$$('.pill').forEach(function (pill) {
      Accoom.on(pill, 'click', function (e) {
        e.preventDefault();
        var text = this.textContent.trim();
        // Populate search with pill text
        var quickInput = document.querySelector('.quick-search-bar input');
        if (quickInput) {
          quickInput.value = text;
          quickInput.focus();
        }
        console.log('Popular search:', text);
      });
    });



    // ============================================================
    // ALL LISTINGS (paginated grid)
    // ============================================================

    // Swap the inside of fetchPage() for a real API call when ready
    // (e.g. fetch('/api/properties?page=' + page + '&perPage=' + perPage))
    // — the return shape { items, total } is all the rendering code needs,
    // so nothing else below has to change.
    var PropertyService = (function () {
    var TYPES = {
        '2-bedroom-flat':   '2 Bedroom Flat',
        '3-bedroom-flat':   '3 Bedroom Flat',
        '4-bedroom-flat':   '4 Bedroom Flat',
        'commercial-space': 'Commercial Space',
        'land':             'Land',
        'hall':             'Hall'
      };

var AGENTS = [
        { name: 'DreamShelter',    verified: true,  rating: 4.6, reviews: 64,  online: true  },
        { name: 'UrbanSpace',      verified: true,  rating: 4.7, reviews: 98,  online: false },
        { name: 'City Stay',       verified: false, rating: 4.5, reviews: 45,  online: true  },
        { name: 'StayWell Agents', verified: true,  rating: 4.9, reviews: 210, online: true  },
        { name: 'Lekki Homes',     verified: true,  rating: 4.8, reviews: 147, online: false },
        { name: 'Comfort Homes',   verified: true,  rating: 4.8, reviews: 120, online: true  },
        { name: 'EasyRent NG',     verified: true,  rating: 4.6, reviews: 87,  online: false }
      ];

      var LOCATIONS = [
        'Ojodu, Lagos', 'Surulere, Lagos', 'Yaba, Lagos', 'Mushin, Lagos',
        'Lekki Phase 1, Lagos', 'Gbagada, Lagos', 'Abule Egba, Lagos',
        'Bariga, Lagos', 'Ogudu, Lagos', 'Victoria Island, Lagos',
        'Ketu, Lagos', 'Ajah, Lagos', 'Ipaja, Lagos', 'Isolo, Lagos',
        'Ikoyi, Lagos', 'Ikeja, Lagos', 'Egbeda, Lagos', 'Magodo, Lagos',
        'Maryland, Lagos', 'Oshodi, Lagos', 'Festac, Lagos', 'Apapa, Lagos',
        'Ilupeju, Lagos', 'Agege, Lagos', 'Alaba, Lagos'
      ];

      var typeKeys = Object.keys(TYPES);

// EDIT THESE 25 entries to match your real files.
      // Each listing owns an `images` array (2 images if it has a video, 3 if it doesn't)
      // plus an optional `video`. Video always plays as the first slide.
      var MEDIA = [
        { images: ['assets/images/home-properties/selfcon1.png','assets/images/home-properties/selfcon2.png','assets/images/home-properties/selfcon3.png'], video: null },
        { images: ['assets/images/home-properties/selfcon2.png','assets/images/home-properties/hall2.png'], video: 'assets/videos/home-properties/2bedroomflat.mp4' },
        { images: ['assets/images/home-properties/selfcon3.png','assets/images/home-properties/selfcon4.png','assets/images/home-properties/selfcon1.png'], video: null },
        { images: ['assets/images/home-properties/commercialspace.png','assets/images/home-properties/commercialspace2.png','assets/images/home-properties/land1.png'], video: null },
        { images: ['assets/images/home-properties/land2.png','assets/images/home-properties/land3.png','assets/images/home-properties/land1.png'], video: null },
        { images: ['assets/images/home-properties/hall3.png','assets/images/home-properties/hall2.png'], video: 'assets/videos/home-properties/selfcon2.mp4' },
        { images: ['assets/images/home-properties/selfcon2.png','assets/images/home-properties/selfcon3.png','assets/images/home-properties/selfcon4.png'], video: null },
        { images: ['assets/images/home-properties/miniflat1.png','assets/images/home-properties/singleroom3.png','assets/images/home-properties/bedroomflat3.png'], video: null },
        { images: ['assets/images/home-properties/bedroomflat3.png','assets/images/home-properties/bedroomflat4.png'], video: 'assets/videos/home-properties/miniflat3.mp4' },
        { images: ['assets/images/home-properties/commercialspace2.png','assets/images/home-properties/commercialspace.png','assets/images/home-properties/land2.png'], video: null },
        { images: ['assets/images/home-properties/land3.png','assets/images/home-properties/land1.png','assets/images/home-properties/land2.png'], video: null },
        { images: ['assets/images/home-properties/hall2.png','assets/images/home-properties/hall3.png','assets/images/home-properties/hall3.png'], video: null },
        { images: ['assets/images/home-properties/bedroomflat3.png','assets/images/home-properties/bedroomflat4.png','assets/images/home-properties/miniflat1.png'], video: null },
        { images: ['assets/images/home-properties/bedroomflat4.png','assets/images/home-properties/bedroomflat3.png','assets/images/home-properties/singleroom3.png'], video: null },
        { images: ['assets/images/home-properties/singleroom3.png','assets/images/home-properties/miniflat1.png'], video: 'assets/videos/home-properties/selfcon3.mp4' },
        { images: ['assets/images/home-properties/singleroom3.png','assets/images/home-properties/bedroomflat3.png','assets/images/home-properties/bedroomflat4.png'], video: null },
        { images: ['assets/images/home-properties/land1.png','assets/images/home-properties/land2.png','assets/images/home-properties/land3.png'], video: null },
        { images: ['assets/images/home-properties/hall3.png','assets/images/home-properties/hall2.png','assets/images/home-properties/hall3.png'], video: null },
        { images: ['assets/images/home-properties/selfcon4.png','assets/images/home-properties/selfcon1.png','assets/images/home-properties/selfcon2.png'], video: null },
        { images: ['assets/images/home-properties/selfcon3.png','assets/images/home-properties/selfcon4.png'], video: 'assets/videos/home-properties/selfcon3.mp4' },
        { images: ['assets/images/home-properties/bedroomflat3.png','assets/images/home-properties/miniflat1.png','assets/images/home-properties/singleroom3.png'], video: null },
        { images: ['assets/images/home-properties/commercialspace.png','assets/images/home-properties/land1.png','assets/images/home-properties/land2.png'], video: null },
        { images: ['assets/images/home-properties/land3.png','assets/images/home-properties/commercialspace2.png','assets/images/home-properties/hall2.png'], video: null },
        { images: ['assets/images/home-properties/hall2.png','assets/images/home-properties/hall3.png','assets/images/home-properties/bedroomflat4.png'], video: null },
        { images: ['assets/images/home-properties/selfcon2.png','assets/images/home-properties/selfcon1.png','assets/images/home-properties/selfcon3.png'], video: null }
      ];

      // Mock 25-item catalogue for now. In production this array goes away
      // entirely and fetchPage() below hits your real endpoint instead.
var ALL = [];
      for (var i = 0; i < 25; i++) {
        var type = typeKeys[i % typeKeys.length];
ALL.push({
          id: i + 1,
          images: MEDIA[i].images,
          video: MEDIA[i].video,
          typeKey: type,
          typeLabel: TYPES[type],
          name: TYPES[type] + ', ' + LOCATIONS[i % LOCATIONS.length],
          price: 120000 + (i % 10) * 35000,
          location: LOCATIONS[i % LOCATIONS.length],
          beds: 1,
          baths: 1,
          agent: AGENTS[i % AGENTS.length]
        });
      }

      function fetchPage(page, perPage) {
        var start = (page - 1) * perPage;
        var items = ALL.slice(start, start + perPage);
        return Promise.resolve({ items: items, total: ALL.length });
      }

      return { fetchPage: fetchPage };
    })();

    var listingsGrid = document.querySelector('[data-listings-grid]');
    var listingsPagination = document.querySelector('[data-listings-pagination]');

    if (listingsGrid && listingsPagination) {

      var currentPage = 1;
      var currentPerPage = getPerPage();

      function getPerPage() {
        var w = window.innerWidth;
        if (w >= 992) return 20; // desktop: 5 x 4
        if (w >= 768) return 16; // tablet: 4 x 4
        return 10;               // mobile: 2 x 5
      }

      function formatPrice(n) {
        return '₦' + n.toLocaleString('en-NG');
      }

      function mediaSlidesTemplate(item) {
        var html = '';
        if (item.video) {
          html += '<video class="media-slide is-active" src="' + item.video + '" muted loop autoplay playsinline preload="metadata" poster="' + item.images[0] + '" data-slide="0"></video>';
        }
        item.images.forEach(function (src, idx) {
          var slideIndex = item.video ? idx + 1 : idx;
          var activeClass = (!item.video && idx === 0) ? ' is-active' : '';
          html += '<img class="media-slide' + activeClass + '" src="' + src + '" alt="' + item.typeLabel + ' in ' + item.location + '" loading="lazy" data-slide="' + slideIndex + '" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.png\';" />';
        });
        return html;
      }

      function mediaNavTemplate() {
        return (
          '<button type="button" class="media-nav media-nav-prev" data-media-prev aria-label="Previous photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>' +
          '</button>' +
          '<button type="button" class="media-nav media-nav-next" data-media-next aria-label="Next photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
          '</button>'
        );
      }

      function mediaDotsTemplate(total) {
        var dots = '';
        for (var d = 0; d < total; d++) {
          dots += '<button type="button" class="media-dot' + (d === 0 ? ' is-active' : '') + '" data-dot="' + d + '" aria-label="View photo ' + (d + 1) + '"></button>';
        }
        return '<div class="media-dots">' + dots + '</div>';
      }

function cardTemplate(item) {
        var totalSlides = item.images.length + (item.video ? 1 : 0);
        return (
          '<article class="listing-card" data-listing-id="' + item.id + '" data-share-image="' + item.images[0] + '">' +
            '<div class="listing-card-media" data-media>' +
              mediaSlidesTemplate(item) +
              (totalSlides > 1 ? mediaNavTemplate() : '') +
              (totalSlides > 1 ? mediaDotsTemplate(totalSlides) : '') +
              '<span class="listing-tag">Available Now</span>' +
              '<button type="button" class="listing-save" aria-label="Save listing" data-save-listing>' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                  '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"></path>' +
                '</svg>' +
              '</button>' +
            '</div>' +
            '<div class="listing-card-body">' +
            '<p class="listing-name">' + item.name + '</p>' +
              '<p class="listing-price">' + formatPrice(item.price) + ' <small>/ year</small></p>' +
              '<p class="listing-location">' + item.location + '</p>' +
              '<div class="listing-meta">' +
                '<span>' + item.beds + ' Bed</span><span>' + item.baths + ' Bath</span>' +
'<button type="button" class="listing-share" aria-label="Share listing" data-share-listing>' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<circle cx="18" cy="5" r="3"></circle>' +
                    '<circle cx="6" cy="12" r="3"></circle>' +
                    '<circle cx="18" cy="19" r="3"></circle>' +
                    '<line x1="8.6" y1="10.6" x2="15.4" y2="6.4"></line>' +
                    '<line x1="8.6" y1="13.4" x2="15.4" y2="17.6"></line>' +
                  '</svg>' +
                '</button>' +
              '</div>' +
              '<div class="listing-agent">' +
                '<div class="listing-agent-id">' +
                  '<span class="listing-agent-avatar">' +
                    '<img src="assets/images/agent-images/agenticonimg.webp" alt="" loading="lazy" />' +
                    (item.agent.verified
                      ? '<svg class="listing-agent-verified" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 2.4 3.3-.4.6 3.3 3 1.6-1.6 3 1.6 3-3 1.6-.6 3.3-3.3-.4L12 22l-2.4-2.4-3.3.4-.6-3.3-3-1.6 1.6-3-1.6-3 3-1.6.6-3.3 3.3.4L12 2z"/></svg>'
                      : '') +
                  '</span>' +
                  '<span class="listing-agent-name">' + item.agent.name +
                    '<i class="listing-agent-status ' + (item.agent.online ? 'is-online' : 'is-offline') + '" aria-label="' + (item.agent.online ? 'Online' : 'Offline') + '"></i>' +
                  '</span>' +
                '</div>' +
                '<span class="listing-rating">' +
                  '<svg width="12" height="12" viewBox="0 0 24 24"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z"/></svg>' +
                  item.agent.rating + ' (' + item.agent.reviews + ')' +
                '</span>' +
              '</div>' +
            '</div>' +
          '</article>'
        );
      }

      function renderGrid(items) {
        listingsGrid.innerHTML = items.map(cardTemplate).join('');
      }

      function renderPagination(page, totalPages) {
        if (totalPages <= 1) { listingsPagination.innerHTML = ''; return; }

        var html = '<button type="button" data-page="prev" ' + (page === 1 ? 'disabled' : '') + ' aria-label="Previous page">‹</button>';
        for (var p = 1; p <= totalPages; p++) {
          html += '<button type="button" class="' + (p === page ? 'is-active' : '') + '" data-page="' + p + '">' + p + '</button>';
        }
        html += '<button type="button" data-page="next" ' + (page === totalPages ? 'disabled' : '') + ' aria-label="Next page">›</button>';

        listingsPagination.innerHTML = html;
      }

      function loadPage(page) {
        var perPage = getPerPage();
        PropertyService.fetchPage(page, perPage).then(function (res) {
          var totalPages = Math.max(1, Math.ceil(res.total / perPage));
          currentPage = Math.min(page, totalPages);
          renderGrid(res.items);
          renderPagination(currentPage, totalPages);
        });
      }

      listingsPagination.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (!btn || btn.disabled) return;

        var target = btn.getAttribute('data-page');
        if (target === 'prev') target = currentPage - 1;
        else if (target === 'next') target = currentPage + 1;
        else target = parseInt(target, 10);

        loadPage(target);
        listingsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });


      function setActiveSlide(mediaEl, index) {
        var slides = Accoom.$$('.media-slide', mediaEl);
        slides.forEach(function (s, i) {
          var active = i === index;
          s.classList.toggle('is-active', active);
          if (s.tagName === 'VIDEO') {
            if (active) { s.play && s.play().catch(function () {}); }
            else { s.pause(); }
          }
        });
        Accoom.$$('.media-dot', mediaEl).forEach(function (d, i) {
          d.classList.toggle('is-active', i === index);
        });
      }

      Accoom.delegate(listingsGrid, 'click', '[data-dot]', function (e) {
        e.preventDefault();
        e.stopPropagation();
        setActiveSlide(this.closest('[data-media]'), parseInt(this.getAttribute('data-dot'), 10));
      });

      Accoom.delegate(listingsGrid, 'click', '[data-media-prev]', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var mediaEl = this.closest('[data-media]');
        var slides = Accoom.$$('.media-slide', mediaEl);
        var current = slides.findIndex(function (s) { return s.classList.contains('is-active'); });
        setActiveSlide(mediaEl, (current - 1 + slides.length) % slides.length);
      });

      Accoom.delegate(listingsGrid, 'click', '[data-media-next]', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var mediaEl = this.closest('[data-media]');
        var slides = Accoom.$$('.media-slide', mediaEl);
        var current = slides.findIndex(function (s) { return s.classList.contains('is-active'); });
        setActiveSlide(mediaEl, (current + 1) % slides.length);
      });

      var resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          var newPerPage = getPerPage();
          if (newPerPage !== currentPerPage) {
            currentPerPage = newPerPage;
            loadPage(1);
          }
        }, 200);
      });

      loadPage(1);
    }



    // ============================================================
    // SHARE MODAL — bounce-in dialog opened by the share icon on each card
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
            '<video data-share-preview-video muted playsinline preload="metadata"></video>' +
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
      var previewVideo = modal.querySelector('[data-share-preview-video]');
      var previewName = modal.querySelector('[data-share-preview-name]');
      var previewMeta = modal.querySelector('[data-share-preview-meta]');
      var linkInput = modal.querySelector('[data-share-link-input]');
      var copyBtn = modal.querySelector('[data-share-copy]');
      var copyLabel = modal.querySelector('[data-share-copy-label]');

function openModal(data) {
        if (data.video) {
          previewVideo.poster = data.image;
          previewVideo.src = data.video;
          previewVideo.load();
          previewVideo.style.display = 'block';
          previewImg.style.display = 'none';
        } else {
          previewVideo.pause();
          previewVideo.removeAttribute('src');
          previewVideo.load();
          previewVideo.style.display = 'none';
          previewImg.src = data.image;
          previewImg.style.display = 'block';
        }
        previewName.textContent = data.name;
        previewMeta.textContent = data.price + ' · ' + data.location;

        var shareUrl = window.location.origin + window.location.pathname + '#listing-' + data.id;
        linkInput.value = shareUrl;

        var shareText = encodeURIComponent(data.name + ' - ' + data.price + ' · ' + data.location);
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
        previewVideo.pause();
      }

Accoom.delegate(document, 'click', '[data-share-listing]', function (e) {
        e.preventDefault();
        var card = this.closest('.listing-card');
        if (!card) return;

var nameEl = card.querySelector('.listing-name');
        var priceEl = card.querySelector('.listing-price');
        var locationEl = card.querySelector('.listing-location');

        openModal({
          id: card.getAttribute('data-listing-id') || '',
          name: nameEl ? nameEl.textContent.trim() : '',
          price: priceEl ? priceEl.textContent.trim() : '',
          location: locationEl ? locationEl.textContent.trim() : '',
          image: card.getAttribute('data-share-image') || '',
          video: ''
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
          setTimeout(function () { copyLabel.textContent = 'Copy'; }, 1500);
        });
      });
    })();

    console.log('Home page initialized');
  });

})(window.Accoom);