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

  // Land is sold outright, not rented — no "/ year". Everything else is
  // rented; cheaper places are billed monthly, pricier ones yearly.
  function getPriceLabel(typeKey, price) {
    if (typeKey === 'land') return 'For Sale';
    return price < 400000 ? '/ month' : '/ year';
  }
  Accoom.getPriceLabel = getPriceLabel;

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
    var price = 120000 + (i % 10) * 85000;
    ALL.push({
      id: i + 1,
      images: MEDIA[i].images,
      video: MEDIA[i].video,
      typeKey: type,
      typeLabel: TYPES[type],
      name: TYPES[type] + ', ' + LOCATIONS[i % LOCATIONS.length],
      price: price,
      priceLabel: getPriceLabel(type, price),
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

  // Words that carry no search meaning on their own ("room in abuja" ->
  // "in" should never block a match).
  var STOPWORDS = {
    'in': 1, 'at': 1, 'on': 1, 'for': 1, 'of': 1, 'to': 1, 'near': 1,
    'around': 1, 'close': 1, 'a': 1, 'an': 1, 'the': 1, 'with': 1,
    'and': 1, 'or': 1, 'is': 1, 'are': 1, 'me': 1, 'i': 1, 'want': 1,
    'need': 1, 'looking': 1, 'find': 1, 'show': 1, 'please': 1, 'any': 1,
    'some': 1, 'available': 1, 'house': 1, 'houses': 1, 'apartment': 1,
    'apartments': 1, 'property': 1, 'properties': 1
  };

  // Loose aliases so slang/abbreviations still hit the real labels/locations
  // (e.g. "selfcon" -> "self contained", "2bed" -> "2 bedroom").
  var SYNONYMS = {
    'selfcon': ['self', 'contained', 'con'],
    'self-con': ['self', 'contained', 'con'],
    'self-contained': ['self', 'contained'],
    'selfcontained': ['self', 'contained'],
    'contain': ['contained'],
    'sc': ['self', 'contained'],
    'miniflat': ['mini', 'flat'],
    'mini-flat': ['mini', 'flat'],
    'singleroom': ['single', 'room'],
    'single-room': ['single', 'room'],
    'flat': ['flat', 'apartment'],
    'duplex': ['duplex', 'house'],
    'shop': ['commercial', 'space'],
    'store': ['commercial', 'space'],
    'office': ['commercial', 'space'],
    'plot': ['land'],
    '1bed': ['1', 'bedroom'],
    '2bed': ['2', 'bedroom'],
    '3bed': ['3', 'bedroom'],
    '4bed': ['4', 'bedroom'],
    'bq': ['boys', 'quarters']
  };

  // Turns "150k" / "1.2m" / "150000" into a plain number.
  function parseAmount(token) {
    var m = /^([\d,.]+)(k|m)?$/i.exec(token);
    if (!m) return null;
    var num = parseFloat(m[1].replace(/,/g, ''));
    if (isNaN(num)) return null;
    if (/k/i.test(m[2])) num *= 1000;
    if (/m/i.test(m[2])) num *= 1000000;
    return num;
  }

  // Pulls any price/amount hint out of the sentence (handles
  // "under 200k", "above 150000", "between 100k and 300k", or a bare
  // number) and returns { min, max } bounds, or null if no amount found.
  function extractPriceIntent(query) {
    var words = query.split(/\s+/);
    var amounts = [];
    var wantsMax = /\b(under|below|less|max|maximum|cheap|budget)\b/.test(query);
    var wantsMin = /\b(above|over|more|min|minimum)\b/.test(query);
    words.forEach(function (w) {
      var amt = parseAmount(w.replace(/[^\d.km]/gi, ''));
      if (amt != null && amt > 0) amounts.push(amt);
    });
    if (!amounts.length) return null;
    if (amounts.length >= 2) {
      return { min: Math.min(amounts[0], amounts[1]), max: Math.max(amounts[0], amounts[1]) };
    }
    var amt = amounts[0];
    if (wantsMax) return { min: null, max: amt };
    if (wantsMin) return { min: amt, max: null };
    // Bare figure with no "under/over" cue: treat it as an approximate
    // target, tolerant to +/-35% either side.
    return { min: amt * 0.65, max: amt * 1.35 };
  }

  function tokenMatchesHay(token, hayWords) {
    var maxDist = token.length <= 3 ? 0 : token.length <= 5 ? 1 : token.length <= 8 ? 2 : 3;
    return hayWords.some(function (hw) {
      return hw.indexOf(token) !== -1 || token.indexOf(hw) !== -1 || levenshtein(token, hw) <= maxDist;
    });
  }

  // Checks one query token against the haystack, expanding it through
  // SYNONYMS first so "selfcon"/"2bed"/"bq" etc. still connect to the
  // real labels stored on the item.
  function meaningfulTokenMatches(token, hayWords) {
    if (tokenMatchesHay(token, hayWords)) return true;
    var alts = SYNONYMS[token];
    if (!alts) return false;
    return alts.some(function (alt) { return tokenMatchesHay(alt, hayWords); });
  }

  // Full-sentence matcher: understands that a query is really made of a
  // property name/type, a location, and/or a price, in any order, mixed
  // in with ordinary sentence words.
  function matchesQuery(item, rawQuery) {
    var query = (rawQuery || '').trim().toLowerCase();
    if (!query) return true;

    var hay = (item.name + ' ' + item.location + ' ' + item.typeLabel + ' ' + item.agent.name).toLowerCase();
    if (hay.indexOf(query) !== -1) return true;
    var hayWords = hay.split(/\s+/);

    var priceIntent = extractPriceIntent(query);
    if (priceIntent) {
      if (priceIntent.min != null && item.price < priceIntent.min) return false;
      if (priceIntent.max != null && item.price > priceIntent.max) return false;
    }

    var tokens = query.split(/[^a-z0-9]+/).filter(function (t) {
      if (!t) return false;
      if (STOPWORDS[t]) return false;
      if (parseAmount(t) != null) return false; // already handled as price
      return true;
    });

    if (!tokens.length) return true; // query was only stopwords/price, price check above already applied

    var matched = 0;
    tokens.forEach(function (t) {
      if (meaningfulTokenMatches(t, hayWords)) matched++;
    });

    // Require most of the meaningful words to line up (not literally all),
    // so one odd/misspelled word in a sentence doesn't zero out real matches.
    var required = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
    return matched >= required;
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
      list = list.filter(function (item) { return matchesQuery(item, filters.search); });
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
    var q = (query || '').trim();
    if (!q) return { items: list.slice(), total: list.length };
    var items = list.filter(function (item) { return matchesQuery(item, q); });
    return { items: items, total: items.length };
  }

  Accoom.PropertyService = { fetchPage: fetchPage, getById: getById, getAll: getAll, searchList: searchList };

})(window.Accoom);