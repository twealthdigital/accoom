window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  // Nigeria's major languages — always shown, in this order, at the
  // top of the dropdown regardless of state.
  var COMMON_LANGUAGES = ['English', 'Nigerian Pidgin', 'Hausa', 'Yoruba', 'Igbo'];

  // Additional languages more specific to a given state, appended after
  // the common list once a state is picked. Reference data — swap for a
  // real dataset/API here if one becomes available; the rendering code
  // only cares about the {value,label} shape returned.
  var STATE_LANGUAGES = {
    'Lagos': ['Yoruba', 'Igbo', 'Hausa'],
    'Oyo': ['Yoruba'],
    'Osun': ['Yoruba'],
    'Ogun': ['Yoruba'],
    'Ondo': ['Yoruba'],
    'Ekiti': ['Yoruba'],
    'Kwara': ['Yoruba', 'Hausa', 'Fulfulde', 'Nupe'],
    'Kano': ['Hausa', 'Fulfulde'],
    'Kaduna': ['Hausa', 'Fulfulde'],
    'Katsina': ['Hausa', 'Fulfulde'],
    'Sokoto': ['Hausa', 'Fulfulde'],
    'Zamfara': ['Hausa', 'Fulfulde'],
    'Kebbi': ['Hausa', 'Fulfulde'],
    'Jigawa': ['Hausa', 'Fulfulde'],
    'Bauchi': ['Hausa', 'Fulfulde'],
    'Gombe': ['Hausa', 'Fulfulde'],
    'Borno': ['Kanuri', 'Hausa'],
    'Yobe': ['Kanuri', 'Hausa'],
    'Abuja (FCT)': ['Hausa', 'Gwari', 'Nupe'],
    'Niger': ['Nupe', 'Hausa', 'Gwari'],
    'Kogi': ['Igala', 'Yoruba', 'Hausa'],
    'Abia': ['Igbo'],
    'Anambra': ['Igbo'],
    'Enugu': ['Igbo'],
    'Ebonyi': ['Igbo'],
    'Imo': ['Igbo'],
    'Delta': ['Igbo', 'Urhobo', 'Isoko'],
    'Edo': ['Edo', 'Esan'],
    'Akwa Ibom': ['Ibibio', 'Annang'],
    'Cross River': ['Ibibio', 'Efik'],
    'Rivers': ['Ikwerre', 'Ijaw', 'Kalabari'],
    'Bayelsa': ['Ijaw'],
    'Benue': ['Tiv', 'Idoma'],
    'Plateau': ['Tiv', 'Berom'],
    'Nasarawa': ['Tiv', 'Hausa', 'Eggon'],
    'Taraba': ['Hausa', 'Fulfulde', 'Jukun'],
    'Adamawa': ['Hausa', 'Fulfulde', 'Bata']
  };

  function dedupe(list) {
    var seen = {};
    return list.filter(function (l) {
      if (seen[l]) return false;
      seen[l] = true;
      return true;
    });
  }

  /**
   * Returns [{ value, label }] of languages spoken in Nigeria, optionally
   * narrowed to a state. Common/national languages always come first;
   * state-specific ones are appended once a state is known.
   */
  Accoom.getLanguages = function (country, state) {
    var regional = (state && STATE_LANGUAGES[state]) || [];
    return dedupe(COMMON_LANGUAGES.concat(regional)).map(function (l) {
      return { value: l, label: l };
    });
  };

})(window.Accoom);