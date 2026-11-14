"""Agrikranti - Agriculture sarkari job alerts (auto). GitHub Actions har 3 ghante chalata hai.
Google News RSS se khabrein -> agriculture + job shabdon se filter -> jobs.json (app ka bell / Exam Updates)."""
import json, re, time, hashlib, os, html
import urllib.request, urllib.parse
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
OUT = os.path.join(HERE, '..', 'jobs.json')
AGRI = re.compile(CFG['agri_regex'], re.I)
JOB = re.compile(CFG['job_regex'], re.I)
BAD = re.compile(CFG['exclude_regex'], re.I)
REG = [(k, re.compile(r, re.I)) for k, r in CFG.get('regions', [])]
MAX_DAYS, KEEP = CFG.get('max_days', 30), CFG.get('keep', 80)
UNIS = [(k, re.compile(r, re.I)) for k, r in CFG.get('universities', [])]
UTOPIC = re.compile(CFG.get('uni_topic_regex', CFG['agri_regex']), re.I)
UJOB = re.compile(CFG.get('uni_job_regex', CFG['job_regex']), re.I)
AGRI_UNI = set(CFG.get('agri_universities', []))
BLOCKED = CFG.get('blocked_sources', [])

def uni(t):
    for k, rx in UNIS:
        if rx.search(t): return k
    return ''

def accept(t, src):
    """('uni naam' ya '') lautata hai agar khabar rakhni hai, warna None."""
    if BAD.search(t) or src in BLOCKED: return None
    u = uni(t)
    if u and (u in AGRI_UNI or UTOPIC.search(t)) and UJOB.search(t): return u   # Gorakhpur kshetra ki university (agriculture)
    if AGRI.search(t) and JOB.search(t): return ''
    return None

def tag(t):
    for k, rx in CFG['tags']:
        if re.search(rx, t, re.I): return k
    return 'Update'

def fetch(q, lang):
    hl, gl, ceid = ('hi', 'IN', 'IN:hi') if lang == 'hi' else ('en-IN', 'IN', 'IN:en')
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q': q + ' when:30d', 'hl': hl, 'gl': gl, 'ceid': ceid})
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (AgrikrantiJobAlerts)'})
    with urllib.request.urlopen(req, timeout=25) as r: data = r.read()
    out = []
    for it in ET.fromstring(data).iter('item'):
        title = html.unescape((it.findtext('title') or '').strip())
        src = (it.findtext('source') or '').strip()
        if src and title.endswith(' - ' + src): title = title[: -len(src) - 3].strip()
        try: ts = int(parsedate_to_datetime(it.findtext('pubDate')).timestamp())
        except Exception: ts = int(time.time())
        out.append({'title': title, 'link': (it.findtext('link') or '').strip(), 'source': src, 'ts': ts})
    return out

def official(label, url, mode, seen_before):
    """University ki official website se agriculture notice ke link (PDF/notice). Date file-naam se, warna pehli baar dikhne ka samay."""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (AgrikrantiJobAlerts)'})
    with urllib.request.urlopen(req, timeout=25) as r: page = r.read().decode('utf-8', 'ignore')
    skip, now, out = re.compile(CFG.get('official_skip_regex', 'tender'), re.I), int(time.time()), []
    allh = []
    for href, txt in re.findall(r'<a\b[^>]*?href\s*=\s*["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', page, re.I | re.S):
        txt = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', txt))).strip()
        link = urllib.parse.urljoin(url, html.unescape(href.strip()))
        lh = hashlib.md5(link.encode()).hexdigest()[:10]; allh.append(lh)
        new_link = lh not in seen_before
        fname = urllib.parse.unquote(link.rsplit('/', 1)[-1])
        if not txt or len(txt) < 8 or txt.lower() in ('click here', 'download', 'view', 'read more', 'more'):
            txt = re.sub(r'(?i)\.(pdf|jpe?g|png|docx?)$', '', fname).replace('-', ' ').replace('_', ' ').strip()
        txt = re.sub(r'^[^0-9A-Za-zऀ-ॿ]+', '', txt).strip()   # ⦿ 🔵 jaise nishan hatao
        txt = re.sub(r'\s*\[[\d.,]+\s*[KM]B\]\s*(Language:\s*\w+)?', '', txt, flags=re.I).strip()
        both = txt + ' ' + fname
        if len(txt) < 6 or skip.search(txt) or skip.search(fname) or BAD.search(txt): continue
        if not link.lower().split('?')[0].endswith(('.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png')) and len(txt) < 35: continue   # menu ke chhote link nahi
        if mode == 'agri' and not UTOPIC.search(both): continue
        if mode == 'job' and not UJOB.search(both): continue
        m = re.search(r'(?<!\d)(\d{2})(\d{2})(\d{4}|\d{2})(?!\d)', fname)
        ts = None
        if m:
            d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3)); y += 2000 if y < 100 else 0
            try:
                import datetime; ts = int(datetime.datetime(y, mo, d, 12).timestamp())
                if ts > now + 86400 or y < 2020: ts = None
            except ValueError: ts = None
        if ts is None:   # text mein likhi taareekh (31/07/2026) - sabse nayi wali
            ds = []
            for a, b, cc in re.findall(r'(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](20\d{2})(?!\d)', txt):
                try:
                    import datetime; v = int(datetime.datetime(int(cc), int(b), int(a), 12).timestamp())
                    if v <= now + 86400: ds.append(v)
                except ValueError: pass
            if ds: ts = max(ds)
        if ts is None: ts = now if (seen_before and new_link) else now - 10 * 86400   # pehli baar: purane maan lo (NEW na dikhe)
        if txt.replace(' ', '') in fname.replace('-', '').replace('_', '').replace('.pdf', '').replace('.PDF', ''):   # naam file se bana: saaf karein
            txt = re.sub(r'(?<!\d)\d{6,8}(?!\d)', '', re.sub(r'(?i)\.(pdf|jpe?g|png|docx?)$', '', txt))
            txt = re.sub(r'(?i)\bM\.?Sc\.?\s*AG\b', 'M.Sc. (Ag.)', re.sub(r'(?i)\bB\.?Sc\.?\s*AG\b', 'B.Sc. (Ag.)', txt)).strip()
            txt = txt + ' - नई सूचना' + (time.strftime(' (%d-%m-%Y)', time.localtime(ts)) if m else '')
        title = (label + ': ' + txt)[:180]
        out.append({'title': title, 'link': link, 'source': label + ' (Official)', 'ts': ts, 'uni': label})
    return out[:15], allh

def region(t):
    for k, rx in REG:
        if rx.search(t): return k
    return ''

def norm(t): return re.sub(r'[^0-9a-zऀ-ॿ]+', '', t.lower())[:70]

def main():
    old = {}
    try:
        for x in json.load(open(OUT, encoding='utf-8')).get('items', []): old[x['id']] = x
    except Exception: pass
    now, seen, items, errs = int(time.time()), set(), [], 0
    allq = CFG['queries'] + CFG.get('uni_queries', [])
    for q, lang in allq:
        try: res = fetch(q, lang)
        except Exception as e: errs += 1; print('ERR', q, e); continue
        for x in res:
            t = x['title']
            u = accept(t, x['source'])
            if now - x['ts'] > MAX_DAYS * 86400 or u is None: continue
            k = norm(t)
            if not k or k in seen: continue
            seen.add(k); i = hashlib.md5(k.encode()).hexdigest()[:10]
            items.append({'id': i, 'title': t[:180], 'link': x['link'], 'source': x['source'][:40], 'ts': x['ts'], 'tag': tag(t), 'region': region(t) or ('Bihar' if u == 'RPCAU Pusa' else ('UP' if u else '')), 'uni': u, 'added': old.get(i, {}).get('added', now)})
        time.sleep(1)
    pages_seen = {}
    try: pages_seen = json.load(open(OUT, encoding='utf-8')).get('pages_seen', {})
    except Exception: pass
    new_seen, failed = {}, set()
    for label, url, mode in CFG.get('official_pages', []):
        try: res, allh = official(label, url, mode, set(pages_seen.get(url, [])))
        except Exception as e: print('ERR official', url, e); new_seen[url] = pages_seen.get(url, []); failed.add(label); continue
        prev = set(pages_seen.get(url, []))
        hs = []
        for x in res:
            h = hashlib.md5(x['link'].encode()).hexdigest()[:10]; hs.append(h)
            k = norm(x['title'])
            if now - x['ts'] > MAX_DAYS * 86400 or k in seen: continue
            seen.add(k)
            o = old.get(h, {})
            items.append({'id': h, 'title': x['title'], 'link': x['link'], 'source': x['source'][:40], 'ts': o.get('ts', x['ts']), 'tag': tag(x['title']), 'region': 'Bihar' if label == 'RPCAU Pusa' else 'UP', 'uni': label, 'added': o.get('added', now)})
        new_seen[url] = sorted(set(allh) | prev)[:2000]
        time.sleep(1)
    if errs == len(allq): raise SystemExit('sab queries fail - jobs.json nahi badla')
    for i, x in old.items():
        if x.get('source', '').endswith('(Official)'):   # official notice: sirf tab rakhein jab us site tak pahunch na paye ho
            if x.get('uni') in failed and not re.search(CFG.get('official_skip_regex', 'tender'), x['title'].split(': ', 1)[-1].lstrip('⦿🔵 '), re.I) and i not in {y['id'] for y in items} and now - x['ts'] <= MAX_DAYS * 86400 and norm(x['title']) not in seen: items.append(x)
            continue
    for i, x in old.items():   # purani (abhi bhi 30 din ke andar) khabrein bhi rakhein
        if i not in {y['id'] for y in items} and now - x['ts'] <= MAX_DAYS * 86400 and norm(x['title']) not in seen and not x.get('source', '').endswith('(Official)') and accept(x['title'], x.get('source', '')) is not None: items.append(x)
    items.sort(key=lambda x: x['ts'], reverse=True)
    un = [x for x in items if x.get('uni')]
    pri = [x for x in items if x.get('region') and not x.get('uni')]; rest = [x for x in items if not x.get('region') and not x.get('uni')]
    items = (un[:CFG.get('uni_keep', 30)] + pri[:50] + rest)[:KEEP]   # pehle Gorakhpur kshetra ki university, phir UP/Bihar
    for x in items:   # pehle nikali details (AI) wapas jodo
        o = old.get(x['id'])
        if o:
            for f in ('d', 'dtry', 'durl'):
                if f in o and f not in x: x[f] = o[f]
    try:
        import details; details.enrich(items, now)
    except Exception as e: print('details module ERR', e)
    new = {'updated': now, 'count': len(items), 'items': items, 'pages_seen': new_seen}
    prev = None
    try: prev = json.load(open(OUT, encoding='utf-8'))
    except Exception: pass
    sig = lambda L: [(x['id'], x.get('d'), x.get('dtry')) for x in L]
    if prev and sig(prev.get('items', [])) == sig(items) and prev.get('pages_seen', {}) == new_seen:
        print('koi nayi khabar nahi'); return
    json.dump(new, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('jobs.json:', len(items), 'khabrein,', len([x for x in items if x['id'] not in old]), 'nayi')

if __name__ == '__main__': main()
