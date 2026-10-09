window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  var DEMO_SERIES = [
    { amount: 280000, status: 'settled' },
    { amount: 345000, status: 'settled' },
    { amount: 310000, status: 'settled' },
    { amount: 420000, status: 'settled' },
    { amount: 390000, status: 'settled' },
    { amount: 475000, status: 'settled' },
    { amount: 360000, status: 'settled' },
    { amount: 520000, status: 'settled' },
    { amount: 455000, status: 'settled' },
    { amount: 590000, status: 'settled' },
    { amount: 490000, status: 'pending' },
    { amount: 640000, status: 'settled' }
  ];

  function transactions() {
    if (typeof Accoom.getWalletTransactions !== 'function') return [];
    return Accoom.getWalletTransactions().filter(function (transaction) {
      return transaction && typeof transaction === 'object';
    });
  }

  function transactionDate(transaction) {
    var date = new Date(transaction.createdAt || transaction.date || '');
    return isNaN(date.getTime()) ? null : date;
  }

  function isEarning(transaction) {
    var category = String(transaction.category || transaction.kind || '').toLowerCase();
    return transaction.type === 'credit' && (category === 'earning' || category === 'commission');
  }

  function getEarningsSummary(now) {
    var current = now instanceof Date ? now : new Date();
    var startOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    var startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    var startOfMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    var totals = { today: 0, week: 0, month: 0, overall: 0 };

    transactions().filter(isEarning).forEach(function (transaction) {
      var amount = Number(transaction.amount);
      var date = transactionDate(transaction);
      if (!isFinite(amount) || amount <= 0 || !date) return;
      totals.overall += amount;
      if (date >= startOfMonth) totals.month += amount;
      if (date >= startOfWeek) totals.week += amount;
      if (date >= startOfToday) totals.today += amount;
    });

    return totals;
  }

  function getPerformanceSeries(now) {
    var current = now instanceof Date ? now : new Date();
    var realEarnings = transactions().filter(function (transaction) {
      return isEarning(transaction) && transactionDate(transaction);
    });
    if (realEarnings.length) {
      var byDay = {};
      realEarnings.forEach(function (transaction) {
        var date = transactionDate(transaction);
        var key = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        byDay[key] = (byDay[key] || 0) + Number(transaction.amount || 0);
      });
      return Object.keys(byDay).map(function (key) {
        var parts = key.split('-');
        var date = new Date(Number(parts[0]), Number(parts[1]), Number(parts[2]));
        return {
          label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          timestamp: date.getTime(),
          amount: byDay[key],
          status: 'settled'
        };
      }).sort(function (a, b) { return a.timestamp - b.timestamp; }).slice(-12);
    }

    return DEMO_SERIES.map(function (point, index) {
      var date = new Date(current.getFullYear(), current.getMonth(), current.getDate());
      date.setDate(date.getDate() - (DEMO_SERIES.length - index - 1) * 2);
      return {
        label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        timestamp: date.getTime(),
        amount: point.amount,
        status: point.status,
        demo: true
      };
    });
  }

  function getTransactionBreakdown() {
    var sums = { earnings: 0, pending: 0, payments: 0 };
    transactions().forEach(function (transaction) {
      var amount = Number(transaction.amount);
      if (!isFinite(amount) || amount <= 0) return;
      if (transaction.status === 'pending' || transaction.verified === false) sums.pending += amount;
      else if (isEarning(transaction)) sums.earnings += amount;
      else if (transaction.type === 'debit') sums.payments += amount;
    });
    if (!sums.earnings && !sums.pending && !sums.payments) {
      sums = { earnings: 1120000, pending: 260000, payments: 540000, demo: true };
    }
    return sums;
  }

  Accoom.AgentDashboardData = {
    getEarningsSummary: getEarningsSummary,
    getPerformanceSeries: getPerformanceSeries,
    getTransactionBreakdown: getTransactionBreakdown,
    getTransactions: transactions
  };
})(window.Accoom);
