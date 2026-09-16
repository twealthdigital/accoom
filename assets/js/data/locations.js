/* ==========================================================================
   ACCOOM — Shared Location Data Service

   Country/state data lives here instead of being hardcoded as <option>
   tags in the HTML — same pattern as PropertyService in properties.js.

   This is a static stand-in list, not a real geo-database. If you want
   full, always-current country/state/city coverage instead of maintaining
   this list by hand, swap getCountries()/getStates() below for a call to
   a real API, e.g.:
     - https://countriesnow.space/api/v0.1/countries/states (free, no key)
     - https://countrystatecity.in/ (needs an API key, more complete)
   The rendering code (agent-details.js) only cares about the shape
   returned — an array of { value, label } — so nothing else has to change.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var STATES_BY_COUNTRY = {
    'Nigeria': [
      'Abuja (FCT)', 'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi',
      'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
      'Ekiti', 'Enugu', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
      'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
      'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
    ]
  };

  var COUNTRIES = ['Nigeria'];

  /**
   * Returns [{ value, label }] for the country dropdown. Nigeria-only
   * for now — this file is where you'd add more countries back later.
   */
  Accoom.getCountries = function () {
    return COUNTRIES.map(function (c) { return { value: c, label: c }; });
  };

  /**
   * Returns [{ value, label }] of states/provinces for a given country.
   * Falls back to an empty list for countries we don't have a state
   * breakdown for ("Other") — the UI should treat that as "type your own".
   */
  Accoom.getStates = function (country) {
    var list = STATES_BY_COUNTRY[country] || [];
    return list.map(function (s) { return { value: s, label: s }; });
  };

})(window.Accoom);