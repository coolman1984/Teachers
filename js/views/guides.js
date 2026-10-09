/* Hessa - step-by-step guides and the "situations" catalogue (owner's request 2026-10-06: anyone opening the program for
   the first time can work without anybody explaining it).

   A guide is a list of steps; each step has a kind (open a page, click, type, choose, check, warning...) and, when it
   points at something on the screen, the page it lives on and a CSS selector. "Guide me" docks a small card at the side
   of the screen that stays while the person works: it opens the right page, outlines the button to press, and moves on
   when they press Next. Nothing is ever clicked or typed for them - they learn by doing it once.

   Words live in the dictionaries: gd.<id>.t (title), gd.<id>.d (what you get), gd.<id>.<n> (step n), gd.<id>.ok (how you
   know it worked) and gd.<id>.x (the usual mistake). Inside a step, [[some.key]] shows that key's text in «quotes», so a
   step always names the button exactly as the screen does, in either language. Situations: sit.<id>.q / sit.<id>.a. */
(function () {
  'use strict';
  var HS = window.HS;

  // step kinds: icon + the small word in front of the step
  var KINDS = { go: 'route', click: 'pointer', type: 'pen', choose: 'sliders', check: 'eye', tip: 'info', warn: 'alert', done: 'flag' };
  var CATS = ['start', 'daily', 'money', 'students', 'groups', 'admin'];

  function S(k, page, sel) { return { k: k, page: page || null, sel: sel || null }; }
  var OV = '#overlay', DR = '.drawer:last-child';

  var GUIDES = [
    /* ---------- first day ---------- */
    { id: 'first', cat: 'start', icon: 'flag', steps: [
      S('tip', 'overview'), S('click', null, '[data-act="password"]'), S('type', null, '#pw-old'), S('type', null, '#pw-new'), S('click', null, '[data-pw-save]'), S('check') ] },
    { id: 'sample', cat: 'start', icon: 'spark', perm: ['data.import', 'users.manage'], steps: [
      S('go', 'settings?tab=data'), S('click', 'settings?tab=data', '[data-sample="load"]'), S('click', null, OV + ' [data-ok]'), S('check', 'students', '[data-f="q"]'),
      S('tip', 'door', '#door-q'), S('warn'), S('click', 'settings?tab=data', '[data-sample="delete"]'), S('check') ] },
    { id: 'centre', cat: 'start', icon: 'home', perm: 'settings.edit', steps: [
      S('go', 'settings?tab=centre'), S('type', 'settings?tab=centre', '[name="systemName"]'), S('type', 'settings?tab=centre', '[name="receiptFooter"]'),
      S('click', 'settings?tab=centre', 'button[type="submit"]'), S('go', 'settings?tab=rules'), S('check', 'settings?tab=rules') ] },
    { id: 'lists', cat: 'start', icon: 'layers', perm: ['teachers.manage', 'rooms.manage'], steps: [
      S('go', 'groups?tab=teachers'), S('click', 'groups?tab=teachers', '[data-list-new="teachers"]'), S('type', null, DR + ' [name="name"]'), S('choose', null, DR + ' [data-list-form]'),
      S('click', null, DR + ' [data-save]'), S('go', 'groups?tab=rooms'), S('click', 'groups?tab=rooms', '[data-list-new="rooms"]'), S('go', 'groups?tab=subjects'), S('check') ] },
    { id: 'group', cat: 'groups', icon: 'layers', perm: 'groups.manage', steps: [
      S('go', 'groups?tab=list'), S('click', 'groups?tab=list', '[data-new]'), S('choose', null, '#gf-teacherId'), S('choose', null, '#gf-gradeCode'), S('choose', null, '#gf-feeType'),
      S('type', null, '#gf-fee'), S('choose', null, '[data-slots]'), S('click', null, '[data-suggest]'), S('click', null, DR + ' [data-save]'), S('check', 'groups?tab=timetable') ] },
    { id: 'people', cat: 'admin', icon: 'user', perm: 'users.manage', steps: [
      S('go', 'settings?tab=access'), S('click', 'settings?tab=access', '[data-adduser]'), S('type', null, DR + ' [name="full_name"]'), S('choose', null, DR + ' [data-mode]'),
      S('type', null, DR + ' [name="username"]'), S('choose', null, DR + ' [name="role"]'), S('choose', null, DR + ' [data-scope]'), S('check', null, DR + ' .perm-group'),
      S('warn'), S('click', null, DR + ' [data-save]'), S('check') ] },
    { id: 'profiles', cat: 'admin', icon: 'shield', perm: 'users.manage', steps: [
      S('go', 'settings?tab=access'), S('click', 'settings?tab=access', '[data-profiles]'), S('click', null, OV + ' [data-newprofile]'), S('type', null, '#pf-name'),
      S('check', null, OV + ' .perm-group'), S('choose', null, '#pf-apply'), S('click', null, OV + ' [data-ok]'), S('check') ] },

    /* ---------- the daily front desk ---------- */
    { id: 'shift', cat: 'daily', icon: 'lock', perm: 'money.collect', steps: [
      S('go', 'door'), S('click', 'door', '[data-openshift]'), S('type', null, '#sh-o'), S('click', null, OV + ' [data-ok]'), S('check', 'door', '[data-shift]') ] },
    { id: 'checkin', cat: 'daily', icon: 'check', perm: 'door.use', steps: [
      S('go', 'door'), S('type', 'door', '#door-q'), S('choose', 'door', '[data-results]'), S('check', 'door', '[data-card]'), S('click', 'door', '[data-checkin]'),
      S('check', 'door', '[data-card]'), S('tip'), S('warn') ] },
    { id: 'roll', cat: 'daily', icon: 'users', perm: 'attendance.mark', steps: [
      S('go', 'door'), S('click', 'door', '[data-roster]'), S('click', null, DR + ' [data-all]'), S('choose', null, DR + ' [data-st]'), S('click', null, DR + ' [data-save]'),
      S('check'), S('tip') ] },
    { id: 'pay', cat: 'money', icon: 'sheet', perm: 'money.collect', steps: [
      S('tip', 'door', '[data-shift]'), S('type', 'door', '#door-q'), S('check', 'door', '[data-card]'), S('click', 'door', '[data-pay]'), S('type', null, '#pay-a'),
      S('choose', null, OV + ' [data-methods]'), S('type', null, '#pay-g'), S('check', null, OV + ' .dialog'), S('click', null, OV + ' [data-ok]'), S('check'), S('warn') ] },
    { id: 'family', cat: 'money', icon: 'users', perm: 'money.collect', steps: [
      S('type', 'door', '#door-q'), S('click', 'door', '[data-family]'), S('type', null, OV), S('check', null, OV), S('click', null, OV + ' [data-ok]'), S('click', null, '[data-printfam]') ] },
    { id: 'handout', cat: 'money', icon: 'doc', perm: 'money.collect', steps: [
      S('go', 'settings?tab=lists'), S('click', 'settings?tab=lists', '[data-list-new="materials"]'), S('type', 'door', '#door-q'), S('click', 'door', '[data-sell]'), S('choose', null, OV),
      S('click', null, OV + ' [data-ok]'), S('warn') ] },
    { id: 'expense', cat: 'money', icon: 'doc', perm: 'expenses.add', steps: [
      S('go', 'money'), S('click', 'money', '[data-expense]'), S('choose', null, '#ex-c'), S('type', null, '#ex-a'), S('type', null, '#ex-n'), S('click', null, OV + ' [data-ok]'), S('tip') ] },
    { id: 'close', cat: 'money', icon: 'lock', perm: ['shifts.close', 'shifts.manage'], steps: [
      S('go', 'money'), S('check', 'money', '[data-mpane]'), S('click', 'money', '[data-close-shift]'), S('type', null, OV + ' .notes-grid'), S('check', null, OV + ' [data-counted]'),
      S('type', null, '#cl-r'), S('click', null, OV + ' [data-ok]'), S('check'), S('warn') ] },
    { id: 'void', cat: 'money', icon: 'refresh', perm: 'money.void', steps: [
      S('go', 'money?tab=receipts'), S('check', 'money?tab=receipts', '[data-led]'), S('click', 'money?tab=receipts', '[data-void]'), S('type', null, OV), S('click', null, OV + ' [data-ok]'),
      S('check'), S('warn') ] },
    { id: 'dayoff', cat: 'daily', icon: 'x', perm: 'attendance.mark', steps: [
      S('go', 'door'), S('click', 'door', '[data-dayoff]'), S('choose', null, '#off-d'), S('choose', null, '#off-r'), S('click', null, OV + ' [data-ok]'), S('check'), S('tip') ] },

    /* ---------- students ---------- */
    { id: 'student', cat: 'students', icon: 'users', perm: 'students.manage', steps: [
      S('go', 'students'), S('click', 'students', '[data-new]'), S('type', null, DR + ' [name="name"]'), S('choose', null, DR + ' [name="gradeCode"]'),
      S('type', null, DR + ' [name="parentMobile"]'), S('check', null, DR + ' [name="consent"]'), S('click', null, DR + ' [data-save]'), S('check'), S('warn') ] },
    { id: 'enrol', cat: 'students', icon: 'plus', perm: 'students.manage', steps: [
      S('go', 'students'), S('type', 'students', '[data-f="q"]'), S('click', 'students', 'tr[data-id]'), S('click', null, DR + ' [data-enrol]'), S('choose', null, OV + ' [data-bill]'),
      S('type', null, OV + ' [data-gq]'), S('click', null, OV + ' [data-g]'), S('check'), S('tip') ] },
    { id: 'import', cat: 'students', icon: 'upload', perm: ['students.manage', 'excel.import'], steps: [
      S('tip'), S('go', 'students/import'), S('choose', 'students/import', '[name="file"]'), S('click', 'students/import', '[data-import-form] [type="submit"]'), S('check'),
      S('choose'), S('click', null, '[data-import-save]'), S('check') ] },
    { id: 'move', cat: 'students', icon: 'route', perm: 'students.transfer', steps: [
      S('go', 'students'), S('type', 'students', '[data-f="q"]'), S('click', 'students', 'tr[data-id]'), S('click', null, DR + ' [data-tab="groups"]'), S('click', null, DR + ' [data-transfer]'),
      S('click', null, OV + ' [data-g]'), S('check'), S('tip') ] },
    { id: 'discount', cat: 'students', icon: 'star', perm: 'students.discount', steps: [
      S('go', 'students'), S('click', 'students', 'tr[data-id]'), S('click', null, DR + ' [data-edit]'), S('type', null, DR + ' [name="discountPct"]'), S('type', null, DR + ' [name="discountReason"]'),
      S('click', null, DR + ' [data-save]'), S('warn') ] },
    { id: 'cards', cat: 'students', icon: 'printer', perm: 'print', steps: [
      S('go', 'students'), S('choose', 'students', '[data-f="group"]'), S('click', 'students', '[data-cards]'), S('check'), S('tip') ] },
    { id: 'debts', cat: 'students', icon: 'bell', perm: ['money.view', 'money.collect'], steps: [
      S('go', 'students'), S('click', 'students', '[data-only="debt"]'), S('check', 'students', '[data-sum]'), S('click', 'students', 'tr[data-id]'), S('click', null, DR + ' [data-wa]'), S('check'), S('tip') ] },

    /* ---------- groups ---------- */
    { id: 'price', cat: 'groups', icon: 'chart', perm: 'groups.manage', steps: [
      S('go', 'groups?tab=list'), S('click', 'groups?tab=list', 'tr[data-id]'), S('click', null, '[data-edit]'), S('type', null, '#gf-fee'), S('choose', null, '#gf-feeFrom'), S('click', null, DR + ' [data-save]'), S('check') ] },
    { id: 'ramadan', cat: 'groups', icon: 'clock', perm: 'groups.manage', steps: [
      S('go', 'groups?tab=list'), S('click', 'groups?tab=list', 'tr[data-id]'), S('click', null, '[data-edit]'), S('choose', null, '#gf-tempFrom'), S('click', null, '[data-addtslot]'), S('click', null, DR + ' [data-save]'), S('check') ] },

    /* ---------- exams, follow-up and teachers' money (owner 2026-10-09: every page has a guide) ---------- */
    { id: 'exam', cat: 'students', icon: 'star', perm: 'exams.manage', steps: [
      S('go', 'exams'), S('click', 'exams', '[data-new]'), S('type', null, '#xf-t'), S('choose', null, '#xf-k'), S('type', null, '#xf-m'),
      S('click', null, '[data-save]'), S('type', null, '[data-mark]'), S('click', null, '[data-save]'), S('check') ] },
    { id: 'followup', cat: 'students', icon: 'bell', perm: 'followup.log', steps: [
      S('go', 'followup?tab=calls'), S('choose', 'followup?tab=calls', '[data-level]'), S('click', 'followup?tab=calls', '[data-call]'),
      S('choose', null, OV + ' [data-out]'), S('click', null, OV + ' [data-ok]'), S('go', 'followup?tab=debts'), S('click', 'followup?tab=debts', '[data-remind-all]'), S('check') ] },
    { id: 'settle', cat: 'money', icon: 'chart', perm: 'settlements.manage', steps: [
      S('go', 'settlements'), S('choose', 'settlements', '[data-month="-1"]'), S('check', 'settlements', '[data-cards]'), S('click', 'settlements', '[data-approve]'),
      S('click', 'settlements', '[data-payout]'), S('check'), S('warn') ] },
    { id: 'devices', cat: 'admin', icon: 'sync', perm: 'users.manage', steps: [
      S('go', 'devices'), S('click', 'devices', '[data-add]'), S('check', null, OV + ' [data-add-body]'), S('tip'), S('check', 'devices') ] },

    /* ---------- reports, safety, administration ---------- */
    { id: 'watch', cat: 'admin', icon: 'shield', perm: 'users.manage', steps: [
      S('go', 'watch'), S('check', 'watch', '.wa-kpis'), S('click', 'watch', '[data-level="critical"]'), S('check', 'watch', '.wa-more'), S('click', 'watch', '.wa-acts .btn'),
      S('click', 'watch', '[data-review]'), S('check', 'watch', '.wa-people'), S('go', 'activity'), S('tip') ] },
    { id: 'report', cat: 'admin', icon: 'chart', perm: 'reports.view', steps: [
      S('go', 'reports'), S('check', 'reports', '[data-rep]'), S('click', 'reports', '[data-xlsx]'), S('click', 'reports', '[data-printrep]'), S('tip') ] },
    { id: 'backup', cat: 'admin', icon: 'shield', perm: 'backups.manage', steps: [
      S('go', 'settings?tab=data'), S('click', 'settings?tab=data', '[data-backup]'), S('type', 'settings?tab=data', '#bk2-path'), S('click', 'settings?tab=data', '[data-folder-form] button[type="submit"], [data-folder-form] .btn.primary'),
      S('click', 'settings?tab=data', '[data-check]'), S('check'), S('warn') ] },
    { id: 'restore', cat: 'admin', icon: 'refresh', perm: 'trash.restore', steps: [
      S('go', 'settings?tab=data'), S('check', 'settings?tab=data', '[data-restore]'), S('click', 'settings?tab=data', '[data-restore]'), S('tip'), S('warn', 'settings?tab=data', '[data-brestore]') ] },
    { id: 'window', cat: 'admin', icon: 'monitor', steps: [
      S('click', null, '[data-act="full"]'), S('go', 'settings'), S('choose', 'settings', '[data-window]'), S('choose', 'settings', '[data-pref="lang"]'), S('choose', 'settings', '[data-pref="size"]') ] }
  ];

  // situations: what really happens in an Egyptian centre, and exactly what to do (sit.<id>.q / .a); page = where to act
  var SITUATIONS = [
    ['forgotCard', 'door', 'daily'], ['sameName', 'door', 'daily'], ['wrongGroup', 'door', 'daily'], ['lateArrival', 'door', 'daily'],
    ['makeup', 'door', 'daily'], ['trial', 'door', 'daily'], ['powerCut', 'door', 'daily'], ['teacherAbsent', 'door', 'daily'],
    ['internet', 'overview', 'daily'], ['pcOff', 'overview', 'daily'],
    ['halfPay', 'door', 'money'], ['claimsPaid', 'students', 'money'], ['wallet', 'door', 'money'], ['noChange', 'door', 'money'],
    ['torn', 'money', 'money'], ['drawerShort', 'money', 'money'], ['forgotClose', 'money', 'money'], ['wrongAmount', 'money', 'money'],
    ['refund', 'money', 'money'], ['advance', 'door', 'money'], ['teacherCash', 'money', 'money'], ['priceRise', 'groups', 'money'],
    ['siblings', 'door', 'money'], ['orphan', 'students', 'money'], ['lateMonth', 'students', 'money'],
    ['phoneChanged', 'students', 'students'], ['duplicate', 'students', 'students'], ['leaves', 'students', 'students'], ['comesBack', 'students', 'students'],
    ['parentAsks', 'students', 'students'], ['noPhone', 'students', 'students'], ['excelMess', 'students/import', 'students'],
    ['ramadan', 'groups', 'groups'], ['exams', 'door', 'groups'], ['roomClash', 'groups', 'groups'], ['groupFull', 'groups', 'groups'], ['moveGroup', 'students', 'groups'],
    ['subscription', 'settings?tab=license', 'admin'], ['theft', 'watch', 'admin'], ['cashNoReceipt', 'watch', 'admin'], ['staffAccount', 'settings?tab=access', 'admin'],
    ['deletedWrong', 'settings?tab=data', 'admin'], ['staffLeaves', 'settings?tab=access', 'admin'], ['forgotPassword', 'settings?tab=access', 'admin'],
    ['pcBroke', 'settings?tab=data', 'admin'], ['virus', 'settings?tab=data', 'admin'], ['newPc', 'settings?tab=data', 'admin'], ['trialPassword', 'overview', 'admin']
  ];

  // owner 2026-10-08: every problem also offers "Guide me" through the guide that fixes it (situation id -> guide id)
  var SIT_GUIDE = { internet: 'devices', pcOff: 'devices', newPc: 'devices', parentAsks: 'debts', forgotCard: 'checkin', sameName: 'checkin', wrongGroup: 'checkin', lateArrival: 'roll', makeup: 'checkin', trial: 'enrol',
    powerCut: 'dayoff', teacherAbsent: 'dayoff', halfPay: 'pay', claimsPaid: 'void', wallet: 'pay', noChange: 'pay', torn: 'close',
    drawerShort: 'close', forgotClose: 'close', wrongAmount: 'void', refund: 'void', advance: 'pay', teacherCash: 'expense', priceRise: 'price',
    siblings: 'family', orphan: 'discount', lateMonth: 'enrol', phoneChanged: 'student', duplicate: 'restore', leaves: 'move', comesBack: 'enrol',
    noPhone: 'student', excelMess: 'import', ramadan: 'ramadan', exams: 'dayoff', roomClash: 'group', groupFull: 'group', moveGroup: 'move',
    theft: 'watch', cashNoReceipt: 'watch', staffAccount: 'people', deletedWrong: 'restore', staffLeaves: 'people', forgotPassword: 'people',
    pcBroke: 'backup', virus: 'backup', trialPassword: 'first' };
  /* ---------- the learning path (المنهج): ordered lessons per role, and where the person stands ----------
     Owner 2026-10-09: a new person learns alone, in order. A lesson is a guide; its fact (server/center.py GUIDE_FACTS) says
     whether it already happened in the real records; a lesson without a fact is done when its guide was finished. */
  function L(guide, fact) { return { guide: guide, fact: fact || null }; }
  var PATHS = [
    { id: 'admin', admin: true, icon: 'shield', roles: ['administrator'], lessons: [
      L('first', 'passwordChanged'), L('centre', 'centreNamed'), L('lists', 'teachersAdded'), L('group', 'groupsAdded'), L('people', 'staffAdded'),
      L('profiles'), L('student', 'studentsAdded'), L('enrol', 'enrolled'), L('shift', 'myShiftOpened'), L('backup', 'backupFolder'), L('devices'), L('watch'),
      L('report')] },
    { id: 'manager', icon: 'home', roles: ['full-access'], lessons: [
      L('first', 'passwordChanged'), L('centre', 'centreNamed'), L('lists', 'teachersAdded'), L('group', 'groupsAdded'), L('student', 'studentsAdded'),
      L('enrol', 'enrolled'), L('shift', 'myShiftOpened'), L('price'), L('settle', 'settlementApproved'), L('backup', 'backupFolder'), L('report')] },
    { id: 'desk', icon: 'board', roles: ['secretary'], lessons: [
      L('first', 'passwordChanged'), L('shift', 'myShiftOpened'), L('checkin', 'myCheckin'), L('pay', 'myPayment'), L('student', 'myStudentAdded'),
      L('enrol', 'myEnrolment'), L('family'), L('expense', 'myExpense'), L('close', 'myShiftClosed')] },
    { id: 'teacher', icon: 'cap', roles: ['teacher'], lessons: [
      L('first', 'passwordChanged'), L('roll', 'myCheckin'), L('student', 'myStudentAdded'), L('enrol', 'myEnrolment'), L('exam', 'examMade'),
      L('followup', 'myFollowup'), L('cards'), L('report')] },
    { id: 'assistant', icon: 'users', roles: ['assistant'], lessons: [
      L('first', 'passwordChanged'), L('checkin', 'myCheckin'), L('roll', 'myCheckin'), L('followup', 'myFollowup'), L('cards')] },
    { id: 'accountant', icon: 'sheet', roles: ['accountant'], lessons: [
      L('first', 'passwordChanged'), L('expense', 'myExpense'), L('void'), L('close', 'myShiftClosed'), L('settle', 'settlementApproved'), L('report'), L('debts')] },
    { id: 'viewer', icon: 'eye', roles: ['viewer'], lessons: [L('first', 'passwordChanged'), L('window'), L('report'), L('cards')] }
  ];
  // ready-made profiles keep their English name on the person (auth.BUILTIN_PROFILES)
  var ROLE_PATH = { 'Administrator': 'admin', 'Centre manager': 'manager', 'Front desk': 'desk', 'Teacher': 'teacher', 'Assistant': 'assistant',
    'Accountant': 'accountant', 'Viewer': 'viewer' };
  var facts = null, factsAt = 0;
  function loadFacts(force) {
    if (!force && facts && Date.now() - factsAt < 15000) return Promise.resolve(facts);
    return HS.get('/api/c/guide-facts').then(function (f) { facts = f || {}; factsAt = Date.now(); return facts; }, function () { return facts || {}; });
  }
  function defaultPath() {
    var me = HS.me || {}, id = ROLE_PATH[me.role];
    if (!id) id = HS.can('users.manage') ? 'admin' : HS.can('settings.edit') ? 'manager' : HS.can('money.collect') ? 'desk' : HS.can('marks.enter') ? 'teacher' : HS.can('door.use') ? 'assistant'
      : HS.can('expenses.add') ? 'accountant' : 'viewer';
    return id;
  }
  function pathOf(id) { return PATHS.filter(function (p) { return p.id === id; })[0] || PATHS.filter(function (p) { return p.id === defaultPath(); })[0]; }
  function myPath() { return pathOf((HS.prefs.data || {}).path || defaultPath()); }
  function guideOf(id) { return GUIDES.filter(function (g) { return g.id === id; })[0]; }
  // the lessons this person may do (a guide they have no right for is left out), each with done / here
  function lessons(p, f) {
    var doneGuides = (HS.prefs.data && HS.prefs.data.guidesDone) || {}, out = [], here = -1;
    p.lessons.forEach(function (x) {
      var g = guideOf(x.guide); if (!g || !allowed(g)) return;
      var done = x.fact ? !!(f || {})[x.fact] : !!doneGuides[x.guide];
      if (!done && here < 0) here = out.length;
      out.push({ g: g, fact: x.fact, done: done });
    });
    if (here >= 0) out[here].here = true;
    return out;
  }
  function pathHTML(p, f) {
    var ls = lessons(p, f), n = ls.filter(function (x) { return x.done; }).length, cur = ls.filter(function (x) { return x.here; })[0];
    return '<section class="card path" data-path="' + p.id + '"><header><span class="tile-ic">' + HS.icon(p.icon) + '</span><div class="grow"><small class="faint">' + HS.esc(HS.t('path.title')) + '</small>' +
        '<h2>' + HS.esc(HS.t('path.' + p.id + '.t')) + '</h2><p class="muted">' + HS.esc(HS.t('path.' + p.id + '.d')) + '</p></div>' +
        '<span class="badge ' + (cur ? 'signal' : 'ok') + ' num">' + HS.esc(HS.t('path.progress', { n: n, m: ls.length })) + '</span></header>' +
      '<div class="meter big" aria-hidden="true"><i style="width:' + (ls.length ? Math.round(n * 100 / ls.length) : 100) + '%"></i></div>' +
      (cur ? '' : '<div class="tip ok">' + HS.icon('flag') + '<span>' + HS.esc(HS.t('path.complete')) + '</span></div>') +
      '<ol class="path-list">' + ls.map(function (x, k) {
        return '<li class="' + (x.done ? 'ok' : x.here ? 'here' : '') + '"' + (x.here ? ' aria-current="step"' : '') + '><span class="tick">' + (x.done ? HS.icon('check', 'sm') : '<b class="num">' + (k + 1) + '</b>') + '</span>' +
          '<div class="grow"><b>' + HS.esc(HS.t('gd.' + x.g.id + '.t')) + '</b>' + (x.here ? ' <span class="badge signal">' + HS.esc(HS.t('path.here')) + '</span>' : '') +
          '<small class="muted">' + HS.esc(HS.t('gd.' + x.g.id + '.d')) + '</small></div>' +
          '<button class="btn sm' + (x.here ? ' primary' : '') + '" data-guide="' + x.g.id + '">' + HS.icon('compass', 'sm') + HS.esc(HS.t(x.done ? 'path.again' : 'path.start')) + '</button></li>';
      }).join('') + '</ol>' +
      '<footer class="row wrap"><label class="field-inline"><span class="faint">' + HS.esc(HS.t('path.choose')) + '</span><select class="input" data-pathpick>' +
        PATHS.map(function (q) { return '<option value="' + q.id + '"' + (q.id === p.id ? ' selected' : '') + '>' + HS.esc(HS.t('path.' + q.id + '.t')) + '</option>'; }).join('') +
      '</select></label></footer></section>';
  }
  // the first page: one card with the next lesson, until the path is complete (it can be hidden)
  function nextCardHTML(p, f) {
    var ls = lessons(p, f), cur = ls.filter(function (x) { return x.here; })[0];
    if (!cur || (HS.prefs.data && HS.prefs.data.pathHidden)) return '';
    var n = ls.filter(function (x) { return x.done; }).length, k = ls.indexOf(cur) + 1;
    return '<div class="row wrap path-next"><span class="tile-ic">' + HS.icon('compass') + '</span><div class="grow"><b>' + HS.esc(HS.t('path.continue')) + '</b>' +
      '<small class="muted">' + HS.esc(HS.t('path.next', { n: k, m: ls.length, lesson: HS.t('gd.' + cur.g.id + '.t') })) + '</small>' +
      '<div class="meter" aria-hidden="true"><i style="width:' + Math.round(n * 100 / ls.length) + '%"></i></div></div>' +
      '<button class="btn primary sm" data-guide="' + cur.g.id + '">' + HS.icon('compass', 'sm') + HS.esc(HS.t('path.start')) + '</button>' +
      '<a class="btn sm" href="#/help?view=path">' + HS.esc(HS.t('path.all')) + '</a><button class="btn ghost sm" data-pathhide>' + HS.esc(HS.t('path.hide')) + '</button></div>';
  }
  document.addEventListener('change', function (e) {
    var pick = e.target.closest && e.target.closest('[data-pathpick]'); if (!pick) return;
    HS.prefs.data.path = pick.value; HS.prefs.save(); if (HS.rerender) HS.rerender();
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-pathhide]')) return;
    HS.prefs.data.pathHidden = true; HS.prefs.save(); var c = e.target.closest('[data-pathcard]'); if (c) c.innerHTML = '';
  });

  function allowed(g) { return !g.perm || HS.can(g.perm); }
  function guideFor(sid) { var id = SIT_GUIDE[sid]; return GUIDES.filter(function (g) { return g.id === id && allowed(g); })[0]; }
  function label(key) { return HS.has(key) ? HS.t(key) : key; }
  // a step's text: escaped, with [[dictionary.key]] shown as «that label» in bold
  function rich(text) {
    return HS.esc(text).replace(/\[\[([a-zA-Z0-9_.-]+)\]\]/g, function (_, k) { return '<b class="ui-name">«' + HS.esc(label(k)) + '»</b>'; });
  }
  function stepText(g, n) { return HS.t('gd.' + g.id + '.' + n); }
  function pageOf(page) { return String(page || '').split('?')[0].split('/')[0]; }

  /* ---------- the coach: a docked card that walks through a guide ---------- */
  var C = { g: null, i: 0, hot: null, timer: null };
  function host() {
    var h = document.getElementById('coach');
    if (!h) { h = document.createElement('aside'); h.id = 'coach'; h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); }
    return h;
  }
  function unhot() {
    clearInterval(C.timer); C.timer = null;
    if (C.hot) { C.hot.classList.remove('coach-hot'); C.hot = null; }
  }
  function findTarget(sel) {
    if (!sel) return null;
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) { var r = list[i].getBoundingClientRect(); if (r.width || r.height) return list[i]; }
    return null;
  }
  // outline the thing to press; pages draw some parts a moment later, so keep looking for a few seconds
  function point(s) {
    unhot();
    if (!s.sel) return;
    var tries = 0;
    function look() {
      var el = findTarget(s.sel);
      if (el) {
        clearInterval(C.timer); C.timer = null;
        C.hot = el; el.classList.add('coach-hot');
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var miss = document.querySelector('#coach [data-miss]'); if (miss) miss.hidden = true;
        return true;
      }
      if (++tries > 16) { clearInterval(C.timer); C.timer = null; var m = document.querySelector('#coach [data-miss]'); if (m) m.hidden = false; }
      return false;
    }
    if (!look()) C.timer = setInterval(look, 250);
  }
  function here(page) {
    if (!page) return true;
    var r = HS.route ? HS.route() : { path: '' }, want = page.split('?'), q = want[1] ? want[1].split('=') : null;
    var path = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    if (want[0].indexOf('/') > 0) return path === want[0];
    return r.path === pageOf(page) && (!q || (r.q && r.q[q[0]] === q[1]));
  }
  function draw() {
    var g = C.g; if (!g) return;
    var s = g.steps[C.i], n = g.steps.length, h = host(), away = s.page && !here(s.page);
    h.className = 'on';
    h.innerHTML = '<div class="coach-card" role="dialog" aria-label="' + HS.esc(HS.t('gd.' + g.id + '.t')) + '">' +
      '<header><span class="tile-ic">' + HS.icon(g.icon) + '</span><div class="grow"><small class="faint">' + HS.esc(HS.t('guide.coach')) + '</small><b>' + HS.esc(HS.t('gd.' + g.id + '.t')) + '</b></div>' +
        '<button class="icon-btn" data-cx aria-label="' + HS.esc(HS.t('common.close')) + '">' + HS.icon('x', 'sm') + '</button></header>' +
      '<div class="coach-bar" aria-hidden="true"><i style="width:' + Math.round((C.i + 1) / n * 100) + '%"></i></div>' +
      '<p class="coach-n faint">' + HS.esc(HS.t('guide.stepOf', { n: C.i + 1, m: n })) + ' · ' + HS.esc(HS.t('guide.k.' + s.k)) + '</p>' +
      '<div class="coach-step k-' + s.k + '"><span class="step-ic">' + HS.icon(KINDS[s.k]) + '</span><p>' + rich(stepText(g, C.i + 1)) + '</p></div>' +
      (away ? '<button class="btn sm" data-cgo>' + HS.icon('route', 'sm') + HS.esc(HS.t('guide.take', { page: HS.t('nav.' + pageOf(s.page)) })) + '</button>' : '') +
      '<p class="faint coach-miss" data-miss hidden>' + HS.esc(HS.t('guide.miss')) + '</p>' +
      (C.i === n - 1 ? '<div class="tip ok">' + HS.icon('check') + '<span>' + rich(HS.t('gd.' + g.id + '.ok')) + '</span></div>' : '') +
      '<footer><button class="btn ghost sm" data-cprev' + (C.i ? '' : ' disabled') + '>' + HS.icon('left', 'sm mirror') + HS.esc(HS.t('common.back')) + '</button><span class="grow"></span>' +
        '<button class="btn primary sm" data-cnext>' + HS.esc(C.i === n - 1 ? HS.t('common.done') : HS.t('common.next')) + (C.i === n - 1 ? '' : HS.icon('right', 'sm mirror')) + '</button></footer></div>';
    if (!away) point(s); else unhot();
  }
  var coach = HS.coach = {
    start: function (id) {
      var g = GUIDES.filter(function (x) { return x.id === id; })[0]; if (!g) return;
      C.g = g; C.i = 0;
      if (HS.overlay && HS.overlay.isOpen) HS.overlay.close();
      var first = g.steps[0];
      if (first.page && !here(first.page)) HS.go(first.page);
      setTimeout(draw, 60);
    },
    next: function () { if (!C.g) return; if (C.i >= C.g.steps.length - 1) { coach.stop(true); return; } C.i++; draw(); },
    prev: function () { if (C.g && C.i > 0) { C.i--; draw(); } },
    stop: function (finished) {
      var g = C.g; if (!g) return;
      unhot(); C.g = null;
      var h = document.getElementById('coach'); if (h) { h.className = ''; h.innerHTML = ''; }
      if (finished && g) { factsAt = 0; var done = HS.prefs.data.guidesDone || {}; done[g.id] = 1; HS.prefs.data.guidesDone = done; HS.prefs.save(); HS.toast(HS.t('guide.finished'), 'ok'); }
    },
    active: function () { return !!C.g; }
  };
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (e.target.closest('#coach [data-cx]')) { coach.stop(); return; }
    if (e.target.closest('#coach [data-cnext]')) { coach.next(); return; }
    if (e.target.closest('#coach [data-cprev]')) { coach.prev(); return; }
    if (e.target.closest('#coach [data-cgo]')) { var s = C.g.steps[C.i]; HS.go(s.page); return; }
    var start = e.target.closest('[data-guide]'); if (start) { e.preventDefault(); coach.start(start.dataset.guide); }
  });
  // the page changed (the person clicked, or the coach took them): redraw the card and look for the target again
  if (HS.on) {
    HS.on('route', function () { if (C.g) setTimeout(draw, 80); });
    HS.on('lang-changed', function () { if (C.g) setTimeout(draw, 80); });
    HS.on('logged-out', function () { coach.stop(); });
  }

  /* ---------- the guide library (Help page) ---------- */
  function guideCard(g) {
    var done = (HS.prefs.data.guidesDone || {})[g.id];
    var steps = g.steps.map(function (s, k) {
      return '<li class="k-' + s.k + '"><span class="step-ic" title="' + HS.esc(HS.t('guide.k.' + s.k)) + '">' + HS.icon(KINDS[s.k]) + '</span><span>' + rich(stepText(g, k + 1)) + '</span></li>'; }).join('');
    return '<details class="guide" id="guide-' + g.id + '" data-gid="' + g.id + '"><summary><span class="tile-ic">' + HS.icon(g.icon) + '</span><span class="grow"><b>' + HS.esc(HS.t('gd.' + g.id + '.t')) + '</b>' +
        '<small class="muted">' + HS.esc(HS.t('gd.' + g.id + '.d')) + '</small></span>' + (done ? '<span class="badge ok">' + HS.icon('check', 'sm') + HS.esc(HS.t('guide.done')) + '</span>' : '') +
        '<span class="badge desk-only">' + HS.esc(HS.t('guide.steps', { n: g.steps.length })) + '</span>' +
        '<button class="btn sm" data-guide="' + g.id + '" title="' + HS.esc(HS.t('guide.start')) + '">' + HS.icon('compass', 'sm') + '<span class="desk-only">' + HS.esc(HS.t('guide.start')) + '</span></button></summary>' +
      '<div class="guide-body"><ol class="guide-steps">' + steps + '</ol>' +
        '<div class="tip ok">' + HS.icon('check') + '<span><b>' + HS.esc(HS.t('guide.ok')) + '</b> ' + rich(HS.t('gd.' + g.id + '.ok')) + '</span></div>' +
        (HS.has('gd.' + g.id + '.x') ? '<div class="tip warn">' + HS.icon('alert') + '<span><b>' + HS.esc(HS.t('guide.x')) + '</b> ' + rich(HS.t('gd.' + g.id + '.x')) + '</span></div>' : '') +
        '<button class="btn primary" data-guide="' + g.id + '">' + HS.icon('compass', 'sm') + HS.esc(HS.t('guide.start')) + '</button></div></details>';
  }
  function situationHTML(x) {
    return '<details class="situation" data-scat="' + x[2] + '"><summary>' + HS.icon('life', 'sm') + '<span class="grow">' + HS.esc(HS.t('sit.' + x[0] + '.q')) + '</span></summary>' +
      '<div class="guide-body"><p>' + rich(HS.t('sit.' + x[0] + '.a')) + '</p><div class="row wrap"><a class="btn sm" href="#/' + x[1] + '">' + HS.esc(HS.t('help.open')) + HS.icon('right', 'sm mirror') + '</a>' +
      (guideFor(x[0]) ? '<button class="btn sm primary" data-guide="' + guideFor(x[0]).id + '">' + HS.icon('compass', 'sm') + HS.esc(HS.t('guide.start')) + '</button>' : '') + '</div></div></details>';
  }
  HS.guides = {
    list: GUIDES, situations: SITUATIONS, sitGuide: SIT_GUIDE, cats: CATS, kinds: KINDS, rich: rich, paths: PATHS, roles: ROLE_PATH,
    lessons: lessons, myPath: myPath, loadFacts: loadFacts,
    // the Help page's first view: my path, filled once the facts arrive
    pathShell: function () { return '<div data-pathfull><div class="skeleton" style="height:16rem"></div></div>'; },
    fillPath: function (root) {
      var box = root.querySelector('[data-pathfull]'); if (!box) return;
      loadFacts(true).then(function (f) { if (box.isConnected !== false) box.innerHTML = pathHTML(myPath(), f); });
    },
    // the overview card: next lesson of my path
    fillNext: function (root) {
      var box = root.querySelector('[data-pathcard]'); if (!box) return;
      loadFacts().then(function (f) { if (box.isConnected !== false) box.innerHTML = nextCardHTML(myPath(), f); });
    },
    pathHTML: pathHTML, nextCardHTML: nextCardHTML,
    // guides that act on this page first, then the rest; each category in its own block
    html: function (forPage) {
      var list = GUIDES.filter(allowed), mine = forPage ? list.filter(function (g) { return g.steps.some(function (s) { return pageOf(s.page) === forPage; }); }) : [];
      var done = HS.prefs.data.guidesDone || {}, count = list.filter(function (g) { return done[g.id]; }).length;
      return '<div class="guide-intro card"><div class="row wrap"><span class="tile-ic">' + HS.icon('compass') + '</span><div class="grow"><h2>' + HS.esc(HS.t('guide.title')) + '</h2><p class="muted">' + HS.esc(HS.t('guide.sub')) + '</p></div>' +
          '<span class="badge ' + (count === list.length ? 'ok' : '') + '">' + HS.esc(HS.t('guide.progress', { n: count, m: list.length })) + '</span></div>' +
          '<ul class="kind-legend">' + Object.keys(KINDS).map(function (k) { return '<li class="k-' + k + '"><span class="step-ic">' + HS.icon(KINDS[k]) + '</span>' + HS.esc(HS.t('guide.k.' + k)) + '</li>'; }).join('') + '</ul></div>' +
        (mine.length ? '<section class="guide-cat"><h3>' + HS.esc(HS.t('guide.here', { page: HS.t('nav.' + forPage) })) + '</h3>' + mine.map(guideCard).join('') + '</section>' : '') +
        CATS.map(function (c) {
          var gs = list.filter(function (g) { return g.cat === c && mine.indexOf(g) < 0; });
          return gs.length ? '<section class="guide-cat"><h3>' + HS.esc(HS.t('guide.cat.' + c)) + '</h3>' + gs.map(guideCard).join('') + '</section>' : '';
        }).join('');
    },
    situationsHTML: function () {
      return '<div class="guide-intro card"><div class="row wrap"><span class="tile-ic">' + HS.icon('life') + '</span><div class="grow"><h2>' + HS.esc(HS.t('sit.title')) + '</h2><p class="muted">' + HS.esc(HS.t('sit.sub')) + '</p></div></div></div>' +
        CATS.filter(function (c) { return c !== 'start'; }).map(function (c) {
          var xs = SITUATIONS.filter(function (x) { return x[2] === c; });
          return xs.length ? '<section class="guide-cat"><h3>' + HS.esc(HS.t('guide.cat.' + c)) + '</h3>' + xs.map(situationHTML).join('') + '</section>' : '';
        }).join('');
    }
  };
})();
