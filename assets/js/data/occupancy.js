/* ==========================================================================
   ACCOOM — Occupancy Extension, vacancy and handover (Stage 7)
   --------------------------------------------------------------------------
   OCCUPANCY EXTENSION is the agreed number of days AFTER the scheduled
   tenancy expiry date during which the tenant may stay while renewal or
   move-out is arranged. It is chosen per rental listing (none, 7, 14, 30,
   60, 90 or a custom number of days), copied into the tenancy when the
   tenancy starts, and written into the ACTD. Changing a listing later only
   affects NEW tenancies.

   TIMELINE OF ONE TENANCY (all in Nigerian time)
     start ............. rent paid, tenancy "active"
     70/80/90% ......... renewal reminders (Stage 6)
     expiry (100%) ..... tenant told; Occupancy Extension starts (if any)
     during extension .. milestone reminders (default: 14, 7, 3, 1 days left)
     extension ends .... status "awaiting vacancy confirmation"; tenant,
                         agent (acting for the landlord) are all asked to
                         confirm the occupancy status.
     handover .......... agent records an inspection, tenant acknowledges it,
                         tenant confirms moving out, agent confirms vacancy,
                         agent confirms the property is ready for a new tenant.
     ready ............. the listing is marked ELIGIBLE for reactivation.
                         Stage 8 decides when it actually goes public again.

   WHAT NEVER HAPPENS AUTOMATICALLY
     - an expired tenancy never turns into a renewed one;
     - ACCOOM never assumes the tenant has left;
     - a property with a tenant still inside, or with an open dispute, is
       never marked eligible for reactivation.

   HONEST LIMITS
     - Dates are worked out when someone opens ACCOOM in this browser. A
       server scheduler is needed for fully automatic reminders.
     - ACCOOM has no separate landlord accounts yet. "Landlord" messages go
       to the listing's agent, who acts for the landlord.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var NG_OFFSET_MS = 3600000, DAY = 86400000;
  var PRESETS = [0, 7, 14, 30, 60, 90];
  var MAX_CUSTOM = 365;
  var DEFAULT_MILESTONES = [14, 7, 3, 1];
  var TENANT_SILENT_DAYS = 7; // after this, an agent's inspection can confirm vacancy without the tenant
  var OPEN = ['occupancy_extension', 'awaiting_vacancy_confirmation'];

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function rec(n) { return Accoom.Records.collection(n); }
  function T() { return Accoom.Tenancy; }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function adminOk(a) { return a && a.role === 'admin' && Accoom.AdminDemo && Accoom.AdminDemo.isActive(); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function dateOf(ms) { return new Date(ms + NG_OFFSET_MS).toISOString().slice(0, 10); }

  /* ------------------------------------------------------- configuration */
  // input: { days: 0|7|14|30|60|90|<custom>, milestones?: [14,7,...] }  ->  { mode, days, milestones? }
  function normalizeConfig(input) {
    input = input || {};
    var raw = input.days === '' || input.days == null ? 0 : Number(input.days);
    if (!isFinite(raw) || Math.floor(raw) !== raw || raw < 0) throw fail('bad_days', 'Enter the Occupancy Extension as a whole number of days.');
    if (raw > MAX_CUSTOM) throw fail('too_long', 'An Occupancy Extension can be at most ' + MAX_CUSTOM + ' days.');
    var out = { mode: raw === 0 ? 'none' : (PRESETS.indexOf(raw) !== -1 ? 'days' : 'custom'), days: raw };
    if (raw > 0 && input.milestones != null && input.milestones !== '') {
      var list = Array.isArray(input.milestones) ? input.milestones : String(input.milestones).split(/[\s,]+/);
      var ms = [];
      list.forEach(function (x) {
        if (x === '' || x == null) return;
        var n = Number(x);
        if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n >= raw) throw fail('bad_milestones', 'Each reminder must be a whole number of days left, from 1 to ' + (raw - 1) + '.');
        if (ms.indexOf(n) === -1) ms.push(n);
      });
      ms.sort(function (a, b) { return b - a; });
      if (ms.length > 10) throw fail('bad_milestones', 'Use at most 10 reminders.');
      if (ms.length) out.milestones = ms;
    }
    return out;
  }

  function milestonesFor(t) {
    var days = t.occupancyExtension.days, m = t.occupancyExtension.milestones;
    var list = Array.isArray(m) && m.length ? m : DEFAULT_MILESTONES;
    return list.filter(function (x) { return x < days; }).sort(function (a, b) { return b - a; });
  }

  // The agent sets the Occupancy Extension for a RENTAL listing. Only new tenancies are affected.
  function setListingConfig(actor, listingId, input) {
    if (!actor || actor.role !== 'agent') return Promise.reject(fail('forbidden', 'Only the agent can set the Occupancy Extension.'));
    return new Promise(function (resolve, reject) {
      var cfg;
      try { cfg = normalizeConfig(input); } catch (e) { reject(e); return; }
      var list;
      try { list = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); } catch (e) { list = null; }
      var l = Array.isArray(list) ? list.filter(function (x) { return String(x.id) === String(listingId); })[0] : null;
      if (!l) { reject(fail('not_found', 'Listing not found.')); return; }
      if (l.category === 'sale' || l.listingType === 'sale') { reject(fail('not_rental', 'An Occupancy Extension only applies to rental listings.')); return; }
      if (l.ownerId && l.ownerId !== actor.id) { reject(fail('forbidden', 'You can only change your own listings.')); return; }
      var next = list.map(function (x) { return String(x.id) === String(listingId) ? Object.assign({}, x, { occupancyExtension: cfg }) : x; });
      try { window.localStorage.setItem('accoom-agent-listings', JSON.stringify(next)); } catch (e) { reject(fail('quota', 'Could not save. Browser storage is full.')); return; }
      Accoom.Records.audit({ actorId: actor.id, actorRole: 'agent', action: 'listing.occupancy_extension', entityType: 'listing', entityId: String(listingId), detail: cfg }).catch(function () {});
      resolve(cfg);
    });
  }

  /* --------------------------------------------------------------- timing */
  function window_(t) {
    var days = t.occupancyExtension.days;
    var expiryMs = T().dayStartMs(t.expiryDate);
    var endDate = Accoom.TenancyDates.addDays(t.expiryDate, days);
    return { expiryMs: expiryMs, days: days, endDate: endDate, endMs: days > 0 ? T().dayStartMs(endDate) : expiryMs };
  }
  function daysLeft(t, now) { var w = window_(t); return Math.max(0, Math.ceil((w.endMs - now) / DAY)); }

  /* ------------------------------------------------------------- ACTD note */
  function actdNote(t, text, reason) {
    if (!Accoom.ACTD) return Promise.resolve();
    return Accoom.ACTD.addendum({ role: 'system', id: 'system' }, t.transactionId, { reason: reason, changes: { s4: { occupancyExtension: text } } }).catch(function () { return null; });
  }

  /* -------------------------------------------------------------- advance */
  // Moves one tenancy through expiry -> extension -> awaiting vacancy, once.
  function advance(id, now) { return T()._lock(id, function () { return advanceCore(id, now); }); }

  // Same as advance() but without taking the tenancy lock (callers that already hold it use this).
  function advanceCore(id, now) {
    now = now == null ? Date.now() : now;
    return (function () {
      return rec('tenancies').get(id).then(function (t) {
        if (!t || (t.status !== 'active' && t.status !== 'occupancy_extension')) return { changed: false };
        var w = window_(t), jobs = [], n = T()._notify;
        if (now < w.expiryMs) return { changed: false };
        var next = clone(t), changed = false, at = new Date(now).toISOString(); // follows the supplied clock (identical to the real time in normal use)

        if (next.status === 'active') {
          changed = true;
          if (w.days > 0) {
            next.status = 'occupancy_extension';
            next.extension = { state: 'running', startedAt: at, startDate: t.expiryDate, endDate: w.endDate, daysTotal: w.days, milestones: {} };
            if (now < w.endMs) {
              jobs.push(n({ dedupeKey: 'ten:' + id + ':ext:start:c', category: 'tenancy_extension_started', recipientId: t.customerId, recipientRole: 'customer', title: 'Occupancy Extension started',
                message: 'Your scheduled tenancy expiry date has passed for \u201C' + t.listingName + '\u201D. Your agreed Occupancy Extension of ' + plural(w.days, 'day') + ' has started and runs until ' + w.endDate + '. Please renew or arrange to move out before it ends. ACCOOM has not assumed you have left or renewed.', link: 'tenancies.html#' + id }));
              jobs.push(n({ dedupeKey: 'ten:' + id + ':ext:start:a', category: 'tenancy_extension_started', recipientId: t.agentId, recipientRole: 'agent', title: 'Occupancy Extension started',
                message: '\u201C' + t.listingName + '\u201D (' + t.customerName + ') reached its scheduled expiry. The agreed Occupancy Extension of ' + plural(w.days, 'day') + ' started and ends on ' + w.endDate + '. Please confirm the occupancy status with the tenant. (Sent to the agent acting for the landlord.)', link: 'tenancies.html#' + id }));
            }
            jobs.push(actdNote(t, 'Occupancy Extension of ' + plural(w.days, 'day') + ' started on ' + t.expiryDate + ' and ends on ' + w.endDate + '. The tenant has not been assumed to have left or renewed.', 'Occupancy Extension started'));
          } else {
            next.status = 'awaiting_vacancy_confirmation'; next.extension = { state: 'none', daysTotal: 0 };
            next.vacancy = newVacancy(at);
            jobs.push(vacancyNotices(t, id, 'The scheduled expiry date has arrived and no Occupancy Extension was agreed.'));
          }
        }

        if (next.status === 'occupancy_extension') {
          if (now >= w.endMs) {
            changed = true; next.extension.state = 'ended'; next.extension.endedAt = at; next.status = 'awaiting_vacancy_confirmation'; next.vacancy = newVacancy(at);
            jobs.push(vacancyNotices(t, id, 'The Occupancy Extension of ' + plural(w.days, 'day') + ' ended on ' + w.endDate + '.'));
            jobs.push(actdNote(t, 'Occupancy Extension ended on ' + w.endDate + '. Vacancy confirmation was requested from the tenant and agent. Nobody has been assumed to have left.', 'Occupancy Extension ended'));
          } else {
            var ms = milestonesFor(next), due = ms.filter(function (m) { return !next.extension.milestones[m] && now >= w.endMs - m * DAY; });
            if (due.length) {
              changed = true;
              var latest = due[due.length - 1]; // smallest "days left" = most recent
              due.forEach(function (m) { if (m !== latest) next.extension.milestones[m] = { state: 'skipped_late', at: at }; });
              next.extension.milestones[latest] = { state: 'sent', at: at };
              var left = plural(latest, 'day') + ' left';
              jobs.push(n({ dedupeKey: 'ten:' + id + ':ext:' + latest, category: 'tenancy_extension_ending', recipientId: t.customerId, recipientRole: 'customer', title: 'Occupancy Extension: ' + left,
                message: '\u201C' + t.listingName + '\u201D: ' + left + ' in your Occupancy Extension (it ends on ' + w.endDate + '). Please confirm whether you will renew or move out.', link: 'tenancies.html#' + id }));
              jobs.push(n({ dedupeKey: 'ten:' + id + ':ext:' + latest + ':a', category: 'tenancy_extension_ending', recipientId: t.agentId, recipientRole: 'agent', title: 'Occupancy Extension: ' + left,
                message: '\u201C' + t.listingName + '\u201D (' + t.customerName + '): ' + left + ' (ends ' + w.endDate + '). Please confirm the occupancy status.', link: 'tenancies.html#' + id }));
            }
          }
        }
        if (!changed) return { changed: false };
        return Promise.all(jobs).then(function () { return rec('tenancies').put(next); })
          .then(function (saved) { return T()._audit({ role: 'system' }, 'tenancy.occupancy_advanced', id, { status: saved.status }).then(function () { return { changed: true, tenancy: saved }; }); });
      });
    })();
  }

  function newVacancy(at) {
    return { requestedAt: at, tenantVacated: null, handover: null, handoverAck: null, agentVacancyConfirmed: null, agentReady: null, stillOccupying: false, dispute: null, relist: { eligible: false } };
  }
  function vacancyNotices(t, id, why) {
    var n = T()._notify;
    return Promise.all([
      n({ dedupeKey: 'ten:' + id + ':vac:c', category: 'tenancy_vacancy', recipientId: t.customerId, recipientRole: 'customer', title: 'Please confirm whether you have moved out',
        message: why + ' for \u201C' + t.listingName + '\u201D. Please tell ACCOOM if you have moved out or are still in the property. ACCOOM has not assumed you have left.', link: 'tenancies.html#' + id }),
      n({ dedupeKey: 'ten:' + id + ':vac:a', category: 'tenancy_vacancy', recipientId: t.agentId, recipientRole: 'agent', title: 'Confirm vacancy and inspect the property',
        message: why + ' for \u201C' + t.listingName + '\u201D (' + t.customerName + '). Please inspect the property, record the handover and confirm the occupancy status. (Sent to the agent acting for the landlord.)', link: 'tenancies.html#' + id })
    ]);
  }

  function advanceAll(now) {
    return rec('tenancies').all().then(function (all) {
      return Promise.all(all.filter(function (t) { return t.status === 'active' || t.status === 'occupancy_extension'; }).map(function (t) { return advance(t.id, now).catch(function () { return { changed: false }; }); }));
    }).then(function (rs) { return rs.filter(function (r) { return r.changed; }).length; });
  }

  /* ------------------------------------------------------- vacancy workflow */
  function load(actor, id, role, now) {
    return advanceCore(id, now).then(function () { return rec('tenancies').get(id); }).then(function (t) {
      if (!t) throw fail('not_found', 'Tenancy not found.');
      if (role === 'customer' && (!actor || actor.role !== 'customer' || t.customerId !== actor.id)) throw fail('forbidden', 'Only the tenant of this property can do this.');
      if (role === 'agent' && (!actor || actor.role !== 'agent' || t.agentId !== actor.id)) throw fail('forbidden', 'Only the agent for this property can do this.');
      return t;
    });
  }
  function ensureOpen(t) {
    if (OPEN.indexOf(t.status) === -1) {
      throw fail('bad_state', t.status === 'active' ? 'The tenancy has not reached its scheduled expiry date yet.' : t.status === 'disputed' ? 'This tenancy has an open dispute. Resolve it first.' : t.status === 'renewed' ? 'This tenancy was renewed.' : 'This is not open for vacancy confirmation.');
    }
    if (!t.vacancy) t.vacancy = newVacancy(nowIso());
  }
  function other(t, actor) { return actor.role === 'agent' ? { id: t.customerId, role: 'customer', name: t.agentName } : { id: t.agentId, role: 'agent', name: t.customerName }; }

  function evaluate(t) {
    var v = t.vacancy, reasons = [];
    var tenantOk = !!v.tenantVacated || !!(v.agentVacancyConfirmed && v.agentVacancyConfirmed.withoutTenant);
    if (v.dispute && v.dispute.open) reasons.push('There is an open dispute.');
    if (v.stillOccupying) reasons.push('The tenant is still in the property.');
    if (!v.handover) reasons.push('The agent has not recorded a handover inspection.');
    else if (v.handover.occupied) reasons.push('The inspection found the property still occupied.');
    if (!v.agentVacancyConfirmed) reasons.push('The agent has not confirmed the property is vacant.');
    if (!tenantOk) reasons.push('The tenant has not confirmed they moved out.');
    var vacated = !reasons.length;
    if (vacated && !v.agentReady) reasons.push('The agent has not confirmed the property is ready for a new tenant.');
    return { vacated: vacated, eligible: vacated && !!v.agentReady, reasons: reasons };
  }
  function relistState(t) {
    if (!t.vacancy) return { eligible: false, reasons: ['Vacancy confirmation has not started.'] };
    var e = evaluate(t); return { eligible: e.eligible && t.status === 'vacated', reasons: e.reasons };
  }

  // Applies the result of an action: updates status and the listing's reactivation marker.
  function settle(t, after) {
    var e = evaluate(t), jobs = [];
    if ((t.status === 'awaiting_vacancy_confirmation' || t.status === 'occupancy_extension') && e.vacated) {
      if (t.status === 'occupancy_extension' && t.extension) { t.extension.state = 'ended_early'; t.extension.endedAt = nowIso(); }
      t.status = 'vacated';
    } else if (t.status === 'vacated' && !e.vacated) t.status = 'awaiting_vacancy_confirmation';
    var wasEligible = !!t.vacancy.relist.eligible, nowEligible = e.eligible && t.status === 'vacated';
    t.vacancy.relist = nowEligible ? { eligible: true, at: wasEligible ? t.vacancy.relist.at : nowIso() } : { eligible: false };
    return rec('tenancies').put(t).then(function (saved) {
      if (nowEligible && !wasEligible) {
        markListing(saved, true);
        jobs.push(T()._notify({ dedupeKey: 'ten:' + saved.id + ':relist', category: 'tenancy_relist_ready', recipientId: saved.agentId, recipientRole: 'agent', title: 'Property ready to be listed again',
          message: '\u201C' + saved.listingName + '\u201D is confirmed vacant and ready for a new tenant. It is now eligible for reactivation. It is not public until you relist it.', link: 'tenancies.html#' + saved.id }));
        jobs.push(actdNote(saved, 'Vacancy was confirmed and the property was handed over. Occupancy Extension and tenancy are closed.', 'Vacancy confirmed'));
      } else if (!nowEligible && wasEligible) markListing(saved, false);
      return Promise.all(jobs).then(function () { return after ? after(saved) : saved; });
    });
  }
  // Additive marker only. It never changes the listing's status or approval; Stage 8 decides what to do with it.
  function markListing(t, eligible) {
    try {
      var list = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); if (!Array.isArray(list)) return;
      window.localStorage.setItem('accoom-agent-listings', JSON.stringify(list.map(function (l) {
        if (String(l.id) !== String(t.listingId)) return l;
        var next = Object.assign({}, l); if (eligible) next.reactivation = { eligible: true, tenancyId: t.id, at: nowIso() }; else delete next.reactivation; return next;
      })));
    } catch (e) { /* storage problem: the tenancy record is still the source of truth */ }
  }
  function inLock(id, fn) { return T()._lock(id, fn); }
  function say(actor, t, key, c) { return T()._notify(Object.assign({ link: 'tenancies.html#' + t.id }, c)); }

  /* occupancy status reports (information; the formal steps are below) */
  function reportOccupancy(actor, id, input, now) {
    input = input || {};
    var role = actor && actor.role;
    var allowed = role === 'customer' ? ['still_occupying', 'vacating', 'vacated'] : ['occupied', 'vacant'];
    if (!actor || allowed.indexOf(input.status) === -1) return Promise.reject(fail('bad_status', 'Choose one of the options.'));
    var note = String(input.note || '').trim().slice(0, 300), planned = String(input.plannedDate || '');
    if (input.status === 'vacating' && !Accoom.TenancyDates.isValid(planned)) return Promise.reject(fail('bad_date', 'Enter the date you plan to move out.'));
    return inLock(id, function () {
      return load(actor, id, role === 'customer' ? 'customer' : 'agent', now).then(function (t) {
        if (OPEN.indexOf(t.status) === -1) throw fail('bad_state', t.status === 'active' ? 'The tenancy has not reached its scheduled expiry date yet.' : 'This is not open for occupancy updates.');
        if (!t.vacancy) t.vacancy = newVacancy(nowIso());
        var rep = { role: role, status: input.status, at: nowIso(), by: actor.id, note: note, plannedDate: planned };
        t.occupancyReports = (t.occupancyReports || []).concat([rep]).slice(-50);
        if (input.status === 'still_occupying' && t.status === 'awaiting_vacancy_confirmation') t.vacancy.stillOccupying = true;
        var o = other(t, actor), text = { still_occupying: 'is still living in the property', vacating: 'plans to move out on ' + planned, vacated: 'says they have moved out', occupied: 'reports the property is still occupied', vacant: 'reports the property is vacant' }[input.status];
        return settle(t).then(function (saved) {
          return say(actor, saved, 'rep', { dedupeKey: 'ten:' + id + ':occ:' + saved.occupancyReports.length, category: 'tenancy_vacancy', recipientId: o.id, recipientRole: o.role,
            title: 'Occupancy update for \u201C' + t.listingName + '\u201D', message: (role === 'customer' ? t.customerName : t.agentName) + ' ' + text + '.' + (note ? ' Note: ' + note : '') })
            .then(function () { return T()._audit(actor, 'tenancy.occupancy_report', id, { status: input.status }); }).then(function () { return saved; });
        });
      });
    });
  }

  function confirmVacated(actor, id, input, now) {
    input = input || {};
    return inLock(id, function () {
      return load(actor, id, 'customer', now).then(function (t) {
        ensureOpen(t);
        var moved = String(input.movedOutOn || dateOf(Date.now()));
        if (!Accoom.TenancyDates.isValid(moved)) throw fail('bad_date', 'Enter the date you moved out.');
        t.vacancy.tenantVacated = { at: nowIso(), movedOutOn: moved, note: String(input.note || '').trim().slice(0, 300) };
        t.vacancy.stillOccupying = false;
        return settle(t, function (saved) {
          return say(actor, saved, 'vac', { dedupeKey: 'ten:' + id + ':tenant-vacated', category: 'tenancy_vacancy', recipientId: t.agentId, recipientRole: 'agent', title: 'Tenant says they moved out',
            message: t.customerName + ' confirmed they moved out of \u201C' + t.listingName + '\u201D on ' + moved + '. Please inspect the property and confirm.' })
            .then(function () { return T()._audit(actor, 'tenancy.tenant_vacated', id, { movedOutOn: moved }); }).then(function () { return saved; });
        });
      });
    });
  }

  function recordInspection(actor, id, input, now) {
    input = input || {};
    return inLock(id, function () {
      return load(actor, id, 'agent', now).then(function (t) {
        ensureOpen(t);
        var date = String(input.date || dateOf(Date.now())), cond = input.condition;
        if (!Accoom.TenancyDates.isValid(date)) throw fail('bad_date', 'Enter the inspection date.');
        if (['good', 'minor_issues', 'major_issues'].indexOf(cond) === -1) throw fail('bad_condition', 'Choose the condition of the property.');
        if (typeof input.occupied !== 'boolean') throw fail('bad_occupied', 'Say whether the property is still occupied.');
        var notes = String(input.notes || '').trim().slice(0, 500);
        if (cond !== 'good' && notes.length < 5) throw fail('notes_required', 'Describe the issues you found.');
        t.vacancy.handover = { at: nowIso(), date: date, condition: cond, keysReturned: input.keysReturned === true, occupied: input.occupied, notes: notes, by: actor.id };
        t.vacancy.handoverAck = null;
        // The inspection result lives in handover.occupied. It never erases the tenant's own "I am still here" report.
        return settle(t, function (saved) {
          return say(actor, saved, 'ins', { dedupeKey: 'ten:' + id + ':inspect:' + date + ':' + saved.vacancy.handover.at, category: 'tenancy_vacancy', recipientId: t.customerId, recipientRole: 'customer', title: 'Handover inspection recorded',
            message: 'The agent recorded a handover inspection for \u201C' + t.listingName + '\u201D (' + date + '). Please read it and tell ACCOOM whether you agree.' })
            .then(function () { return T()._audit(actor, 'tenancy.inspection', id, { condition: cond, occupied: input.occupied }); }).then(function () { return saved; });
        });
      });
    });
  }

  function acknowledgeHandover(actor, id, input, now) {
    input = input || {};
    return inLock(id, function () {
      return load(actor, id, 'customer', now).then(function (t) {
        ensureOpen(t);
        if (!t.vacancy.handover) throw fail('no_inspection', 'The agent has not recorded an inspection yet.');
        if (['agree', 'disagree'].indexOf(input.answer) === -1) throw fail('bad_answer', 'Choose whether you agree.');
        var note = String(input.note || '').trim().slice(0, 500);
        if (input.answer === 'disagree' && note.length < 5) throw fail('note_required', 'Say what you disagree with.');
        t.vacancy.handoverAck = { answer: input.answer, at: nowIso(), note: note };
        if (input.answer === 'disagree') return openDispute(t, actor, 'The tenant disagrees with the handover inspection: ' + note);
        return settle(t, function (saved) { return T()._audit(actor, 'tenancy.handover_ack', id, { answer: 'agree' }).then(function () { return saved; }); });
      });
    });
  }

  function confirmVacancy(actor, id, input, now) {
    input = input || {};
    var at = now == null ? Date.now() : now;
    return inLock(id, function () {
      return load(actor, id, 'agent', now).then(function (t) {
        ensureOpen(t);
        var v = t.vacancy;
        if (!v.handover) throw fail('no_inspection', 'Record a handover inspection first.');
        if (v.handover.occupied) throw fail('still_occupied', 'The inspection says the property is still occupied. It cannot be confirmed vacant.');
        if (v.stillOccupying) throw fail('still_occupied', 'The tenant has said they are still in the property.');
        var tenantSilent = !v.tenantVacated;
        if (tenantSilent) {
          var since = Date.parse(v.requestedAt) + TENANT_SILENT_DAYS * DAY;
          if (at < since) throw fail('wait_for_tenant', 'The tenant has not confirmed they moved out. You can confirm without them ' + TENANT_SILENT_DAYS + ' days after the request was sent (from ' + dateOf(since) + ').');
        }
        v.agentVacancyConfirmed = { at: nowIso(), note: String(input.note || '').trim().slice(0, 300), withoutTenant: tenantSilent };
        return settle(t, function (saved) {
          return say(actor, saved, 'vc', { dedupeKey: 'ten:' + id + ':agent-vacancy', category: 'tenancy_vacancy', recipientId: t.customerId, recipientRole: 'customer', title: 'Vacancy confirmed',
            message: 'The agent confirmed \u201C' + t.listingName + '\u201D is vacant.' + (tenantSilent ? ' You had not confirmed moving out. If this is wrong, raise a dispute.' : '') })
            .then(function () { return T()._audit(actor, 'tenancy.vacancy_confirmed', id, { withoutTenant: tenantSilent }); }).then(function () { return saved; });
        });
      });
    });
  }

  function confirmReady(actor, id, input, now) {
    input = input || {};
    return inLock(id, function () {
      return load(actor, id, 'agent', now).then(function (t) {
        if (t.status !== 'vacated') throw fail('not_vacated', t.status === 'disputed' ? 'This tenancy has an open dispute.' : 'Vacancy must be fully confirmed before the property can be marked ready.');
        t.vacancy.agentReady = { at: nowIso(), note: String(input.note || '').trim().slice(0, 300) };
        return settle(t, function (saved) { return T()._audit(actor, 'tenancy.ready_for_new_tenant', id, {}).then(function () { return saved; }); });
      });
    });
  }

  /* disputes */
  function openDispute(t, actor, reason) {
    var v = t.vacancy || (t.vacancy = newVacancy(nowIso()));
    v.dispute = { open: true, raisedBy: actor.role, by: actor.id, reason: reason, at: nowIso() };
    t.statusBeforeDispute = t.status === 'disputed' ? t.statusBeforeDispute : t.status;
    t.status = 'disputed';
    v.relist = { eligible: false };
    return rec('tenancies').put(t).then(function (saved) {
      markListing(saved, false);
      var o = other(saved, actor);
      return T()._notify({ dedupeKey: 'ten:' + saved.id + ':dispute:' + v.dispute.at, category: 'tenancy_vacancy', recipientId: o.id, recipientRole: o.role, title: 'Dispute raised',
        message: (actor.role === 'agent' ? saved.agentName : saved.customerName) + ' raised a dispute about \u201C' + saved.listingName + '\u201D: ' + reason + ' The property will not be relisted while the dispute is open.', link: 'tenancies.html#' + saved.id })
        .then(function () { return T()._audit(actor, 'tenancy.dispute_opened', saved.id, {}); }).then(function () { return saved; });
    });
  }
  function raiseDispute(actor, id, reason, now) {
    reason = String(reason || '').trim();
    if (!actor || (actor.role !== 'customer' && actor.role !== 'agent')) return Promise.reject(fail('forbidden', 'Sign in to raise a dispute.'));
    if (reason.length < 5) return Promise.reject(fail('reason_required', 'Say what the dispute is about.'));
    return inLock(id, function () {
      return load(actor, id, actor.role, now).then(function (t) {
        if (['occupancy_extension', 'awaiting_vacancy_confirmation', 'vacated'].indexOf(t.status) === -1) throw fail('bad_state', t.status === 'disputed' ? 'There is already an open dispute.' : 'A dispute can only be raised once the scheduled expiry date has passed.');
        return openDispute(t, actor, reason);
      });
    });
  }
  // Closed by whoever raised it, or by an ACCOOM reviewer (demonstration mode).
  function resolveDispute(actor, id, note) {
    note = String(note || '').trim();
    if (note.length < 5) return Promise.reject(fail('note_required', 'Say how the dispute was resolved.'));
    return inLock(id, function () {
      return rec('tenancies').get(id).then(function (t) {
        if (!t || t.status !== 'disputed' || !t.vacancy || !t.vacancy.dispute || !t.vacancy.dispute.open) throw fail('bad_state', 'There is no open dispute.');
        var raiser = t.vacancy.dispute;
        var ok = adminOk(actor) || (actor && actor.role === raiser.raisedBy && actor.id === raiser.by);
        if (!ok) throw fail('forbidden', 'Only the person who raised the dispute, or an ACCOOM reviewer, can close it.');
        t.vacancy.dispute = Object.assign({}, raiser, { open: false, resolvedAt: nowIso(), resolvedBy: actor.id, resolution: note });
        t.status = t.statusBeforeDispute || 'awaiting_vacancy_confirmation'; delete t.statusBeforeDispute;
        return settle(t, function (saved) { return T()._audit(actor, 'tenancy.dispute_resolved', id, {}).then(function () { return saved; }); });
      });
    });
  }

  Accoom.Occupancy = {
    PRESETS: PRESETS, MAX_CUSTOM: MAX_CUSTOM, DEFAULT_MILESTONES: DEFAULT_MILESTONES, TENANT_SILENT_DAYS: TENANT_SILENT_DAYS,
    normalizeConfig: normalizeConfig, setListingConfig: setListingConfig, milestonesFor: milestonesFor, window: window_, daysLeft: daysLeft,
    advance: advance, advanceAll: advanceAll, reportOccupancy: reportOccupancy,
    confirmVacated: confirmVacated, recordInspection: recordInspection, acknowledgeHandover: acknowledgeHandover, confirmVacancy: confirmVacancy, confirmReady: confirmReady,
    raiseDispute: raiseDispute, resolveDispute: resolveDispute, relistState: relistState
  };
})(window.Accoom);
