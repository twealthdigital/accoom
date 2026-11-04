/* ==========================================================================
   ACCOOM — Record schemas (Stage 1)
   --------------------------------------------------------------------------
   One place that defines the shape of every new record type (documents,
   analysis reports, transactions, ACTDs, receipts, agreements, tenancies,
   renewals, notifications, audit events ...) plus the allowed values.

   FRONTEND-ONLY NOTE: everything here is stored in the visitor's own browser.
   It is not cloud storage, does not sync between devices, can be cleared by
   the browser or the user, and is NOT legally secure evidence retention.
   A backend must replace the storage adapter before real use.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var SCHEMA_VERSION = 2; // listing record schema version

  var ENUM = {
    listingType: ['rent', 'sale'],
    billingPeriod: ['day', 'week', 'month', 'year'],

    // Lifecycle status of a listing (existing values are kept: available,
    // in_progress, sold, delisted, in_dispute, reported, hold; "rented" is new).
    listingStatus: ['available', 'in_progress', 'rented', 'sold', 'delisted',
      'in_dispute', 'reported', 'hold', 'deleted'],

    // Approval state is a SEPARATE axis from the lifecycle status above.
    // "legacy_unreviewed" = created before document review existed.
    approvalState: ['draft', 'pending_review', 'ai_review', 'manual_review',
      'changes_required', 'approved', 'rejected', 'legacy_unreviewed'],

    // Review status of one uploaded document.
    documentStatus: ['uploaded', 'processing', 'analysis_complete',
      'issuer_confirmation_pending', 'ownership_verification_pending',
      'human_review_required', 'verified', 'needs_review', 'rejected', 'superseded'],

    // Where a verification came from. Only the last two may produce VERIFIED.
    verificationSource: ['none', 'demo_analysis', 'ai_analysis',
      'independent_issuer', 'admin_manual'],

    transactionType: ['rent_payment', 'sale_payment', 'renewal_payment', 'agency_payment', 'other'],
    transactionStatus: ['pending', 'succeeded', 'failed', 'refunded', 'disputed'],
    paymentSource: ['demo', 'gateway_webhook'], // a button click is never "gateway_webhook"

    receiptDelivery: ['digital', 'physical'],
    deliveryState: ['not_applicable', 'pending_agent', 'agent_marked_delivered',
      'client_ok', 'client_problem', 'client_not_received', 'resolved'],

    tenancyStatus: ['active', 'occupancy_extension', 'awaiting_vacancy_confirmation',
      'vacated', 'renewed', 'disputed', 'ended'],
    renewalDecision: ['none', 'renew', 'not_renew', 'discuss'],
    signatureLevel: ['visual_signature', 'electronic_record', 'legally_validated'],

    role: ['customer', 'agent', 'admin', 'system']
  };

  // Single-letter-free, readable prefixes for generated ids.
  var ID_PREFIX = {
    documents: 'doc', analysisReports: 'rpt', verifications: 'ver',
    transactions: 'txn', actds: 'actd', receipts: 'rcp', agreements: 'agr',
    tenancies: 'ten', renewals: 'ren', extensions: 'ext',
    deliveryAcks: 'ack', notifications: 'dn', auditEvents: 'aud'
  };

  function nowIso() { return new Date().toISOString(); }
  function pick(v, allowed, fallback) { return allowed.indexOf(v) !== -1 ? v : fallback; }
  function str(v) { return v == null ? '' : String(v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }

  /* ------------------------------------------------------------ factories */
  // Each factory returns a COMPLETE record with safe defaults. Callers pass
  // only what they know. IDs are assigned by Accoom.Records when stored.

  var make = {
    document: function (d) {
      d = d || {};
      return {
        id: d.id || '', groupId: d.groupId || '', version: num(d.version, 1), isCurrent: d.isCurrent !== false,
        propertyId: str(d.propertyId), listingId: str(d.listingId), ownerId: str(d.ownerId),
        docType: str(d.docType), originalName: str(d.originalName), mimeType: str(d.mimeType),
        size: num(d.size), sha256: str(d.sha256), storageRef: str(d.storageRef),
        uploadedAt: d.uploadedAt || nowIso(),
        reviewStatus: pick(d.reviewStatus, ENUM.documentStatus, 'uploaded'),
        verification: d.verification || { source: 'none', verifiedBy: '', verifiedAt: '' },
        rejectionReason: str(d.rejectionReason), replacedReason: str(d.replacedReason),
        supersedes: str(d.supersedes), supersededBy: str(d.supersededBy)
      };
    },
    analysisReport: function (d) {
      d = d || {};
      return {
        id: d.id || '', documentId: str(d.documentId), mode: pick(d.mode, ['demo', 'ai', 'issuer'], 'demo'),
        identifiedType: str(d.identifiedType), extracted: d.extracted || {}, checks: d.checks || [],
        warnings: d.warnings || [], crossDocument: d.crossDocument || [],
        risk: d.risk || { level: 'unassessed', explanation: '' },
        aiRecommendation: str(d.aiRecommendation),
        adminDecision: d.adminDecision || { decision: '', by: '', at: '', notes: '' },
        verificationSource: pick(d.verificationSource, ENUM.verificationSource, 'none'),
        createdAt: d.createdAt || nowIso()
      };
    },
    transaction: function (d) {
      d = d || {};
      return {
        id: d.id || '', idempotencyKey: str(d.idempotencyKey),
        type: pick(d.type, ENUM.transactionType, 'other'),
        status: pick(d.status, ENUM.transactionStatus, 'pending'),
        paymentSource: pick(d.paymentSource, ENUM.paymentSource, 'demo'),
        propertyId: str(d.propertyId), listingId: str(d.listingId),
        customerId: str(d.customerId), agentId: str(d.agentId), landlordId: str(d.landlordId),
        amounts: d.amounts || { price: 0, agencyFee: 0, legalFee: 0, other: 0, total: 0 },
        billingPeriod: d.billingPeriod ? pick(d.billingPeriod, ENUM.billingPeriod, '') : '',
        paymentReference: str(d.paymentReference), paymentMethod: str(d.paymentMethod),
        paidAt: str(d.paidAt), actdId: str(d.actdId), receiptId: str(d.receiptId),
        tenancyId: str(d.tenancyId), createdAt: d.createdAt || nowIso()
      };
    },
    actd: function (d) {
      d = d || {};
      return {
        id: d.id || '', actdNumber: str(d.actdNumber), transactionId: str(d.transactionId),
        version: num(d.version, 1), supersedes: str(d.supersedes), updateReason: str(d.updateReason),
        content: d.content || {}, issuedAt: d.issuedAt || nowIso(), pdfRef: str(d.pdfRef)
      };
    },
    receipt: function (d) {
      d = d || {};
      return {
        id: d.id || '', receiptNumber: str(d.receiptNumber), transactionId: str(d.transactionId),
        purpose: str(d.purpose), delivery: pick(d.delivery, ENUM.receiptDelivery, 'digital'),
        content: d.content || {}, issuedAt: d.issuedAt || nowIso(), pdfRef: str(d.pdfRef)
      };
    },
    agreement: function (d) {
      d = d || {};
      return {
        id: d.id || '', transactionId: str(d.transactionId), propertyId: str(d.propertyId),
        kind: str(d.kind), documentId: str(d.documentId),
        signatures: d.signatures || [], // {partyRole, at, level}; level is never "legally_validated" by default
        status: str(d.status) || 'draft', createdAt: d.createdAt || nowIso()
      };
    },
    tenancy: function (d) {
      d = d || {};
      return {
        id: d.id || '', propertyId: str(d.propertyId), customerId: str(d.customerId),
        agentId: str(d.agentId), landlordId: str(d.landlordId), actdId: str(d.actdId),
        agreementId: str(d.agreementId), rentAmount: num(d.rentAmount),
        billingPeriod: pick(d.billingPeriod, ENUM.billingPeriod, 'year'),
        periodCount: num(d.periodCount, 1),
        startDate: str(d.startDate), expiryDate: str(d.expiryDate),
        status: pick(d.status, ENUM.tenancyStatus, 'active'),
        renewalDecision: pick(d.renewalDecision, ENUM.renewalDecision, 'none'),
        occupancyExtension: d.occupancyExtension || { days: 0 },
        previousTenancyId: str(d.previousTenancyId),
        paymentHistory: d.paymentHistory || [], notificationHistory: d.notificationHistory || [],
        createdAt: d.createdAt || nowIso()
      };
    },
    renewal: function (d) {
      d = d || {};
      return {
        id: d.id || '', tenancyId: str(d.tenancyId), decision: pick(d.decision, ENUM.renewalDecision, 'none'),
        newAmount: num(d.newAmount), newBillingPeriod: d.newBillingPeriod ? pick(d.newBillingPeriod, ENUM.billingPeriod, '') : '',
        newStartDate: str(d.newStartDate), newExpiryDate: str(d.newExpiryDate),
        newTransactionId: str(d.newTransactionId), decidedAt: d.decidedAt || nowIso()
      };
    },
    extension: function (d) {
      d = d || {};
      return { id: d.id || '', tenancyId: str(d.tenancyId), days: Math.max(0, Math.floor(num(d.days))), configuredBy: str(d.configuredBy), configuredAt: d.configuredAt || nowIso() };
    },
    deliveryAck: function (d) {
      d = d || {};
      return {
        id: d.id || '', receiptId: str(d.receiptId), transactionId: str(d.transactionId),
        state: pick(d.state, ENUM.deliveryState, 'pending_agent'),
        history: d.history || [], // append-only {state, by, role, at, note}
        createdAt: d.createdAt || nowIso()
      };
    },
    notification: function (d) {
      d = d || {};
      return {
        id: d.id || '', dedupeKey: str(d.dedupeKey), category: str(d.category),
        recipientId: str(d.recipientId), recipientRole: pick(d.recipientRole, ENUM.role, 'customer'),
        title: str(d.title), message: str(d.message), link: str(d.link),
        channels: d.channels || [{ channel: 'in_app', state: 'delivered' }], // external channels are never "delivered" in the frontend
        createdAt: d.createdAt || nowIso()
      };
    },
    auditEvent: function (d) {
      d = d || {};
      return {
        id: d.id || '', at: d.at || nowIso(), actorId: str(d.actorId),
        actorRole: pick(d.actorRole, ENUM.role, 'system'), action: str(d.action),
        entityType: str(d.entityType), entityId: str(d.entityId), detail: d.detail || {}
      };
    }
  };

  /* ------------------------------------------------- existing-listing upgrade */

  // Returns a NEW object. Purely additive: never removes or changes an
  // existing field. Note: listings already have a numeric `documents` field
  // (a count), so new data lives under `documentation` / `approval`.
  function normalizeListing(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    if (num(rec.schemaVersion) >= SCHEMA_VERSION) return rec;
    var out = Object.assign({}, rec);
    var type = rec.category === 'sale' ? 'sale' : 'rent';
    var stamp = nowIso();

    out.schemaVersion = SCHEMA_VERSION;
    if (!out.listingType) out.listingType = type;
    if (!out.approval) {
      out.approval = {
        state: 'legacy_unreviewed', updatedAt: stamp, reason: '',
        note: 'Created before ACCOOM document review existed. Never reviewed.'
      };
    }
    if (!out.documentation) {
      out.documentation = { requirementSet: '', submittedCount: 0, lastSubmittedAt: '' };
    }
    if (!out.receiptDelivery) out.receiptDelivery = 'digital';
    // Rental-only settings are only ever added to rental listings.
    if (type === 'rent' && !out.occupancyExtension) out.occupancyExtension = { mode: 'none', days: 0 };
    return out;
  }

  Accoom.Schemas = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    ENUM: ENUM,
    ID_PREFIX: ID_PREFIX,
    make: make,
    normalizeListing: normalizeListing
  };
})(window.Accoom);
