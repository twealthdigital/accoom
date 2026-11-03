window.Accoom = window.Accoom || {};

(function (Accoom) {
  'use strict';

  // Temporary, removable sample chart data; never written to wallet transactions.
  // ONE ledger feeds the line, the bar AND the pie, so every number matches.
  //   earned  = income that has settled. This is what the bars / line plot.
  //   pending = income still waiting to settle. The chart HOLDS the previous level
  //             (flat, gold) for that period until the money settles and the line rises or falls.
  //   paid    = money paid out.
  var DEMO_LEDGER = [
    { earned: 280000, paid: 40000 },
    { earned: 345000, paid: 35000 },
    { earned: 310000 },
    { earned: 420000, paid: 60000 },
    { earned: 390000, paid: 25000 },
    { earned: 475000, paid: 70000 },
    { earned: 360000 },
    { earned: 520000, paid: 80000 },
    { earned: 455000, paid: 30000 },
    { earned: 590000, paid: 90000 },
    { pending: 320000 },
    { earned: 640000, paid: 100000 }
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

  function isPendingTx(transaction) {
    return transaction.status === 'pending' || transaction.verified === false;
  }

  // Turns ledger rows into chart points. A pending row never moves the chart:
  // it keeps the previous level (flat) until the money settles.
  function toPoints(rows, demo) {
    var held = 0;
    var hasPrevious = false;
    return rows.map(function (row) {
      var pendingOnly = !(row.earned > 0) && row.pending > 0;
      var amount = pendingOnly ? (hasPrevious ? held : row.pending) : (row.earned || 0);
      held = amount;
      hasPrevious = true;
      return {
        label: new Date(row.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        timestamp: row.timestamp,
        amount: amount,
        earned: row.earned || 0,
        pendingAmount: row.pending || 0,
        status: pendingOnly ? 'pending' : 'settled',
        demo: !!demo
      };
    });
  }

  function totalsOf(rows, demo) {
    var totals = { earnings: 0, pending: 0, payments: 0, demo: !!demo };
    rows.forEach(function (row) {
      totals.earnings += row.earned || 0;
      totals.pending += row.pending || 0;
      totals.payments += row.paid || 0;
    });
    return totals;
  }

  // The single source of truth for all three charts.
  function getLedger(now) {
    var current = now instanceof Date ? now : new Date();
    var real = transactions().filter(function (transaction) {
      var amount = Number(transaction.amount);
      return transactionDate(transaction) && isFinite(amount) && amount > 0;
    });

    if (real.some(isEarning)) {
      var byDay = {};
      real.forEach(function (transaction) {
        var date = transactionDate(transaction);
        var key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        var row = byDay[key] || (byDay[key] = { timestamp: key, earned: 0, pending: 0, paid: 0 });
        var amount = Number(transaction.amount);
        if (isEarning(transaction) && isPendingTx(transaction)) row.pending += amount;
        else if (isEarning(transaction)) row.earned += amount;
        else if (transaction.type === 'debit') row.paid += amount;
      });
      var rows = Object.keys(byDay).map(function (key) { return byDay[key]; })
        .sort(function (a, b) { return a.timestamp - b.timestamp; });
      var incomeRows = rows.filter(function (row) { return row.earned > 0 || row.pending > 0; }).slice(-12);
      var from = incomeRows.length ? incomeRows[0].timestamp : 0;
      return {
        points: toPoints(incomeRows, false),
        totals: totalsOf(rows.filter(function (row) { return row.timestamp >= from; }), false)
      };
    }

    var demoRows = DEMO_LEDGER.map(function (row, index) {
      var date = new Date(current.getFullYear(), current.getMonth(), current.getDate());
      date.setDate(date.getDate() - (DEMO_LEDGER.length - index - 1) * 2);
      return { timestamp: date.getTime(), earned: row.earned || 0, pending: row.pending || 0, paid: row.paid || 0 };
    });
    return { points: toPoints(demoRows, true), totals: totalsOf(demoRows, true) };
  }

  function getPerformanceSeries(now) {
    return getLedger(now).points;
  }

  // Same ledger as the line/bar, so Earnings here = the sum of the settled bars.
  function getTransactionBreakdown(now) {
    return getLedger(now).totals;
  }

  Accoom.AgentDashboardData = {
    getEarningsSummary: getEarningsSummary,
    getPerformanceSeries: getPerformanceSeries,
    getTransactionBreakdown: getTransactionBreakdown,
    getTransactions: transactions
  };
})(window.Accoom);
