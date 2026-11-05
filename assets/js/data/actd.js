/* ==========================================================================
   ACCOOM — ACTD: ACCOOM CERTIFICATE TRANSACTION DOCUMENT (Stage 4)
   --------------------------------------------------------------------------
   One ACTD per successful transaction, whatever the amount. It records what
   happened. It does NOT replace title documents, government certificates or
   legally required agreements.

   RULES (covered by tests)
   - Generated only from a transaction whose status is "succeeded".
   - Idempotent: the same transaction can never get two different ACTDs
     (unique key = transactionId + version, enforced inside Accoom.Records).
   - Immutable: an issued version is never edited. A later confirmation
     creates a NEW version (an addendum) with a reason and a timestamp; the
     old versions stay and can still be downloaded.
   - The money fields (section 2) can never be changed by an addendum.
   - Customers see only their ACTDs, agents only the ones for their own
     transactions, a (demo) administrator sees all.
   - No customer phone number or email address is ever stored in an ACTD.
   - Verification of an ACTD is public but returns no personal data.

   THE "SEAL"
   The seal is a SHA-256 fingerprint of the issued record. It shows whether
   the record has been changed since issue. It is NOT a digital signature,
   not a certificate from any authority, and is only as trustworthy as the
   place the record is stored. In this frontend-only version the records live
   in this browser, so checking is only possible here. A server is needed for
   public verification from any device.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var STATEMENT = 'This document is an ACCOOM-generated transaction record. It records information and confirmations available to ACCOOM at the time of issue. It does not replace original property title documents, government-issued certificates or legally required agreements.';
  var SEAL_NOTE = 'The seal is a SHA-256 fingerprint of this record. It shows whether the record has changed since it was issued. It is not a digital signature and not a certificate from any government body or court.';
  var ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O/1/I/L so numbers are easy to read out

  function fail(code, message) { var e = new Error(message); e.code = code; return e; }
  function nowIso() { return new Date().toISOString(); }
  function records(n) { return Accoom.Records.collection(n); }

  function randomCode(len) {
    var out = '', bytes = new Uint8Array(len);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < len; j++) out += ALPHABET.charAt(bytes[j] % ALPHABET.length);
    return out;
  }

  /* ---------------------------------------------------------------- SHA-256 */
  // Used for the seal. Web Crypto where it exists, a plain JS version where it
  // does not (for example a page opened over plain http on a phone).
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  function utf8(str) {
    var s = unescape(encodeURIComponent(str)), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  function sha256Js(bytes) {
    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = bytes.length, total = ((len + 9 + 63) >> 6) << 6, buf = new Uint8Array(total);
    buf.set(bytes); buf[len] = 0x80;
    var bits = len * 8, dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(bits / 4294967296)); dv.setUint32(total - 4, bits >>> 0);
    var w = new Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
  }

  function sha256Hex(str) {
    var bytes = utf8(str), subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.resolve(sha256Js(bytes));
    return subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }, function () { return sha256Js(bytes); });
  }

  // Same text for the same data, whatever order the keys were added in.
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
  }

  function sealInput(rec) {
    return canonical({ actdNumber: rec.actdNumber, transactionId: rec.transactionId, version: rec.version, issuedAt: rec.issuedAt,
      supersedes: rec.supersedes || '', updateReason: rec.updateReason || '', content: rec.content });
  }
  function sealOf(rec) { return sha256Hex(sealInput(rec)); }

  /* --------------------------------------------------------------- content */
  var TYPE_LABEL = { rent_payment: 'Rental payment', sale_payment: 'Property purchase', renewal_payment: 'Rental renewal payment', agency_payment: 'Agency payment', other: 'Other transaction' };
  var PERIOD_WORD = { day: 'day', week: 'week', month: 'month', year: 'year' };
  var DELIVERY_LABEL = { digital: 'Digital receipt: ACCOOM makes the receipt available in the customer\u2019s document centre.',
    physical: 'Physical receipt: the agent is responsible for delivering the receipt to the client.' };

  var ALLOWED_ADDENDUM = { s3: ['documents', 'verification'], s4: ['confirmations', 'signingRecords', 'agreementRefs', 'occupancyExtension'], s5: null };

  // "NGN 1,250,000" - the PDF fonts have no Naira sign, so the text form is used everywhere.
  function ngn(n) {
    var v = Math.round(Number(n || 0) * 100) / 100, neg = v < 0; v = Math.abs(v);
    var parts = v.toFixed(2).split('.'), whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + 'NGN ' + whole + (parts[1] === '00' ? '' : '.' + parts[1]);
  }

  function docRows(docs, category) {
    return (docs || []).map(function (d) {
      var st = Accoom.DocVerification ? Accoom.DocVerification.displayStatus(d) : { headline: 'NEEDS REVIEW', stage: d.reviewStatus };
      return { type: d.docType, label: Accoom.DocRequirements ? Accoom.DocRequirements.labelFor(category === 'sale' ? 'sale' : 'rent', d.docType) : d.docType,
        fileName: d.originalName, version: d.version, outcome: st.headline + ' (' + st.stage + ')' };
    });
  }

  function buildContent(tx, ctx) {
    var l = ctx.listing || {}, isRent = tx.type === 'rent_payment' || tx.type === 'renewal_payment';
    var a = tx.amounts || {};
    var lines = [];
    if (isRent) lines.push({ label: 'Rent (' + tx.periodCount + ' ' + PERIOD_WORD[tx.billingPeriod] + (tx.periodCount > 1 ? 's' : '') + ' at ' + ngn(a.unitPrice) + ' per ' + PERIOD_WORD[tx.billingPeriod] + ')', amount: a.price });
    else lines.push({ label: 'Property price', amount: a.price });
    if (a.agencyFee) lines.push({ label: 'Agency fee', amount: a.agencyFee });
    if (a.legalFee) lines.push({ label: 'Legal fee', amount: a.legalFee });
    if (a.other) lines.push({ label: 'Other charges', amount: a.other });

    var location = [l.area, l.state].filter(Boolean).join(', ');
    var occDays = l.occupancyExtension && l.occupancyExtension.days;
    var delivery = l.receiptDelivery === 'physical' ? 'physical' : 'digital';

    var content = {
      demo: tx.paymentSource === 'demo',
      s1: {
        actdNumber: ctx.actdNumber, transactionId: tx.id, propertyId: tx.propertyId, propertyName: tx.listingName || l.name || '',
        propertyLocation: location || l.address || '', transactionType: TYPE_LABEL[tx.type] || tx.type, dateTime: tx.paidAt, status: 'Successful',
        client: { id: tx.customerId, name: tx.customerName || 'Not provided' },
        agent: { id: tx.agentId, name: tx.agentName || 'Not provided' },
        landlord: { name: l.landlordName || '', note: l.landlordName ? '' : (isRent ? 'Landlord details were not provided to ACCOOM for this listing.' : 'Seller details were not provided to ACCOOM for this listing.') }
      },
      s2: {
        amountPaid: a.total, price: a.price, agencyFee: a.agencyFee || 0, legalFee: a.legalFee || 0, otherCharges: a.other || 0, total: a.total, lines: lines,
        method: tx.paymentMethod, provider: tx.provider, reference: tx.paymentReference, confirmedAt: tx.paidAt,
        status: tx.paymentSource === 'demo' ? 'Confirmed by a DEMONSTRATION payment event. No real money was moved.' : 'Confirmed',
        receiptRef: tx.receiptRef
      },
      s3: {
        propertyType: l.typeLabel || '', address: l.address || '', state: l.state || '', area: l.area || '', description: l.description || '',
        listingRef: l.id || tx.listingId, agent: { id: tx.agentId, name: tx.agentName || 'Not provided' },
        landlord: { name: l.landlordName || '', note: l.landlordName ? '' : 'Not provided to ACCOOM.' },
        documents: docRows(ctx.docs, l.category),
        verification: 'Outcomes are those recorded by ACCOOM when this ACTD was issued. Unless a document is marked VERIFIED, ACCOOM has not independently confirmed it with the issuing authority.'
      },
      s4: {
        terms: isRent
          ? 'Rental of the property for ' + tx.periodCount + ' ' + PERIOD_WORD[tx.billingPeriod] + (tx.periodCount > 1 ? 's' : '') + ' at ' + ngn(a.unitPrice) + ' per ' + PERIOD_WORD[tx.billingPeriod] + '.'
          : 'Purchase of the property at the price shown in section 2.',
        rentalDuration: isRent ? tx.periodCount + ' ' + PERIOD_WORD[tx.billingPeriod] + (tx.periodCount > 1 ? 's' : '') : '',
        startDate: isRent ? tx.startDate : '', expiryDate: isRent ? tx.expiryDate : '',
        renewalConditions: isRent ? 'Renewal is never automatic. ACCOOM reminds the tenant as the term runs out (at 70%, 80%, 90% and 100% of the term). Any renewal is agreed between tenant and landlord or agent through ACCOOM, and a renewal payment receives its own ACTD.' : '',
        occupancyExtension: isRent ? (occDays > 0 ? 'Occupancy Extension of ' + occDays + ' days after the scheduled expiry date.' : 'No Occupancy Extension was configured for this listing at the time of issue.') : '',
        confirmations: [{ party: isRent ? 'Tenant' : 'Buyer', state: 'Not recorded at issue' }, { party: isRent ? 'Landlord / agent' : 'Seller', state: 'Not recorded at issue' }],
        signingRecords: [], agreementRefs: []
      },
      s5: {
        receiptDelivery: delivery, receiptDeliveryText: DELIVERY_LABEL[delivery],
        documentsIssued: [{ name: 'ACCOOM Certificate Transaction Document (this document)', ref: ctx.actdNumber }, { name: 'ACCOOM payment receipt', ref: tx.receiptRef, note: 'Issued separately under this reference.' }],
        deliveryDates: [{ item: 'ACTD', at: ctx.issuedAt }], agentConfirmation: 'Not recorded', clientAcknowledgement: 'Not recorded', outstanding: [], reportedProblems: []
      },
      s6: { verifyUrl: ctx.verifyUrl, history: [{ version: 1, issuedAt: ctx.issuedAt, reason: 'Original issue' }], statement: STATEMENT, sealNote: SEAL_NOTE }
    };
    return content;
  }

  /* ------------------------------------------------------------ generation */
  function baseUrl() {
    try { return new URL('verify-document.html', window.location.href).href.split('?')[0]; } catch (e) { return 'verify-document.html'; }
  }
  function verifyUrlFor(number, version) { return baseUrl() + '?ref=' + encodeURIComponent(number) + '&v=' + version; }

  function newNumber() {
    var year = new Date().getUTCFullYear(), tries = 0;
    function attempt() {
      var n = 'ACTD-' + year + '-' + randomCode(10);
      return records('actds').where(function (r) { return r.actdNumber === n; }).then(function (x) {
        if (!x.length) return n;
        if (++tries > 5) throw fail('number_clash', 'Could not allocate an ACTD number.');
        return attempt();
      });
    }
    return attempt();
  }

  function readListing(id) {
    try { var l = JSON.parse(window.localStorage.getItem('accoom-agent-listings')); return (Array.isArray(l) ? l : []).filter(function (x) { return String(x.id) === String(id); })[0] || null; }
    catch (e) { return null; }
  }
  function notify(title, text) {
    try { if (Accoom.NotificationService) Accoom.NotificationService.add({ type: 'accoom', title: title, text: text, link: 'document-centre.html' }); } catch (e) { /* never blocks issuing */ }
  }

  function versionsOf(txId) {
    return records('actds').where(function (r) { return r.transactionId === txId; }).then(function (l) { return l.sort(function (a, b) { return a.version - b.version; }); });
  }
  function latestOf(txId) { return versionsOf(txId).then(function (l) { return l[l.length - 1] || null; }); }

  function generateForTransaction(txId) {
    return records('transactions').get(txId).then(function (tx) {
      if (!tx) throw fail('not_found', 'Transaction not found.');
      if (tx.status !== 'succeeded') throw fail('not_paid', 'An ACTD is only issued after a payment is confirmed as successful.');
      var listing = readListing(tx.listingId);
      var docsP = Accoom.DocumentStore && listing ? Accoom.DocumentStore.listForListing(listing.id).catch(function () { return []; }) : Promise.resolve([]);
      return Promise.all([docsP, newNumber()]).then(function (r) {
        var issuedAt = nowIso(), number = r[1];
        var ctx = { listing: listing, docs: r[0], actdNumber: number, issuedAt: issuedAt, verifyUrl: verifyUrlFor(number, 1) };
        var rec = { versionKey: txId + ':v1', actdNumber: number, transactionId: txId, version: 1, supersedes: '', updateReason: '', issuedAt: issuedAt,
          content: buildContent(tx, ctx), listingId: tx.listingId, customerId: tx.customerId, agentId: tx.agentId, paymentSource: tx.paymentSource };
        return sealOf(rec).then(function (seal) {
          rec.seal = seal;
          return records('actds').createUnique(Accoom.Schemas.make.actd(rec));
        });
      }).then(function (res) {
        // Whoever got here second finds the first one. Only the creator links and announces.
        if (!res.created) return { actd: res.record, created: false };
        return records('transactions').put(Object.assign({}, tx, { actdId: res.record.id })).then(function () {
          return Accoom.Records.audit({ actorRole: 'system', action: 'actd.issued', entityType: 'actd', entityId: res.record.id, detail: { actdNumber: res.record.actdNumber, version: 1, transactionId: txId } }).catch(function () {});
        }).then(function () {
          notify('ACTD generated', 'Your ACCOOM Certificate Transaction Document ' + res.record.actdNumber + ' is ready in your document centre.');
          return { actd: res.record, created: true };
        });
      });
    });
  }

  // A later confirmation creates version n+1. Money fields and the original
  // property, parties and dates cannot be touched.
  function addendum(actor, txId, input) {
    input = input || {};
    if (!actor || (actor.role !== 'agent' && actor.role !== 'admin' && actor.role !== 'system' && actor.role !== 'customer')) return Promise.reject(fail('forbidden', 'Sign in to update an ACTD.'));
    var reason = String(input.reason || '').trim();
    if (!reason) return Promise.reject(fail('reason_required', 'Say why the ACTD is being updated.'));
    var changes = input.changes || {}, secs = Object.keys(changes);
    if (!secs.length) return Promise.reject(fail('nothing_to_change', 'There is nothing to add.'));
    for (var i = 0; i < secs.length; i++) {
      var s = secs[i];
      if (!ALLOWED_ADDENDUM.hasOwnProperty(s)) return Promise.reject(fail('immutable_section', 'Section ' + s.replace('s', '') + ' cannot be changed after issue.'));
      var allowed = ALLOWED_ADDENDUM[s];
      if (allowed) for (var k in changes[s]) if (allowed.indexOf(k) === -1) return Promise.reject(fail('immutable_field', '"' + k + '" cannot be changed after issue.'));
    }
    return latestOf(txId).then(function (prev) {
      if (!prev) throw fail('not_found', 'No ACTD exists for this transaction.');
      if (actor.role === 'agent' && prev.agentId !== actor.id) throw fail('forbidden', 'You can only update ACTDs for your own transactions.');
      if (actor.role === 'customer' && prev.customerId !== actor.id) throw fail('forbidden', 'You can only update your own ACTDs.');
      var content = JSON.parse(JSON.stringify(prev.content)), version = prev.version + 1, at = nowIso();
      secs.forEach(function (s) { content[s] = Object.assign({}, content[s], JSON.parse(JSON.stringify(changes[s]))); });
      content.s6.history = (content.s6.history || []).concat([{ version: version, issuedAt: at, reason: reason, by: actor.role }]);
      content.s6.verifyUrl = verifyUrlFor(prev.actdNumber, version);
      var rec = { versionKey: txId + ':v' + version, actdNumber: prev.actdNumber, transactionId: txId, version: version, supersedes: prev.id, updateReason: reason,
        issuedAt: at, content: content, listingId: prev.listingId, customerId: prev.customerId, agentId: prev.agentId, paymentSource: prev.paymentSource };
      return sealOf(rec).then(function (seal) {
        rec.seal = seal;
        return records('actds').createUnique(Accoom.Schemas.make.actd(rec));
      }).then(function (res) {
        if (!res.created) throw fail('version_conflict', 'Someone else updated this ACTD at the same moment. Reload and try again.');
        return Accoom.Records.audit({ actorId: actor.id, actorRole: actor.role, action: 'actd.addendum', entityType: 'actd', entityId: res.record.id,
          detail: { actdNumber: prev.actdNumber, version: version, reason: reason } }).catch(function () {}).then(function () { return res.record; });
      });
    });
  }

  /* ---------------------------------------------------------------- access */
  function adminOk(actor) { return actor && actor.role === 'admin' && Accoom.AdminDemo && Accoom.AdminDemo.isActive(); }

  function canSee(actor, rec) {
    if (!actor) return false;
    if (actor.role === 'admin') return !!adminOk(actor);
    if (actor.role === 'agent') return !!actor.id && rec.agentId === actor.id;
    if (actor.role === 'customer') return !!actor.id && rec.customerId === actor.id;
    return false;
  }

  // Latest version of each ACTD the person is allowed to see.
  function listFor(actor) {
    return records('actds').all().then(function (all) {
      var byTx = {};
      all.forEach(function (r) { if (canSee(actor, r)) (byTx[r.transactionId] = byTx[r.transactionId] || []).push(r); });
      return Object.keys(byTx).map(function (k) {
        var vs = byTx[k].sort(function (a, b) { return a.version - b.version; });
        return { actd: vs[vs.length - 1], versions: vs };
      }).sort(function (a, b) { return a.actd.issuedAt < b.actd.issuedAt ? 1 : -1; });
    });
  }

  function getFor(actor, number) {
    return records('actds').where(function (r) { return r.actdNumber === number; }).then(function (vs) {
      vs = vs.sort(function (a, b) { return a.version - b.version; });
      if (!vs.length || !canSee(actor, vs[0])) throw fail('not_found', 'ACTD not found.');
      return { actd: vs[vs.length - 1], versions: vs };
    });
  }

  /* ---------------------------------------------------------- verification */
  // Public. Returns no names, amounts, addresses or contact details.
  function verify(ref, version) {
    return records('actds').where(function (r) { return r.actdNumber === ref; }).then(function (vs) {
      vs = vs.sort(function (a, b) { return a.version - b.version; });
      if (!vs.length) return { found: false };
      var v = Number(version) || vs[vs.length - 1].version;
      var rec = vs.filter(function (x) { return x.version === v; })[0];
      if (!rec) return { found: false };
      return sealOf(rec).then(function (seal) {
        return { found: true, actdNumber: rec.actdNumber, version: rec.version, latestVersion: vs[vs.length - 1].version, isLatest: rec.version === vs[vs.length - 1].version,
          issuedAt: rec.issuedAt, sealMatches: seal === rec.seal, demo: !!rec.content.demo, updateReason: rec.updateReason };
      });
    });
  }

  Accoom.ACTD = {
    ngn: ngn,
    STATEMENT: STATEMENT, SEAL_NOTE: SEAL_NOTE, TYPE_LABEL: TYPE_LABEL,
    generateForTransaction: generateForTransaction, addendum: addendum,
    versionsOf: versionsOf, latestOf: latestOf, listFor: listFor, getFor: getFor, verify: verify, canSee: canSee,
    sealOf: sealOf, sha256Hex: sha256Hex, _sha256Js: function (s) { return sha256Js(utf8(s)); }, canonical: canonical, verifyUrlFor: verifyUrlFor
  };
})(window.Accoom);
