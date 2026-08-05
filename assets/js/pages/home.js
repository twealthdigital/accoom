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
        { name: 'DreamShelter',    verified: true,  rating: 4.6, reviews: 64  },
        { name: 'UrbanSpace',      verified: true,  rating: 4.7, reviews: 98  },
        { name: 'City Stay',       verified: false, rating: 4.5, reviews: 45  },
        { name: 'StayWell Agents', verified: true,  rating: 4.9, reviews: 210 },
        { name: 'Lekki Homes',     verified: true,  rating: 4.8, reviews: 147 },
        { name: 'Comfort Homes',   verified: true,  rating: 4.8, reviews: 120 },
        { name: 'EasyRent NG',     verified: true,  rating: 4.6, reviews: 87  }
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

      // EDIT THESE 25 NAMES to match your real files in assets/images/home-properties/
      var IMAGES = [
        'assets/images/home-properties/selfcon1.png',
        'assets/images/home-properties/selfcon2.png',//not working
        'assets/images/home-properties/selfcon2.png',
        'assets/images/home-properties/commercialspace.png',
        'assets/images/home-properties/selfcon2.png',
        'assets/images/home-properties/hall-1.jpg',
        'assets/images/home-properties/land2.png',
        'assets/images/home-properties/miniflat1.png',
        'assets/images/home-properties/4-bedroom-flat-2.jpg',
        'assets/images/home-properties/commercialspace2.png',
        'assets/images/home-properties/land3.png',
        'assets/images/home-properties/hall-2.jpg',
        'assets/images/home-properties/2-bedroom-flat-3.jpg',
        'assets/images/home-properties/3-bedroom-flat-3.jpg',
        'assets/images/home-properties/4-bedroom-flat-3.jpg',
        'assets/images/home-properties/commercial-space-3.jpg',
        'assets/images/home-properties/land-3.jpg',
        'assets/images/home-properties/hall-3.jpg',
        'assets/images/home-properties/2-bedroom-flat-4.jpg',
        'assets/images/home-properties/3-bedroom-flat-4.jpg',
        'assets/images/home-properties/4-bedroom-flat-4.jpg',
        'assets/images/home-properties/commercial-space-4.jpg',
        'assets/images/home-properties/land-4.jpg',
        'assets/images/home-properties/hall-4.jpg',
        'assets/images/home-properties/2-bedroom-flat-5.jpg'
      ];

      // EDIT THESE to add a video for that listing (same order as IMAGES above), or leave null
var VIDEOS = [
        null,
        'assets/videos/home-properties/2bedroomflat.mp4',
        'assets/videos/home-properties/2bedroomflat.mp',
        'assets/videos/home-properties/2bedroomflat.mp',
        'assets/videos/home-properties/2bedroomflat.mp',
        'assets/videos/home-properties/selfcon2.mp4',
        'assets/videos/home-properties/selfcon2.mp',
        'assets/videos/home-properties/selfcon2.mp',
        'assets/videos/home-properties/miniflat3.mp4',
        null, null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null, null, null, null, null, null
      ];

      // Mock 25-item catalogue for now. In production this array goes away
      // entirely and fetchPage() below hits your real endpoint instead.
var ALL = [];
      for (var i = 0; i < 25; i++) {
        var type = typeKeys[i % typeKeys.length];
        ALL.push({
          id: i + 1,
          image: IMAGES[i],
          video: VIDEOS[i],
          typeKey: type,
          typeLabel: TYPES[type],
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

      function cardTemplate(item) {
        return (
          '<article class="listing-card" data-listing-id="' + item.id + '">' +
            '<div class="listing-card-media">' +
(item.video
                ? '<video src="' + item.video + '" muted loop autoplay playsinline preload="metadata" poster="' + item.image + '"></video>'
                : '<img src="' + item.image + '" alt="' + item.typeLabel + ' in ' + item.location + '" loading="lazy" />'
              ) +
              '<span class="listing-badge" data-type="' + item.typeKey + '">' + item.typeLabel + '</span>' +
              '<button type="button" class="listing-save" aria-label="Save listing" data-save-listing>' +
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                  '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"></path>' +
                '</svg>' +
              '</button>' +
            '</div>' +
            '<div class="listing-card-body">' +
              '<p class="listing-price">' + formatPrice(item.price) + ' <small>/ year</small></p>' +
              '<p class="listing-location">' + item.location + '</p>' +
              '<div class="listing-meta"><span>' + item.beds + ' Bed</span><span>' + item.baths + ' Bath</span></div>' +
              '<div class="listing-agent">' +
                '<span class="listing-agent-name">' + item.agent.name +
                  (item.agent.verified
                    ? ' <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 2.4 3.3-.4.6 3.3 3 1.6-1.6 3 1.6 3-3 1.6-.6 3.3-3.3-.4L12 22l-2.4-2.4-3.3.4-.6-3.3-3-1.6 1.6-3-1.6-3 3-1.6.6-3.3 3.3.4L12 2z"/></svg>'
                    : '') +
                '</span>' +
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



    console.log('Home page initialized');
  });

})(window.Accoom);