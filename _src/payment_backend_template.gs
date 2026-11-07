/**
 * Agrikranti backend - Automatic eBook payment (Razorpay) + Student login (Email OTP, ek ID ek phone) - Google Apps Script
 * Student pay karta hai -> yeh script Razorpay se payment verify karti hai -> book ki chaabi app ko deti hai
 * -> har bikri Google Sheet "Agrikranti eBook Sales" mein likhi jati hai aur aapko email aata hai.
 *
 * Steps: script.new par yeh pura code paste karein, neeche RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET bharein,
 * Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone. URL admin panel mein daalein.
 * NOTE: Is file ko kabhi public na karein (isme book ki chaabi hai).
 */
var RAZORPAY_KEY_ID = 'PASTE_KEY_ID';          // rzp_live_... (ya test ke liye rzp_test_...)
var RAZORPAY_KEY_SECRET = 'PASTE_KEY_SECRET';  // Razorpay Dashboard > Settings > API Keys
var NOTIFY_EMAIL = '';                          // khali = script wale Gmail par email

// Book ki keemat (server par hi tay, app se badli nahi ja sakti) aur chaabi
var BOOKS = {
  /*BOOKS_JSON*/
};

function doGet() { return out({ ok: true, name: 'Agrikranti Pay' }); }

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    var mobile = String(b.mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile)) return out({ error: 'mobile' });
    if (b.action === 'otp') return sendOtp(mobile, b);
    if (b.action === 'login') return login(mobile, b);
    if (b.action === 'check') return check(mobile, b);
    var book = BOOKS[b.book];
    if (!book) return out({ error: 'book not found' });

    if (b.action === 'order') {
      var r = rzp('post', '/orders', { amount: book.price * 100, currency: 'INR', receipt: b.book + '-' + mobile + '-' + Date.now(),
        notes: { book: b.book, mobile: mobile, name: String(b.name || '').slice(0, 60) } });
      if (!r.id) return out({ error: (r.error && r.error.description) || 'order failed' });
      return out({ order_id: r.id, amount: r.amount, key_id: RAZORPAY_KEY_ID, title: book.title });
    }

    if (b.action === 'verify') {
      var sig = hex(Utilities.computeHmacSha256Signature(b.order_id + '|' + b.payment_id, RAZORPAY_KEY_SECRET));
      if (sig !== b.signature) return out({ error: 'signature' });
      var o = rzp('get', '/orders/' + encodeURIComponent(b.order_id));
      if (!o.notes || o.notes.book !== b.book || o.notes.mobile !== mobile) return out({ error: 'order mismatch' });
      if (o.amount_paid < book.price * 100 && o.status !== 'paid') {
        var p = rzp('get', '/payments/' + encodeURIComponent(b.payment_id));
        if (p.status !== 'captured' && p.status !== 'authorized') return out({ error: 'not paid' });
      }
      record(b.book, mobile, b.name || o.notes.name || '', book.price, b.payment_id, b.order_id);
      return out({ ok: true, key: book.key });
    }

    if (b.action === 'restore') {
      var pid = String(b.payment_id || '').trim();
      var rows = sheet().getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][3]) === b.book && String(rows[i][2]).slice(-10) === mobile && (!pid || String(rows[i][5]) === pid)) {
          if (!pid) return out({ error: 'payment id required' });
          return out({ ok: true, key: book.key });
        }
      }
      return out({ error: 'not found' });
    }
    return out({ error: 'action' });
  } catch (err) { return out({ error: String(err) }); }
}

function rzp(method, path, payload) {
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(RAZORPAY_KEY_ID + ':' + RAZORPAY_KEY_SECRET) } };
  if (payload) opt.payload = JSON.stringify(payload);
  return JSON.parse(UrlFetchApp.fetch('https://api.razorpay.com/v1' + path, opt).getContentText() || '{}');
}
function hex(bytes) { return bytes.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join(''); }
function sheet() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('SHEET_ID'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('Agrikranti eBook Sales'); props.setProperty('SHEET_ID', ss.getId());
    ss.getSheets()[0].appendRow(['Date', 'Name', 'Mobile', 'Book', 'Amount', 'Payment ID', 'Order ID']); }
  return ss.getSheets()[0];
}
function record(book, mobile, name, amount, pid, oid) {
  var sh = sheet(), rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][5]) === pid) return;   // dobara na likhe
  sh.appendRow([Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MM-yyyy HH:mm'), name, "'" + mobile, book, amount, pid, oid]);
  try { MailApp.sendEmail(NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(), 'Agrikranti: नई eBook बिक्री ₹' + amount,
    'Book: ' + book + '\nनाम: ' + name + '\nमोबाइल: ' + mobile + '\nPayment ID: ' + pid + '\n\nBook student के app में अपने आप खुल गई है।'); } catch (e) {}
}
/* ---- Student login: Email OTP + ek ID ek samay mein ek hi phone par ---- */
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
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px"><h2 style="color:#1f8f3a">Agrikranti 1928</h2><p>आपका Login OTP है:</p><p style="font-size:30px;font-weight:bold;letter-spacing:6px;color:#b88700">' + otp + '</p><p>यह 10 मिनट तक मान्य है। इसे किसी के साथ share न करें।</p><p style="color:#777;font-size:12px">मोबाइल: ' + m + '</p></div>' });
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
    var sh = users(), u = findUser(sh, m), now = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MM-yyyy HH:mm');
    if (u) { sh.getRange(u.row, 4, 1, 3).setValues([[String(b.device || ''), now, Number(u.v[5] || 0) + 1]]); return out({ ok: true, name: u.v[1] }); }
    sh.appendRow(["'" + m, st.name || String(b.name || ''), st.email, String(b.device || ''), now, 1]);
    return out({ ok: true, name: st.name || String(b.name || ''), created: true });
  } finally { lock.releaseLock(); }
}
function check(m, b) {
  var u = findUser(users(), m); if (!u) return out({ ok: true });
  var same = String(u.v[3]) === String(b.device || '');
  return out({ ok: same, reason: same ? '' : 'other' });
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Pehli baar Run karein: permission dega aur Sales sheet bana dega */
function setup() { Logger.log('Sheet: ' + sheet().getParent().getUrl()); }
