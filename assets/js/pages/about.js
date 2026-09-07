/* ==========================================================================
   ACCOOM — About Page: Hero Spotlight
   Pulls the 4 strongest live listings from Accoom.PropertyService and
   renders them into the hero, replacing the skeleton placeholders.
   ========================================================================== */
(function (Accoom) {
  'use strict';

  var container = Accoom.$('[data-about-spotlight]');
  if (!container || !Accoom.PropertyService) return;

  function formatPrice(n) {
    return '₦' + n.toLocaleString('en-NG');
  }

  function score(item) {
    var s = item.agent.rating * 10;
    if (item.agent.verified) s += 15;
    if (item.agent.online) s += 8;
    s += Math.min(item.agent.reviews, 200) / 20;
    return s;
  }

  var branchPositions = ['pos-branch-top', 'pos-branch-topright', 'pos-branch-bottomleft'];

  var top4 = Accoom.PropertyService.getAll()
    .slice()
    .sort(function (a, b) { return score(b) - score(a); })
    .slice(0, 4);

  function cardHtml(item, extraClass) {
    return (
      '<div class="about-spotlight-card' + (extraClass ? ' ' + extraClass : '') + '" data-listing-id="' + item.id + '" role="button" tabindex="0">' +
        '<div class="about-spotlight-media">' +
          '<img src="' + item.images[0] + '" alt="' + item.name + '" loading="lazy" />' +
        '</div>' +
        '<div class="about-spotlight-body">' +
          '<p class="about-spotlight-name">' + item.name + '</p>' +
          '<div class="about-spotlight-meta">' +
            '<span>' + formatPrice(item.price) + '</span>' +
            '<span>' + item.beds + ' bed</span>' +
          '</div>' +
          '<span class="about-spotlight-arrow">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
          '</span>' +
        '</div>' +
      '</div>'
    );
  }

  container.innerHTML =
    '<div class="about-spotlight-grid">' +
      top4.map(function (item) { return cardHtml(item); }).join('') +
    '</div>';

  // Mobile only: show one card at a time, swapping every ~2s.
  var mobileQuery = window.matchMedia('(max-width: 768px)');
  var cards = container.querySelectorAll('.about-spotlight-card');
  var activeIndex = 0;
  var rotateTimer = null;

  function showCard(i) {
    cards.forEach(function (card, idx) {
      card.classList.toggle('is-active', idx === i);
    });
  }

  function startRotation() {
    if (rotateTimer || !cards.length) return;
    showCard(activeIndex);
    rotateTimer = setInterval(function () {
      activeIndex = (activeIndex + 1) % cards.length;
      showCard(activeIndex);
    }, 2000);
  }

  function stopRotation() {
    clearInterval(rotateTimer);
    rotateTimer = null;
  }

  function handleViewportChange(e) {
    if (e.matches) startRotation();
    else stopRotation();
  }

  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', handleViewportChange);
  } else {
    mobileQuery.addListener(handleViewportChange); // older Safari fallback
  }
  handleViewportChange(mobileQuery);

  Accoom.delegate(container, 'click', '.about-spotlight-card', function () {
    var id = this.getAttribute('data-listing-id');
    var item = Accoom.PropertyService.getById(id);
    if (item) Accoom.setStorage('accoom-active-listing', item);
    window.location.href = 'property.html?id=' + encodeURIComponent(id) +
      '&name=' + encodeURIComponent(item ? item.name : '');
  });

})(window.Accoom);