/* Hessa owner page - service worker. The page files are kept so the app opens without a network; the live picture is
   fetched from the network and, when the phone is offline, the last copy is shown with its time (X-Hessa-Saved).
   The phone's key is sent in a header and never written into the cache. A removed phone (401) deletes the copy at once. */
var VERSION = 'hs-owner-1';
var SHELL = ['/o/', '/app/owner.css', '/app/owner.js', '/app/owner.webmanifest', '/app/icon-192.png', '/app/icon-512.png'];
var LAST = '/o/last';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('hs-owner-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) {
  if (e.data && e.data.forget) e.waitUntil(caches.open(VERSION).then(function (c) { return c.delete(LAST); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (url.origin !== location.origin || req.method !== 'GET') return;
  if (url.pathname === '/api/owner') {
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok) {
        r.clone().text().then(function (body) {
          caches.open(VERSION).then(function (c) { c.put(LAST, new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Hessa-Saved': new Date().toISOString() } })); });
        });
      } else if (r.status === 401) {
        caches.open(VERSION).then(function (c) { c.delete(LAST); });
      }
      return r;
    }, function () { return caches.match(LAST).then(function (r) { return r || Response.error(); }); }));
    return;
  }
  if (url.pathname === '/o/' || url.pathname.indexOf('/app/') === 0) {
    e.respondWith(fetch(req).then(function (r) {
      if (r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return r;
    }, function () { return caches.match(req, { ignoreSearch: true }); }));
  }
});
