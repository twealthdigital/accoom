/* ==========================================================================
   ACCOOM - Pricing (customer-facing inclusive price)
   --------------------------------------------------------------------------
   An agent enters: accommodation price + service charge + legal fee + agency
   fee. Those four values stay on the listing record (agent records, platform
   calculations). Customers only ever see ONE number:

     final price = accommodation price + service charge + legal fee + agency fee

   Rules
   - Every customer-facing screen and the payment record use finalPrice().
   - Never add the fees on top of a price that is already final.
   - A record WITHOUT fee fields (demo catalogue, a card price already shown to
     the customer) is already final: finalPrice() returns it unchanged.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  function num(v) {
    if (typeof v === 'number') return isFinite(v) && v > 0 ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
    return isFinite(n) && n > 0 ? n : 0;
  }

  // The accommodation price the agent entered (internal).
  function baseOf(rec) {
    if (!rec) return 0;
    return num(rec.priceValue != null ? rec.priceValue : rec.price);
  }

  function breakdown(rec) {
    rec = rec || {};
    var base = baseOf(rec);
    var service = num(rec.serviceCharge), agency = num(rec.agencyFee), legal = num(rec.legalFee);
    var fees = service + agency + legal;
    // No accommodation price means no valid listing price, so fees alone never make a payable price.
    return { base: base, service: service, agency: agency, legal: legal, fees: fees, final: base > 0 ? base + fees : 0 };
  }

  // The one price customers see.
  function finalPrice(rec) { return breakdown(rec).final; }

  var PERIOD = {
    day: { per: 'Day', first: 'First Day', slash: 'day' },
    week: { per: 'Week', first: 'First Week', slash: 'week' },
    month: { per: 'Month', first: 'First Month', slash: 'month' },
    year: { per: 'Year', first: 'First Year', slash: 'year' }
  };
  function periodWords(period) { return PERIOD[String(period || '').toLowerCase()] || PERIOD.year; }

  function naira(n) { return '\u20A6' + Math.round(Number(n) || 0).toLocaleString('en-NG'); }

  Accoom.Pricing = { breakdown: breakdown, finalPrice: finalPrice, baseOf: baseOf, periodWords: periodWords, naira: naira };
})(window.Accoom);
