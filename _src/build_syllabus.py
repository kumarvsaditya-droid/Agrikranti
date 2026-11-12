"""Agrikranti - Syllabus PDF builder.
syllabus/data.json padhkar har exam ki bilingual PDF (syllabus/<id>.pdf) aur app ke liye syllabus/index.json banata hai.
Chalane ke liye: python3 _src/build_syllabus.py   (Playwright + Chrome + Hind / Noto Sans Devanagari font chahiye)"""
import json, os, html, base64, datetime, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SYL = ROOT / 'syllabus'
DATA = json.load(open(SYL / 'data.json', encoding='utf-8'))
LOGO = base64.b64encode((ROOT / 'icons' / 'logo.png').read_bytes()).decode()
FONTS = pathlib.Path.home() / '.fonts'
REGION = {'UP': 'उत्तर प्रदेश', 'Bihar': 'बिहार', 'Central': 'केंद्र / All India'}
e = lambda s: html.escape(str(s or ''))


def font_css():
    out = []
    for fam, f, w in [('Hind', 'Hind-Regular.ttf', 400), ('Hind', 'Hind-SemiBold.ttf', 600), ('Hind', 'Hind-Bold.ttf', 700)]:
        p = FONTS / f
        if p.exists():
            out.append("@font-face{font-family:'%s';src:url('file://%s');font-weight:%d}" % (fam, p, w))
    return '\n'.join(out)


def page(x, today):
    rows = ''.join('<tr><th>%s</th><td>%s</td></tr>' % (e(a), e(b)) for a, b in x['pattern'])
    secs = ''
    for s in x['sections']:
        li = ''.join('<li><span class="en">%s</span><span class="hi">%s</span></li>' % (e(en), e(hi)) for en, hi in s['topics'])
        secs += '<section><h3><span>%s<small>%s</small></span>%s</h3><ol>%s</ol></section>' % (
            e(s['name']), e(s['hi']), ('<b class="mk">%s</b>' % e(s['marks'])) if s.get('marks') else '', li)
    facts = [('संस्था / Body', x['body']), ('विज्ञापन / Advt.', x['advt']), ('पद / Posts', x['posts']), ('योग्यता / Eligibility', x['eligibility'])]
    if x.get('dates'): facts.append(('तिथियाँ / Dates', x['dates']))
    facts.append(('Official website', x['official']))
    fx = ''.join('<div><i>%s</i><b>%s</b></div>' % (e(a), e(b)) for a, b in facts)
    return """<!doctype html><html lang="hi"><head><meta charset="utf-8"><style>
%s
@page{size:A4;margin:14mm 13mm 16mm}
*{box-sizing:border-box}
body{font-family:'Hind','Noto Sans Devanagari',sans-serif;color:#1d2a1f;font-size:11.5pt;line-height:1.45;margin:0}
.hd{display:flex;align-items:center;gap:12px;background:#12321c;color:#fff;border-radius:10px;padding:12px 16px}
.hd img{width:54px;height:54px;border-radius:50%%;background:#fff}
.hd .t{flex:1}.hd b{font-size:12pt;letter-spacing:.5px}.hd .s{font-size:9.5pt;color:#f3d36b}
.tag{background:#f3d36b;color:#12321c;font-weight:700;border-radius:20px;padding:3px 12px;font-size:9.5pt;white-space:nowrap}
h1{font-size:19pt;margin:14px 0 0;line-height:1.2;color:#12321c}h2{font-size:14pt;margin:2px 0 10px;color:#8a6a00;font-weight:600}
.fx{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0 12px}.fx div{border:1px solid #d6dfd3;border-radius:8px;padding:6px 10px;background:#f6f9f4}
.fx i{display:block;font-style:normal;font-size:8.5pt;color:#5d6b5f}.fx b{font-size:10.5pt}
h4{margin:12px 0 6px;font-size:12.5pt;color:#12321c;border-left:4px solid #f3d36b;padding-left:8px}
table{width:100%%;border-collapse:collapse;font-size:10.5pt}th,td{border:1px solid #cbd6c8;padding:6px 9px;text-align:left;vertical-align:top}th{background:#e7efe4;width:30%%}
section{border:1px solid #d6dfd3;border-radius:10px;margin:10px 0;overflow:hidden}
h3{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0;background:#1f5f3a;color:#fff;padding:7px 12px;font-size:12pt}
h3 small{display:block;font-weight:400;color:#f3d36b;font-size:10pt}.mk{background:#f3d36b;color:#12321c;border-radius:14px;padding:2px 10px;font-size:9.5pt;white-space:nowrap}
ol{margin:6px 0 8px;padding-left:28px}li{margin:4px 0;padding-right:8px;break-inside:avoid}h3{break-after:avoid}.en{display:block}.hi{display:block;color:#5a4a00;font-size:10.5pt}
.note{margin-top:12px;border:1.5px dashed #c99a00;background:#fffaea;border-radius:10px;padding:8px 12px;font-size:9.5pt}
.ft{margin-top:12px;display:flex;justify-content:space-between;font-size:9pt;color:#5d6b5f;border-top:1px solid #d6dfd3;padding-top:6px}
</style></head><body>
<div class="hd"><img src="data:image/png;base64,%s"><div class="t"><b>AGRIKRANTI 1928</b><div class="s">Aditya Kumar · M.Sc. (Ag.) Soil Science, Gold Medalist</div></div><span class="tag">FREE SYLLABUS · %s</span></div>
<h1>%s</h1><h2>%s</h2>
<div class="fx">%s</div>
<h4>परीक्षा पैटर्न / Exam Pattern</h4><table>%s</table>
<h4>विस्तृत पाठ्यक्रम / Detailed Syllabus</h4>%s
<div class="note"><b>ध्यान दें:</b> यह syllabus आधिकारिक विज्ञापन और उपलब्ध स्रोतों से मिलाकर छात्रों की सुविधा के लिए संकलित है। आवेदन / परीक्षा से पहले %s पर जारी आधिकारिक विज्ञापन से मिलान ज़रूर करें। आयोग पैटर्न बदल सकता है।</div>
<div class="ft"><span>Agrikranti App - free syllabus, share करें</span><span>अपडेट: %s</span></div>
</body></html>""" % (font_css(), LOGO, e(REGION.get(x['region'], x['region'])), e(x['title']), e(x['hi']), fx, rows, secs, e(x['official']), today)


def main():
    today = datetime.date.today().strftime('%d-%m-%Y')
    index = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        pg = b.new_page()
        for x in DATA['exams']:
            pg.set_content(page(x, today), wait_until='load')
            pg.evaluate('document.fonts.ready')
            out = SYL / (x['id'] + '.pdf')
            pg.pdf(path=str(out), format='A4', print_background=True, display_header_footer=True, header_template='<span></span>',
                   footer_template='<div style="font-size:8px;width:100%;text-align:center;color:#888"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
                   margin={'top': '14mm', 'bottom': '16mm', 'left': '13mm', 'right': '13mm'})
            print('PDF', out.name, out.stat().st_size // 1024, 'KB')
            index.append({k: x.get(k, '') for k in ('id', 'title', 'hi', 'body', 'region', 'year', 'posts', 'advt', 'official', 'match')}
                         | {'pdf': 'syllabus/%s.pdf' % x['id'], 'sections': [s['name'] for s in x['sections']], 'updated': today})
        b.close()
    json.dump({'updated': today, 'count': len(index), 'items': index}, open(SYL / 'index.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('index.json', len(index), 'exams')


if __name__ == '__main__':
    main()
