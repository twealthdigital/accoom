/* ==========================================================================
   ACCOOM — Skeleton Loading Helper
   Shared across every page. Fill a container with wireframe placeholders
   before real content is ready, then just overwrite it with the real
   markup when it lands, same as any other render call already does.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  // Every skeleton must stay on screen at least this long, so a fast
  // response doesn't just flash the placeholder for a frame. The fetch
  // itself is never delayed — only the swap to real content is.
  var MIN_VISIBLE_MS = 2000;

  // Tracks when each container's skeleton went up, keyed by the element
  // itself so multiple skeletons on one page each get their own
  // independent minimum-display timer.
  var shownAt = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

  // Built in shapes. Add more here as new sections need their own shape,
  // everything else about the system stays the same.
  var TEMPLATES = {
    listingCard: function () {
      return (
        '<div class="skeleton-card">' +
          '<div class="skeleton skeleton-card-media"></div>' +
          '<div class="skeleton-card-body">' +
            '<div class="skeleton skeleton-line is-wide"></div>' +
            '<div class="skeleton skeleton-line is-medium"></div>' +
            '<div class="skeleton skeleton-line is-short"></div>' +
          '</div>' +
        '</div>'
      );
    },
    line: function () {
      return '<div class="skeleton skeleton-line is-wide"></div>';
    },
    avatarRow: function () {
      return (
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="skeleton skeleton-circle" style="width:40px;height:40px;flex-shrink:0;"></div>' +
          '<div style="flex:1;"><div class="skeleton skeleton-line is-medium"></div></div>' +
        '</div>'
      );
    }
  };

  // Accoom.showSkeleton(container, 'listingCard', 8)
  // Fills `container` with `count` copies of the named shape. Call this
  // right before your fetch, then let the real render() overwrite
  // container.innerHTML the way it already does. No separate clear step.
  Accoom.showSkeleton = function (container, kind, count) {
    if (!container) return;
    var tpl = TEMPLATES[kind];
    if (!tpl) { console.error('Accoom.showSkeleton: unknown kind "' + kind + '"'); return; }
    var html = '';
    for (var i = 0; i < (count || 4); i++) html += tpl();
    container.innerHTML = html;
    if (shownAt) shownAt.set(container, Date.now());
  };

  // Accoom.hideSkeleton(container, function () { container.innerHTML = realHtml; })
  // Waits until the skeleton has been visible for at least MIN_VISIBLE_MS
  // (never longer than the data actually takes to arrive), then swaps in
  // the real content with a short fade — same box, same dimensions, no
  // layout jump. If a container was never shown via showSkeleton(),
  // renderFn just runs immediately.
  Accoom.hideSkeleton = function (container, renderFn) {
    if (!container) { if (typeof renderFn === 'function') renderFn(); return; }
    var startedAt = (shownAt && shownAt.get(container)) || 0;
    var elapsed = startedAt ? (Date.now() - startedAt) : MIN_VISIBLE_MS;
    var wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    setTimeout(function () {
      container.classList.add('skeleton-swap-out');
      requestAnimationFrame(function () {
        if (typeof renderFn === 'function') renderFn();
        container.classList.remove('skeleton-swap-out');
        container.classList.add('skeleton-swap-in');
        setTimeout(function () {
          container.classList.remove('skeleton-swap-in');
        }, 320);
      });
    }, wait);
  };

  // Let any page file add its own shape, e.g:
  // Accoom.registerSkeleton('agentCard', function () { return '...'; });
  Accoom.registerSkeleton = function (kind, tplFn) {
    TEMPLATES[kind] = tplFn;
  };

})(window.Accoom);