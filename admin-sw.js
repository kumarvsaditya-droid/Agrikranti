/* Admin app: hamesha naya version internet se (cache nahi), internet na ho to sandesh */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function(){
    return new Response('<meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#0E1410;color:#fff;font-family:sans-serif;display:grid;place-items:center;height:90vh;text-align:center"><div><h2>इंटरनेट नहीं है</h2><p>इंटरनेट चालू करके दोबारा खोलें।</p></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }));
});
