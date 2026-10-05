/* Hessa - printing: the thermal receipt (80 mm) after a payment; the print page itself is built in its own task. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;

  function qr(text) {
    try { var q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (e) { return ''; }
  }
  function setting(id) { var v = ((HS.data.state && HS.data.state.settings) || {})[id]; return v ? String(v) : ''; }
  function plain(html) { return String(html).replace(/<[^>]+>/g, ''); }

  function receipt(p) {
    var st = HS.data.get('students', p.studentId) || {}, row = function (k, v) { return '<tr><th>' + HS.esc(HS.t(k)) + '</th><td>' + v + '</td></tr>'; };
    return '<div class="ps-receipt"><div class="r-head"><b>' + HS.esc(setting('systemName') || HS.t('app.name')) + '</b><span>' + HS.esc(HS.t('receipt.title')) + '</span></div>' +
      '<div class="r-no" dir="ltr">' + HS.esc(p.no) + '</div><table>' +
      row('f.date', HS.esc(plain(U.day(p.date))) + ' ' + U.bdi(p.at || '')) +
      (st.name ? row('f.name', HS.esc(st.name) + ' <bdi dir="ltr">' + HS.esc(st.code || '') + '</bdi>') : '') +
      (p.groupId ? row('f.group', HS.esc(HS.data.groupName(p.groupId))) : '') +
      (p.period ? row('pay.period', U.bdi(p.period)) : '') +
      row('pay.method', HS.esc(HS.t('pay.method.' + p.method)) + (p.ref ? ' <bdi dir="ltr">' + HS.esc(p.ref) + '</bdi>' : '')) +
      row('f.user', HS.esc(p.by || '')) + '</table>' +
      '<div class="r-total">' + plain(U.money(p.amount)) + '</div>' +
      '<div class="r-qr">' + qr(p.no) + '</div>' +
      (setting('receiptFooter') ? '<p class="r-foot">' + HS.esc(setting('receiptFooter')) + '</p>' : '') +
      '<p class="r-foot">' + HS.esc(HS.t('receipt.keep')) + '</p></div>';
  }
  /* ID cards: 10 per A4 sheet (85 x 54 mm), the QR holds only the code, which the front-desk scanner types */
  function cards(list) {
    var centre = setting('systemName') || HS.t('app.name');
    return '<div class="ps-cards">' + list.map(function (s) {
      return '<div class="id-card"><div class="c-top"><b>' + HS.esc(centre) + '</b><span>' + HS.esc(HS.t('card.title')) + '</span></div>' +
        '<div class="c-body"><div class="c-qr">' + qr(String(s.code || '')) + '</div><div class="c-txt"><b class="c-name">' + HS.esc(s.name) + '</b>' +
        '<span>' + U.grade(s.gradeCode, s.system, s.track) + '</span><span class="c-code" dir="ltr">' + HS.esc(s.code || '') + '</span></div></div></div>';
    }).join('') + '</div>';
  }
  /* the paper backup of a group: names with empty boxes for the next 8 sessions (power cuts happen) */
  HS.printGroupList = function (g) {
    var st = HS.data.list('enrollments').filter(function (e) { return e.groupId === g.id && (e.status || 'active') === 'active'; })
      .map(function (e) { return HS.data.get('students', e.studentId); }).filter(Boolean)
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), HS.lang); });
    var boxes = [1, 2, 3, 4, 5, 6, 7, 8];
    printSheet('<div class="ps-head"><div><div class="ps-org">' + HS.esc(setting('systemName') || HS.t('app.name')) + '</div><h1>' + HS.esc(g.name) + '</h1>' +
      '<div>' + HS.esc([HS.data.teacherName(g.teacherId), HS.data.subjectName(g.subjectId), HS.t('grade.' + g.gradeCode)].filter(Boolean).join(' · ')) + '</div></div></div>' +
      '<table class="ps-list"><thead><tr><th>#</th><th>' + HS.esc(HS.t('f.code')) + '</th><th>' + HS.esc(HS.t('f.name')) + '</th>' + boxes.map(function () { return '<th class="box"></th>'; }).join('') + '</tr></thead><tbody>' +
      st.map(function (s, i) { return '<tr><td>' + (i + 1) + '</td><td dir="ltr">' + HS.esc(s.code || '') + '</td><td>' + HS.esc(s.name) + '</td>' + boxes.map(function () { return '<td class="box"></td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table>');
  };
  /* the shift report after closing the drawer: expected, counted, the difference and its reason, totals by method */
  HS.printShift = function (s, r) {
    var row = function (k, v) { return '<tr><th>' + HS.esc(HS.t(k)) + '</th><td>' + v + '</td></tr>'; }, m = plain;
    var methods = Object.keys(s.byMethod || {}).map(function (k) { return row('pay.method.' + k, m(U.money(s.byMethod[k]))); }).join('');
    printSheet('<div class="ps-receipt"><div class="r-head"><b>' + HS.esc(setting('systemName') || HS.t('app.name')) + '</b><span>' + HS.esc(HS.t('shift.report')) + '</span></div>' +
      '<div class="r-no" dir="ltr">' + HS.esc(s.shift.no) + '</div><table>' +
      row('f.user', HS.esc(s.shift.user || '')) + row('shift.openedAt', HS.esc(m(U.dt(s.shift.openedAt)))) + row('shift.opening', m(U.money(s.shift.openingCash))) +
      row('shift.cashIn', m(U.money(s.cashIn))) + row('shift.cashOut', m(U.money(s.cashOut))) + methods +
      row('shift.receipts', String(s.receipts)) + row('shift.expected', '<b>' + m(U.money(r.expected)) + '</b>') + row('shift.counted', '<b>' + m(U.money(r.counted)) + '</b>') + '</table>' +
      '<div class="r-total">' + HS.esc(HS.t('shift.diff')) + ' ' + m(U.money(r.diff)) + '</div>' +
      '<p class="r-foot">' + HS.esc(HS.t('shift.sign')) + '</p></div>');
  };
  /* exam results sheet: ranked, with the full mark, for the notice board or the teacher */
  HS.printResults = function (ex, rows, rank) {
    var list = rows.slice().sort(function (a, b) { return (rank[a.id] || 1e9) - (rank[b.id] || 1e9) || String(a.name).localeCompare(String(b.name), HS.lang); });
    printSheet('<div class="ps-head"><div><div class="ps-org">' + HS.esc(setting('systemName') || HS.t('app.name')) + '</div><h1>' + HS.esc(ex.title) + '</h1>' +
      '<div>' + HS.esc([HS.t('exam.kind.' + ex.kind), plain(U.day(ex.date)), HS.data.teacherName(ex.teacherId), HS.t('ex.max') + ' ' + ex.maxScore].join(' · ')) + '</div></div></div>' +
      '<table class="ps-list"><thead><tr><th>' + HS.esc(HS.t('f.rank')) + '</th><th>' + HS.esc(HS.t('f.code')) + '</th><th>' + HS.esc(HS.t('f.name')) + '</th><th>' + HS.esc(HS.t('f.score')) + '</th><th>%</th></tr></thead><tbody>' +
      list.map(function (r) {
        var pct = !r.absent && r.score !== '' ? Math.round(Number(r.score) * 100 / (ex.maxScore || 1)) + '%' : '';
        return '<tr><td>' + (rank[r.id] || '') + '</td><td dir="ltr">' + HS.esc(r.code || '') + '</td><td>' + HS.esc(r.name) + '</td><td>' + (r.absent ? HS.esc(HS.t('att.absent')) : HS.esc(r.score)) + '</td><td>' + pct + '</td></tr>';
      }).join('') + '</tbody></table>');
  };
  HS.printCards = function (list) { if (list && list.length) printSheet(cards(list)); };
  HS.printReceipt = function (p) { printSheet(receipt(p)); };
  function printSheet(html) {
    var el = document.createElement('div');
    el.id = 'print-sheet';
    el.innerHTML = html;
    document.body.appendChild(el);
    document.body.classList.add('printing');
    var done = function () { document.body.classList.remove('printing'); el.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); }, 60);
  }

  HS.views.print = HS.withData({
    render: function () {
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('nav.print')) + '</h1><p>' +
        HS.esc(HS.t('page.print.d')) + '</p></div></div>' +
        '<section class="card">' + U.empty('doc', HS.t('page.pending.title'), HS.t('page.pending.body')) + '</section>';
    },
    mount: function () {}
  });
})();
