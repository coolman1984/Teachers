/* Startup regression: execute the actual index script order, without a browser. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const pages = ['door', 'students', 'groups', 'money', 'exams', 'followup', 'settlements', 'reports', 'importx', 'print', 'mailbox'];

function startup(lang, options) {
  const ctx = vm.createContext({
    document: { documentElement: { lang, dataset: {} }, addEventListener() {} },
    localStorage: { getItem() { return null; } },
    console, Intl, URLSearchParams, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval
  });
  ctx.window = ctx;
  for (const file of scripts) {
    // QRCode needs the browser DOM; its existence is checked separately.
    if (file === 'lib/qrcode.min.js' || (options && options.app === false && file === 'js/app.js')) continue;
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  }
  return ctx.HS;
}

test('all startup assets exist and centre scripts follow the plan order', () => {
  for (const file of scripts) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.equal(new Set(scripts).size, scripts.length);
  const plan = fs.readFileSync(path.join(root, 'docs/EXECUTION_PLAN.md'), 'utf8');
  const list = plan.match(/Script list exactly: ([\s\S]*?)\x60\./)[1].replace(/\x60/g, '').replace(/\s/g, '').split(',');
  assert.deepEqual(scripts.slice(1), list); // boot.js intentionally runs before first paint
  assert.ok(html.includes('Hessa needs JavaScript. يحتاج نظام حصة إلى تفعيل جافاسكريبت.'));
});

test('startup registers translated centre placeholders in both languages', () => {
  for (const lang of ['en', 'ar']) {
    const HS = startup(lang);
    HS.lang = lang;
    HS.data.state = {};
    for (const id of pages) {
      assert.equal(typeof HS.dict[lang]['nav.' + id], 'string', id);
      assert.equal(typeof HS.dict[lang]['page.' + id + '.d'], 'string', id);
      const view = HS.views[id];
      assert.equal(typeof view.render, 'function', id);
      assert.equal(typeof view.mount, 'function', id);
      HS.me = { perms: ['gateway.manage'] };
      const rendered = view.render({});
      if (id !== 'mailbox') assert.ok(rendered.includes(HS.esc(HS.t('nav.' + id))), id);
      if (id !== 'mailbox') assert.ok(rendered.includes(HS.esc(HS.t('page.' + id + '.d'))), id);
      if (['mailbox','overview','importx','door','students','groups'].indexOf(id)<0) assert.ok(rendered.includes(HS.esc(HS.t('page.pending.body'))), id);
      assert.ok(!rendered.includes('undefined'), id);
      if (['mailbox','overview','importx','door','students','groups'].indexOf(id)<0) view.mount({}, {});
    }
  }
});

test('data failure offers retry and recovery mounts the page', async () => {
  const HS = startup('en');
  HS.lang = 'en';
  let refreshes = 0, mounted = 0, retry;
  HS.rerender = () => { refreshes++; };
  HS.data.load = () => Promise.reject(new Error('unavailable'));
  const view = HS.withData({ render: () => 'loaded', mount: () => { mounted++; } });
  assert.ok(view.render({}).includes('role="status"'));
  view.mount({}, {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshes, 1);
  assert.ok(view.render({}).includes('data-load-retry'));
  view.mount({ querySelector: () => ({ addEventListener: (name, fn) => { retry = fn; } }) }, {});
  HS.data.load = () => { HS.data.state = {}; return Promise.resolve(); };
  retry();
  view.mount({}, {});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.render({}), 'loaded');
  view.mount({}, {});
  assert.equal(mounted, 1);
});

module.exports = { startup };
