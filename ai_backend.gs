/**
 * Agrikranti AI - Ask AI backend (Google Apps Script)
 * ChatGPT (OpenAI) se chalta hai. Students ko sirf "Agrikranti AI" dikhta hai.
 * Steps: script.new par yeh pura code paste karein, neeche OPENAI_KEY mein apni key daalein,
 * Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone.
 * (Free Gemini chahiye to OPENAI_KEY khali chhodkar GEMINI_KEY bharein.)
 */
var OPENAI_KEY = 'PASTE_YOUR_OPENAI_KEY';                  // sk-... (platform.openai.com/api-keys)
var OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini'];      // sasta aur tez; pehla na chale to agla
var GEMINI_KEY = '';                                        // optional free backup (aistudio.google.com/apikey)
var MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
var DAILY_LIMIT = 1500;   // ek din mein kul itne prashn (free quota bachane ke liye)

var SYSTEM = [
  'आप "Agrikranti AI" हैं - Agrikranti 1928 (Aditya Kumar, M.Sc. Soil Science, Gold Medalist) का agriculture tutor।',
  'छात्र B.Sc. Agriculture, ICAR UG/PG/JRF, UPCATET, UPSSSC AGTA, Sugarcane Supervisor जैसी परीक्षाओं की तैयारी कर रहे हैं।',
  'जवाब आसान हिंदी (देवनागरी) में दें, तकनीकी शब्द English में रखें (जैसे Nitrogen fixation, Vertisols)।',
  'जवाब छोटा और exam-focused रखें: पहले सीधा उत्तर, फिर 3 - 6 बुलेट में मुख्य बिंदु, जहाँ उपयोगी हो वैज्ञानिक का नाम, वर्ष, संख्या।',
  'Markdown में सिर्फ **bold** और - बुलेट इस्तेमाल करें। तालिका न बनाएं।',
  'अगर किसी तथ्य पर पक्का भरोसा न हो तो साफ लिखें "इसे किताब से मिला लें"। कुछ भी गढ़ें नहीं।',
  'अगर "Agrikranti notes से तथ्य" दिए गए हैं और प्रश्न से जुड़े हैं, तो उन्हें प्राथमिकता दें।',
  'Agriculture/पढ़ाई से बाहर के प्रश्न (राजनीति, गलत काम आदि) पर विनम्रता से मना करें और agriculture प्रश्न पूछने को कहें।',
  'अपने बारे में पूछे जाने पर बताएं कि आप Agrikranti AI हैं, जिसे Agrikranti 1928 ने छात्रों के लिए बनाया है। किसी company, model या ChatGPT/OpenAI/Gemini का नाम न लें।'
].join('\n');

function doGet() { return out({ ok: true, name: 'Agrikranti AI' }); }

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var q = String(body.q || '').slice(0, 600).trim();
    if (!q) return out({ error: 'empty question' });
    var cache = CacheService.getScriptCache(), day = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd');
    var used = Number(cache.get('n' + day) || 0);
    if (used >= DAILY_LIMIT) return out({ answer: 'आज के AI प्रश्नों की सीमा पूरी हो गई। कृपया कल दोबारा पूछें, या Telegram पर doubt भेजें।' });
    cache.put('n' + day, String(used + 1), 21600);

    var contents = [];
    (body.history || []).slice(-6).forEach(function (m) {
      if (m && m.text) contents.push({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text).slice(0, 800) }] });
    });
    var ctx = String(body.context || '').slice(0, 2500);
    contents.push({ role: 'user', parts: [{ text: (ctx ? 'Agrikranti notes से तथ्य (संदर्भ के लिए):\n' + ctx + '\n\n' : '') + 'प्रश्न: ' + q }] });

    var lastErr = '';
    var hasOpenAI = OPENAI_KEY && OPENAI_KEY.indexOf('PASTE_') !== 0;
    if (hasOpenAI) {
      var msgs = [{ role: 'system', content: SYSTEM }].concat(contents.map(function (c) { return { role: c.role === 'model' ? 'assistant' : 'user', content: c.parts[0].text }; }));
      for (var m = 0; m < OPENAI_MODELS.length; m++) {
        var r = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + OPENAI_KEY },
          payload: JSON.stringify({ model: OPENAI_MODELS[m], messages: msgs, temperature: 0.4, max_tokens: 900 })
        });
        var oj = JSON.parse(r.getContentText() || '{}');
        var ot = oj.choices && oj.choices[0] && oj.choices[0].message ? oj.choices[0].message.content : '';
        if (ot) return out({ answer: ot });
        lastErr = (oj.error && oj.error.message) || ('HTTP ' + r.getResponseCode());
      }
    }
    if (GEMINI_KEY && GEMINI_KEY.indexOf('PASTE_') !== 0) {
      var payload = { systemInstruction: { parts: [{ text: SYSTEM }] }, contents: contents, generationConfig: { temperature: 0.4, maxOutputTokens: 900 } };
      for (var i = 0; i < MODELS.length; i++) {
        var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[i] + ':generateContent?key=' + GEMINI_KEY,
          { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
        var j = JSON.parse(res.getContentText() || '{}');
        var txt = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
          ? j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('') : '';
        if (txt) return out({ answer: txt });
        lastErr = (j.error && j.error.message) || ('HTTP ' + res.getResponseCode());
      }
    }
    if (!lastErr) lastErr = 'API key nahi daali gayi';
    return out({ error: lastErr });
  } catch (err) {
    return out({ error: String(err) });
  }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Test: editor mein is function ko Run karein, Logs mein jawab dikhega */
function testAI() {
  var r = doPost({ postData: { contents: JSON.stringify({ q: 'Vertisols की मुख्य विशेषताएँ बताइए' }) } });
  Logger.log(r.getContent());
}
