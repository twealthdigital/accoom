/* ==========================================================================
   ACCOOM — Content Guard
   --------------------------------------------------------------------------
   Decides whether a piece of text contains something that isn't allowed in
   a listing. Two sources feed it:

     1. The editable list in data/blocked-terms.js (social media, payment
        terms, "contact me" wording). Nothing is hardcoded here.
     2. The Obscenity library (vendor/obscenity.bundle.js) for foul language.

   Every term is matched no matter how it is disguised:
     fac---------e----boo----k     symbols/spaces between letters
     F A C E B O O K               spacing
     faceb@@k / f4c3b00k           look-alike characters (@ counts as a or o)
     faaaceboooook                 stretched letters
     callmeonwhatsapp              glued to other words (unless wholeWord)

   Accoom.ContentGuard.scan(text)
     -> null when the text is clean, otherwise
        { match, label, kind }   match = the exact piece the person typed,
                                 kind  = 'social' | 'payment' | 'contact' |
                                         'profanity' | 'other'
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var MAX_LEN = 4000;
  var SEP = '[\\W_]*'; // any run of symbols/spaces between two letters

  // Characters people swap in for a letter. Each letter matches itself
  // plus its look-alikes ('@' is offered for both a and o).
  var LOOKALIKE = {
    a: '[a4@]', b: '[b8]', e: '[e3]', g: '[g9]', i: '[i1!|l]', l: '[l1|i]',
    o: '[o0@]', s: '[s5$]', t: '[t7+]'
  };

  var KINDS = {
    social:    { label: 'a social media reference' },
    payment:   { label: 'payment wording' },
    contact:   { label: 'off-platform contact wording' },
    profanity: { label: 'inappropriate language' },
    other:     { label: 'a prohibited term' }
  };

  var cache = { version: -1, rules: [] };

  function keyOf(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function escapeRe(c) { return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function buildRule(entry) {
    var key = keyOf(entry.term);
    if (!key) return null;
    var parts = [];
    for (var i = 0; i < key.length; i++) {
      var ch = key.charAt(i);
      parts.push((LOOKALIKE[ch] || escapeRe(ch)) + '+');
    }
    var core = parts.join(SEP);
    // wholeWord: must start and end on a word edge in what the person typed.
    var src = entry.wholeWord ? '(^|[^a-z0-9])(' + core + ')(?![a-z0-9])' : '()(' + core + ')';
    var category = KINDS[entry.category] ? entry.category : 'other';
    return { re: new RegExp(src, 'gi'), ignoreNearDigits: !!entry.ignoreNearDigits, category: category };
  }

  function rules() {
    var api = Accoom.BlockedTerms;
    if (!api) return [];
    var v = api.version();
    if (cache.version !== v) {
      cache.rules = api.list().map(buildRule).filter(Boolean);
      cache.version = v;
    }
    return cache.rules;
  }

  function nearestNonSpace(text, from, step) {
    for (var i = from; i >= 0 && i < text.length; i += step) {
      if (!/\s/.test(text.charAt(i))) return text.charAt(i);
    }
    return '';
  }

  function scanTerms(text) {
    var list = rules();
    for (var r = 0; r < list.length; r++) {
      var rule = list[r];
      var m;
      rule.re.lastIndex = 0;
      while ((m = rule.re.exec(text))) {
        var start = m.index + m[1].length;
        var end = start + m[2].length;
        var skip = false;
        if (rule.ignoreNearDigits) {
          skip = /\d/.test(nearestNonSpace(text, start - 1, -1)) || /\d/.test(nearestNonSpace(text, end, 1));
        }
        if (!skip) return { match: m[2], label: KINDS[rule.category].label, kind: rule.category };
        if (rule.re.lastIndex === m.index) rule.re.lastIndex++;
      }
    }
    return null;
  }

  function scanProfanity(text) {
    var lib = window.AccoomProfanity;
    if (!lib || typeof lib.find !== 'function') return null;
    var hits;
    try { hits = lib.find(text); } catch (e) { return null; }
    var allow = {};
    var api = Accoom.BlockedTerms;
    (api ? api.allowList() : []).forEach(function (w) { allow[keyOf(w)] = true; });
    for (var i = 0; i < hits.length; i++) {
      if (allow[keyOf(hits[i])]) continue;
      return { match: hits[i], label: KINDS.profanity.label, kind: 'profanity' };
    }
    return null;
  }

  Accoom.ContentGuard = {
    scan: function (text) {
      if (!text) return null;
      var t = String(text).slice(0, MAX_LEN);
      return scanTerms(t) || scanProfanity(t);
    }
  };
})(window.Accoom);