/* Hessa - Help & guide: one topic per daily job (the front desk, students, groups, money, marks, follow-up,
   settlements, reports, phones, safety), plain questions and answers in both languages, a search that understands
   Arabic spelling variants, a link from every topic to its page, and the tour and welcome slides. The "?" in the top
   bar opens the topic of the page you are on. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  // n = how many questions the topic has (keys hq.<id>.<k>.q / .a)
  var TOPICS = [
    { id: 'start', icon: 'flag', page: 'overview', n: 4 },
    { id: 'door', icon: 'board', page: 'door', perm: 'door.use', n: 10 },
    { id: 'students', icon: 'users', page: 'students', perm: 'students.view', n: 5 },
    { id: 'groups', icon: 'layers', page: 'groups', perm: 'groups.view', n: 8 },
    { id: 'money', icon: 'sheet', page: 'money', perm: ['money.view', 'money.collect'], n: 6 },
    { id: 'exams', icon: 'star', page: 'exams', perm: ['exams.view', 'marks.enter'], n: 4 },
    { id: 'followup', icon: 'bell', page: 'followup', perm: 'followup.view', n: 4 },
    { id: 'settlements', icon: 'chart', page: 'settlements', perm: 'settlements.view', n: 3 },
    { id: 'reports', icon: 'present', page: 'reports', perm: 'reports.view', n: 2 },
    { id: 'phone', icon: 'globe', page: 'overview', n: 3 },
    { id: 'devices', icon: 'sync', page: 'devices', perm: 'users.manage', n: 6 },
    { id: 'safety', icon: 'shield', page: 'settings', n: 6 },
    { id: 'parents', icon: 'link', page: 'settings?tab=gateway', n: 6 },
    { id: 'remote', icon: 'globe', page: 'settings?tab=remote', n: 4 },
    { id: 'printing', icon: 'printer', page: 'settings', n: 3 }
  ];
  HS.helpTopic = function (page) { return TOPICS.filter(function (t) { return t.id === page; })[0] ? page : 'start'; };

  function visible() { return TOPICS.filter(function (t) { return !t.perm || HS.can(t.perm); }); }
  function topicHTML(t, open) {
    var qa = [];
    for (var k = 1; k <= t.n; k++) qa.push('<details' + (open && k === 1 ? ' open' : '') + '><summary>' + HS.esc(HS.t('hq.' + t.id + '.' + k + '.q')) + '</summary><p>' + HS.esc(HS.t('hq.' + t.id + '.' + k + '.a')) + '</p></details>');
    return '<section class="help-topic" id="topic-' + t.id + '" data-topic="' + t.id + '"><header class="row"><span class="tile-ic">' + HS.icon(t.icon) + '</span><h2 class="grow">' + HS.esc(HS.t('hq.' + t.id)) + '</h2>' +
      '<a class="btn sm" href="#/' + t.page + '">' + HS.esc(HS.t('help.open')) + HS.icon('right', 'sm mirror') + '</a></header><div class="faq">' + qa.join('') + '</div></section>';
  }

  HS.views.help = {
    render: function (ctx) {
      var list = visible(), q = (ctx && ctx.route && ctx.route.q) || {};
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('help.title')) + '</h1><p>' + HS.esc(HS.t('help.sub')) + '</p></div>' +
          '<button class="btn" data-a="tour">' + HS.icon('play', 'sm') + HS.esc(HS.t('help.tour.start')) + '</button>' +
          '<button class="btn" data-a="slides">' + HS.icon('present', 'sm') + HS.esc(HS.t('help.slides.start')) + '</button></div>' +
        '<div class="help-search">' + HS.icon('search', 'lg') + '<input class="input" id="help-q" type="search" placeholder="' + HS.esc(HS.t('help.search')) + '" aria-label="' + HS.esc(HS.t('help.search')) + '" value="' + HS.esc(q.q || '') + '"></div>' +
        '<nav class="help-cards" aria-label="' + HS.esc(HS.t('help.topics')) + '">' + list.map(function (t) {
          return '<a href="#/help?topic=' + t.id + '" data-jump="' + t.id + '" class="help-card' + (q.topic === t.id ? ' on' : '') + '">' + HS.icon(t.icon) + '<span>' + HS.esc(HS.t('hq.' + t.id)) + '</span></a>'; }).join('') + '</nav>' +
        '<div class="stack" id="help-topics">' + list.map(function (t) { return topicHTML(t, q.topic === t.id); }).join('') + '</div>' +
        '<div class="empty" id="faq-none" hidden><div class="art">' + HS.icon('search', 'lg') + '</div><h3>' + HS.esc(HS.t('help.none')) + '</h3><p>' + HS.esc(HS.t('help.none.b')) + '</p></div>';
    },
    mount: function (root, ctx) {
      root.querySelector('[data-a="tour"]').addEventListener('click', function () { HS.go('overview'); setTimeout(HS.tour.start, 350); });
      root.querySelector('[data-a="slides"]').addEventListener('click', function () { HS.slides.open(); });
      var q = root.querySelector('#help-q');
      function filter() {
        var n = U.key(q.value), shown = 0;   // U.key: أ/ا, ة/ه, ى/ي and Arabic digits match their plain forms
        HS.$$('.help-topic', root).forEach(function (sec) {
          var any = 0;
          HS.$$('details', sec).forEach(function (d) { var hit = !n || U.key(d.textContent).indexOf(n) >= 0; d.hidden = !hit; if (hit) { any++; if (n) d.open = true; } });
          sec.hidden = !any; shown += any;
        });
        root.querySelector('#faq-none').hidden = shown > 0;
      }
      q.addEventListener('input', HS.debounce(filter, 100));
      root.addEventListener('click', function (e) {
        var j = e.target.closest('[data-jump]'); if (!j) return;
        e.preventDefault();
        q.value = ''; filter();
        var sec = root.querySelector('#topic-' + j.dataset.jump);
        if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); var d = sec.querySelector('details'); if (d) d.open = true; }
        HS.$$('.help-card', root).forEach(function (c) { c.classList.toggle('on', c === j); });
      });
      var t = ctx && ctx.route && ctx.route.q.topic;
      if (q.value) filter();
      if (t) setTimeout(function () { var sec = root.querySelector('#topic-' + t); if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'start' }); }, 50);
    }
  };
})();
