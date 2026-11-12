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
    for q, lang in CFG['queries']:
        try: res = fetch(q, lang)
        except Exception as e: errs += 1; print('ERR', q, e); continue
        for x in res:
            t = x['title']
            if now - x['ts'] > MAX_DAYS * 86400 or not AGRI.search(t) or not JOB.search(t) or BAD.search(t): continue
            k = norm(t)
            if not k or k in seen: continue
            seen.add(k); i = hashlib.md5(k.encode()).hexdigest()[:10]
            items.append({'id': i, 'title': t[:180], 'link': x['link'], 'source': x['source'][:40], 'ts': x['ts'], 'tag': tag(t), 'region': region(t), 'added': old.get(i, {}).get('added', now)})
        time.sleep(1)
    if errs == len(CFG['queries']): raise SystemExit('sab queries fail - jobs.json nahi badla')
    for i, x in old.items():   # purani (abhi bhi 30 din ke andar) khabrein bhi rakhein
        if i not in {y['id'] for y in items} and now - x['ts'] <= MAX_DAYS * 86400 and norm(x['title']) not in seen: items.append(x)
    items.sort(key=lambda x: x['ts'], reverse=True)
    pri = [x for x in items if x.get('region')]; rest = [x for x in items if not x.get('region')]
    items = (pri[:50] + rest)[:KEEP]   # UP/Bihar wali khabrein pehle
    new = {'updated': now, 'count': len(items), 'items': items}
    prev = None
    try: prev = json.load(open(OUT, encoding='utf-8'))
    except Exception: pass
    if prev and [x['id'] for x in prev.get('items', [])] == [x['id'] for x in items]:
        print('koi nayi khabar nahi'); return
    json.dump(new, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('jobs.json:', len(items), 'khabrein,', len([x for x in items if x['id'] not in old]), 'nayi')

if __name__ == '__main__': main()
