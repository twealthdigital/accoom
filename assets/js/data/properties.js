/* ==========================================================================
   ACCOOM — Shared Property Data Service
   Every page reads listings through Accoom.PropertyService. Swap the
   inside of fetchPage() for a real API call when ready, the return
   shape { items, total } is all the rendering code needs.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var TYPES = {
    '2-bedroom-flat':   '2 Bedroom Flat',
    '3-bedroom-flat':   '3 Bedroom Flat',
    '4-bedroom-flat':   '4 Bedroom Flat',
    'commercial-space': 'Commercial Space',
    'land':             'Land',
    'hall':             'Hall'
  };

  var AGENTS = [
    { name: 'DreamShelter',    verified: true,  rating: 4.6, reviews: 64,  online: true,  level: 'AL1' },
    { name: 'UrbanSpace',      verified: true,  rating: 4.7, reviews: 98,  online: false, level: 'AL2' },
    { name: 'City Stay',       verified: false, rating: 4.5, reviews: 45,  online: true,  level: 'AL3' },
    { name: 'StayWell Agents', verified: true,  rating: 4.9, reviews: 210, online: true,  level: 'AL4' },
    { name: 'Lekki Homes',     verified: true,  rating: 4.8, reviews: 147, online: false, level: 'AL5' },
    { name: 'Comfort Homes',   verified: true,  rating: 4.8, reviews: 120, online: true,  level: 'AL1' },
    { name: 'EasyRent NG',     verified: true,  rating: 4.6, reviews: 87,  online: false, level: 'AL2' }
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
      price: 120000 + (i % 10) * 85000,
      location: LOCATIONS[i % LOCATIONS.length],
      beds: (i % 4) + 1,
      baths: 1,
      agent: AGENTS[i % AGENTS.length]
    });
  }

  // Typo tolerant matcher. Tries an exact substring first (fast path),
  // then falls back to per word edit distance so a misspelt token like
  // "bouy" still finds "boy". Allowance scales with word length so
  // short words don't match too loosely.
  function levenshtein(a, b) {
    var m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    var row = [];
    for (var j = 0; j <= n; j++) row[j] = j;
    for (var i = 1; i <= m; i++) {
      var prev = row[0];
      row[0] = i;
      for (var k = 1; k <= n; k++) {
        var temp = row[k];
        row[k] = a.charAt(i - 1) === b.charAt(k - 1)
          ? prev
          : Math.min(prev, row[k], row[k - 1]) + 1;
        prev = temp;
      }
    }
    return row[n];
  }

  function fuzzyMatch(hay, query) {
    if (!query) return true;
    if (hay.indexOf(query) !== -1) return true;
    var hayWords = hay.split(/\s+/);
    var queryWords = query.split(/\s+/);
    return queryWords.every(function (qw) {
      if (!qw) return true;
      var maxDist = qw.length <= 4 ? 1 : qw.length <= 7 ? 2 : 3;
      return hayWords.some(function (hw) {
        return hw.indexOf(qw) !== -1 || levenshtein(qw, hw) <= maxDist;
      });
    });
  }

  // sortBy: 'nearby' | 'newest' | 'online' | 'verified'
  // filters: { priceMin, priceMax, levels: [], beds: [], verifiedOnly, onlineOnly }
  function fetchPage(page, perPage, sortBy, filters) {
    var list = ALL.slice();
    filters = filters || {};

    if (filters.priceMin != null) {
      list = list.filter(function (item) { return item.price >= filters.priceMin; });
    }
    if (filters.priceMax != null) {
      list = list.filter(function (item) { return item.price <= filters.priceMax; });
    }
    if (filters.levels && filters.levels.length) {
      list = list.filter(function (item) { return filters.levels.indexOf(item.agent.level) !== -1; });
    }
    if (filters.beds && filters.beds.length) {
      list = list.filter(function (item) {
        var b = item.beds >= 4 ? 4 : item.beds;
        return filters.beds.indexOf(b) !== -1;
      });
    }
    if (filters.verifiedOnly) {
      list = list.filter(function (item) { return item.agent.verified; });
    }
    if (filters.onlineOnly) {
      list = list.filter(function (item) { return item.agent.online; });
    }
    if (filters.search) {
      var q = filters.search.trim().toLowerCase();
      list = list.filter(function (item) {
        var hay = (item.name + ' ' + item.location + ' ' + item.typeLabel + ' ' + item.agent.name).toLowerCase();
        return fuzzyMatch(hay, q);
      });
    }

    if (sortBy === 'online') {
      list.sort(function (a, b) { return (b.agent.online ? 1 : 0) - (a.agent.online ? 1 : 0); });
    } else if (sortBy === 'verified') {
      list.sort(function (a, b) { return (b.agent.verified ? 1 : 0) - (a.agent.verified ? 1 : 0); });
    } else if (sortBy === 'nearby') {
      list.sort(function (a, b) { return a.id - b.id; });
    } else {
      list.sort(function (a, b) { return b.id - a.id; });
    }

    var start = (page - 1) * perPage;
    var items = list.slice(start, start + perPage);
    return Promise.resolve({ items: items, total: list.length });
  }

  function getById(id) {
    var found = null;
    ALL.forEach(function (item) {
      if (String(item.id) === String(id)) found = item;
    });
    return found;
  }

  function getAll() {
    return ALL.slice();
  }

  function searchList(list, query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return { items: list.slice(), total: list.length };
    var items = list.filter(function (item) {
      var hay = (item.name + ' ' + item.location + ' ' + item.typeLabel + ' ' + item.agent.name).toLowerCase();
      return fuzzyMatch(hay, q);
    });
    return { items: items, total: items.length };
  }

  Accoom.PropertyService = { fetchPage: fetchPage, getById: getById, getAll: getAll, searchList: searchList };

})(window.Accoom);