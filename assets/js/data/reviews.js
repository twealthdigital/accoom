/* ==========================================================================
   ACCOOM — Agent reviews (frontend only, saved in this browser)
   --------------------------------------------------------------------------
   A customer can rate an agent (1-5 stars + optional text) after approving or
   declining a payment. One review per customer per property; writing again
   edits it. A real backend only has to keep the same shape.

   Accoom.Reviews.agentKey(ownerId, name)  -> stable key for an agent
   Accoom.Reviews.forAgent(key)            -> reviews, newest first
   Accoom.Reviews.summary(key)             -> { count, avg }   (avg is 0 when none)
   Accoom.Reviews.mine(key, propertyId)    -> this customer's review or null
   Accoom.Reviews.save({...})              -> saved review
   Accoom.Reviews.openModal({...})         -> stars + text dialog
   ========================================================================== */
window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var KEY = 'accoom-agent-reviews';

  function readAll() {
    try { var a = JSON.parse(window.localStorage.getItem(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function writeAll(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }
  function agentKey(ownerId, name) {
    return ownerId ? 'id:' + ownerId : 'name:' + String(name || '').trim().toLowerCase();
  }
  function reviewer() {
    var u = null;
    try { u = JSON.parse(window.localStorage.getItem('accoom-user')); } catch (e) {}
    var id = u ? (u.id || u.userId || (u.role === 'agent' ? (u.agentId || 'local-agent') : 'local-customer')) : 'guest';
    var full = u ? (u.fullName || u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')) : '';
    var parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    var label = parts.length ? parts[0] + (parts[1] ? ' ' + parts[1].charAt(0).toUpperCase() + '.' : '') : 'Customer';
    return { id: String(id), name: label };
  }
  function forAgent(key) {
    return readAll().filter(function (r) { return r.agentKey === key; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  }
  function summary(key) {
    var list = forAgent(key);
    if (!list.length) return { count: 0, avg: 0 };
    var sum = list.reduce(function (t, r) { return t + (Number(r.rating) || 0); }, 0);
    return { count: list.length, avg: Math.round((sum / list.length) * 10) / 10 };
  }
  function mine(key, propertyId) {
    var me = reviewer().id;
    return readAll().filter(function (r) {
      return r.agentKey === key && String(r.propertyId) === String(propertyId) && r.reviewerId === me;
    })[0] || null;
  }
  function save(d) {
    var rating = Math.round(Number(d.rating));
    if (!(rating >= 1 && rating <= 5)) return null;
    var me = reviewer();
    var list = readAll();
    var text = String(d.text || '').trim().slice(0, 600);
    var now = new Date().toISOString();
    var rec = null;
    list.forEach(function (r) {
      if (r.agentKey === d.agentKey && String(r.propertyId) === String(d.propertyId) && r.reviewerId === me.id) rec = r;
    });
    if (rec) { rec.rating = rating; rec.text = text; rec.updatedAt = now; rec.outcome = d.outcome || rec.outcome; }
    else {
      rec = { id: 'rev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), agentKey: d.agentKey, agentName: d.agentName || '',
        propertyId: String(d.propertyId || ''), propertyName: d.propertyName || '', reviewerId: me.id, reviewerName: me.name,
        rating: rating, text: text, outcome: d.outcome || '', createdAt: now };
      list.push(rec);
    }
    return writeAll(list) ? rec : null;
  }

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var STAR = '<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.5 7 .9-5 4.9 1.2 7-6.2-3.4L5.8 21 7 14 2 9.1l7-.9L12 2z"></path></svg>';
  function stars(n, size) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<span style="display:inline-flex;color:var(--gold,#d9922b);' + (i <= n ? '' : 'opacity:.28') + '">' + STAR.replace(/\{s\}/g, size || 12) + '</span>';
    return out;
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!(s >= 0)) return '';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    var d = Math.round(s / 86400);
    if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
    var m = Math.round(d / 30);
    if (m < 12) return m + (m === 1 ? ' month ago' : ' months ago');
    return Math.round(m / 12) + ' yr ago';
  }

  var styled = false;
  function addStyles() {
    if (styled) return; styled = true;
    var st = document.createElement('style');
    st.textContent =
      '.rv-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.rv-modal{width:100%;max-width:400px;background:var(--surface-page,#fff);color:var(--on-page,#111);border-radius:16px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
      '.rv-modal h3{margin:0 0 4px;font-size:1.1rem}.rv-modal p{margin:0 0 14px;font-size:.85rem;opacity:.75}' +
      '.rv-stars{display:flex;gap:6px;margin-bottom:14px}.rv-star{background:none;border:0;padding:2px;cursor:pointer;color:var(--gold,#d9922b);opacity:.28;line-height:0}.rv-star.is-on{opacity:1}' +
      '.rv-text{width:100%;min-height:96px;resize:vertical;border:1px solid var(--line-page,#ddd);border-radius:10px;padding:10px;font:inherit;font-size:.9rem;background:transparent;color:inherit;box-sizing:border-box}' +
      '.rv-err{color:#d33;font-size:.8rem;min-height:1.1em;margin:6px 0 0}.rv-actions{display:flex;gap:10px;margin-top:12px}' +
      '.rv-btn{flex:1;padding:11px;border-radius:10px;border:1px solid var(--line-page,#ddd);background:transparent;color:inherit;font-weight:600;cursor:pointer}' +
      '.rv-btn--primary{background:var(--gold,#d9922b);border-color:var(--gold,#d9922b);color:#fff}' +
      '.rv-overlay{transition:background .5s ease}.rv-overlay.is-fading{background:rgba(0,0,0,0)}' +
      '.rv-modal.is-success{text-align:center;padding:30px 22px 26px;animation:rv-pop .35s cubic-bezier(.2,.9,.3,1.2)}' +
      '.rv-modal.is-success h3{margin:6px 0 8px;font-size:1.2rem}.rv-modal.is-success p{margin:0;line-height:1.5}' +
      '.rv-check{display:block;margin:0 auto 6px}' +
      '.rv-check-circle{stroke:var(--gold,#d9922b);stroke-width:3;stroke-dasharray:151;stroke-dashoffset:151;animation:rv-draw .6s ease forwards}' +
      '.rv-check-mark{stroke:var(--gold,#d9922b);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:rv-draw .4s .45s ease forwards}' +
      '@keyframes rv-draw{to{stroke-dashoffset:0}}' +
      '@keyframes rv-pop{from{transform:scale(.92);opacity:.6}to{transform:scale(1);opacity:1}}' +
      '.rv-modal.is-dropping{animation:rv-drop .65s cubic-bezier(.5,0,.9,.4) forwards}' +
      '@keyframes rv-drop{0%{transform:translateY(0)}20%{transform:translateY(-16px)}100%{transform:translateY(110vh);opacity:0}}' +
      '@media (prefers-reduced-motion:reduce){.rv-modal.is-success,.rv-modal.is-dropping{animation:none}.rv-check-circle,.rv-check-mark{animation:none;stroke-dashoffset:0}.rv-overlay{transition:none}}';
    document.head.appendChild(st);
  }

  function openModal(o) {
    addStyles();
    var existing = mine(o.agentKey, o.propertyId);
    var rating = o.rating || (existing ? existing.rating : 0);
    var ov = document.createElement('div');
    ov.className = 'rv-overlay';
    ov.innerHTML = '<div class="rv-modal" role="dialog" aria-modal="true" aria-label="Rate this seller">' +
      '<h3>Rate ' + esc(o.agentName || 'this seller') + '</h3>' +
      '<p>' + esc(o.propertyName ? 'About ' + o.propertyName : 'Tell others about your experience') + '</p>' +
      '<div class="rv-stars" role="radiogroup" aria-label="Stars"></div>' +
      '<textarea class="rv-text" maxlength="600" placeholder="Write your review (optional)"></textarea>' +
      '<p class="rv-err" role="alert"></p>' +
      '<div class="rv-actions"><button type="button" class="rv-btn" data-rv-later>Later</button><button type="button" class="rv-btn rv-btn--primary" data-rv-send>Submit</button></div></div>';
    var starsEl = ov.querySelector('.rv-stars'), ta = ov.querySelector('.rv-text'), err = ov.querySelector('.rv-err');
    if (existing) ta.value = existing.text || '';
    for (var i = 1; i <= 5; i++) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'rv-star'; b.setAttribute('data-v', i); b.setAttribute('aria-label', i + ' star' + (i > 1 ? 's' : ''));
      b.innerHTML = STAR.replace(/\{s\}/g, 30); starsEl.appendChild(b);
    }
    function paint() { [].forEach.call(starsEl.children, function (b) { b.classList.toggle('is-on', Number(b.getAttribute('data-v')) <= rating); }); }
    var dropTimer = null;
    function close() {
      window.clearTimeout(dropTimer);
      document.removeEventListener('keydown', onKey);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    // After saving: animated tick and a short message, then the dialog drops away (with a small bounce) back to the chat.
    function showSuccess(rec) {
      if (o.onSaved) o.onSaved(rec);
      var modal = ov.querySelector('.rv-modal');
      modal.setAttribute('aria-label', 'Review submitted');
      modal.className = 'rv-modal is-success';
      modal.innerHTML = '<div role="status">' +
        '<svg class="rv-check" viewBox="0 0 52 52" width="76" height="76" aria-hidden="true"><circle class="rv-check-circle" cx="26" cy="26" r="24" fill="none"></circle><path class="rv-check-mark" fill="none" d="M15 27l8 8 15-17"></path></svg>' +
        '<h3>Review submitted</h3>' +
        '<p>Your review will be updated on ' + esc(o.agentName ? o.agentName + '\u2019s' : 'the seller\u2019s') + ' profile shortly. Thank you for sharing your experience.</p></div>';
      dropTimer = window.setTimeout(function () {
        modal.classList.add('is-dropping'); ov.classList.add('is-fading');
        dropTimer = window.setTimeout(close, 650);
      }, 2200);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    starsEl.addEventListener('click', function (e) { var b = e.target.closest('.rv-star'); if (!b) return; rating = Number(b.getAttribute('data-v')); err.textContent = ''; paint(); });
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-rv-later]')) { close(); return; }
      if (e.target.closest('[data-rv-send]')) {
        if (!rating) { err.textContent = 'Please choose a star rating.'; return; }
        var rec = save({ agentKey: o.agentKey, agentName: o.agentName, propertyId: o.propertyId, propertyName: o.propertyName, rating: rating, text: ta.value, outcome: o.outcome });
        if (!rec) { err.textContent = 'Could not save your review. Please try again.'; return; }
        showSuccess(rec);
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov); paint();
  }

  Accoom.Reviews = { agentKey: agentKey, forAgent: forAgent, summary: summary, mine: mine, save: save, openModal: openModal, stars: stars, ago: ago, esc: esc };
})(window.Accoom);
