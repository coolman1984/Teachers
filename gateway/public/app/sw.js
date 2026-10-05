/* Hessa parent page - service worker. The page files are cached so a saved card opens without a network. The card itself is
   fetched from the network first; when the phone is offline the last copy is answered with the time it was saved
   (X-Hessa-Saved), so the page can say it may be old. A stopped or expired link (404/410) deletes that copy at once.
   Each card is cached under a hash of its address: the link token is never written into the cache index, two children
   never mix, and nothing is kept for a link this phone never opened. */
var VERSION = 'hs-parent-2';
var SHELL = ['/app/style.css', '/app/i18n.js', '/app/app.js', '/app/manifest.webmanifest', '/app/icon.svg'];

function cardKey(path) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(path)).then(function (h) {
    return '/c/' + Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  });
}
function forget(path) {
  return cardKey(path.replace(/^\/t\//, '/api/card/')).then(function (key) { return caches.open(VERSION).then(function (c) { return c.delete(key); }); });
}

self.addEventListener('install', function (e) {
  // the page is the same for every child (no data in it), so it is kept once under a neutral address
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL).then(function () { return fetch('/t/shell').then(function (r) { if (!r.ok) throw new Error('shell'); return c.put('/index.html', r); }); });
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) {
  if (e.data && typeof e.data.forget === 'string') e.waitUntil(forget(e.data.forget));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin || req.method !== 'GET') return;
  if (req.mode === 'navigate' && url.pathname.indexOf('/t/') === 0) {
    e.respondWith(fetch(req).then(function (r) { if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put('/index.html', copy); }); } return r; },
      function () { return caches.match('/index.html'); }));
    return;
  }
  if (url.pathname.indexOf('/api/card/') === 0) {
    e.respondWith(cardKey(url.pathname).then(function (key) {
      return fetch(req).then(function (r) {
        if (r.ok) {
          var copy = r.clone();
          copy.text().then(function (body) {
            var saved = new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Hessa-Saved': new Date().toISOString() } });
            caches.open(VERSION).then(function (c) { c.put(key, saved); });
          });
        } else if (r.status === 404 || r.status === 410) {
          caches.open(VERSION).then(function (c) { c.delete(key); });
        }
        return r;
      }, function () { return caches.match(key).then(function (r) { return r || Response.error(); }); });
    }));
    return;
  }
  if (url.pathname.indexOf('/app/') === 0) e.respondWith(caches.match(req).then(function (r) { return r || fetch(req); }));
});
