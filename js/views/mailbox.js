/* Hessa - optional parent gateway configuration; secrets are held outside shared data. */
(function () {
  'use strict';
  var HS = window.HS, U = HS.ui;
  var fields = [{ key:'url', label:'gateway.url', type:'url', ltr:true },
    { key:'pollSeconds', label:'gateway.poll', type:'number', ltr:true }];
  var tab = {
    render: function () {
      if (!HS.can('gateway.manage')) return U.empty('lock', HS.t('set.admin.only'), '');
      return '<section class="card"><h2>' + HS.esc(HS.t('set.tab.gateway')) + '</h2><p>' + HS.esc(HS.t('gateway.help')) + '</p>' +
        '<p data-gateway-status role="status">' + HS.esc(HS.t('common.loading')) + '</p><form data-gateway-form>' + U.fields(fields, {pollSeconds:60}) +
        '<button type="submit" class="btn primary">' + HS.esc(HS.t('common.save')) + '</button></form>' +
        '<div class="toolbar"><button class="btn" data-gateway="generate">' + HS.esc(HS.t('gateway.generate')) + '</button>' +
        '<button class="btn" data-gateway="test">' + HS.esc(HS.t('gateway.test')) + '</button><button class="btn" data-gateway-code>' +
        HS.esc(HS.t('gateway.showCode')) + '</button></div><div data-gateway-result role="status"></div></section>';
    },
    mount: function (root) {
      if (!HS.can('gateway.manage')) return;
      var form = root.querySelector('[data-gateway-form]'), status = root.querySelector('[data-gateway-status]');
      function show(data) { status.textContent = HS.t(data.configured ? 'gateway.configured' : 'gateway.disabled');
        if (data.lastError) status.textContent += ' · ' + data.lastError;
        form.querySelector('[name="url"]').value = data.url || '';
        form.querySelector('[name="pollSeconds"]').value = data.pollSeconds || 60;
      }
      HS.get('/api/gateway').then(show).catch(function (e) { status.textContent = U.errorText(e); });
      form.addEventListener('submit', function (e) {
        e.preventDefault(); U.run(HS.post('/api/gateway/save', U.read(form, fields).values), 'common.saved', form.querySelector('[type="submit"]'))
          .then(function (data) { show(data); form.querySelector('[type="submit"]').disabled = false; }).catch(function () {});
      });
      root.addEventListener('click', function (e) {
        var button = e.target.closest('[data-gateway]');
        if (button) U.run(HS.post('/api/gateway/' + button.dataset.gateway, {}), 'common.saved', button)
          .then(function (data) { if (data.configured !== undefined) show(data); button.disabled = false; }).catch(function () {});
        if (e.target.closest('[data-gateway-code]')) HS.get('/api/gateway/code').then(function (data) {
          var result = root.querySelector('[data-gateway-result]');
          result.innerHTML = '<label for="gateway-code">' + HS.esc(HS.t('gateway.codeHelp')) + '</label><textarea class="input" id="gateway-code" readonly dir="ltr">' + HS.esc(data.code) + '</textarea>';
          result.querySelector('textarea').select();
        }).catch(function (err) { HS.toast(U.errorText(err), 'bad'); });
      });
    }
  };
  HS.mailboxTab = tab;
  HS.views.mailbox = HS.withData(tab);
})();
