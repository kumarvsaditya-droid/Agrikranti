/* Agrikranti service worker - app ko offline bhi chalata hai */
var CACHE = 'agrikranti-v59';
var CORE = ['./', 'index.html', 'tests.js', 'tests-ganna.js', 'manifest.webmanifest', 'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'img/upi-qr.png', 'akcrypto.js', 'img/aditya.jpg'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); })); self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // backend / fonts seedha network se
  e.respondWith(fetch(e.request).then(function (r) {                        // pehle network (naya content), fail ho to cache
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
  }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('index.html'); }); }));
});

/* ===== Job Alerts: background me nayi agriculture naukri ki khabar (installed app, Chrome Android) ===== */
var JOBS_URL = 'https://raw.githubusercontent.com/kumarvsaditya-droid/Agrikranti/main/jobs.json';
function metaGet(k) { return caches.open('ak-meta').then(function (c) { return c.match(k); }).then(function (r) { return r ? r.text() : null; }); }
function metaSet(k, v) { return caches.open('ak-meta').then(function (c) { return c.put(k, new Response(String(v))); }); }
function checkJobs() {
  return fetch(JOBS_URL + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
    var items = (j && j.items) || [], newest = items.reduce(function (m, x) { return Math.max(m, x.ts); }, 0);
    return metaGet('/__jobs_last').then(function (last) {
      last = +last || 0;
      if (!last) return metaSet('/__jobs_last', newest);
      var fresh = items.filter(function (x) { return x.ts > last; });
      if (!fresh.length) return;
      var pri = fresh.filter(function (x) { return x.region; }), top = pri[0] || fresh[0];
      if (self.navigator && self.navigator.setAppBadge) { try { self.navigator.setAppBadge(fresh.length); } catch (e) {} }
      return self.registration.showNotification(pri.length ? '⭐ ' + pri.length + ' नई UP/Bihar Agriculture Job Alert' : '🔔 ' + fresh.length + ' नई Agriculture Job Alert',
        { body: top.title, icon: 'icons/notif-icon.png', badge: 'icons/badge-72.png', image: 'img/job-alert.jpg', tag: 'ak-jobs', renotify: true, data: { url: './?go=updates' } })
        .then(function () { return metaSet('/__jobs_last', newest); });
    });
  }).catch(function () {});
}
self.addEventListener('periodicsync', function (e) { if (e.tag === 'ak-jobs') e.waitUntil(checkJobs()); });
self.addEventListener('message', function (e) { if (e.data && e.data.type === 'jobs-seen') e.waitUntil(metaSet('/__jobs_last', e.data.ts)); });
self.addEventListener('notificationclick', function (e) {
  e.notification.close(); var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) { cs[i].navigate(url).catch(function () {}); return cs[i].focus(); } }
    return self.clients.openWindow(url);
  }));
});
