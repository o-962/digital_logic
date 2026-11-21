"""Cache busting for the website: no stale JS / CSS / data is ever used by the browser.

What it does, every time you run it:
  1. computes a short fingerprint (hash) of every .js and .css file;
  2. rewrites every <script src> / <link href> in index.html and pages/*.html to  file.js?v=<fingerprint>
     (a changed file gets a new fingerprint, so the browser must download the new copy);
  3. makes sure every HTML page tells the browser not to cache the page itself.

Run:  python no_cache.py      (or double-click no_cache.bat)
It is also run automatically by the export script after the site is regenerated.
"""
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
META = ('<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n'
        '<meta http-equiv="Pragma" content="no-cache">\n'
        '<meta http-equiv="Expires" content="0">\n')


def fingerprint(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


def bust(html_path):
    base = os.path.dirname(html_path)
    with open(html_path, encoding="utf8") as f:
        html = f.read()
    changed = 0

    def repl(m):
        nonlocal changed
        attr, url = m.group(1), m.group(2)
        clean = url.split("?")[0]
        target = os.path.normpath(os.path.join(base, clean))
        if not os.path.exists(target):
            return m.group(0)
        changed += 1
        return f'{attr}="{clean}?v={fingerprint(target)}"'

    # only local .js / .css references
    html = re.sub(r'(src|href)="((?!https?:)[^"]+\.(?:js|css)(?:\?[^"]*)?)"', repl, html)
    if 'http-equiv="Cache-Control"' not in html:
        html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + META.rstrip("\n"), 1)
    with open(html_path, "w", encoding="utf8") as f:
        f.write(html)
    return changed


def main():
    pages = [os.path.join(ROOT, "index.html")]
    pdir = os.path.join(ROOT, "pages")
    if os.path.isdir(pdir):
        pages += [os.path.join(pdir, f) for f in sorted(os.listdir(pdir)) if f.endswith(".html")]
    total = sum(bust(p) for p in pages if os.path.exists(p))
    print(f"no_cache: {len(pages)} pages, {total} file links refreshed")


if __name__ == "__main__":
    main()
