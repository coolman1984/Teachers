/* Hessa - Help & guide: searchable questions and answers, tour and slides. */
(function () {
  'use strict';
  var HS = window.HS;
  var N = 8;
  HS.views.help = {
    render: function () {
      var items = [];
      for (var i = 1; i <= N; i++) items.push('<details data-i="' + i + '"><summary>' + HS.esc(HS.t('help.q' + i)) + '</summary><p>' + HS.esc(HS.t('help.a' + i)) + '</p></details>');
      return '<div class="page-head"><div class="titles"><h1>' + HS.esc(HS.t('help.title')) + '</h1><p>' + HS.esc(HS.t('help.sub')) + '</p></div>' +
        '<button class="btn" data-a="tour">' + HS.icon('play', 'sm') + HS.esc(HS.t('help.tour.start')) + '</button>' +
        '<button class="btn" data-a="slides">' + HS.icon('present', 'sm') + HS.esc(HS.t('help.slides.start')) + '</button></div>' +
        '<div class="toolbar"><input class="input" id="help-q" type="search" placeholder="' + HS.esc(HS.t('help.search')) + '" style="max-width:32rem" aria-label="' + HS.esc(HS.t('help.search')) + '"></div>' +
        '<div class="faq" id="faq">' + items.join('') + '</div><div class="empty" id="faq-none" hidden><div class="art">' + HS.icon('search', 'lg') + '</div><p>' + HS.esc(HS.t('help.none')) + '</p></div>';
    },
    mount: function (root) {
      root.querySelector('[data-a="tour"]').addEventListener('click', function () { HS.go('overview'); setTimeout(HS.tour.start, 350); });
      root.querySelector('[data-a="slides"]').addEventListener('click', function () { HS.slides.open(); });
      var q = root.querySelector('#help-q');
      q.addEventListener('input', function () {
        var n = q.value.trim().toLowerCase(), shown = 0;
        HS.$$('#faq details', root).forEach(function (d) {
          var hit = !n || d.textContent.toLowerCase().indexOf(n) >= 0;
          d.hidden = !hit; if (hit) shown++;
        });
        root.querySelector('#faq-none').hidden = shown > 0;
      });
    }
  };
})();
