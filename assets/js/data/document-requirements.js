/* ==========================================================================
   ACCOOM — Property document requirements (Stage 2)
   --------------------------------------------------------------------------
   Decides WHICH documents a listing needs. The list changes with:
     - the listing type (rent or sale)
     - the property type (e.g. "Land / Plot" has no building approval)
     - who is listing (owner, or someone acting for the owner)
     - overrides saved by an administrator (demo mode, see below)

   Levels:
     required    must be uploaded before the listing can be submitted
     applicable  "Required where applicable": only blocks when its condition
                 is true (e.g. Power of Attorney when selling for someone else)
     optional    never blocks
     hidden      not shown for this property

   No single title document is mandatory for every sale. Instead the sale set
   asks for AT LEAST ONE title document (C of O, Deed of Assignment,
   Governor's Consent or a land registry search).

   Accoom.DocRequirements.forListing(type, propertyTypeLabel, answers) -> { items, groups, questions }
   Accoom.DocRequirements.evaluate(type, label, answers, docs)         -> readiness report
   Accoom.DocRequirements.setOverride(actor, override)                 -> admin only (demo mode)

   Honest limit: overrides are stored in this browser only and the "admin"
   role is a local demonstration role, not real authentication.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var CONFIG_KEY = 'accoom-doc-requirements-config';
  var LEVELS = ['required', 'applicable', 'optional', 'hidden'];
  var ADDITIONAL = 'additional_supporting';

  /* ----------------------------------------------------------- definitions */
  // critical: replacing this document sends an approved listing back to review.
  var DEFS = {
    rent: [
      { id: 'ownership_or_authorization', label: 'Evidence of property ownership or landlord authorization', level: 'required', critical: true,
        help: 'For example a title document, a utility bill in the landlord\u2019s name, or a signed letter from the landlord allowing you to let the property.' },
      { id: 'agent_authorization', label: 'Agent authorization or property management agreement', level: 'applicable', critical: true,
        requiredIf: { representation: 'agent' },
        help: 'Needed when you are listing for the landlord and are not the owner.' },
      { id: 'rent_receipt', label: 'Existing property payment receipt or receipt template', level: 'optional',
        help: 'A receipt the landlord or agent normally issues, or a template you plan to use.' },
      { id: 'tenancy_agreement', label: 'Tenancy agreement template or proposed agreement', level: 'optional',
        help: 'Upload it if you already have one. You can prepare it later.' },
      { id: 'inventory_report', label: 'Property inventory or condition report', level: 'applicable',
        help: 'Useful for furnished properties. Not blocking.' },
      { id: ADDITIONAL, label: 'Additional supporting documents', level: 'optional', multiple: true,
        help: 'Anything else that helps ACCOOM review the property.' }
    ],
    sale: [
      { id: 'certificate_of_occupancy', label: 'Certificate of Occupancy (C of O)', level: 'applicable', critical: true, group: 'title',
        help: 'Where the land has one.' },
      { id: 'deed_of_assignment', label: 'Deed of Assignment', level: 'applicable', critical: true, group: 'title',
        help: 'Where the property was transferred to the current owner by deed.' },
      { id: 'governors_consent', label: 'Governor\u2019s Consent', level: 'applicable', critical: true, group: 'title',
        help: 'Where the title requires the State Governor\u2019s consent.' },
      { id: 'land_registry_search', label: 'Land registry or title search evidence', level: 'applicable', critical: true, group: 'title',
        help: 'A search result from the relevant land registry, where available.' },
      { id: 'survey_plan', label: 'Survey Plan', level: 'required', critical: true,
        help: 'A survey plan showing the boundaries and size of the property.' },
      { id: 'building_approval', label: 'Building approval', level: 'applicable',
        help: 'Planning or building permit for the structure, where applicable.' },
      { id: 'seller_ownership_proof', label: 'Seller\u2019s proof of ownership or authorization', level: 'required', critical: true,
        help: 'Shows the person selling is the owner, or is allowed to sell for the owner.' },
      { id: 'power_of_attorney', label: 'Power of Attorney', level: 'applicable', critical: true,
        requiredIf: { representation: 'representative' },
        help: 'Needed when you are selling on behalf of the owner.' },
      { id: 'previous_receipts', label: 'Previous purchase or title receipts', level: 'applicable',
        help: 'Receipts from earlier purchases of the property, where available.' },
      { id: ADDITIONAL, label: 'Additional supporting documents', level: 'optional', multiple: true,
        help: 'Anything else that helps ACCOOM review the property.' }
    ]
  };

  var GROUPS = {
    rent: [],
    sale: [{ id: 'title', min: 1, label: 'At least one title document',
      help: 'Upload at least one of: C of O, Deed of Assignment, Governor\u2019s Consent or a land registry search.' }]
  };

  var QUESTIONS = {
    rent: { id: 'representation', label: 'Who is listing this property?',
      options: [{ value: 'owner', label: 'I am the owner / landlord' }, { value: 'agent', label: 'I am an agent or manager acting for the owner' }], defaultValue: 'owner' },
    sale: { id: 'representation', label: 'Who is selling this property?',
      options: [{ value: 'owner', label: 'I am the owner / seller' }, { value: 'representative', label: 'I am selling on behalf of the owner' }], defaultValue: 'owner' }
  };

  // Built-in property-type adjustments (administrators can add more).
  var TYPE_RULES = [
    { match: /land|plot/i, listingType: 'sale', hide: ['building_approval'] },
    { match: /land|plot/i, listingType: 'rent', hide: ['inventory_report'] }
  ];

  /* ---------------------------------------------------------------- config */
  function readConfig() {
    try {
      var raw = window.localStorage.getItem(CONFIG_KEY);
      var c = raw ? JSON.parse(raw) : null;
      if (c && typeof c === 'object' && Array.isArray(c.overrides)) return c;
    } catch (e) { /* fall through */ }
    return { version: 1, overrides: [] };
  }
  function writeConfig(c) {
    try { window.localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
  }
  function fail(code, message) { var e = new Error(message); e.code = code; return e; }

  // override: { listingType, docType, level, propertyType? (substring, optional) }
  function setOverride(actor, override) {
    if (!actor || actor.role !== 'admin') throw fail('forbidden', 'Only an administrator can change document requirements.');
    override = override || {};
    if (['rent', 'sale'].indexOf(override.listingType) === -1) throw fail('bad_input', 'Choose rent or sale.');
    if (LEVELS.indexOf(override.level) === -1) throw fail('bad_input', 'Unknown requirement level.');
    var known = DEFS[override.listingType].some(function (d) { return d.id === override.docType; });
    if (!known) throw fail('bad_input', 'Unknown document type for this listing type.');
    if (override.docType === ADDITIONAL && override.level !== 'optional') throw fail('bad_input', 'Additional supporting documents are always optional.');
    var cfg = readConfig();
    var ptype = String(override.propertyType || '').trim().toLowerCase();
    cfg.overrides = cfg.overrides.filter(function (o) {
      return !(o.listingType === override.listingType && o.docType === override.docType && (o.propertyType || '') === ptype);
    });
    cfg.overrides.push({ listingType: override.listingType, docType: override.docType, level: override.level, propertyType: ptype,
      by: actor.id || 'admin', at: new Date().toISOString() });
    if (!writeConfig(cfg)) throw fail('storage', 'The change could not be saved in this browser.');
    if (Accoom.Records && Accoom.Records.audit) {
      Accoom.Records.audit({ actorId: actor.id || 'admin', actorRole: 'admin', action: 'requirements.override', entityType: 'requirements',
        entityId: override.listingType + ':' + override.docType, detail: { level: override.level, propertyType: ptype } }).catch(function () {});
    }
    return cfg;
  }
  function resetOverrides(actor) {
    if (!actor || actor.role !== 'admin') throw fail('forbidden', 'Only an administrator can change document requirements.');
    writeConfig({ version: 1, overrides: [] });
  }

  /* ------------------------------------------------------------ resolution */
  function normType(t) { return t === 'sale' ? 'sale' : 'rent'; }

  function forListing(listingType, propertyTypeLabel, answers) {
    var type = normType(listingType);
    var label = String(propertyTypeLabel || '');
    answers = answers || {};
    var cfg = readConfig();
    var hidden = {};
    TYPE_RULES.forEach(function (r) { if (r.listingType === type && r.match.test(label)) r.hide.forEach(function (id) { hidden[id] = true; }); });

    var items = DEFS[type].map(function (d) {
      var level = d.level;
      if (hidden[d.id]) level = 'hidden';
      // administrator overrides: a property-type specific one beats a general one
      var general = null, specific = null;
      cfg.overrides.forEach(function (o) {
        if (o.listingType !== type || o.docType !== d.id) return;
        if (!o.propertyType) general = o;
        else if (label.toLowerCase().indexOf(o.propertyType) !== -1) specific = o;
      });
      var ov = specific || general;
      if (ov) level = ov.level;

      var conditionMet = !d.requiredIf || Object.keys(d.requiredIf).every(function (k) {
        return (answers[k] || QUESTIONS[type].defaultValue) === d.requiredIf[k];
      });
      var blocking = level === 'required' || (level === 'applicable' && !!d.requiredIf && conditionMet);
      var badge = level === 'required' ? 'Required'
        : level === 'optional' ? 'Optional'
        : (d.requiredIf && conditionMet) ? 'Required for your listing'
        : 'Required where applicable';
      if (level === 'applicable' && !d.requiredIf) badge = 'Required where applicable';
      return { id: d.id, label: d.label, help: d.help, level: level, blocking: blocking, badge: badge,
        critical: !!d.critical, multiple: !!d.multiple, group: d.group || '' };
    }).filter(function (i) { return i.level !== 'hidden'; });

    return { listingType: type, items: items, groups: GROUPS[type].slice(), question: QUESTIONS[type] };
  }

  // docs: current (non-superseded) document records for this listing.
  // A rejected document does not count as submitted.
  function evaluate(listingType, propertyTypeLabel, answers, docs) {
    var spec = forListing(listingType, propertyTypeLabel, answers);
    var byType = {};
    (docs || []).forEach(function (d) {
      if (d.isCurrent === false || d.reviewStatus === 'rejected' || d.reviewStatus === 'superseded') return;
      (byType[d.docType] = byType[d.docType] || []).push(d);
    });
    var missing = [];
    spec.items.forEach(function (i) {
      if (i.blocking && !(byType[i.id] && byType[i.id].length)) missing.push({ id: i.id, label: i.label });
    });
    var groupIssues = [];
    spec.groups.forEach(function (g) {
      var members = spec.items.filter(function (i) { return i.group === g.id; });
      if (!members.length) return; // an admin hid every member: no group rule
      var have = members.filter(function (i) { return byType[i.id] && byType[i.id].length; }).length;
      if (have < g.min) groupIssues.push({ id: g.id, label: g.label, help: g.help });
    });
    var submitted = Object.keys(byType).reduce(function (n, k) { return n + byType[k].length; }, 0);
    return { complete: !missing.length && !groupIssues.length, missing: missing, groupIssues: groupIssues, submittedCount: submitted, spec: spec };
  }

  function isCritical(listingType, docType) {
    return DEFS[normType(listingType)].some(function (d) { return d.id === docType && d.critical; });
  }
  function labelFor(listingType, docType) {
    var d = DEFS[normType(listingType)].filter(function (x) { return x.id === docType; })[0];
    return d ? d.label : docType;
  }

  Accoom.DocRequirements = {
    ADDITIONAL: ADDITIONAL,
    LEVELS: LEVELS,
    forListing: forListing,
    evaluate: evaluate,
    isCritical: isCritical,
    labelFor: labelFor,
    getOverrides: function () { return readConfig().overrides.slice(); },
    setOverride: setOverride,
    resetOverrides: resetOverrides
  };
})(window.Accoom);
