/* ==========================================================================
   ACCOOM — Page Loader
   Full-page skeleton curtain. Stays up until the page is actually ready:
   every resource has loaded AND, for pages that fetch their own data,
   until that page explicitly says so via Accoom.pageReady().
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var FORCE_REVEAL_MS = 12000;
  var START_DELAY_MS = 140;
  var units = [];
  var initialized = false;

  document.documentElement.classList.add('progressive-loading');

  function usable(el) {
    return el && el.nodeType === 1 &&
      el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' &&
      !el.classList.contains('panel-overlay') &&
      !el.classList.contains('as-modal-overlay') &&
      el.id !== 'page-skeleton';
  }

  function addUnit(el) {
    if (!usable(el) || el.dataset.progressiveUnit) return;
    el.dataset.progressiveUnit = 'true';
    units.push(el);
  }

  function collectUnits() {
    Array.prototype.forEach.call(document.body.children, function (el) {
      if (!usable(el)) return;

      if (el.matches('.partial-mount, [data-progressive-partial], section')) {
        addUnit(el);
        return;
      }

      if (el.matches('main, .auth-page, .onboarding-page, .pd-page')) {
        var kids = Array.prototype.filter.call(el.children, usable);

        if (kids.length > 1) {
          kids.forEach(addUnit);
        } else {
          addUnit(kids[0] || el);
        }
      }
    });
  }


function getSkeletonLayer(target) {
  return Array.prototype.find.call(
    target.children,
    function (child) {
      return child.classList &&
        child.classList.contains('progressive-skeleton-layer');
    }
  ) || null;
}

function skeletonizeClone(clone) {
  /*
   * Remove anything that must never appear in the skeleton clone.
   */
  clone.querySelectorAll(
    '#page-skeleton, script, style, noscript, template'
  ).forEach(function (el) {
    el.remove();
  });

  /*
   * Prevent duplicate IDs from interfering with the real page.
   */
  clone.removeAttribute('id');

  clone.querySelectorAll('[id]').forEach(function (el) {
    el.removeAttribute('id');
  });

  /*
   * Keep cloned elements looking like their real counterparts,
   * but turn images into wireframe blocks.
   */
  clone.querySelectorAll('img').forEach(function (img) {
    var cs = window.getComputedStyle(img);

    if (cs.width && cs.width !== 'auto') {
      img.style.width = cs.width;
    }

    if (cs.height && cs.height !== 'auto') {
      img.style.height = cs.height;
    }

    img.classList.add('skeleton');

    img.removeAttribute('srcset');
    img.removeAttribute('sizes');

    img.setAttribute(
      'src',
      'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    );

    img.setAttribute('alt', '');

    img.style.backgroundImage = 'none';
    img.style.objectFit = cs.objectFit;
  });

  /*
   * Videos become skeleton blocks while keeping their dimensions.
   */
  clone.querySelectorAll('video').forEach(function (video) {
    var cs = window.getComputedStyle(video);

    if (cs.width && cs.width !== 'auto') {
      video.style.width = cs.width;
    }

    if (cs.height && cs.height !== 'auto') {
      video.style.height = cs.height;
    }

    video.classList.add('skeleton');

    video.removeAttribute('src');
    video.removeAttribute('poster');
  });

  /*
   * Form fields retain their actual shapes.
   */
  clone.querySelectorAll(
    'input, textarea, select'
  ).forEach(function (field) {
    field.classList.add('skeleton');

    field.setAttribute('tabindex', '-1');

    field.removeAttribute('placeholder');

    field.style.color = 'transparent';
    field.style.caretColor = 'transparent';
  });

  /*
   * Remove real background images from the clone.
   * Keep the element itself so its real shape remains.
   */
  clone.querySelectorAll('*').forEach(function (el) {
    try {
      var bg = window.getComputedStyle(el).backgroundImage;

      if (bg && bg !== 'none') {
        el.style.backgroundImage = 'none';
        el.classList.add('skeleton');
      }
    } catch (e) {}
  });

  /*
   * Turn real text into shimmering wireframe bars.
   * The surrounding elements/classes remain untouched, so their
   * original layout, margins, alignment and spacing are preserved.
   */
  Array.prototype.slice.call(
    clone.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, p, strong, small, label, a, button, span, li'
    )
  ).forEach(function (el) {
    if (
      el.closest('.progressive-skeleton-layer') === null &&
      el.childNodes.length
    ) {
      Array.prototype.slice.call(el.childNodes).forEach(function (node) {
        if (
          node.nodeType === 3 &&
          node.nodeValue &&
          node.nodeValue.trim()
        ) {
          var text = node.nodeValue.trim();

          var bar = document.createElement('span');

          bar.className = 'skeleton progressive-skeleton-text';

          bar.style.display = 'inline-block';

          bar.style.width = Math.max(
            2.5,
            Math.min(18, text.length * 0.42)
          ) + 'ch';

          bar.style.height = '0.72em';

          bar.style.verticalAlign = 'middle';

          bar.style.marginRight = '0.12em';

          node.parentNode.replaceChild(bar, node);
        }
      });
    }
  });

  /*
   * Keep icons in the correct places, but make them faint.
   */
  clone.querySelectorAll('svg').forEach(function (svg) {
    svg.style.opacity = '0.18';
  });

  /*
   * Nothing in the clone should be clickable.
   */
  clone.querySelectorAll('a, button').forEach(function (el) {
    el.removeAttribute('href');
    el.setAttribute('tabindex', '-1');
  });
}

function buildPartialFallback(target) {
  var isHeader = target.matches('.partial-mount');

  var fallback = document.createElement('div');

  fallback.className = 'progressive-partial-fallback';

  fallback.style.width = '100%';
  fallback.style.height =
    isHeader
      ? (window.innerWidth <= 768
          ? 'var(--header-h-mobile, 64px)'
          : 'var(--header-h, 72px)')
      : '80px';

  fallback.style.display = 'flex';
  fallback.style.alignItems = 'center';
  fallback.style.justifyContent = 'space-between';
  fallback.style.gap = '14px';
  fallback.style.padding = '0 var(--gutter, 20px)';
  fallback.style.boxSizing = 'border-box';

  fallback.innerHTML =
    '<span class="skeleton" style="width:105px;height:28px;"></span>' +
    '<span class="skeleton" style="width:80px;height:12px;"></span>' +
    '<span class="skeleton" style="width:70px;height:12px;"></span>' +
    '<span class="skeleton skeleton-circle" style="width:34px;height:34px;"></span>';

  return fallback;
}

function watchProgressiveTarget(target) {
  if (
    typeof MutationObserver === 'undefined' ||
    target.__progressiveObserver
  ) {
    return;
  }

  var observer = new MutationObserver(function (mutations) {
    if (
      target.dataset.progressiveReady ||
      target.__progressiveBuilding
    ) {
      return;
    }

    var relevant = mutations.some(function (mutation) {
      if (
        mutation.target &&
        mutation.target.closest &&
        mutation.target.closest('.progressive-skeleton-layer')
      ) {
        return false;
      }

      var addedReal = Array.prototype.some.call(
        mutation.addedNodes || [],
        function (node) {
          return !(
            node.nodeType === 1 &&
            node.classList &&
            node.classList.contains('progressive-skeleton-layer')
          );
        }
      );

      var removedReal = Array.prototype.some.call(
        mutation.removedNodes || [],
        function (node) {
          return !(
            node.nodeType === 1 &&
            node.classList &&
            node.classList.contains('progressive-skeleton-layer')
          );
        }
      );

      return addedReal || removedReal || mutation.type === 'characterData';
    });

    if (!relevant) return;

    clearTimeout(target.__progressiveRebuildTimer);

    target.__progressiveRebuildTimer = setTimeout(function () {
      if (
        !target.dataset.progressiveReady &&
        hasRealContent(target)
      ) {
        makeLayer(target);
      }
    }, 40);
  });

  observer.observe(target, {
    subtree: true,
    childList: true,
    characterData: true
  });

  target.__progressiveObserver = observer;
}

function hasRealContent(target) {
  return Array.prototype.some.call(
    target.children,
    function (child) {
      return !(
        child.classList &&
        child.classList.contains('progressive-skeleton-layer')
      );
    }
  );
}

function makeLayer(target) {
  if (!target) return;

  target.__progressiveBuilding = true;

  var oldLayer = getSkeletonLayer(target);

  if (oldLayer) {
    oldLayer.remove();
  }

  if (window.getComputedStyle(target).position === 'static') {
    target.style.position = 'relative';
  }

  target.style.visibility = 'hidden';

  var layer = document.createElement('div');

  layer.className = 'progressive-skeleton-layer';

  layer.setAttribute('aria-hidden', 'true');

  layer.style.position = 'absolute';
  layer.style.inset = '0';
  layer.style.width = '100%';
  layer.style.height = '100%';
  layer.style.minHeight = '100%';
  layer.style.boxSizing = 'border-box';
  layer.style.zIndex = '999';
  layer.style.overflow = 'hidden';
  layer.style.pointerEvents = 'none';
  layer.style.opacity = '1';

  layer.style.background =
    window.getComputedStyle(target).backgroundColor ||
    'var(--surface-page, #fff)';

  layer.style.transition =
    'opacity 220ms cubic-bezier(0.4, 0, 0.2, 1)';

  /*
   * CLONE THE REAL TARGET.
   *
   * This is the important part:
   * the skeleton now has the same classes, layout, grid,
   * spacing, dimensions, cards, buttons and structure as
   * the actual thing being loaded.
   */
  if (hasRealContent(target)) {
    var clone = target.cloneNode(true);

    clone.removeAttribute('data-progressive-unit');
    clone.removeAttribute('data-progressive-partial');

    clone.classList.remove(
      'progressive-target',
      'is-progressive-loading'
    );

    /*
     * A clone of the target must not contain another skeleton layer.
     */
    clone.querySelectorAll(
      '.progressive-skeleton-layer'
    ).forEach(function (el) {
      el.remove();
    });

    layer.appendChild(clone);

    target.appendChild(layer);

    skeletonizeClone(clone);
  } else {
    layer.appendChild(
      buildPartialFallback(target)
    );

    target.appendChild(layer);
  }

  target.classList.add(
    'progressive-target',
    'is-progressive-loading'
  );

target.__progressiveBuilding = false;

watchProgressiveTarget(target);
}

Accoom.prepareProgressiveUnit = function (target) {
  if (!target) return;

  if (!getSkeletonLayer(target)) {
    makeLayer(target);
  }
};

  function inView(el) {
    var r = el.getBoundingClientRect();

    return (
      r.top < window.innerHeight * 1.15 &&
      r.bottom > -120
    );
  }

  function waitForImages(target, done) {
    var images = Array.prototype.filter.call(
      target.querySelectorAll('img'),
      function (img) {
        if (img.closest('.progressive-skeleton-layer')) return false;

        var r = img.getBoundingClientRect();

        return (
          r.width > 0 &&
          r.height > 0 &&
          r.top < window.innerHeight * 1.25 &&
          r.bottom > -160
        );
      }
    );

    var pending = images.filter(function (img) {
      return !img.complete;
    });

    if (!pending.length) {
      setTimeout(done, 40);
      return;
    }

    var left = pending.length;

    function release() {
      left--;

      if (left <= 0) {
        done();
      }
    }

    pending.forEach(function (img) {
      img.addEventListener('load', release, { once: true });
      img.addEventListener('error', release, { once: true });
    });
  }

function partialReady(target) {
  return hasRealContent(target);
}

  function reveal(target, force) {
    if (!target || target.dataset.progressiveReady) return;

target.dataset.progressiveReady = 'true';
target.classList.remove('is-progressive-loading');
target.style.visibility = '';

if (target.__progressiveObserver) {
  target.__progressiveObserver.disconnect();
  target.__progressiveObserver = null;
}

clearTimeout(target.__progressiveRebuildTimer);

    var layer = Array.prototype.find.call(
      target.children,
      function (child) {
        return child.classList &&
          child.classList.contains('progressive-skeleton-layer');
      }
    );

if (!layer) {
  target.style.visibility = '';
  return;
}

    if (force) {
      layer.remove();
      return;
    }

    layer.classList.add('is-fading');

    setTimeout(function () {
      layer.remove();
    }, 220);
  }

  function startUnit(target) {
    if (target.dataset.progressiveStarted) return;

    target.dataset.progressiveStarted = 'true';

    var timeout = setTimeout(function () {
      reveal(target, true);
    }, FORCE_REVEAL_MS);

    var isPartial = target.matches(
      '.partial-mount, [data-progressive-partial]'
    );

    function finish() {
      clearTimeout(timeout);

      waitForImages(target, function () {
        reveal(target, false);
      });
    }

    if (isPartial) {
      (function waitPartial() {
        if (partialReady(target)) {
          finish();
          return;
        }

        setTimeout(waitPartial, 70);
      })();

      return;
    }

    setTimeout(finish, START_DELAY_MS);
  }

  function checkVisible() {
    units.forEach(function (unit) {
      if (!unit.dataset.progressiveReady && inView(unit)) {
        startUnit(unit);
      }
    });
  }

  function init() {
    if (initialized) return;

    initialized = true;

    collectUnits();

    units.forEach(makeLayer);

var curtain = document.getElementById('page-skeleton');

if (curtain) {
  curtain.remove();
}

    checkVisible();

    window.addEventListener('scroll', checkVisible, {
      passive: true
    });

    window.addEventListener('resize', checkVisible, {
      passive: true
    });

Accoom.on(document, 'partial:loaded', function (e) {
  var target = e && e.detail ? e.detail.el : null;

  /*
   * Only create a progressive skeleton for actual page-level
   * partials. Messages and notifications are nested header
   * controls, not page sections, so they must appear normally.
   */
  if (
    target &&
    !target.matches('[data-private-messages], [data-private-notifications]')
  ) {
    makeLayer(target);

    /*
     * These are dynamically loaded after the initial unit scan,
     * so register them as real progressive units.
     */
    if (!target.dataset.progressiveUnit) {
      addUnit(target);
    }

    if (inView(target)) {
      startUnit(target);
    }
  }

  checkVisible();
});

Accoom.pageReady = function (target) {
  if (target) {
    var el = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (el) {
      reveal(el, false);
      return;
    }
  }

  checkVisible();
};
  }

  Accoom.waitForPageData = function () {};

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {
      once: true
    });
  } else {
    init();
  }

})(window.Accoom);