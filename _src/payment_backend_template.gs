/**
 * Agrikranti Pay - v5 (PRIVATE - is file ko kabhi public na karein, isme book ki chaabi hai)
 *
 * Naya kya hai:
 *  1. Har nayi book / pack apne aap: keemat aur naam app ke content.json se aate hain.
 *     Admin panel se nayi paid book daaliye - is script ko dobara chhoone ki zaroorat nahi.
 *  2. Login ID (mobile) par khareedi har book kisi bhi phone par apne aap khulti hai.
 *  3. Payment hua par book nahi khuli (app band ho gaya, net chala gaya) - Razorpay se khud jaanch kar
 *     book khol deta hai. Purane (v4 wale) khareedaron ko bhi Razorpay se dhoond kar khol deta hai.
 *
 * Is code mein kuch bhi badalna nahi hai. Razorpay keys "Project Settings > Script Properties" mein hain
 * (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) - wahi purani wali apne aap use hongi.
 */
var PROPS = PropertiesService.getScriptProperties();
var RAZORPAY_KEY_ID = String(PROPS.getProperty('RAZORPAY_KEY_ID') || '').trim();
var RAZORPAY_KEY_SECRET = String(PROPS.getProperty('RAZORPAY_KEY_SECRET') || '').trim();
var NOTIFY_EMAIL = '';                          // khali = script wale Gmail par email

/* ---------- Iske neeche kuch na badlein ---------- */
var CONTENT_URL = 'https://raw.githubusercontent.com/kumarvsaditya-droid/Agrikranti/main/content.json';
var REPO_API = 'https://api.github.com/repos/kumarvsaditya-droid/Agrikranti';
var MAX_DEVICES = 4;                            // ek khareed = zyada se zyada itne phone
var MASTER_KEY = '/*MASTER*/';                  // har nayi book ki chaabi isse banti hai (admin panel bhi yahi karta hai)
var OLD_KEYS = /*OLD_KEYS*/;                    // purani books ki apni chaabi
var OLD_PRICES = { notes1: 99, sem1: 100 };     // content.json na mile to

function doGet() { return out({ ok: true, name: 'Agrikranti Pay', v: 5, keySet: !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) }); }

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    if (b.action === 'ping') return out({ ok: true, v: 5 });
    if (b.action === 'sales') return sales(b);
    var mobile = String(b.mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile)) return out({ error: 'mobile' });
    if (b.action === 'otp') return sendOtp(mobile, b);
    if (b.action === 'login') return login(mobile, b);
    if (b.action === 'check') return check(mobile, b);
    if (b.action === 'mine') return mine(mobile, b);
    var book = bookInfo(b.book);
    if (!book) return out({ error: 'book not found' });

    if (b.action === 'order') {
      var r = rzp('post', '/orders', { amount: book.price * 100, currency: 'INR', receipt: (b.book + '-' + mobile + '-' + Date.now()).slice(0, 40),
        notes: { book: b.book, mobile: mobile, name: String(b.name || '').slice(0, 60) } });
      if (!r.id) return out({ error: (r.error && r.error.description) || 'order failed' });
      try { orders().appendRow([now(), r.id, b.book, "'" + mobile, String(b.name || '').slice(0, 60), book.price, 'created']); } catch (x) {}
      return out({ order_id: r.id, amount: r.amount, key_id: RAZORPAY_KEY_ID, title: book.title });
    }

    if (b.action === 'verify') {
      var sig = hex(Utilities.computeHmacSha256Signature(b.order_id + '|' + b.payment_id, RAZORPAY_KEY_SECRET));
      if (sig !== b.signature) return out({ error: 'signature' });
      var o = rzp('get', '/orders/' + encodeURIComponent(b.order_id));
      if (!o.notes || o.notes.book !== b.book || o.notes.mobile !== mobile) return out({ error: 'order mismatch' });
      if (o.status !== 'paid' && !(o.amount_paid >= o.amount)) {
        var p = rzp('get', '/payments/' + encodeURIComponent(b.payment_id));
        if (p.status !== 'captured' && p.status !== 'authorized') return out({ error: 'not paid' });
      }
      record(b.book, mobile, b.name || o.notes.name || '', Math.round((o.amount || book.price * 100) / 100), b.payment_id, b.order_id);
      return out({ ok: true, key: book.key });
    }

    if (b.action === 'restore') {
      var pid = String(b.payment_id || '').trim();
      if (!pid) { var m = myBooks(mobile, b); return m[b.book] ? out({ ok: true, key: m[b.book] }) : out({ error: 'not found' }); }
      var rows = sheet().getDataRange().getValues();
      for (var i = 1; i < rows.length; i++)
        if (String(rows[i][3]) === b.book && String(rows[i][2]).replace(/\D/g, '').slice(-10) === mobile && String(rows[i][5]) === pid) return out({ ok: true, key: book.key });
      var pp = rzp('get', '/payments/' + encodeURIComponent(pid));       // sheet mein nahi to Razorpay se
      if (pp.order_id) { var oo = rzp('get', '/orders/' + encodeURIComponent(pp.order_id));
        if (oo.notes && oo.notes.book === b.book && oo.notes.mobile === mobile && (pp.status === 'captured' || pp.status === 'authorized')) {
          record(b.book, mobile, oo.notes.name || '', Math.round(oo.amount / 100), pid, pp.order_id); return out({ ok: true, key: book.key }); } }
      return out({ error: 'not found' });
    }
    return out({ error: 'action' });
  } catch (err) { return out({ error: String(err) }); }
}

/* ---- Book ki jaankari content.json se (5 minute cache) ---- */
function content() {
  var c = CacheService.getScriptCache(), s = c.get('content');
  if (s) return JSON.parse(s);
  try { var t = UrlFetchApp.fetch(CONTENT_URL + '?t=' + Date.now(), { muteHttpExceptions: true }).getContentText();
    var j = JSON.parse(t), small = { ebooks: (j.ebooks || []).map(function (x) { return { id: x.id, title: x.title, price: x.price }; }) };
    try { c.put('content', JSON.stringify(small), 300); } catch (x) {}
    return small;
  } catch (e) { return { ebooks: [] }; }
}
function bookInfo(id) {
  if (!id) return null;
  var e = (content().ebooks || []).filter(function (x) { return x.id === id; })[0];
  var price = e ? Number(e.price) : OLD_PRICES[id];
  if (!price || price <= 0) return null;
  return { price: price, title: e ? e.title : id, key: keyOf(id) };
}
function keyOf(id) {
  if (OLD_KEYS[id]) return OLD_KEYS[id];
  return Utilities.base64Encode(Utilities.computeHmacSha256Signature(Utilities.newBlob('item|' + id).getBytes(), Utilities.base64Decode(MASTER_KEY)));
}

/* ---- Login ID par sab khareedi books ---- */
function mine(mobile, b) {
  var dev = String(b.device || '').slice(0, 40);
  var books = myBooks(mobile, b);
  if (Object.keys(books).length && dev) {
    var d = deviceOk(mobile, dev);
    if (!d) return out({ ok: false, error: 'devices', max: MAX_DEVICES });
  }
  return out({ ok: true, books: books });
}
function myBooks(mobile, b) {
  checkOrders(mobile, (b && b.orders) || []);
  var res = {}, rows = sheet().getDataRange().getValues(), found = false;
  for (var i = 1; i < rows.length; i++) if (String(rows[i][2]).replace(/\D/g, '').slice(-10) === mobile && rows[i][3]) { res[String(rows[i][3])] = keyOf(String(rows[i][3])); found = true; }
  if (!found) { scanRazorpay(mobile);
    rows = sheet().getDataRange().getValues();
    for (var k = 1; k < rows.length; k++) if (String(rows[k][2]).replace(/\D/g, '').slice(-10) === mobile && rows[k][3]) res[String(rows[k][3])] = keyOf(String(rows[k][3])); }
  return res;
}
/* Payment hua par app tak verify nahi pahuncha - order khud jaanch lo */
function checkOrders(mobile, list) {
  var ids = {}, sh = orders(), rows = sh.getDataRange().getValues();
  (list || []).slice(0, 10).forEach(function (x) { if (/^order_/.test(String(x))) ids[x] = -1; });
  for (var i = 1; i < rows.length; i++) if (String(rows[i][3]).replace(/\D/g, '').slice(-10) === mobile && rows[i][6] !== 'paid') ids[rows[i][1]] = i + 1;
  Object.keys(ids).slice(0, 10).forEach(function (oid) {
    var o = rzp('get', '/orders/' + encodeURIComponent(oid));
    if (!o.notes || o.notes.mobile !== mobile) return;
    if (o.status === 'paid' || o.amount_paid >= o.amount) {
      var ps = rzp('get', '/orders/' + encodeURIComponent(oid) + '/payments'), pid = '';
      (ps.items || []).forEach(function (p) { if (p.status === 'captured' || p.status === 'authorized') pid = p.id; });
      if (pid) { record(o.notes.book, mobile, o.notes.name || '', Math.round(o.amount / 100), pid, oid); if (ids[oid] > 0) sh.getRange(ids[oid], 7).setValue('paid'); }
    }
  });
}
/* Purane khareedar (jinka verify kabhi pahuncha hi nahi): Razorpay ke pichhle 60 din ke paid orders dekho */
function scanRazorpay(mobile) {
  var c = CacheService.getScriptCache();
  if (c.get('scan_' + mobile)) return; c.put('scan_' + mobile, '1', 600);
  var from = Math.floor(Date.now() / 1000) - 60 * 86400;
  for (var skip = 0; skip < 500; skip += 100) {
    var r = rzp('get', '/orders?count=100&skip=' + skip + '&from=' + from), items = r.items || [];
    items.forEach(function (o) {
      if (!o.notes || o.notes.mobile !== mobile || !(o.status === 'paid' || o.amount_paid >= o.amount)) return;
      var ps = rzp('get', '/orders/' + encodeURIComponent(o.id) + '/payments'), pid = '';
      (ps.items || []).forEach(function (p) { if (p.status === 'captured' || p.status === 'authorized') pid = p.id; });
      if (pid) record(o.notes.book, mobile, o.notes.name || '', Math.round(o.amount / 100), pid, o.id);
    });
    if (items.length < 100) break;
  }
}
/* Ek khareed zyada se zyada MAX_DEVICES phone par (Sheet "Devices" mein row mita kar reset) */
function deviceOk(mobile, dev) {
  var ss = sheet().getParent(), sh = ss.getSheetByName('Devices');
  if (!sh) { sh = ss.insertSheet('Devices'); sh.appendRow(['Mobile', 'Devices', 'Last']); }
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]).replace(/\D/g, '').slice(-10) === mobile) {
    var list = String(rows[i][1] || '').split(',').filter(String);
    if (list.indexOf(dev) < 0) { if (list.length >= MAX_DEVICES) return false; list.push(dev); }
    sh.getRange(i + 1, 2, 1, 2).setValues([[list.join(','), now()]]); return true;
  }
  sh.appendRow(["'" + mobile, dev, now()]); return true;
}

/* ---- Admin panel: khareedaron ki list (GitHub token se jaanch) ---- */
function sales(b) {
  var t = String(b.token || ''); if (!t) return out({ error: 'token' });
  var c = CacheService.getScriptCache(), ck = 'tok_' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t)).slice(0, 20);
  if (!c.get(ck)) {
    var r = UrlFetchApp.fetch(REPO_API, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + t, 'User-Agent': 'agrikranti' } });
    var j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
    if (r.getResponseCode() !== 200 || !(j.permissions && (j.permissions.push || j.permissions.admin))) return out({ error: 'token' });
    c.put(ck, '1', 3600);
  }
  var sh = sheet(), rows = sh.getDataRange().getDisplayValues().slice(1);
  return out({ ok: true, rows: rows, sheet: sh.getParent().getUrl(), v: 5 });
}

/* ---- Helpers ---- */
function rzp(method, path, payload) {
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(RAZORPAY_KEY_ID + ':' + RAZORPAY_KEY_SECRET) } };
  if (payload) opt.payload = JSON.stringify(payload);
  try { return JSON.parse(UrlFetchApp.fetch('https://api.razorpay.com/v1' + path, opt).getContentText() || '{}'); } catch (e) { return {}; }
}
function hex(bytes) { return bytes.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join(''); }
function now() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MM-yyyy HH:mm'); }
function sheet() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('Agrikranti eBook Sales'); props.setProperty('SHEET_ID', ss.getId());
    ss.getSheets()[0].appendRow(['Date', 'Name', 'Mobile', 'Book', 'Amount', 'Payment ID', 'Order ID']); }
  return ss.getSheets()[0];
}
function orders() {
  var ss = sheet().getParent(), sh = ss.getSheetByName('Orders');
  if (!sh) { sh = ss.insertSheet('Orders'); sh.appendRow(['Date', 'Order ID', 'Book', 'Mobile', 'Name', 'Amount', 'Status']); }
  return sh;
}
function record(book, mobile, name, amount, pid, oid) {
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = sheet(), rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) if (String(rows[i][5]) === pid) return;   // dobara na likhe
    sh.appendRow([now(), name, "'" + mobile, book, amount, pid, oid]);
  } finally { lock.releaseLock(); }
  try { MailApp.sendEmail(NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(), 'Agrikranti: नई eBook बिक्री ₹' + amount,
    'Book: ' + book + '\nनाम: ' + name + '\nमोबाइल: ' + mobile + '\nPayment ID: ' + pid + '\n\nBook student के app में अपने आप खुल गई है।'); } catch (e) {}
}

/* ---- Student login: Email OTP (optional) ---- */
function users() {
  var ss = sheet().getParent(), sh = ss.getSheetByName('Users');
  if (!sh) { sh = ss.insertSheet('Users'); sh.appendRow(['Mobile', 'Name', 'Email', 'Device', 'Last login', 'Logins']); }
  return sh;
}
function findUser(sh, m) { var rows = sh.getDataRange().getValues(); for (var i = 1; i < rows.length; i++) if (String(rows[i][0]).replace(/\D/g, '').slice(-10) === m) return { row: i + 1, v: rows[i] }; return null; }
function mask(e) { var p = String(e).split('@'); return p[0].slice(0, 2) + '***@' + (p[1] || ''); }
function sendOtp(m, b) {
  var cache = CacheService.getScriptCache(), cnt = Number(cache.get('oc_' + m) || 0);
  if (cnt >= 5) return out({ error: 'too many' });
  var u = findUser(users(), m), email = u ? String(u.v[2]) : String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out({ error: u ? 'no email' : 'email' });
  var otp = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp_' + m, JSON.stringify({ otp: otp, email: email, name: String(b.name || '').slice(0, 60), tries: 0 }), 600);
  cache.put('oc_' + m, String(cnt + 1), 3600);
  MailApp.sendEmail({ to: email, subject: 'Agrikranti Login OTP: ' + otp, name: 'Agrikranti 1928',
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px"><h2 style="color:#1f8f3a">Agrikranti 1928</h2><p>आपका Login OTP है:</p><p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#b88700">' + otp + '</p><p>यह 10 मिनट तक मान्य है।</p></div>' });
  return out({ ok: true, to: mask(email), existing: !!u });
}
function login(m, b) {
  var cache = CacheService.getScriptCache(), raw = cache.get('otp_' + m);
  if (!raw) return out({ error: 'expired' });
  var st = JSON.parse(raw);
  if (String(b.otp || '').trim() !== st.otp) { st.tries++; if (st.tries >= 5) cache.remove('otp_' + m); else cache.put('otp_' + m, JSON.stringify(st), 600); return out({ error: 'otp' }); }
  cache.remove('otp_' + m);
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var sh = users(), u = findUser(sh, m);
    if (u) { sh.getRange(u.row, 4, 1, 3).setValues([[String(b.device || ''), now(), Number(u.v[5] || 0) + 1]]); return out({ ok: true, name: u.v[1] }); }
    sh.appendRow(["'" + m, st.name || String(b.name || ''), st.email, String(b.device || ''), now(), 1]);
    return out({ ok: true, name: st.name || String(b.name || ''), created: true });
  } finally { lock.releaseLock(); }
}
function check(m, b) {
  var u = findUser(users(), m); if (!u) return out({ ok: true });
  var same = String(u.v[3]) === String(b.device || '');
  return out({ ok: same, reason: same ? '' : 'other' });
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Code paste karne ke baad ek baar Run karein (permission ke liye) */
function setup() { Logger.log('Razorpay keys: ' + (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET ? 'OK (' + RAZORPAY_KEY_ID + ')' : 'NAHI MILI - Script Properties dekhein') + ' | Sheet: ' + sheet().getParent().getUrl() + ' | Books: ' + JSON.stringify(content().ebooks.map(function (x) { return x.id + '=' + x.price; }))); }
