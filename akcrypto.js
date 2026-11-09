/* Agrikranti - paid eBook protection (AES-GCM + PBKDF2, browser WebCrypto) */
(function (root) {
  var C = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto : (typeof require === 'function' ? require('crypto').webcrypto : null);
  var enc = new TextEncoder();
  function b64e(u8) { var s = ''; for (var i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); }
  function b64d(str) { var s = atob(str), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function pbkdf(pass, salt, iter) {
    return C.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return C.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(salt), iterations: iter, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function rawKey(u8) { return C.subtle.importKey('raw', u8, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  function aesEnc(key, u8) {
    var iv = C.getRandomValues(new Uint8Array(12));
    return C.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, u8).then(function (ct) { var o = new Uint8Array(12 + ct.byteLength); o.set(iv); o.set(new Uint8Array(ct), 12); return o; });
  }
  function aesDec(key, u8) { return C.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(0, 12) }, key, u8.subarray(12)).then(function (b) { return new Uint8Array(b); }); }
  function sha(t) { return C.subtle.digest('SHA-256', enc.encode(t)).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function norm(m, c) { return [String(m).replace(/\D/g, '').slice(-10), String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')]; }
  var AK = {
    b64e: b64e, b64d: b64d, rawKey: rawKey, aesEnc: aesEnc, aesDec: aesDec, sha: sha,
    newKey: function () { return C.getRandomValues(new Uint8Array(32)); },
    newCode: function () { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = C.getRandomValues(new Uint8Array(8)), s = ''; for (var i = 0; i < 8; i++) s += a[r[i] % a.length]; return s; },
    licId: function (book, m, c) { var x = norm(m, c); return sha('lic|' + book + '|' + x[0] + '|' + x[1]).then(function (h) { return h.slice(0, 24); }); },
    licWrap: function (K, book, m, c) { var x = norm(m, c); return pbkdf(x[1], 'ak|' + book + '|' + x[0], 120000).then(function (k) { return aesEnc(k, K); }).then(b64e); },
    licUnwrap: function (w, book, m, c) { var x = norm(m, c); return pbkdf(x[1], 'ak|' + book + '|' + x[0], 120000).then(function (k) { return aesDec(k, b64d(w)); }); },
    passWrap: function (K, book, pass) { var x = norm('0', pass)[1]; return pbkdf(x, 'akpass|' + book, 120000).then(function (k) { return aesEnc(k, K); }).then(b64e); },
    passUnwrap: function (w, book, pass) { var x = norm('0', pass)[1]; return pbkdf(x, 'akpass|' + book, 120000).then(function (k) { return aesDec(k, b64d(w)); }); },
    pinKey: function (pin) { return pbkdf(String(pin), 'agrikranti-admin-pin', 200000); }
  };
  if (typeof module !== 'undefined') module.exports = AK; else root.AK = AK;
})(this);
