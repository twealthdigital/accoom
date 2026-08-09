/* ==========================================================================
   ACCOOM — Property Detail Page
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    // ============================================================
    // PROPERTY DATA
    // The single source of truth for this page. When wiring this up
    // to real navigation, populate this from the clicked listing
    // (e.g. via a query string) instead of the hardcoded fallback.
    // ============================================================
var params = new URLSearchParams(window.location.search);

    var stored = Accoom.getStorage('accoom-active-listing', null);
    if (stored && String(stored.id) !== String(params.get('id'))) stored = null;

    var property = {
      id: params.get('id') || 'ACCOM-24567',
      name: params.get('name') || (stored ? stored.name : '2 Bedroom Detached Duplex'),
      location: stored ? stored.location : 'Lekki Phase 1, Lagos, Nigeria',
      price: stored ? ('\u20A6' + stored.price.toLocaleString('en-NG')) : '\u20A6460,000',
      images: stored ? stored.images : [
        'assets/images/home-properties/miniflat1.png',
        'assets/images/home-properties/miniflat.png',
        'assets/images/home-properties/placeholder.png',
        'assets/images/home-properties/miniflat.png'
      ],
      video: stored ? stored.video : null,
      agent: stored && stored.agent ? stored.agent : { level: 'AL5' }
    };

    // ============================================================
    // Apply dynamic property name across the page
    // ============================================================
    (function applyPropertyName() {
      var name = property.name;

      var breadcrumbEl = document.querySelector('[data-pd-breadcrumb-current]');
      if (breadcrumbEl) breadcrumbEl.textContent = name;

      var titleEl = document.querySelector('[data-pd-title]');
      if (titleEl) titleEl.textContent = name;

      var docTitleEl = document.querySelector('[data-pd-doctitle]');
      if (docTitleEl) {
        docTitleEl.textContent = name + ' \u2014 ACCOOM';
        document.title = name + ' \u2014 ACCOOM';
      }
    })();

    // ============================================================
    // Apply dynamic agent level (carried over from the home page card)
    // ============================================================
    (function applyAgentLevel() {
      var levelEl = document.querySelector('[data-pd-agent-level]');
      if (!levelEl) return;

      var level = property.agent.level;
      var rank = parseInt(level.replace('AL', ''), 10);

      levelEl.className = 'pd-agent-level pd-agent-level--al' + rank;

      var dots = levelEl.querySelectorAll('.pd-level-dot');
      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-filled', i < rank);
      });

      levelEl.lastChild.textContent = ' ' + level;
    })();

    // ============================================================
    // Button ripple animations (shared module)
    // ============================================================
    Accoom.initButtonAnimations();

    // ============================================================
    // GALLERY — main image / thumbnail switching
    // ============================================================
(function initGallery() {
      var gallery = document.querySelector('[data-pd-gallery]');
      if (!gallery) return;

      var mainImg = gallery.querySelector('[data-pd-main-img]');
      var mainVideo = gallery.querySelector('[data-pd-main-video]');
      var counter = gallery.querySelector('[data-pd-counter]');
      var thumbsWrap = gallery.querySelector('[data-pd-thumbs]');

      var slides = [];
      if (property.video) {
        slides.push({ type: 'video', src: property.video, poster: property.images[0] });
      }
      property.images.forEach(function (src) {
        slides.push({ type: 'image', src: src });
      });

      function renderThumbs() {
        thumbsWrap.innerHTML = slides.map(function (slide, i) {
          var poster = slide.type === 'video' ? slide.poster : slide.src;
          var playIcon = slide.type === 'video'
            ? '<span class="pd-thumb-play"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg></span>'
            : '';
          return '<button type="button" class="pd-thumb" data-pd-thumb data-index="' + i + '" aria-label="' +
            (slide.type === 'video' ? 'Play video' : 'Photo ' + (i + 1)) + '">' +
            '<img src="' + poster + '" alt="" onerror="this.onerror=null;this.src=\'assets/images/home-properties/placeholder.png\';" />' +
            playIcon +
            '</button>';
        }).join('');
      }

      function setActive(index) {
        var slide = slides[index] || slides[0];
        if (!slide) return;
        

        if (slide.type === 'video') {
          mainImg.style.display = 'none';
          mainVideo.style.display = 'block';
          if (mainVideo.getAttribute('src') !== slide.src) mainVideo.setAttribute('src', slide.src);
          mainVideo.play().catch(function () {});
        } else {
          mainVideo.pause();
          mainVideo.style.display = 'none';
          mainImg.style.display = 'block';
          mainImg.classList.add('is-swapping');
          setTimeout(function () {
            mainImg.src = slide.src;
            mainImg.classList.remove('is-swapping');
          }, 120);
        }

        Accoom.$$('[data-pd-thumb]', thumbsWrap).forEach(function (t) {
          t.classList.toggle('is-active', parseInt(t.getAttribute('data-index'), 10) === index);
        });

        if (counter) counter.textContent = (index + 1) + '/' + slides.length;
      }

      renderThumbs();
      setActive(0);

      Accoom.delegate(thumbsWrap, 'click', '[data-pd-thumb]', function () {
        setActive(parseInt(this.getAttribute('data-index'), 10));
      });


      // Zoom — left-click to zoom in, right-click to zoom out
      var mainFrame = gallery.querySelector('[data-pd-gallery-main]');
      var ZOOM_MIN = 1, ZOOM_MAX = 3, ZOOM_STEP = 0.5;
      var mainZoom = 1;

      function setMainZoom(level) {
        mainZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
        mainImg.style.transform = 'scale(' + mainZoom + ')';
        mainFrame.classList.toggle('is-zoomed', mainZoom > 1);
      }

      Accoom.on(mainImg, 'click', function () {
        setMainZoom(mainZoom + ZOOM_STEP);
      });

      Accoom.on(mainImg, 'contextmenu', function (e) {
        e.preventDefault();
        setMainZoom(mainZoom - ZOOM_STEP);
      });

    })();

    // ============================================================
    // LIGHTBOX — full photo viewer
    // ============================================================
    var Lightbox = (function initLightbox() {
      var total = property.images.length;

      var slidesHtml = property.images.map(function (src) {
        return '<div class="pd-lightbox-slide"><img src="' + src + '" alt="' + property.name + '" draggable="false" /></div>';
      }).join('');

      var box = document.createElement('div');
      box.className = 'pd-lightbox';
      box.setAttribute('data-pd-lightbox', '');
      box.innerHTML =
        box.innerHTML =
        '<div class="pd-lightbox-stage">' +
          '<div class="pd-lightbox-frame" data-pd-lightbox-frame>' +
            '<div class="pd-lightbox-track" data-pd-lightbox-track>' + slidesHtml + '</div>' +
          '</div>' +
          '<div class="pd-lightbox-zoom-controls">' +
            '<button type="button" class="pd-lightbox-zoom-btn" data-pd-zoom-out aria-label="Zoom out">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.6" y2="16.6"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>' +
            '</button>' +
            '<button type="button" class="pd-lightbox-zoom-btn" data-pd-zoom-reset aria-label="Reset zoom">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>' +
            '</button>' +
            '<button type="button" class="pd-lightbox-zoom-btn" data-pd-zoom-in aria-label="Zoom in">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.6" y2="16.6"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>' +
            '</button>' +
          '</div>' +
          '<button type="button" class="pd-lightbox-close" data-pd-lightbox-close aria-label="Close">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
          '<button type="button" class="pd-lightbox-nav pd-lightbox-prev" data-pd-lightbox-prev aria-label="Previous photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>' +
          '</button>' +
          '<button type="button" class="pd-lightbox-nav pd-lightbox-next" data-pd-lightbox-next aria-label="Next photo">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>' +
          '</button>' +
          '<span class="pd-lightbox-counter" data-pd-lightbox-counter></span>' +
        '</div>';
      document.body.appendChild(box);

      var track = box.querySelector('[data-pd-lightbox-track]');
      var counter = box.querySelector('[data-pd-lightbox-counter]');
      var current = 0;

      function render(instant) {
        track.style.transition = instant ? 'none' : '';
        track.style.transform = 'translateX(' + (-current * 100) + '%)';
        counter.textContent = (current + 1) + ' / ' + total;
      }

      function open(index) {
        current = index || 0;
        box.classList.add('is-open');
        document.body.classList.add('no-scroll');
        setZoom(1);
        render(true);
      }

      function close() {
        box.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
      }

      function next() {
        current = (current + 1) % total;
        setZoom(1);
        render();
      }

      function prev() {
        current = (current - 1 + total) % total;
        setZoom(1);
        render();
      }

      Accoom.on(box.querySelector('[data-pd-lightbox-close]'), 'click', close);
      Accoom.on(box.querySelector('[data-pd-lightbox-next]'), 'click', next);
      Accoom.on(box.querySelector('[data-pd-lightbox-prev]'), 'click', prev);

      Accoom.on(box, 'click', function (e) {
        if (e.target === box) close();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (!box.classList.contains('is-open')) return;
        if (e.key === 'Escape') close();
        if (e.key === 'ArrowRight') next();
        if (e.key === 'ArrowLeft') prev();
      });

      // Touch / pointer swipe on the track itself
      var dragState = null;

      Accoom.on(track, 'pointerdown', function (e) {
        if (total < 2) return;
        dragState = { startX: e.clientX, dx: 0 };
        track.style.transition = 'none';
        track.setPointerCapture(e.pointerId);
      });

      Accoom.on(track, 'pointermove', function (e) {
        if (!dragState) return;
        dragState.dx = e.clientX - dragState.startX;
        var pct = (dragState.dx / track.clientWidth) * 100;
        track.style.transform = 'translateX(' + (-current * 100 + pct) + '%)';
      });

      function endDrag() {
        if (!dragState) return;
        var threshold = track.clientWidth * 0.16;
        if (dragState.dx < -threshold) next();
        else if (dragState.dx > threshold) prev();
        else render();
        dragState = null;
      }

      Accoom.on(track, 'pointerup', endDrag);
      Accoom.on(track, 'pointercancel', endDrag);

      // ============================================================
      // ZOOM — left-click to zoom in, right-click to zoom out,
      // +/- buttons and a reset button for mobile
      // ============================================================
      var ZOOM_MIN = 1;
      var ZOOM_MAX = 3;
      var ZOOM_STEP = 0.5;
      var zoomLevel = 1;
      var frame = box.querySelector('[data-pd-lightbox-frame]');

      function currentImg() {
        var slide = track.children[current];
        return slide ? slide.querySelector('img') : null;
      }

      function setZoom(level) {
        zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
        var img = currentImg();
        if (img) img.style.transform = 'scale(' + zoomLevel + ')';
        frame.classList.toggle('is-zoomed', zoomLevel > 1);
      }

      function zoomIn() { setZoom(zoomLevel + ZOOM_STEP); }
      function zoomOut() { setZoom(zoomLevel - ZOOM_STEP); }
      function zoomReset() { setZoom(1); }

      Accoom.on(frame, 'click', function () {
        if (dragState && Math.abs(dragState.dx) > 6) return;
        zoomIn();
      });

      Accoom.on(frame, 'contextmenu', function (e) {
        e.preventDefault();
        zoomOut();
      });

      Accoom.on(box.querySelector('[data-pd-zoom-in]'), 'click', function (e) {
        e.stopPropagation();
        zoomIn();
      });

      Accoom.on(box.querySelector('[data-pd-zoom-out]'), 'click', function (e) {
        e.stopPropagation();
        zoomOut();
      });

      Accoom.on(box.querySelector('[data-pd-zoom-reset]'), 'click', function (e) {
        e.stopPropagation();
        zoomReset();
      });

      Accoom.delegate(document, 'click', '[data-pd-open-lightbox]', function (e) {
        e.preventDefault();
        var idx = parseInt(this.getAttribute('data-index'), 10);
        open(isNaN(idx) ? 0 : idx);
      });

      return { open: open, close: close };
    })();

    // ============================================================
    // SAVE / FAVORITE toggle
    // ============================================================
    (function initSave() {
      var btn = document.querySelector('[data-pd-save]');
      if (!btn) return;
      Accoom.on(btn, 'click', function () {
        Accoom.toggleClass(btn, 'is-active');
      });
    })();

    // ============================================================
    // MAKE PAYMENT — placeholder hook for the payment flow
    // ============================================================
    (function initPayment() {
      var btn = document.querySelector('[data-pd-payment]');
      if (!btn) return;
      Accoom.on(btn, 'click', function () {
        // Wire this up to the real checkout / payment flow.
        console.log('Make Payment clicked for property:', property.id);
      });
    })();

    // ============================================================
    // SUGGESTED AGENTS — carousel prev/next
    // ============================================================
    (function initAgentsCarousel() {
      var track = document.querySelector('[data-pd-agents-track]');
      var prevBtn = document.querySelector('[data-pd-agents-prev]');
      var nextBtn = document.querySelector('[data-pd-agents-next]');
      if (!track) return;

      function scrollByTile(direction) {
        var tile = track.querySelector('.pd-agent-tile');
        var step = tile ? tile.getBoundingClientRect().width + 20 : 300;
        track.scrollBy({ left: direction * step, behavior: 'smooth' });
      }

      if (prevBtn) Accoom.on(prevBtn, 'click', function () { scrollByTile(-1); });
      if (nextBtn) Accoom.on(nextBtn, 'click', function () { scrollByTile(1); });
    })();

    // ============================================================
    // SHARE MODAL — bounce-in dialog, scoped to this property
    // (same visual/behavioral pattern used site-wide)
    // ============================================================
    (function initShareModal() {
      var modal = document.createElement('div');
      modal.className = 'share-modal-overlay';
      modal.setAttribute('data-share-modal', '');
      modal.innerHTML =
        '<div class="share-modal" role="dialog" aria-modal="true" aria-label="Share this property">' +
          '<button type="button" class="share-modal-close" data-share-close aria-label="Close">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
          '<h3 class="share-modal-title">Share this property</h3>' +
          '<p class="share-modal-subtitle">Send this listing to someone who needs it.</p>' +
          '<div class="share-modal-preview">' +
            '<img data-share-preview-img src="" alt="" />' +
            '<div class="share-modal-preview-text">' +
              '<p data-share-preview-name class="share-modal-preview-name"></p>' +
              '<p data-share-preview-meta class="share-modal-preview-meta"></p>' +
            '</div>' +
          '</div>' +
          '<div class="share-modal-options">' +
            '<a class="share-option" data-share-whatsapp target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.5-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.2 3.3 5.3 4.6.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z"/><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg></span>' +
              '<span>WhatsApp</span>' +
            '</a>' +
            '<a class="share-option" data-share-twitter target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7.1l-5.6-6.9L4 22H1l8.1-9.3L1 2h7.3l5 6.3L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg></span>' +
              '<span>X</span>' +
            '</a>' +
            '<a class="share-option" data-share-facebook target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.6 1.6-1.6h1.7V3.2C16.5 3.1 15.4 3 14.2 3c-2.6 0-4.4 1.6-4.4 4.5V9.8H7v3.2h2.8v8h3.7z"/></svg></span>' +
              '<span>Facebook</span>' +
            '</a>' +
            '<a class="share-option" data-share-telegram target="_blank" rel="noopener">' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.7 11.6c-1 .4-1 1.6.1 1.9l4.9 1.5 1.9 5.8c.2.7 1.1.9 1.6.3l2.6-2.8 5 3.7c.7.5 1.7.2 1.9-.7l3.2-15c.2-.9-.7-1.6-1.5-1.3zM8.6 14l9.4-5.8c.2-.1.4.1.2.3l-7.6 6.9-.3 3.2-1.4-4.1z"/></svg></span>' +
              '<span>Telegram</span>' +
            '</a>' +
            '<a class="share-option" data-share-email>' +
              '<span class="share-option-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 6 10-6"></path></svg></span>' +
              '<span>Email</span>' +
            '</a>' +
          '</div>' +
          '<div class="share-modal-link">' +
            '<input type="text" readonly data-share-link-input />' +
            '<button type="button" data-share-copy>' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
              '<span data-share-copy-label>Copy</span>' +
            '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(modal);

      var closeBtn = modal.querySelector('[data-share-close]');
      var previewImg = modal.querySelector('[data-share-preview-img]');
      var previewName = modal.querySelector('[data-share-preview-name]');
      var previewMeta = modal.querySelector('[data-share-preview-meta]');
      var linkInput = modal.querySelector('[data-share-link-input]');
      var copyBtn = modal.querySelector('[data-share-copy]');
      var copyLabel = modal.querySelector('[data-share-copy-label]');

      function openModal() {
        previewImg.src = property.images[0];
        previewName.textContent = property.name;
        previewMeta.textContent = property.price + ' \u00B7 ' + property.location;

        var shareUrl = window.location.origin + window.location.pathname + '?id=' + encodeURIComponent(property.id);
        linkInput.value = shareUrl;

        var shareText = encodeURIComponent(property.name + ' - ' + property.price + ' \u00B7 ' + property.location);
        var encodedUrl = encodeURIComponent(shareUrl);

        modal.querySelector('[data-share-whatsapp]').href = 'https://wa.me/?text=' + shareText + '%20' + encodedUrl;
        modal.querySelector('[data-share-twitter]').href = 'https://twitter.com/intent/tweet?text=' + shareText + '&url=' + encodedUrl;
        modal.querySelector('[data-share-facebook]').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl;
        modal.querySelector('[data-share-telegram]').href = 'https://t.me/share/url?url=' + encodedUrl + '&text=' + shareText;
        modal.querySelector('[data-share-email]').href = 'mailto:?subject=' + shareText + '&body=' + encodedUrl;

        modal.classList.add('is-open');
        document.body.classList.add('no-scroll');
      }

      function closeModal() {
        modal.classList.remove('is-open');
        document.body.classList.remove('no-scroll');
      }

      Accoom.delegate(document, 'click', '[data-pd-share-trigger]', function (e) {
        e.preventDefault();
        openModal();
      });

      Accoom.on(closeBtn, 'click', closeModal);

      Accoom.on(modal, 'click', function (e) {
        if (e.target === modal) closeModal();
      });

      Accoom.on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
      });

      Accoom.on(copyBtn, 'click', function () {
        linkInput.select();
        navigator.clipboard && navigator.clipboard.writeText(linkInput.value).then(function () {
          copyLabel.textContent = 'Copied!';
          setTimeout(function () { copyLabel.textContent = 'Copy'; }, 1800);
        });
      });
    })();

    console.log('ACCOOM property page initialized');
  });

})(window.Accoom);