# Agrikranti app - maintainer notes

- Live site: https://kumarvsaditya-droid.github.io/Agrikranti/ (GitHub Pages, served from branch `gh-pages`; keep `main` and `gh-pages` identical)
- `index.html` - poora app (CONFIG aur EBOOKS upar script mein)
- `tests.js` - auto-generated; kabhi haath se edit na karein. `_src/questions/tNN.txt` badlein, phir `python3 _src/build_tests.py`
- `ebooks/` - sirf FREE PDFs. Paid PDF kabhi commit na karein (repo public hai); paid book Telegram par di jaati hai.
- `sw.js` - offline cache; har release par `CACHE = 'agrikranti-vN'` badhayein taaki phone naya version le.

## Admin panel (admin.html) - added 6 Nov 2026
- Live URL: https://kumarvsaditya-droid.github.io/Agrikranti/admin.html (GitHub fine-grained token, Contents read/write on Agrikranti only).
- Admin writes content.json (links, notice, ebooks, semester papers) and tests.js directly to BOTH main and gh-pages.
- tests.js may now be edited from admin, so it is the source of truth. ALWAYS `git pull` first; when changing tests, edit tests.js JSON (or rebuild from _src only after merging admin edits back).
- App reads content.json at start (falls back to defaults in index.html).
- Stats: abacus.jasoncameron.dev namespace agrikranti1928-app, keys users/installs/opens/tests-submitted/pdf-opens/buy-clicks/day-YYYY-MM-DD.

## Payment v5 (13 Nov 2026)
- App calls `action:'mine'` (mobile + device + pending order ids) on start, login, eBooks/Semester open. Server returns `{ok, books:{id:key}}` for every book bought on that mobile, so books open on any phone with no code.
- Server v5 reads price/title from content.json (any new paid book works without editing the script). Key = OLD_KEYS[id] or MASTER_KEY (admin uploads new paid PDFs with master key).
- Server also checks unpaid/unverified orders on Razorpay and scans the last 60 days of paid orders for that mobile, so "paid but not opened" fixes itself.
- Max 4 devices per buyer (Sheet "Devices", delete row to reset). Template here has placeholders; the filled PRIVATE copy is only with Aditya.
- Reader: if saved key fails, app fetches fresh key via `mine` and reopens.
