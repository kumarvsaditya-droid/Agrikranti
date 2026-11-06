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
