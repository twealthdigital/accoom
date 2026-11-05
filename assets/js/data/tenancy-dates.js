/* ==========================================================================
   ACCOOM — Calendar maths for rentals (Stage 4, reused by Stage 6)
   --------------------------------------------------------------------------
   expiryDate(start, period, count)
     day    start + count days
     week   start + 7 x count days
     month  same day-of-month, count months later. If that month is shorter,
            the LAST day of that month is used (31 Jan + 1 month = 28/29 Feb).
     year   same day and month, count years later (29 Feb -> 28 Feb in a
            non-leap year).
   Dates are plain calendar dates (YYYY-MM-DD) worked out in UTC, so daylight
   saving or the viewer's time zone can never shift a date by a day.
   The expiry date is the day the agreed term ends: a monthly tenancy that
   starts on 10 March expires on 10 April.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var PERIODS = ['day', 'week', 'month', 'year'];

  function parts(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) throw new Error('Not a valid date: ' + s);
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) throw new Error('Not a valid date: ' + s);
    return { y: y, m: mo, d: d };
  }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(y, m, d) { return String(y).padStart(4, '0') + '-' + pad(m) + '-' + pad(d); }
  function dayNumber(s) { var p = parts(s); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000); }
  function fromDayNumber(n) { var t = new Date(n * 86400000); return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }

  function addMonths(s, n) {
    var p = parts(s), total = p.y * 12 + (p.m - 1) + n;
    var y = Math.floor(total / 12), m = total % 12 + 1;
    return fmt(y, m, Math.min(p.d, daysInMonth(y, m)));
  }

  function expiryDate(start, period, count) {
    count = Number(count);
    if (PERIODS.indexOf(period) === -1) throw new Error('Unknown billing period: ' + period);
    if (!isFinite(count) || count < 1 || Math.floor(count) !== count) throw new Error('The number of periods must be a whole number of at least 1.');
    if (period === 'day') return fromDayNumber(dayNumber(start) + count);
    if (period === 'week') return fromDayNumber(dayNumber(start) + 7 * count);
    if (period === 'month') return addMonths(start, count);
    return addMonths(start, 12 * count);
  }

  function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }
  function addDays(s, n) { return fromDayNumber(dayNumber(s) + n); }
  function today() { var t = new Date(); return fmt(t.getFullYear(), t.getMonth() + 1, t.getDate()); }

  Accoom.TenancyDates = { PERIODS: PERIODS, expiryDate: expiryDate, daysBetween: daysBetween, addDays: addDays, today: today, isValid: function (s) { try { parts(s); return true; } catch (e) { return false; } } };
})(window.Accoom);
