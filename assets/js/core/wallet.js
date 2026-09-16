/* ==========================================================================
   ACCOOM — Wallet (frontend mock, backend-ready)

   Single source of truth for the buyer's wallet balance. Every page that
   shows or changes the balance (header panel, profile stats, property
   payment modal, payment page) reads/writes through this module instead
   of touching localStorage or the DOM directly.

   Swapping this for a real backend later only means editing the bodies
   of getBalance/credit/debit/setBalance below to call your API instead
   of localStorage — nothing else in the app needs to change.
   ========================================================================== */

window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var BALANCE_KEY = 'accoom-wallet-balance';
  var UPDATED_EVENT = 'accoom:wallet-updated';

  function toSafeAmount(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return null;
    // Work in whole kobo internally to avoid float drift, store as Naira.
    return Math.round(n * 100) / 100;
  }

  function broadcast(balance) {
    try {
      document.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: { balance: balance } }));
    } catch (e) {
      // Older browsers without CustomEvent support simply won't get the live update.
    }
  }

  /**
   * Current wallet balance in Naira. Defaults to 0 for a brand new/guest session.
   */
  Accoom.getWalletBalance = function () {
    var stored = Accoom.getStorage(BALANCE_KEY, 0);
    var safe = toSafeAmount(stored);
    return safe === null ? 0 : safe;
  };

  /**
   * Overwrite the balance outright (rarely needed directly — prefer credit/debit).
   */
  Accoom.setWalletBalance = function (amount) {
    var safe = toSafeAmount(amount);
    if (safe === null) return false;
    Accoom.setStorage(BALANCE_KEY, safe);
    broadcast(safe);
    return true;
  };

  /**
   * Add funds (a successful deposit/top-up). Returns the new balance, or
   * null if the amount was invalid.
   */
  Accoom.creditWallet = function (amount) {
    var addAmount = toSafeAmount(amount);
    if (addAmount === null || addAmount <= 0) return null;
    var next = toSafeAmount(Accoom.getWalletBalance() + addAmount);
    Accoom.setStorage(BALANCE_KEY, next);
    broadcast(next);
    return next;
  };

  /**
   * Remove funds (a completed purchase paid from wallet balance). Refuses
   * to go below zero. Returns the new balance, or null if it can't be done.
   */
  Accoom.debitWallet = function (amount) {
    var takeAmount = toSafeAmount(amount);
    if (takeAmount === null || takeAmount <= 0) return null;
    var current = Accoom.getWalletBalance();
    if (takeAmount > current) return null;
    var next = toSafeAmount(current - takeAmount);
    Accoom.setStorage(BALANCE_KEY, next);
    broadcast(next);
    return next;
  };

  /**
   * Format a Naira amount the same way everywhere in the app.
   */
  Accoom.formatWalletAmount = function (amount) {
    var safe = toSafeAmount(amount) || 0;
    return '\u20A6' + safe.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  Accoom.WALLET_UPDATED_EVENT = UPDATED_EVENT;

})(window.Accoom);