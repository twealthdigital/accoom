/* ==========================================================================
   ACCOOM — Purchase Details Page
   Reads ?id= from the URL and renders that order's full detail view.
   MOCK_ORDER_DETAILS is keyed by order id — swap getOrder() for a real
   fetch once the backend exists:

     function getOrder(id, cb) {
       fetch('/api/orders/' + encodeURIComponent(id))
         .then(function (res) {
           if (!res.ok) throw new Error('not found');
           return res.json();
         })
         .then(function (order) { cb(order); })
         .catch(function () { cb(null); });
     }

   Everything below getOrder() (renderOrder / showNotFound) stays the same
   — it only cares about the order object shape, not where it came from.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.profile-page');
    if (!page) return;

    var user = Accoom.getStorage('accoom-user', null);
    if (!user) {
      window.location.href = 'auth.html';
      return;
    }

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    function initials(name, email) {
      var source = (name || '').trim();
      if (source) {
        var parts = source.split(/\s+/);
        var first = parts[0].charAt(0);
        var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
      }
      if (email) return email.charAt(0).toUpperCase();
      return 'AC';
    }

    function firstName(name, email) {
      if (name && name.trim()) return name.trim().split(/\s+/)[0];
      if (email) return email.split('@')[0];
      return 'there';
    }

    function memberSince(isoDate) {
      var date = isoDate ? new Date(isoDate) : null;
      if (!date || isNaN(date.getTime())) date = new Date();
      return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
    }

    // ----------------------------------------------------------------
    // Sidebar hero — same fields profile.js / purchases.js fill in
    // ----------------------------------------------------------------
    var avatarSideEl = document.querySelector('[data-profile-avatar-side]');
    var avatarImgSideEl = document.querySelector('[data-profile-avatar-img-side]');
    var nameSideEl = document.querySelector('[data-profile-name-side]');
    var memberSideEl = document.querySelector('[data-profile-member-since-side]');

    if (avatarSideEl) avatarSideEl.textContent = initials(user.name, user.email);
    if (nameSideEl) nameSideEl.textContent = firstName(user.name, user.email);
    if (memberSideEl) memberSideEl.textContent = memberSince(user.createdAt);
    if (avatarImgSideEl && user.avatar) {
      avatarImgSideEl.src = user.avatar;
      avatarImgSideEl.hidden = false;
      if (avatarSideEl) avatarSideEl.hidden = true;
    }

    var signoutBtn = document.querySelector('[data-purchases-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

    // ----------------------------------------------------------------
    // Order data
    // ----------------------------------------------------------------
    var STATUS_LABEL = { upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };
    var STATUS_CLASS = {
      upcoming: 'pod-status-badge--upcoming',
      completed: 'pod-status-badge--completed',
      cancelled: 'pod-status-badge--cancelled'
    };

    // Mirrors MOCK_PURCHASES in purchases.js, extended with the fields
    // this page needs. Keyed by order id for O(1) lookup — replace the
    // whole block with getOrder() (see file header comment) once real
    // data exists; nothing else in this file needs to change.
    var MOCK_ORDER_DETAILS = {
      'ACCOOM-2025-0008': {
        id: 'ACCOOM-2025-0008',
        name: '2 Bedroom Apartment',
        location: 'Lekki Phase 1, Lagos',
        image: 'assets/images/home-properties/miniflat.png',
        status: 'upcoming',
        guests: 2,
        checkIn: 'Aug 20, 2025',
        checkOut: 'Aug 25, 2025',
        bookingDate: 'May 18, 2025 \u00B7 10:30 AM',
        totalAmount: '\u20A6250,000',
        propertyPrice: '\u20A6240,000',
        serviceFee: '\u20A610,000',
        paymentMethod: 'Mastercard **** 4242',
        timeline: [
          { title: 'Purchase Confirmed', desc: 'Your purchase has been confirmed.', date: 'May 18, 2025 \u00B7 10:30 AM', state: 'done' },
          { title: 'Payment Successful', desc: 'We have received your payment.', date: 'May 18, 2025 \u00B7 10:32 AM', state: 'done' },
          { title: 'Upcoming Check-in', desc: 'Get ready for your stay! Check-in on Aug 20, 2025.', date: 'Aug 20, 2025', state: 'current' },
          { title: 'Check-out', desc: 'Your check-out date is Aug 25, 2025.', date: 'Aug 25, 2025', state: 'pending' }
        ]
      },
      'ACCOOM-2025-0007': {
        id: 'ACCOOM-2025-0007',
        name: 'Modern Detached Duplex',
        location: 'Ikoyi, Lagos',
        image: 'assets/images/home-properties/hall2.png',
        status: 'completed',
        guests: 4,
        checkIn: 'Jul 10, 2025',
        checkOut: 'Jul 15, 2025',
        bookingDate: 'Jun 2, 2025 \u00B7 9:10 AM',
        totalAmount: '\u20A6450,000',
        propertyPrice: '\u20A6430,000',
        serviceFee: '\u20A620,000',
        paymentMethod: 'Mastercard **** 4242',
        timeline: [
          { title: 'Purchase Confirmed', desc: 'Your Purchase has been confirmed.', date: 'Jun 2, 2025 \u00B7 9:10 AM', state: 'done' },
          { title: 'Payment Successful', desc: 'We have received your payment.', date: 'Jun 2, 2025 \u00B7 9:12 AM', state: 'done' },
          { title: 'Checked In', desc: 'Check-in completed on Jul 10, 2025.', date: 'Jul 10, 2025', state: 'done' },
          { title: 'Checked Out', desc: 'Stay completed on Jul 15, 2025.', date: 'Jul 15, 2025', state: 'done' }
        ]
      },
      'ACCOOM-2025-0005': {
        id: 'ACCOOM-2025-0005',
        name: 'Self-Contained Studio',
        location: 'Yaba, Lagos',
        image: 'assets/images/home-properties/selfcon1.png',
        status: 'cancelled',
        guests: 1,
        checkIn: 'May 15, 2025',
        checkOut: 'May 18, 2025',
        bookingDate: 'Apr 20, 2025 \u00B7 4:45 PM',
        totalAmount: '\u20A680,000',
        propertyPrice: '\u20A675,000',
        serviceFee: '\u20A65,000',
        paymentMethod: 'Verve **** 1187',
        timeline: [
          { title: 'Purchase Confirmed', desc: 'Your purchase has been confirmed.', date: 'Apr 20, 2025 \u00B7 4:45 PM', state: 'done' },
          { title: 'Payment Successful', desc: 'We have received your payment.', date: 'Apr 20, 2025 \u00B7 4:47 PM', state: 'done' },
          { title: 'purchase Cancelled', desc: 'This purchase was cancelled before check-in.', date: 'May 1, 2025', state: 'done' }
        ]
      }
      // Remaining MOCK_PURCHASES ids follow the same shape.
    };

    function getOrder(id, cb) {
      if (MOCK_ORDER_DETAILS[id]) {
        cb(MOCK_ORDER_DETAILS[id]);
        return;
      }
      
      var MOCK_PURCHASES_FALLBACK = [
        { id: 'ACCOOM-2025-0008', name: '2 Bedroom Apartment', location: 'Lekki Phase 1, Lagos', dates: 'Aug 20 \u2013 Aug 25, 2025', guests: 2, amount: '\u20A6250,000', image: 'assets/images/home-properties/miniflat.png', status: 'upcoming' },
        { id: 'ACCOOM-2025-0007', name: 'Modern Detached Duplex', location: 'Ikoyi, Lagos', dates: 'Jul 10 \u2013 Jul 15, 2025', guests: 4, amount: '\u20A6450,000', image: 'assets/images/home-properties/hall2.png', status: 'completed' },
        { id: 'ACCOOM-2025-0006', name: '1 Bedroom Apartment', location: 'Victoria Island, Lagos', dates: 'Jun 25 \u2013 Jun 28, 2025', guests: 1, amount: '\u20A6120,000', image: 'assets/images/home-properties/bedroomflat3.png', status: 'completed' },
        { id: 'ACCOOM-2025-0005', name: 'Self-Contained Studio', location: 'Yaba, Lagos', dates: 'May 15 \u2013 May 18, 2025', guests: 1, amount: '\u20A680,000', image: 'assets/images/home-properties/selfcon1.png', status: 'cancelled' },
        { id: 'ACCOOM-2025-0004', name: '3 Bedroom Apartment', location: 'Lekki Phase 1, Lagos', dates: 'Apr 10 \u2013 Apr 15, 2025', guests: 3, amount: '\u20A6350,000', image: 'assets/images/home-properties/miniflat1.png', status: 'completed' },
        { id: 'ACCOOM-2025-0003', name: 'Mini Flat', location: 'Surulere, Lagos', dates: 'Mar 5 \u2013 Mar 8, 2025', guests: 2, amount: '\u20A6180,000', image: 'assets/images/home-properties/miniflat.png', status: 'completed' },
        { id: 'ACCOOM-2025-0002', name: '4 Bedroom Detached Duplex', location: 'Ajah, Lagos', dates: 'Feb 12 \u2013 Feb 17, 2025', guests: 5, amount: '\u20A6460,000', image: 'assets/images/home-properties/hall2.png', status: 'completed' },
        { id: 'ACCOOM-2025-0001', name: 'Self-Contained Studio', location: 'Yaba, Lagos', dates: 'Jan 3 \u2013 Jan 6, 2025', guests: 1, amount: '\u20A675,000', image: 'assets/images/home-properties/selfcon1.png', status: 'completed' }
      ];

      var log = Accoom.getStorage('accoom-purchases-log', []);
      var allPurchases = log.concat(MOCK_PURCHASES_FALLBACK);
      
      var found = allPurchases.filter(function(r) { return r.id === id; })[0];
      
      if (found) {
        var parts = (found.dates || '').split(' \u2013 ');
        var checkIn = parts[0] || 'TBD';
        var checkOut = parts[1] || 'TBD';
        cb({
          id: found.id,
          name: found.name,
          location: found.location,
          image: found.image,
          status: found.status,
          guests: found.guests || 1,
          checkIn: checkIn,
          checkOut: checkOut,
          bookingDate: checkIn + ' \u00B7 10:00 AM',
          totalAmount: found.amount,
          propertyPrice: found.amount,
          serviceFee: '\u20A60',
          paymentMethod: 'Card',
          timeline: [
            { title: 'Purchase Confirmed', desc: 'Your purchase has been confirmed.', date: checkIn, state: 'done' }
          ]
        });
      } else {
        cb(null);
      }
    }

    function renderTimeline(steps) {
      var list = document.querySelector('[data-pod-timeline]');
      if (!list) return;
      list.innerHTML = '';
      steps.forEach(function (step) {
        var li = document.createElement('li');
        li.className = 'pod-timeline-item pod-timeline-item--' + step.state;
        var icon = step.state === 'done'
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : '';
        li.innerHTML =
          '<span class="pod-timeline-dot">' + icon + '</span>' +
          '<div class="pod-timeline-body">' +
            '<h4>' + step.title + '</h4>' +
            '<p>' + step.desc + '</p>' +
          '</div>' +
          '<span class="pod-timeline-date">' + step.date + '</span>';
        list.appendChild(li);
      });
    }

    function renderOrder(order) {
      document.title = order.name + ' \u2014 ACCOOM';

      var imgEl = document.querySelector('[data-pod-image]');
      if (imgEl) { imgEl.src = order.image; imgEl.alt = order.name; }

      var setText = function (selector, value) {
        var el = document.querySelector(selector);
        if (el) el.textContent = value;
      };

      setText('[data-pod-name]', order.name);
      setText('[data-pod-location]', order.location);
      setText('[data-pod-dates]', order.checkIn + ' \u2013 ' + order.checkOut);
      setText('[data-pod-guests]', order.guests + (order.guests === 1 ? ' Guest' : ' Guests'));
      setText('[data-pod-order-id]', '#' + order.id);
      setText('[data-pod-total]', order.totalAmount);
      setText('[data-pod-checkin]', order.checkIn);
      setText('[data-pod-checkout]', order.checkOut);
      setText('[data-pod-guests-detail]', order.guests + (order.guests === 1 ? ' Guest' : ' Guests'));
      setText('[data-pod-booking-date]', order.bookingDate);
      setText('[data-pod-property-price]', order.propertyPrice);
      setText('[data-pod-total-2]', order.totalAmount);
      setText('[data-pod-service-fee]', order.serviceFee);
      setText('[data-pod-payment-method]', order.paymentMethod);

      var statusEl = document.querySelector('[data-pod-status]');
      if (statusEl) {
        statusEl.textContent = STATUS_LABEL[order.status] || order.status;
        statusEl.className = 'pod-status-badge ' + (STATUS_CLASS[order.status] || '');
      }

      renderTimeline(order.timeline || []);

      var podPage = document.querySelector('[data-pod-page]');
      if (podPage) podPage.hidden = false;
    }

    function showNotFound() {
      var notFound = document.querySelector('[data-pod-not-found]');
      if (notFound) notFound.hidden = false;
    }

    var orderId = new URLSearchParams(window.location.search).get('id');

    if (!orderId) {
      showNotFound();
    } else {
      getOrder(orderId, function (order) {
        if (order) {
          renderOrder(order);
        } else {
          showNotFound();
        }
      });
    }

  });

})(window.Accoom);