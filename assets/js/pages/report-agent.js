/* ==========================================================================
   ACCOOM — Report Agent
   Category first, then the details. Saves the report, shows the confirmation
   dialog, then offers "Make another report about <agent>".
   The chat page stores who is being reported under 'accoom-report-context'.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  /* Every category covers the whole platform. money:true shows the amount /
     "paid outside ACCOOM?" fields. */
  var CATEGORIES = [
    { id: 'offplatform_deal', title: 'Taking the deal off ACCOOM', desc: 'Asked to continue, agree or close the deal outside the platform.', hint: 'Tell us what they proposed, and where they wanted to move the deal.' },
    { id: 'extra_fees', title: 'Asking for extra fees outside ACCOOM', desc: 'Requested agency, legal, inspection or other fees that are not on the listing.', money: true, hint: 'Which fee did they ask for, how much, and how did they want it paid?' },
    { id: 'direct_payment', title: 'Asking for direct payment', desc: 'Asked you to pay by transfer, cash or crypto instead of paying on ACCOOM.', money: true, hint: 'What payment method did they ask for, and what reason did they give?' },
    { id: 'contact_details', title: 'Pushing contact details', desc: 'Asked for or shared phone numbers, WhatsApp, socials or email to move the chat.', hint: 'Which platform or details did they push, and what did they say?' },
    { id: 'fake_listing', title: 'Fake or misleading listing', desc: 'Photos, price, location or details do not match the real property.', hint: 'What is different between the listing and the real property?' },
    { id: 'price_change', title: 'Price changed after agreeing', desc: 'Raised the price or added hidden costs after you showed interest.', money: true, hint: 'What was the agreed price, and what did they change it to?' },
    { id: 'unavailable', title: 'Property not available', desc: 'The listing is still up but the property is taken, sold or does not exist.', hint: 'How did you find out the property was not available?' },
    { id: 'scam', title: 'Suspected scam or fraud', desc: 'Something feels like a scam, or money or documents were taken dishonestly.', money: true, hint: 'Describe what happened in order, with any names, dates and amounts.' },
    { id: 'impersonation', title: 'Fake identity or impersonation', desc: 'Pretending to be someone else, or claiming to be verified when they are not.', hint: 'Who are they pretending to be, and what made you suspicious?' },
    { id: 'pressure', title: 'Pressure or rushed payment', desc: 'Used threats, fake urgency or "other buyers are waiting" to force a decision.', hint: 'What did they say or do to rush you?' },
    { id: 'refund', title: 'Refund or dispute problem', desc: 'Refused a refund, delayed approval or will not resolve a payment dispute.', money: true, hint: 'What was paid, what was promised, and what is the agent refusing to do?' },
    { id: 'no_show', title: 'No-show or missed viewing', desc: 'Did not turn up for a viewing, or cancelled without notice.', hint: 'When was the viewing arranged, and what happened on the day?' },
    { id: 'unprofessional', title: 'Rude, unprofessional or unresponsive', desc: 'Disrespectful, misleading or stopped replying without explanation.', hint: 'Describe how they behaved and over what period.' },
    { id: 'harassment', title: 'Harassment or abusive language', desc: 'Insults, threats, repeated unwanted messages or inappropriate behaviour.', hint: 'What was said or done, and how often?' },
    { id: 'discrimination', title: 'Discrimination', desc: 'Treated you unfairly because of tribe, religion, gender, marital status or similar.', hint: 'What happened and what did they say?' },
    { id: 'privacy', title: 'Privacy or data misuse', desc: 'Shared or used your personal information without your permission.', hint: 'What information was shared or used, and how did you find out?' },
    { id: 'spam_listings', title: 'Duplicate or spam listings', desc: 'Posting the same property many times, or unrelated or fake listings.', hint: 'Where did you see the duplicates or spam?' },
    { id: 'other', title: 'Something else', desc: 'It does not fit any category above.', hint: 'Tell us what happened in as much detail as you can.' }
  ];

  var MAX_FILES = 5;
  var MAX_BYTES = 10 * 1024 * 1024;

  Accoom.ready(function () {
    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var ctx = Accoom.getStorage('accoom-report-context', null) || {};
    var agentName = (ctx.agentName || '').trim();

    var els = {
      form: $('[data-rp-form]'),
      formWrap: $('[data-rp-form-wrap]'),
      success: $('[data-rp-success]'),
      agentCard: $('[data-rp-agent-card]'),
      agentField: $('[data-rp-agent-field]'),
      agentInput: $('#rp-agent-input'),
      cats: $('[data-rp-cats]'),
      catError: $('[data-rp-cat-error]'),
      details: $('[data-rp-details]'),
      chosen: $('[data-rp-chosen]'),
      subject: $('#rp-subject'),
      date: $('#rp-date'),
      property: $('#rp-property'),
      desc: $('#rp-desc'),
      count: $('[data-rp-count]'),
      money: $('[data-rp-money]'),
      amount: $('#rp-amount'),
      drop: $('[data-rp-drop]'),
      file: $('[data-rp-file]'),
      fileBtn: $('[data-rp-file-btn]'),
      fileError: $('[data-rp-file-error]'),
      files: $('[data-rp-files]'),
      block: $('[data-rp-block]'),
      confirm: $('[data-rp-confirm]'),
      confirmError: $('[data-rp-confirm-error]'),
      submit: $('[data-rp-submit]'),
      dialog: $('[data-rp-dialog]')
    };

    var state = { category: null, files: [], lastFocus: null };

    /* ---------- Who is being reported ---------- */
    function propLabel(p) {
      if (!p) return '';
      return [p.name, p.location].filter(Boolean).join(' · ');
    }

    function setAgentName(name) {
      agentName = name;
      Array.prototype.forEach.call(document.querySelectorAll('[data-rp-agent-name], [data-rp-success-name], [data-rp-another-name], [data-rp-dialog-name]'), function (n) {
        n.textContent = name || 'this agent';
      });
    }

    if (agentName) {
      els.agentCard.hidden = false;
      var av = $('[data-rp-agent-avatar]');
      if (ctx.avatar) av.src = ctx.avatar;
      av.alt = agentName;
      $('[data-rp-agent-verified]').hidden = !ctx.verified;
      $('[data-rp-agent-prop]').textContent = propLabel(ctx.property);
      setAgentName(agentName);
    } else {
      // Opened without a chat: ask who is being reported.
      els.agentField.hidden = false;
      setAgentName('');
    }

    // Back to chat: reopen the exact conversation when we know it.
    var backHref = 'contact-agent.html' + (ctx.property && ctx.property.id ? '?open=' + encodeURIComponent(ctx.property.id) : '');
    Array.prototype.forEach.call(document.querySelectorAll('[data-rp-back], [data-rp-back-secondary]'), function (a) { a.setAttribute('href', backHref); });

    /* ---------- Categories ---------- */
    CATEGORIES.forEach(function (c) {
      var label = document.createElement('label');
      label.className = 'rp-cat';
      label.innerHTML =
        '<input type="radio" name="category" value="' + c.id + '" />' +
        '<span class="rp-cat-body">' +
          '<span class="rp-cat-text"><b></b><small></small></span>' +
          '<span class="rp-cat-dot"></span>' +
        '</span>';
      label.querySelector('b').textContent = c.title;
      label.querySelector('small').textContent = c.desc;
      els.cats.appendChild(label);
    });

    function getCategory(id) {
      for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
      return null;
    }

    Accoom.on(els.cats, 'change', function (e) {
      var cat = getCategory(e.target.value);
      if (!cat) return;
      state.category = cat;
      els.catError.textContent = '';
      els.chosen.textContent = cat.title;
      els.desc.placeholder = cat.hint + ' Include names, dates and anything that was said.';
      els.money.hidden = !cat.money;
      var revealing = els.details.hidden;
      els.details.hidden = false;
      if (revealing) {
        window.setTimeout(function () {
          els.details.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    });

    /* ---------- Property select ---------- */
    function buildPropertyOptions() {
      var list = [];
      if (ctx.properties && ctx.properties.length) list = ctx.properties;
      else if (ctx.property && ctx.property.id) list = [ctx.property];
      els.property.innerHTML = '';
      var first = document.createElement('option');
      first.value = '';
      first.textContent = 'Select one';
      els.property.appendChild(first);
      list.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name + (p.location ? ' — ' + p.location : '');
        els.property.appendChild(o);
      });
      var none = document.createElement('option');
      none.value = 'none';
      none.textContent = 'Not about a specific property';
      els.property.appendChild(none);
      if (ctx.property && ctx.property.id) els.property.value = ctx.property.id;
    }
    buildPropertyOptions();

    // Today's date as the latest allowed incident date
    function todayStr() {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    els.date.max = todayStr();
    els.date.value = todayStr();

    /* ---------- Counter ---------- */
    Accoom.on(els.desc, 'input', function () {
      els.count.textContent = els.desc.value.length + ' / 2000';
    });

    /* ---------- Evidence ---------- */
    function fmtSize(b) {
      if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
      return (b / 1024 / 1024).toFixed(1) + ' MB';
    }

    function renderFiles() {
      els.files.innerHTML = '';
      state.files.forEach(function (f, i) {
        var li = document.createElement('li');
        li.className = 'rp-file';
        var thumb;
        if (/^image\//.test(f.type)) {
          thumb = document.createElement('img');
          thumb.className = 'rp-file-thumb';
          thumb.alt = '';
          thumb.src = URL.createObjectURL(f);
        } else {
          thumb = document.createElement('span');
          thumb.className = 'rp-file-thumb';
          thumb.textContent = 'PDF';
        }
        var info = document.createElement('div');
        info.className = 'rp-file-info';
        var n = document.createElement('p'); n.className = 'rp-file-name'; n.textContent = f.name;
        var s = document.createElement('p'); s.className = 'rp-file-size'; s.textContent = fmtSize(f.size);
        info.appendChild(n); info.appendChild(s);
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'rp-file-remove';
        rm.setAttribute('aria-label', 'Remove ' + f.name);
        rm.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        rm.addEventListener('click', function () { state.files.splice(i, 1); renderFiles(); });
        li.appendChild(thumb); li.appendChild(info); li.appendChild(rm);
        els.files.appendChild(li);
      });
    }

    function addFiles(list) {
      els.fileError.textContent = '';
      Array.prototype.forEach.call(list, function (f) {
        if (state.files.length >= MAX_FILES) { els.fileError.textContent = 'You can add up to ' + MAX_FILES + ' files.'; return; }
        if (!/^(image\/(png|jpe?g)|application\/pdf)$/.test(f.type)) { els.fileError.textContent = '"' + f.name + '" is not a PNG, JPG or PDF.'; return; }
        if (f.size > MAX_BYTES) { els.fileError.textContent = '"' + f.name + '" is larger than 10MB.'; return; }
        state.files.push(f);
      });
      renderFiles();
    }

    Accoom.on(els.fileBtn, 'click', function () { els.file.click(); });
    Accoom.on(els.file, 'change', function () { addFiles(els.file.files); els.file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) {
      els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      els.drop.addEventListener(ev, function (e) { e.preventDefault(); els.drop.classList.remove('is-over'); });
    });
    els.drop.addEventListener('drop', function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });

    /* ---------- Validation ---------- */
    function fieldOf(input) { return input.closest('.rp-field'); }
    function showError(input, msg) {
      var f = fieldOf(input);
      if (!f) return;
      f.classList.add('has-error');
      var p = f.querySelector('.rp-error');
      if (p) p.textContent = msg;
    }
    function clearError(input) {
      var f = fieldOf(input);
      if (!f) return;
      f.classList.remove('has-error');
      var p = f.querySelector('.rp-error');
      if (p) p.textContent = '';
    }
    [els.agentInput, els.subject, els.date, els.property, els.desc, els.amount].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('input', function () { clearError(inp); });
      inp.addEventListener('change', function () { clearError(inp); });
    });
    Accoom.on(els.confirm, 'change', function () { els.confirmError.textContent = ''; });
    Accoom.on(els.form, 'change', function (e) {
      if (e.target.name === 'paidOutside') clearError(e.target);
    });

    function validate() {
      var firstBad = null;
      function bad(el, msg) { showError(el, msg); if (!firstBad) firstBad = el; }

      if (!agentName && !els.agentInput.value.trim()) bad(els.agentInput, 'Enter the name of the agent you are reporting.');

      if (!state.category) {
        els.catError.textContent = 'Choose a category before you continue.';
        if (!firstBad) firstBad = els.cats;
      } else {
        if (els.subject.value.trim().length < 5) bad(els.subject, 'Add a short summary (at least 5 characters).');
        if (!els.date.value) bad(els.date, 'Choose the date it happened.');
        else if (els.date.value > todayStr()) bad(els.date, 'The date cannot be in the future.');
        if (!els.property.value) bad(els.property, 'Choose a property, or "Not about a specific property".');
        var len = els.desc.value.trim().length;
        if (len < 30) bad(els.desc, 'Please describe what happened in at least 30 characters (' + len + ' so far).');
        if (state.category.money) {
          var paid = els.form.querySelector('input[name="paidOutside"]:checked');
          if (!paid) bad(els.form.querySelector('input[name="paidOutside"]'), 'Tell us whether you already sent money.');
          if (els.amount.value !== '' && Number(els.amount.value) < 0) bad(els.amount, 'Enter a valid amount.');
        }
        if (!els.confirm.checked) {
          els.confirmError.textContent = 'Please confirm that your report is true before submitting.';
          if (!firstBad) firstBad = els.confirm;
        }
      }
      if (firstBad) {
        var target = firstBad.closest('.rp-field') || firstBad.closest('.rp-card') || firstBad;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (firstBad.focus && firstBad !== els.cats) { try { firstBad.focus({ preventScroll: true }); } catch (e) { firstBad.focus(); } }
        return false;
      }
      return true;
    }

    /* ---------- Save ---------- */
    function makeRef() {
      var s = '';
      var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (var i = 0; i < 8; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
      return 'RPT-' + s;
    }

    function saveReport() {
      var ref = makeRef();
      var name = agentName || els.agentInput.value.trim();
      var paid = els.form.querySelector('input[name="paidOutside"]:checked');
      var propId = els.property.value;
      var report = {
        ref: ref,
        createdAt: Date.now(),
        agentName: name,
        convId: ctx.convId || null,
        propertyId: propId && propId !== 'none' ? propId : null,
        category: state.category.id,
        categoryTitle: state.category.title,
        subject: els.subject.value.trim(),
        incidentDate: els.date.value,
        description: els.desc.value.trim(),
        amount: state.category.money && els.amount.value !== '' ? Number(els.amount.value) : null,
        paidOutside: state.category.money && paid ? paid.value : null,
        evidence: state.files.map(function (f) { return { name: f.name, size: f.size, type: f.type }; }),
        blocked: !!els.block.checked,
        status: 'under_review'
      };
      var all = Accoom.getStorage('accoom-reports', []);
      if (!Array.isArray(all)) all = [];
      all.unshift(report);
      Accoom.setStorage('accoom-reports', all);

      // Reflect it in the chat: property goes "In Dispute", and block if asked.
      try {
        var convs = Accoom.getStorage('accoom-conversations', null);
        if (Array.isArray(convs) && ctx.convId) {
          convs.forEach(function (c) {
            if (c.id !== ctx.convId) return;
            if (report.propertyId) {
              c.propertyState = c.propertyState || {};
              var k = String(report.propertyId);
              c.propertyState[k] = c.propertyState[k] || { paymentStatus: 'idle', disputed: false, purchaseOrderId: null };
              c.propertyState[k].disputed = true;
            }
            if (report.blocked) c.blocked = true;
          });
          Accoom.setStorage('accoom-conversations', convs);
        }
      } catch (e) { /* never block the report */ }

      return report;
    }

    /* ---------- Dialog ---------- */
    function openDialog(report) {
      state.lastFocus = document.activeElement;
      $('[data-rp-dialog-ref]').textContent = report.ref;
      $('[data-rp-success-ref]').textContent = report.ref;
      $('[data-rp-success-blocked]').hidden = !report.blocked;
      els.dialog.classList.add('is-open');
      els.dialog.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      var box = els.dialog.querySelector('.rp-dialog');
      window.setTimeout(function () { box.focus(); }, 60);
    }

    function closeDialog() {
      if (!els.dialog.classList.contains('is-open')) return;
      els.dialog.classList.remove('is-open');
      els.dialog.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      // After closing, the screen becomes "Make another report about <agent>"
      els.formWrap.hidden = true;
      els.success.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    Array.prototype.forEach.call(els.dialog.querySelectorAll('[data-rp-dialog-close]'), function (b) {
      b.addEventListener('click', closeDialog);
    });
    // Click on the dark area outside the box
    els.dialog.addEventListener('click', function (e) { if (e.target === els.dialog) closeDialog(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDialog(); });

    /* ---------- Submit ---------- */
    Accoom.on(els.form, 'submit', function (e) {
      e.preventDefault();
      if (!validate()) return;
      els.submit.classList.add('is-loading');
      els.submit.disabled = true;
      window.setTimeout(function () {
        if (!agentName) setAgentName(els.agentInput.value.trim());
        var report = saveReport();
        els.submit.classList.remove('is-loading');
        els.submit.disabled = false;
        openDialog(report);
      }, 1200);
    });

    /* ---------- Make another report ---------- */
    Accoom.on($('[data-rp-another]'), 'click', function () {
      els.form.reset();
      state.category = null;
      state.files = [];
      renderFiles();
      els.fileError.textContent = '';
      els.catError.textContent = '';
      els.confirmError.textContent = '';
      Array.prototype.forEach.call(els.form.querySelectorAll('.has-error'), function (f) { f.classList.remove('has-error'); });
      Array.prototype.forEach.call(els.form.querySelectorAll('.rp-field .rp-error'), function (p) { p.textContent = ''; });
      els.details.hidden = true;
      els.money.hidden = true;
      els.count.textContent = '0 / 2000';
      buildPropertyOptions();
      els.date.value = todayStr();
      if (agentName && !ctx.agentName) els.agentInput.value = agentName;
      els.success.hidden = true;
      els.formWrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

})(window.Accoom);