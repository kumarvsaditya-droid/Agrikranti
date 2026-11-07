/**
 * Agrikranti - Automatic eBook payment (Razorpay) backend - Google Apps Script
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
    var book = BOOKS[b.book];
    if (!book) return out({ error: 'book not found' });
    var mobile = String(b.mobile || '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(mobile)) return out({ error: 'mobile' });

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
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Pehli baar Run karein: permission dega aur Sales sheet bana dega */
function setup() { Logger.log('Sheet: ' + sheet().getParent().getUrl()); }
