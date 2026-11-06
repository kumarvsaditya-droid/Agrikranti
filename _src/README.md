# Agrikranti app - maintainer notes

- Live site: https://kumarvsaditya-droid.github.io/Agrikranti/ (GitHub Pages, served from branch `gh-pages`; keep `main` and `gh-pages` identical)
- `index.html` - poora app (CONFIG aur EBOOKS upar script mein)
- `tests.js` - auto-generated; kabhi haath se edit na karein. `_src/questions/tNN.txt` badlein, phir `python3 _src/build_tests.py`
- `ebooks/` - sirf FREE PDFs. Paid PDF kabhi commit na karein (repo public hai); paid book Telegram par di jaati hai.
- `sw.js` - offline cache; har release par `CACHE = 'agrikranti-vN'` badhayein taaki phone naya version le.
