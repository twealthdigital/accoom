window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var STATE_KEY = 'accoom-agent-payout-state';
  var SEEDED_KEY = 'accoom-agent-payout-samples-seeded';
  var WITHDRAWAL_CATEGORY = 'payout-withdrawal';
  var SAMPLE_BANK = 'Access Bank';
  var SAMPLE_MASKED_ACCOUNT = '******4321';

  function initialState() {
    return { accounts: [] };
  }

  function readState() {
    var state = Accoom.getStorage(STATE_KEY, null);
    if (!state || typeof state !== 'object') return initialState();

    var accounts = Array.isArray(state.accounts) ? state.accounts.filter(function (account) {
      return account && account.id && account.bankName && account.accountName &&
        /^\d{4}$/.test(account.last4) && account.isDemo !== true;
    }).map(function (account) {
      return {
        id: account.id,
        bankName: account.bankName,
        accountName: account.accountName,
        last4: account.last4
      };
    }) : [];
    return { accounts: accounts };
  }

  function saveState(state) {
    return Accoom.setStorage(STATE_KEY, state);
  }

  function sampleDate(daysAgo) {
    var date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString();
  }

  function ensureSampleTransactions() {
    if (Accoom.getStorage(SEEDED_KEY, false)) return;
    var samples = [
      {
        amount: 125000,
        status: 'successful',
        reference: 'ACM-PAYOUT-SUCCESS',
        date: sampleDate(18)
      },
      {
        amount: 75000,
        status: 'pending',
        reference: 'ACM-PAYOUT-PENDING',
        date: sampleDate(2)
      },
      {
        amount: 35000,
        status: 'failed',
        reference: 'ACM-PAYOUT-FAILED',
        date: sampleDate(9)
      }
    ];

    samples.forEach(function (sample) {
      Accoom.recordMockPayoutWithdrawal(sample.amount, {
        status: sample.status,
        reference: sample.reference,
        createdAt: sample.date,
        payoutMethod: SAMPLE_BANK,
        destinationBank: SAMPLE_BANK,
        destinationAccountName: 'Account Holder',
        maskedAccount: SAMPLE_MASKED_ACCOUNT,
        fee: 0,
        netAmount: sample.amount,
        isDemo: true
      });
    });
    Accoom.setStorage(SEEDED_KEY, true);
  }

  function initialize() {
    var state = Accoom.getStorage(STATE_KEY, null);
    if (!state || typeof state !== 'object') saveState(initialState());
    else saveState(readState());
    ensureSampleTransactions();
  }

  function getAccounts() {
    var state = readState();
    return state.accounts.map(function (account) {
      return {
        id: account.id,
        bankName: account.bankName,
        accountName: account.accountName,
        last4: account.last4
      };
    });
  }

  function saveAccount(details) {
    var state = readState();
    var existing = details.id ? state.accounts.filter(function (account) { return account.id === details.id; })[0] : null;
    var last4 = details.accountNumber
      ? String(details.accountNumber).slice(-4)
      : (existing && existing.last4);
    if (!details.bankName || !details.accountName || !/^\d{4}$/.test(last4 || '')) return null;

    var account = {
      id: existing ? existing.id : 'payout-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      bankName: String(details.bankName),
      accountName: String(details.accountName).trim(),
      last4: last4
    };

    if (existing) {
      state.accounts = state.accounts.map(function (item) { return item.id === existing.id ? account : item; });
    } else {
      state.accounts.push(account);
    }
    if (!saveState(state)) return null;
    return account;
  }

  function removeAccount(id) {
    var state = readState();
    state.accounts = state.accounts.filter(function (account) { return account.id !== id; });
    return saveState(state);
  }

  function getTransactions() {
    return Accoom.getWalletTransactions().filter(function (transaction) {
      return transaction && transaction.category === WITHDRAWAL_CATEGORY;
    }).sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  function getSummary() {
    var transactions = getTransactions();
    return {
      availableBalance: Accoom.getWalletBalance(),
      totalWithdrawn: transactions.reduce(function (sum, transaction) {
        return sum + (transaction.payoutStatus === 'successful' ? Number(transaction.amount) || 0 : 0);
      }, 0),
      pendingWithdrawals: transactions.reduce(function (sum, transaction) {
        return sum + (transaction.payoutStatus === 'pending' ? Number(transaction.amount) || 0 : 0);
      }, 0),
      successfulCount: transactions.filter(function (transaction) {
        return transaction.payoutStatus === 'successful';
      }).length
    };
  }

  function createWithdrawal(amount, accountId, fee) {
    var state = readState();
    var account = state.accounts.filter(function (item) { return item.id === accountId; })[0];
    var safeAmount = Number(amount);
    var safeFee = Number(fee);
    if (!account || !isFinite(safeAmount) || safeAmount <= 0 ||
        !isFinite(safeFee) || safeFee < 0 || safeAmount > Accoom.getWalletBalance()) return null;

    var reference = 'ACM-' + Date.now().toString(36).toUpperCase() + '-' +
      Math.random().toString(36).slice(2, 7).toUpperCase();
    return Accoom.recordMockPayoutWithdrawal(safeAmount, {
      status: 'pending',
      reference: reference,
      payoutMethod: account.bankName,
      destinationBank: account.bankName,
      destinationAccountName: account.accountName,
      maskedAccount: '******' + account.last4,
      fee: safeFee,
      netAmount: Math.max(0, safeAmount - safeFee),
      isDemo: false
    });
  }

  Accoom.PayoutService = {
    initialize: initialize,
    getAccounts: getAccounts,
    saveAccount: saveAccount,
    removeAccount: removeAccount,
    getTransactions: getTransactions,
    getSummary: getSummary,
    createWithdrawal: createWithdrawal,
    withdrawalCategory: WITHDRAWAL_CATEGORY
  };
})(window.Accoom);
