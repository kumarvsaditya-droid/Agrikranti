"""Har nayi job khabar ka poora article padh kar Gemini se details nikalta hai (pad, yogyata, umar, fees, tithi...).
Sirf wahi details rakhta hai jo article/notice mein likhi hain. jobs.json ke item mein 'd' (details) aur 'durl' (asli article link) jodta hai."""
import json, re, os, base64, html, time, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'}
MAX_PER_RUN = 12
BUDGET = 480   # details ke liye kul seconds har run mein
MAX_TRIES = 3
MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']
FIELDS = ['post_name', 'total_posts', 'qualification', 'age_limit', 'fee', 'salary', 'start_date', 'last_date', 'exam_date', 'selection', 'official_site', 'summary']


def key():
    k = os.environ.get('GEMINI_KEY', '').strip()
    if k: return k
    try:
        c = json.load(open(os.path.join(HERE, '..', 'content.json'), encoding='utf-8'))['config']
        return base64.b64decode(c['gk']).decode()[::-1]
    except Exception:
        return ''


def get(url, data=None, headers=None, timeout=20):
    url = urllib.parse.quote(url, safe=':/?&=%#+,;@!$~*()\'')
    h = dict(UA); h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.geturl(), r.headers.get('Content-Type', '')


def gnews_decode(url):
    """news.google.com/rss/articles/... -> asli article ka URL."""
    m = re.search(r'news\.google\.com/(?:rss/)?articles/([^?/]+)', url)
    if not m: return url
    gid = m.group(1)
    page = get('https://news.google.com/rss/articles/' + gid)[0].decode('utf-8', 'ignore')
    sg = re.search(r'data-n-a-sg="([^"]+)"', page); ts = re.search(r'data-n-a-ts="([^"]+)"', page)
    if not (sg and ts): raise ValueError('gnews signature nahi mila')
    inner = '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"%s",%s,"%s"]' % (gid, ts.group(1), sg.group(1))
    body = 'f.req=' + urllib.parse.quote(json.dumps([[['Fbv4je', inner]]]))
    txt = get('https://news.google.com/_/DotsSplashUi/data/batchexecute', body.encode(), {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})[0].decode('utf-8', 'ignore')
    data = json.loads(txt.split('\n\n')[1])[:-2]
    return json.loads(data[0][2])[1]


def page_text(raw):
    s = raw.decode('utf-8', 'ignore')
    s = re.sub(r'(?is)<(script|style|noscript|svg|iframe|header|footer|nav|form)\b.*?</\1>', ' ', s)
    s = re.sub(r'(?i)<\s*(br|/p|/tr|/li|/h\d|/div|/table)\b[^>]*>', '\n', s)
    s = re.sub(r'(?i)</t[dh]\s*>', ' | ', s)
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    s = re.sub(r'[ \t\xa0]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n', s)
    return s.strip()[:14000]


PROMPT = """You extract recruitment / admission details for an Indian agriculture job-alert poster.
Headline: {title}
Use ONLY facts written in the source below. Never guess, never use outside knowledge. If a field is not clearly stated, return null for it.
Write values in short Hindi (Devanagari) and keep English technical terms, degree names, numbers and dates as they are. Dates as DD-MM-YYYY when the source gives a full date.
Each value at most 70 characters. Return JSON only with these keys:
post_name (post / course name), total_posts (number of posts or seats), qualification, age_limit, fee (application fee), salary (pay / stipend),
start_date (apply start), last_date (last date to apply / walk-in date), exam_date (exam or interview date), selection (selection process),
official_site (official website domain only, like upsssc.gov.in), summary (one plain Hindi sentence about what this notice is),
relevant (true if the source really is about this headline, else false)."""


_MODELS = None
def models(k):
    """Is key par jo flash model abhi chal rahe hain, unki list (purane naam band ho jaate hain)."""
    global _MODELS
    if _MODELS is not None: return _MODELS
    names = []
    try:
        j = json.loads(get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + k)[0])
        for m in j.get('models', []):
            n = m['name'].split('/')[-1]
            if 'generateContent' in m.get('supportedGenerationMethods', []) and 'flash' in n and not re.search(r'image|tts|audio|live|thinking|exp|preview', n): names.append(n)
    except Exception as e: print('  models list ERR', repr(e)[:120], flush=True)
    def rank(n):
        v = re.search(r'(\d+(?:\.\d+)?)', n); return (0 if 'latest' in n else 1, -(float(v.group(1)) if v else 0), 'lite' in n, n)
    names.sort(key=rank)
    _MODELS = (names or MODELS)[:4]; print('  models:', _MODELS, flush=True)
    return _MODELS


def gemini(k, title, text=None, pdf=None):
    parts = [{'text': PROMPT.format(title=title)}]
    if pdf: parts.append({'inline_data': {'mime_type': 'application/pdf', 'data': base64.b64encode(pdf).decode()}})
    else: parts.append({'text': 'SOURCE:\n' + text})
    body = json.dumps({'contents': [{'parts': parts}], 'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json'}}).encode()
    last = None
    for m in models(k):
        try:
            raw = get('https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s' % (m, k), body, {'Content-Type': 'application/json'}, 90)[0]
            j = json.loads(raw)
            t = j['candidates'][0]['content']['parts'][0]['text']
            t = re.sub(r'^```(?:json)?|```$', '', t.strip()).strip()
            return json.loads(t)
        except Exception as e:
            last = e; print('  gemini', m, repr(e)[:120], flush=True)
            if getattr(e, 'code', 0) not in (404, 429, 500, 503) and not isinstance(e, TimeoutError): break
            time.sleep(2)
    raise last


def clean(d):
    out = {}
    for f in FIELDS:
        v = d.get(f)
        if v is None: continue
        v = re.sub(r'\s+', ' ', str(v)).strip(' .,-')
        if not v or v.lower() in ('null', 'none', 'n/a', 'na', 'not mentioned', 'not specified', '-') or 'उपलब्ध नहीं' in v or 'उल्लेख नहीं' in v: continue
        out[f] = v[:90]
    if 'official_site' in out:
        out['official_site'] = re.sub(r'^https?://', '', out['official_site']).split('/')[0].lower()
        if not re.match(r'^[a-z0-9.-]+\.[a-z]{2,}$', out['official_site']): out.pop('official_site')
    return out


def enrich(items, now):
    k = key()
    if not k: print('details: Gemini key nahi mili - skip'); return 0
    todo = [x for x in items if 'd' not in x and x.get('dtry', 0) < MAX_TRIES and now - x['ts'] <= 20 * 86400]
    todo.sort(key=lambda x: (0 if x.get('uni') else (1 if x.get('region') else 2), -x['ts']))
    done, t0 = 0, time.time()
    print('details: %d baaki, is run mein %d' % (len(todo), min(len(todo), MAX_PER_RUN)), flush=True)
    for x in todo[:MAX_PER_RUN]:
        if time.time() - t0 > BUDGET: print('details: samay khatam, baaki agle run mein', flush=True); break
        x['dtry'] = x.get('dtry', 0) + 1
        try:
            url = gnews_decode(x['link'])
            raw, final, ctype = get(url, timeout=20)
            pdf = raw if ('pdf' in ctype.lower() or final.lower().split('?')[0].endswith('.pdf')) else None
            if pdf and len(pdf) > 15 * 1024 * 1024: raise ValueError('PDF bahut bada')
            text = None if pdf else page_text(raw)
            if not pdf and len(text) < 300: raise ValueError('article mein text nahi')
            d = gemini(k, x['title'], text, pdf)
            x['durl'] = final
            if d.get('relevant') is False: x['d'] = {}; print('details: relevant nahi', x['title'][:60]); continue
            x['d'] = clean(d); done += 1
            print('details OK', len(x['d']), x['title'][:70], flush=True)
        except Exception as e:
            print('details ERR', x['title'][:60], '-', repr(e)[:160], flush=True)
        time.sleep(2)
    return done
