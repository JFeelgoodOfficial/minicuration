"""
Phase 10 — Static verification
Checks canonicals, internal links, required meta tags, and JSON-LD presence
across all HTML files in the repo.
Run: python3 scripts/verify.py
"""
import os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
BASE = 'https://minicuration.com'
ERRORS = []
WARNS  = []

def err(f, msg):  ERRORS.append(f'ERROR  {f}: {msg}')
def warn(f, msg): WARNS.append(f'WARN   {f}: {msg}')

html_files = []
for dirpath, _, files in os.walk(ROOT):
    if any(skip in dirpath for skip in ['.git', 'scripts', 'node_modules']):
        continue
    for f in files:
        if f.endswith('.html'):
            html_files.append(os.path.join(dirpath, f))

html_files.sort()

# Build set of all .html paths relative to root (normalised with forward slashes)
all_html_rel = set()
for p in html_files:
    rel = os.path.relpath(p, ROOT).replace('\\', '/')
    all_html_rel.add(rel)

def rel_path(filepath):
    return os.path.relpath(filepath, ROOT).replace('\\', '/')

for filepath in html_files:
    rel = rel_path(filepath)
    with open(filepath, encoding='utf-8') as f:
        src = f.read()

    # 1. canonical present
    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', src)
    if not canonical:
        err(rel, 'missing canonical')
    else:
        canon_url = canonical.group(1)
        if not canon_url.startswith(BASE):
            err(rel, f'canonical not absolute: {canon_url}')

    # 2. title present and not empty
    title = re.search(r'<title>(.+?)</title>', src)
    if not title:
        err(rel, 'missing <title>')
    elif len(title.group(1)) > 70:
        warn(rel, f'title {len(title.group(1))} chars (>70): {title.group(1)[:60]}…')

    # 3. meta description
    if not re.search(r'<meta name="description"', src):
        err(rel, 'missing meta description')

    # 4. OG tags
    for og in ['og:title', 'og:description', 'og:image', 'og:url']:
        if f'property="{og}"' not in src:
            warn(rel, f'missing {og}')

    # 5. JSON-LD
    if 'application/ld+json' not in src:
        warn(rel, 'no JSON-LD found')

    # 6. Internal links resolve
    links = re.findall(r'href="([^"#]+\.html)"', src)
    file_dir = os.path.dirname(filepath)
    for link in links:
        if link.startswith('http'):
            continue
        target = os.path.normpath(os.path.join(file_dir, link))
        target_rel = os.path.relpath(target, ROOT).replace('\\', '/')
        if target_rel not in all_html_rel:
            err(rel, f'broken internal link: {link}')

    # 7. Images have alt text
    imgs = re.findall(r'<img [^>]+>', src)
    for img in imgs:
        if 'alt=""' in img or 'alt= ' in img or 'alt=' not in img:
            warn(rel, f'image missing/empty alt: {img[:80]}')

print(f'Checked {len(html_files)} HTML files\n')
for line in ERRORS: print(line)
for line in WARNS:  print(line)
if not ERRORS and not WARNS:
    print('All checks passed.')
elif not ERRORS:
    print(f'\n{len(WARNS)} warnings, 0 errors.')
else:
    print(f'\n{len(ERRORS)} errors, {len(WARNS)} warnings.')
    sys.exit(1)
