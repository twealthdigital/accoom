/* ==========================================================================
   ACCOOM — Skeleton Loading Helper
   Shared across every page. Fill a container with wireframe placeholders
   before real content is ready, then just overwrite it with the real
   markup when it lands, same as any other render call already does.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

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
  };

  // Let any page file add its own shape, e.g:
  // Accoom.registerSkeleton('agentCard', function () { return '...'; });
  Accoom.registerSkeleton = function (kind, tplFn) {
    TEMPLATES[kind] = tplFn;
  };

})(window.Accoom);