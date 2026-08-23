/* ==========================================================================
   ACCOOM — Saved Properties Page
   Reads/writes the same 'accoom_saved_properties' key profile.js already
   writes to (via the order-menu "Save Property" action). Swap
   getSavedProperties() / removeSavedProperty() for real fetch/delete
   calls once the backend exists — everything below only depends on the
   property object shape (id, name, location, price, image), plus
   optional beds/baths/sqm/priceUnit fields if your API returns them.
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

    var signoutBtn = document.querySelector('[data-saved-signout]');
    if (signoutBtn) {
      Accoom.on(signoutBtn, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
    }

    // ----------------------------------------------------------------
    // Data access — swap these two functions for real API calls:
    //
    //   function getSavedProperties(cb) {
    //     fetch('/api/account/saved-properties')
    //       .then(function (res) { return res.json(); })
    //       .then(cb)
    //       .catch(function () { cb([]); });
    //   }
    //
    //   function removeSavedProperty(id, cb) {
    //     fetch('/api/account/saved-properties/' + encodeURIComponent(id), { method: 'DELETE' })
    //       .then(function () { cb(true); })
    //       .catch(function () { cb(false); });
    //   }
    //
    // render() below only needs the array back — nothing else changes.
    // ----------------------------------------------------------------
    function getSavedProperties(cb) {
      var saved = JSON.parse(localStorage.getItem('accoom_saved_properties') || '[]');
      cb(saved);
    }

    function removeSavedProperty(id, cb) {
      var saved = JSON.parse(localStorage.getItem('accoom_saved_properties') || '[]');
      saved = saved.filter(function (p) { return p.id !== id; });
      localStorage.setItem('accoom_saved_properties', JSON.stringify(saved));
      cb(true);
    }

    var listEl = document.querySelector('[data-saved-list]');
    var emptyEl = document.querySelector('[data-saved-empty]');
    var countEl = document.querySelector('[data-saved-count]');

    function specLine(property) {
      var parts = [];
      if (property.beds) parts.push(property.beds + (property.beds === 1 ? ' Bed' : ' Beds'));
      if (property.baths) parts.push(property.baths + (property.baths === 1 ? ' Bath' : ' Baths'));
      if (property.sqm) parts.push(property.sqm + ' sqm');
      return parts;
    }

    function renderCard(property) {
      var article = document.createElement('article');
      article.className = 'saved-item';

      var specs = specLine(property);
      var specsHtml = specs.map(function (s, i) {
        return '<span>' + (i > 0 ? '<span aria-hidden="true">|</span> ' : '') + s + '</span>';
      }).join('');

      article.innerHTML =
        '<a class="saved-thumb" href="property.html?id=' + encodeURIComponent(property.id) + '&name=' + encodeURIComponent(property.name) + '">' +
          '<img src="' + property.image + '" alt="' + property.name + '" />' +
        '</a>' +
        '<div class="saved-info">' +
          '<h4>' + property.name + '</h4>' +
          (property.location ?
            '<p class="saved-loc"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>' + property.location + '</p>'
            : '') +
          (specs.length ? '<div class="saved-specs">' + specsHtml + '</div>' : '') +
        '</div>' +
        '<div class="saved-price-block">' +
          '<span class="saved-price">' + (property.price || '') + '</span>' +
          (property.priceUnit ? '<span class="saved-price-unit">' + property.priceUnit + '</span>' : '') +
        '</div>' +
        '<button type="button" class="saved-remove-btn" data-saved-remove="' + property.id + '" aria-label="Remove ' + property.name + ' from saved properties">' +
          '<span class="saved-remove-icon">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-6.7-4.3-9.3-8.2C1.1 10.3 1.6 6.8 4.3 5.1c2.2-1.4 5-.9 6.7 1.1l1 1.2 1-1.2c1.7-2 4.5-2.5 6.7-1.1 2.7 1.7 3.2 5.2 1.6 7.7C18.7 16.7 12 21 12 21z"></path></svg>' +
          '</span>' +
          '<span class="saved-remove-label">Remove</span>' +
        '</button>';

      return article;
    }

    function render(properties) {
      if (!listEl) return;
      listEl.innerHTML = '';

      if (countEl) {
        countEl.textContent = properties.length + (properties.length === 1 ? ' Saved Property' : ' Saved Properties');
      }

      if (!properties.length) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;

      properties.forEach(function (property) {
        listEl.appendChild(renderCard(property));
      });
    }

    if (listEl) {
      Accoom.on(listEl, 'click', function (e) {
        var btn = e.target.closest('[data-saved-remove]');
        if (!btn) return;
        e.preventDefault();
        var id = btn.getAttribute('data-saved-remove');
        removeSavedProperty(id, function () {
          getSavedProperties(render);
        });
      });
    }

    getSavedProperties(render);

  });

})(window.Accoom);