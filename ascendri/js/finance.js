/* ============================================================
   Acendri OS — Finance: transactions, budgets, savings goals.
   Month navigator, summary stats, one-line insight, monthly
   budget bars and glowing savings goals with celebrations.
   ============================================================ */
(function () {
  'use strict';
  var A = window.Ascendri;

  var CATS = ['Food', 'Transport', 'Fun', 'Subscriptions', 'Sport', 'School', 'Shopping', 'Job', 'Gifts', 'Other'];
  var GOAL_EMOJIS = ['🛡️', '🎾', '💻', '✈️', '🏠', '🎁', '🚗', '🎮'];

  /* ---------------- module state ---------------- */

  var selMonth = A.ui.monthISO();   // 'YYYY-MM' being viewed
  var catFilter = 'all';            // transactions table category filter
  var showAllTx = false;            // table shows 12 rows until expanded

  /* ---------------- helpers ---------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function ymAdd(ym, delta) {
    var p = ym.split('-');
    var y = +p[0], m = (+p[1] - 1) + delta;
    y += Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }

  function ymLabel(ym) {
    var p = ym.split('-');
    return A.ui.MONTHS[(+p[1]) - 1] + ' ' + p[0];
  }

  function safeAccent(name) {
    return A.ui.ACCENT_NAMES.indexOf(name) >= 0 ? name : 'yellow';
  }

  function fin(s) {
    return s.finance || { transactions: [], budgets: {}, savingsGoals: [] };
  }

  function ensureFin(st) {
    if (!st.finance) st.finance = {};
    if (!st.finance.transactions) st.finance.transactions = [];
    if (!st.finance.budgets) st.finance.budgets = {};
    if (!st.finance.savingsGoals) st.finance.savingsGoals = [];
    return st.finance;
  }

  function findGoal(s, id) {
    var out = null;
    (fin(s).savingsGoals || []).forEach(function (g) { if (g.id === id) out = g; });
    return out;
  }

  function findTx(s, id) {
    var out = null;
    (fin(s).transactions || []).forEach(function (t) { if (t.id === id) out = t; });
    return out;
  }

  function parseAmount(raw) {
    var a = parseFloat(raw);
    if (!isFinite(a)) return 0;
    return Math.round(a * 100) / 100;
  }

  function catOptions(selected) {
    return CATS.map(function (c) {
      return '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
  }

  /* ---------------- modals ---------------- */

  function openTxModal() {
    var esc = A.ui.esc;
    var vType = 'expense';

    A.ui.modal({
      title: '💸 New transaction',
      accent: 'yellow',
      body:
        '<div class="field"><label>Type</label><div class="row">' +
          '<button type="button" class="btn" id="tx-inc">Income</button>' +
          '<button type="button" class="btn btn-acc acc-red" id="tx-exp">Expense</button>' +
        '</div></div>' +
        '<div class="field"><label>Amount</label>' +
          '<input id="tx-amount" class="input" type="number" min="0" step="0.01" placeholder="0.00"></div>' +
        '<div class="field"><label>Category</label>' +
          '<select id="tx-cat" class="select">' + catOptions('Food') + '</select></div>' +
        '<div class="field"><label>Note</label>' +
          '<input id="tx-note" class="input" maxlength="80" placeholder="e.g. Lunch out"></div>' +
        '<div class="field"><label>Date</label>' +
          '<input id="tx-date" class="input" type="date" value="' + esc(A.ui.todayISO()) + '"></div>',
      onOpen: function (m) {
        var inc = m.querySelector('#tx-inc');
        var exp = m.querySelector('#tx-exp');
        function paint() {
          inc.className = 'btn' + (vType === 'income' ? ' btn-acc acc-green' : '');
          exp.className = 'btn' + (vType === 'expense' ? ' btn-acc acc-red' : '');
        }
        inc.addEventListener('click', function () { vType = 'income'; paint(); });
        exp.addEventListener('click', function () { vType = 'expense'; paint(); });
      },
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: 'Save transaction',
          cls: 'btn-primary',
          onClick: function (m) {
            var amount = parseAmount(m.querySelector('#tx-amount').value);
            if (!(amount > 0)) { A.ui.toast('Enter an amount greater than zero', '🧮'); return false; }
            var cat = m.querySelector('#tx-cat').value;
            if (CATS.indexOf(cat) === -1) cat = 'Other';
            var note = m.querySelector('#tx-note').value.trim();
            var date = m.querySelector('#tx-date').value || A.ui.todayISO();
            selMonth = date.slice(0, 7);
            if (catFilter !== 'all' && catFilter !== cat) catFilter = 'all';
            A.S.update(function (st) {
              ensureFin(st).transactions.push({
                id: A.ui.uid(), type: vType, amount: amount, category: cat, note: note, date: date
              });
            });
            A.S.addXp(2, 'Transaction logged');
          }
        }
      ]
    });
  }

  function openBudgetModal() {
    A.ui.modal({
      title: '📊 Set a monthly budget',
      accent: 'orange',
      body:
        '<p class="small muted" style="margin-bottom:12px">Pick a category and a monthly spending cap — Acendri warns you before you blow past it.</p>' +
        '<div class="field"><label>Category</label>' +
          '<select id="bud-cat" class="select">' + catOptions('Food') + '</select></div>' +
        '<div class="field"><label>Monthly limit</label>' +
          '<input id="bud-limit" class="input" type="number" min="0" step="1" placeholder="e.g. 120"></div>',
      onOpen: function (m) {
        var sel = m.querySelector('#bud-cat');
        var inp = m.querySelector('#bud-limit');
        function syncExisting() {
          var budgets = fin(A.S.get()).budgets || {};
          if (budgets[sel.value]) inp.value = budgets[sel.value];
        }
        sel.addEventListener('change', syncExisting);
        syncExisting();
      },
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: 'Set budget',
          cls: 'btn-primary',
          onClick: function (m) {
            var cat = m.querySelector('#bud-cat').value;
            if (CATS.indexOf(cat) === -1) cat = 'Other';
            var limit = parseAmount(m.querySelector('#bud-limit').value);
            if (!(limit > 0)) { A.ui.toast('Enter a limit greater than zero', '🧮'); return false; }
            A.S.update(function (st) {
              ensureFin(st).budgets[cat] = limit;
            });
            A.ui.toast('Budget set: ' + cat + ' capped at ' + A.ui.fmtMoney(limit) + '/month', '📊');
          }
        }
      ]
    });
  }

  function openGoalModal() {
    var esc = A.ui.esc;
    A.ui.modal({
      title: '🏦 New savings goal',
      accent: 'yellow',
      body:
        '<div class="field"><label>What are you saving for?</label>' +
          '<input id="sg-title" class="input" maxlength="60" placeholder="e.g. New racquet"></div>' +
        '<div class="field"><label>Emoji</label>' +
          '<div class="emoji-pick" id="sg-emoji">' +
            GOAL_EMOJIS.map(function (e, i) {
              return '<button type="button" data-emoji="' + esc(e) + '"' + (i === 0 ? ' class="sel"' : '') +
                ' aria-label="Pick emoji ' + esc(e) + '">' + esc(e) + '</button>';
            }).join('') +
          '</div></div>' +
        '<div class="field"><label>Target amount</label>' +
          '<input id="sg-target" class="input" type="number" min="0" step="0.01" placeholder="e.g. 500"></div>' +
        '<div class="field"><label>Accent colour</label>' +
          '<div class="swatches" id="sg-acc">' +
            A.ui.ACCENT_NAMES.map(function (name) {
              return '<button type="button" class="acc-' + name + (name === 'yellow' ? ' sel' : '') +
                '" data-swatch="' + name + '" title="' + name + '" aria-label="Accent ' + name + '"></button>';
            }).join('') +
          '</div></div>',
      onOpen: function (m) {
        m.querySelectorAll('#sg-emoji button').forEach(function (b) {
          b.addEventListener('click', function () {
            m.querySelectorAll('#sg-emoji button').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
          });
        });
        m.querySelectorAll('#sg-acc button').forEach(function (b) {
          b.addEventListener('click', function () {
            m.querySelectorAll('#sg-acc button').forEach(function (x) { x.classList.remove('sel'); });
            b.classList.add('sel');
          });
        });
      },
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: 'Create goal',
          cls: 'btn-primary',
          onClick: function (m) {
            var title = m.querySelector('#sg-title').value.trim();
            if (!title) { A.ui.toast('Give your savings goal a name first', '✍️'); return false; }
            var target = parseAmount(m.querySelector('#sg-target').value);
            if (!(target > 0)) { A.ui.toast('Enter a target amount greater than zero', '🧮'); return false; }
            var emBtn = m.querySelector('#sg-emoji button.sel');
            var emoji = emBtn ? emBtn.getAttribute('data-emoji') : GOAL_EMOJIS[0];
            var swBtn = m.querySelector('#sg-acc button.sel');
            var accent = safeAccent(swBtn ? swBtn.getAttribute('data-swatch') : 'yellow');
            A.S.update(function (st) {
              ensureFin(st).savingsGoals.push({
                id: A.ui.uid(), title: title, emoji: emoji, target: target, saved: 0, accent: accent
              });
            });
            A.ui.toast('Savings goal created — first dollar is the hardest', '🏦');
          }
        }
      ]
    });
  }

  function openAddMoneyModal(goalId) {
    var esc = A.ui.esc;
    var g = findGoal(A.S.get(), goalId);
    if (!g) return;
    var remaining = Math.max(0, g.target - g.saved);
    A.ui.modal({
      title: esc(g.emoji || '🏦') + ' Add money — ' + esc(g.title),
      accent: safeAccent(g.accent),
      body:
        '<p class="small muted" style="margin-bottom:12px">' +
          A.ui.esc(A.ui.fmtMoney(g.saved) + ' saved of ' + A.ui.fmtMoney(g.target)) +
          (remaining > 0 ? ' — ' + A.ui.esc(A.ui.fmtMoney(remaining)) + ' to go.' : ' — target already reached, keep stacking!') +
        '</p>' +
        '<div class="field"><label>Amount to add</label>' +
          '<input id="sg-add" class="input" type="number" min="0" step="0.01" placeholder="0.00"></div>',
      actions: [
        { label: 'Cancel', cls: 'btn-ghost' },
        {
          label: 'Add money',
          cls: 'btn-primary',
          onClick: function (m) {
            var amount = parseAmount(m.querySelector('#sg-add').value);
            if (!(amount > 0)) { A.ui.toast('Enter an amount greater than zero', '🧮'); return false; }
            var justReached = false, title = '';
            A.S.update(function (st) {
              var goals = ensureFin(st).savingsGoals;
              for (var i = 0; i < goals.length; i++) {
                if (goals[i].id !== goalId) continue;
                var before = goals[i].saved;
                goals[i].saved = Math.round((before + amount) * 100) / 100;
                title = goals[i].title;
                justReached = before < goals[i].target && goals[i].saved >= goals[i].target;
                break;
              }
            });
            if (justReached) {
              A.ui.confetti();
              A.ui.toast('GOAL reached 🎉 — "' + title + '" fully funded!', '🏆');
            } else {
              A.ui.toast(A.ui.fmtMoney(amount) + ' added to "' + title + '"', '💰');
            }
          }
        }
      ]
    });
  }

  /* ---------------- HTML builders ---------------- */

  // The view can go forward past the current month when future-dated
  // transactions exist there (e.g. a pre-logged payment).
  function maxMonth() {
    var max = A.ui.monthISO();
    A.S.get().finance.transactions.forEach(function (t) {
      if (t.date && t.date.slice(0, 7) > max) max = t.date.slice(0, 7);
    });
    return max;
  }

  function headHTML() {
    var atCurrent = selMonth >= maxMonth();
    return '<div class="screen-head"><div class="spread wrap">' +
      '<div><h1>Finance</h1>' +
      '<div class="sub">Know where your money goes — and where you want it to go.</div></div>' +
      '<div class="row wrap">' +
        '<div class="row" style="gap:2px">' +
          '<button class="icon-btn" data-mprev="1" title="Previous month" aria-label="Previous month">' +
            '<span style="display:inline-flex;transform:scaleX(-1)">' + A.ui.icon('arrow', 'sm') + '</span></button>' +
          '<span class="bold" style="min-width:82px;text-align:center">' + ymLabel(selMonth) + '</span>' +
          '<button class="icon-btn" data-mnext="1" title="Next month" aria-label="Next month"' +
            (atCurrent ? ' disabled style="opacity:.35;cursor:default"' : '') + '>' + A.ui.icon('arrow', 'sm') + '</button>' +
        '</div>' +
        '<button class="btn btn-primary" data-newtx="1">+ Transaction</button>' +
      '</div>' +
      '</div></div>';
  }

  function summaryHTML(sum) {
    var fmt = A.ui.fmtMoney;
    return '<div class="grid4">' +
      '<div class="card acc-green"><div class="stat">' +
        '<div class="v pos num">' + fmt(sum.income) + '</div><div class="k">Income</div></div></div>' +
      '<div class="card acc-red"><div class="stat">' +
        '<div class="v num">' + fmt(sum.expenses) + '</div><div class="k">Expenses</div></div></div>' +
      '<div class="card acc-cyan"><div class="stat">' +
        '<div class="v num ' + (sum.net >= 0 ? 'pos' : 'neg') + '">' + fmt(sum.net) + '</div><div class="k">Net this month</div></div></div>' +
      '<div class="card acc-yellow"><div class="stat">' +
        '<div class="v h-acc num">' + fmt(sum.savings) + '</div><div class="k">Total saved</div></div></div>' +
      '</div>';
  }

  function insightHTML(sum) {
    var esc = A.ui.esc, fmt = A.ui.fmtMoney;
    var sentence;
    if (sum.overBudget && sum.overBudget.length) {
      var o = sum.overBudget[0];
      sentence = '⚠️ Over budget in ' + esc(o.cat) + ' (' + esc(fmt(o.spent)) + ' of ' + esc(fmt(o.limit)) + ')' +
        (sum.overBudget.length > 1 ? ' — and ' + (sum.overBudget.length - 1) + ' more categor' + (sum.overBudget.length === 2 ? 'y is' : 'ies are') + ' over too.' : ' — ease off there this week.');
    } else if (sum.expenses > 0) {
      var topCat = null, topAmt = 0;
      Object.keys(sum.byCat).forEach(function (c) {
        if (sum.byCat[c] > topAmt) { topAmt = sum.byCat[c]; topCat = c; }
      });
      var pct = Math.round(100 * topAmt / sum.expenses);
      sentence = 'Your top expense category in ' + ymLabel(selMonth) + ' is ' + esc(topCat) + ' at ' + esc(fmt(topAmt)) +
        ' — ' + pct + '% of everything you spent.';
    } else {
      sentence = 'No expenses logged for ' + ymLabel(selMonth) + ' yet — log your first transaction and find out where your money actually goes.';
    }
    return '<div class="card acc acc-cyan section-gap"><div class="row">' +
      '<span class="icon-tile">' + A.ui.icon('bulb') + '</span>' +
      '<div style="min-width:0">' + sentence + '</div>' +
      '</div></div>';
  }

  function txTableHTML(monthTx) {
    var esc = A.ui.esc, fmt = A.ui.fmtMoney;
    var filtered = catFilter === 'all'
      ? monthTx
      : monthTx.filter(function (t) { return t.category === catFilter; });

    var body;
    if (!monthTx.length) {
      body = '<div class="empty"><div class="e-emoji">💸</div>' +
        '<p>No transactions in ' + ymLabel(selMonth) + ' yet — money you don’t track quietly disappears.</p>' +
        '<button class="btn btn-acc acc-yellow" data-newtx="1">Add your first transaction</button></div>';
    } else if (!filtered.length) {
      body = '<div class="empty"><div class="e-emoji">🔍</div>' +
        '<p>No ' + esc(catFilter) + ' transactions in ' + ymLabel(selMonth) + '.</p>' +
        '<button class="btn btn-acc acc-cyan" data-clearfilter="1">Show all categories</button></div>';
    } else {
      var shown = showAllTx ? filtered : filtered.slice(0, 12);
      var rows = shown.map(function (t) {
        var isInc = t.type === 'income';
        return '<tr>' +
          '<td class="muted">' + esc(A.ui.fmtDate(t.date)) + '</td>' +
          '<td>' + (t.note ? esc(t.note) : '<span class="dim">—</span>') + '</td>' +
          '<td><span class="tag">' + esc(t.category) + '</span></td>' +
          '<td class="num ' + (isInc ? 'pos' : 'neg') + '">' + (isInc ? '+' : '') + esc(fmt(t.amount)) + '</td>' +
          '<td style="text-align:right"><button class="icon-btn danger" data-delt="' + esc(t.id) + '" title="Delete transaction" aria-label="Delete transaction">' +
            A.ui.icon('trash', 'sm') + '</button></td>' +
          '</tr>';
      }).join('');
      body = '<div class="scroll-x"><table class="tbl">' +
        '<thead><tr><th>Date</th><th>Note</th><th>Category</th><th>Amount</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>' +
        (filtered.length > 12
          ? '<div style="margin-top:8px"><button class="btn btn-ghost btn-sm" data-txmore="1">' +
            (showAllTx ? 'Show fewer' : 'Show all ' + filtered.length) + '</button></div>'
          : '');
    }

    var filterSel = '';
    if (monthTx.length) {
      filterSel = '<select class="select" data-catfilter="1" style="width:auto;padding-top:6px;padding-bottom:6px" aria-label="Filter by category">' +
        '<option value="all"' + (catFilter === 'all' ? ' selected' : '') + '>All categories</option>' +
        CATS.map(function (c) {
          return '<option value="' + c + '"' + (c === catFilter ? ' selected' : '') + '>' + c + '</option>';
        }).join('') +
        '</select>';
    }

    return '<div class="card acc-yellow section-gap">' +
      '<div class="spread wrap" style="margin-bottom:6px">' +
        '<div class="card-title" style="margin-bottom:0">' + A.ui.icon('dollar') + 'Transactions</div>' +
        filterSel +
      '</div>' + body + '</div>';
  }

  function budgetsHTML(sum, budgets) {
    var esc = A.ui.esc, fmt = A.ui.fmtMoney;
    var cats = Object.keys(budgets).sort();
    var body;
    if (!cats.length) {
      body = '<div class="empty"><div class="e-emoji">📊</div>' +
        '<p>A budget is a monthly cap for one category — set one and Acendri flags you before overspending sneaks up.</p>' +
        '<button class="btn btn-acc acc-orange" data-newbudget="1">Set your first budget</button></div>';
    } else {
      body = '<div class="list">' + cats.map(function (cat) {
        var limit = budgets[cat];
        var spent = sum.byCat[cat] || 0;
        var over = limit > 0 && spent > limit;
        var pct = over ? 100 : (limit > 0 ? Math.min(100, Math.round(100 * spent / limit)) : 100);
        return '<div class="list-item acc-' + (over ? 'red' : 'orange') + '">' +
          '<div class="li-main">' +
            '<div class="spread">' +
              '<span class="li-title' + (over ? ' neg' : '') + '">' + (over ? '⚠️ ' : '') + esc(cat) + '</span>' +
              '<span class="small num ' + (over ? 'neg' : 'muted') + '">' + esc(fmt(spent)) + ' spent of ' + esc(fmt(limit)) + '</span>' +
            '</div>' +
            '<div class="bar" style="margin-top:7px"><span class="bar-fill" style="width:' + pct + '%"></span></div>' +
          '</div>' +
          '<button class="icon-btn danger" data-delbudget="' + esc(cat) + '" title="Remove budget" aria-label="Remove budget">' +
            A.ui.icon('trash', 'sm') + '</button>' +
          '</div>';
      }).join('') + '</div>';
    }
    return '<div class="card acc-orange">' +
      '<div class="spread" style="margin-bottom:6px">' +
        '<div class="card-title" style="margin-bottom:0">' + A.ui.icon('trend') + 'Monthly budgets</div>' +
        '<button class="btn btn-sm btn-acc" data-newbudget="1">Set budget</button>' +
      '</div>' + body + '</div>';
  }

  function savingsHTML(goals) {
    var esc = A.ui.esc, fmt = A.ui.fmtMoney;
    var body;
    if (!goals.length) {
      body = '<div class="empty"><div class="e-emoji">🏦</div>' +
        '<p>Give every dollar a mission — create a savings goal and watch the bar fill up.</p>' +
        '<button class="btn btn-acc acc-yellow" data-newgoal="1">New savings goal</button></div>';
    } else {
      body = '<div class="list">' + goals.map(function (g) {
        var acc = safeAccent(g.accent);
        var target = Math.max(0.01, g.target || 0.01);
        var pct = Math.min(100, Math.round(100 * (g.saved || 0) / target));
        var done = (g.saved || 0) >= (g.target || 0);
        return '<div class="list-item acc-' + acc + '">' +
          '<div class="li-main">' +
            '<div class="spread wrap">' +
              '<div class="row" style="min-width:0">' +
                '<span class="avatar">' + esc(g.emoji || '🏦') + '</span>' +
                '<div style="min-width:0">' +
                  '<div class="li-title">' + esc(g.title) + (done ? ' <span class="tag">🎉 reached</span>' : '') + '</div>' +
                  '<div class="li-sub num">' + esc(fmt(g.saved || 0)) + ' saved of ' + esc(fmt(g.target || 0)) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="row">' +
                '<button class="btn btn-sm btn-acc" data-addmoney="' + esc(g.id) + '">+ Add money</button>' +
                '<button class="icon-btn danger" data-delgoal="' + esc(g.id) + '" title="Delete savings goal" aria-label="Delete savings goal">' +
                  A.ui.icon('trash', 'sm') + '</button>' +
              '</div>' +
            '</div>' +
            '<div class="bar" style="margin-top:9px"><span class="bar-fill" style="width:' + pct + '%"></span></div>' +
          '</div>' +
          '</div>';
      }).join('') + '</div>';
    }
    return '<div class="card acc-yellow">' +
      '<div class="spread" style="margin-bottom:6px">' +
        '<div class="card-title" style="margin-bottom:0">' + A.ui.icon('flag') + 'Savings goals</div>' +
        '<button class="btn btn-sm btn-acc" data-newgoal="1">New savings goal</button>' +
      '</div>' + body + '</div>';
  }

  /* ---------------- screen ---------------- */

  function renderFinance(el, ctx) {
    var s = A.S.get();
    var f = fin(s);
    var sum = A.engine.financeSummary(selMonth);

    var monthTx = (f.transactions || [])
      .filter(function (t) { return t.date && t.date.slice(0, 7) === selMonth; })
      .slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });

    el.innerHTML =
      headHTML() +
      summaryHTML(sum) +
      insightHTML(sum) +
      txTableHTML(monthTx) +
      '<div class="grid2 section-gap">' + budgetsHTML(sum, f.budgets || {}) + savingsHTML(f.savingsGoals || []) + '</div>';

    /* ---- listeners ---- */

    el.querySelector('[data-mprev]').addEventListener('click', function () {
      selMonth = ymAdd(selMonth, -1);
      renderFinance(el, ctx);
    });

    el.querySelector('[data-mnext]').addEventListener('click', function () {
      if (selMonth >= maxMonth()) return; // disabled at the last month that has anything to show
      selMonth = ymAdd(selMonth, 1);
      renderFinance(el, ctx);
    });

    el.querySelectorAll('[data-newtx]').forEach(function (b) {
      b.addEventListener('click', function () { openTxModal(); });
    });

    el.querySelectorAll('[data-catfilter]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        catFilter = sel.value;
        renderFinance(el, ctx);
      });
    });

    el.querySelectorAll('[data-clearfilter]').forEach(function (b) {
      b.addEventListener('click', function () {
        catFilter = 'all';
        renderFinance(el, ctx);
      });
    });

    el.querySelectorAll('[data-txmore]').forEach(function (b) {
      b.addEventListener('click', function () {
        showAllTx = !showAllTx;
        renderFinance(el, ctx);
      });
    });

    el.querySelectorAll('[data-delt]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delt');
        var t = findTx(A.S.get(), id);
        if (!t) return;
        A.ui.confirm(
          'Delete this ' + t.type + ' (' + (t.note || t.category) + ', ' + A.ui.fmtMoney(t.amount) + ')? This can’t be undone.',
          function () {
            A.S.update(function (st) {
              var ff = ensureFin(st);
              ff.transactions = ff.transactions.filter(function (x) { return x.id !== id; });
            });
            A.ui.toast('Transaction deleted', '🗑️');
          },
          { title: 'Delete transaction', yesLabel: 'Delete' }
        );
      });
    });

    el.querySelectorAll('[data-newbudget]').forEach(function (b) {
      b.addEventListener('click', function () { openBudgetModal(); });
    });

    el.querySelectorAll('[data-delbudget]').forEach(function (b) {
      b.addEventListener('click', function () {
        var cat = b.getAttribute('data-delbudget');
        A.ui.confirm(
          'Remove the ' + cat + ' budget? Spending in ' + cat + ' will no longer be capped or flagged.',
          function () {
            A.S.update(function (st) {
              delete ensureFin(st).budgets[cat];
            });
            A.ui.toast(cat + ' budget removed', '🗑️');
          },
          { title: 'Remove budget', yesLabel: 'Remove' }
        );
      });
    });

    el.querySelectorAll('[data-newgoal]').forEach(function (b) {
      b.addEventListener('click', function () { openGoalModal(); });
    });

    el.querySelectorAll('[data-addmoney]').forEach(function (b) {
      b.addEventListener('click', function () { openAddMoneyModal(b.getAttribute('data-addmoney')); });
    });

    el.querySelectorAll('[data-delgoal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-delgoal');
        var g = findGoal(A.S.get(), id);
        if (!g) return;
        A.ui.confirm(
          'Delete "' + g.title + '"? The ' + A.ui.fmtMoney(g.saved || 0) + ' you tracked stays in your pocket, but the goal and its progress are gone.',
          function () {
            A.S.update(function (st) {
              var ff = ensureFin(st);
              ff.savingsGoals = ff.savingsGoals.filter(function (x) { return x.id !== id; });
            });
            A.ui.toast('Savings goal deleted', '🗑️');
          },
          { title: 'Delete savings goal', yesLabel: 'Delete' }
        );
      });
    });
  }

  A.registerScreen('app/finance', {
    title: 'Finance',
    icon: 'wallet',
    accent: 'yellow',
    inShell: true,
    order: 6,
    render: renderFinance
  });
})();
