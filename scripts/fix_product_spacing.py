"""Push product page images down so they clear the fixed nav comfortably."""
import os, glob

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

replacements = [
    # breadcrumb top padding: 100px → 140px
    ('padding:100px 48px 0;', 'padding:140px 48px 0;'),
    # product section top padding: 40px → 60px
    ('padding:40px 48px 100px;', 'padding:60px 48px 100px;'),
    # sticky top offset: 100px → 120px
    ('position:sticky;top:100px;}', 'position:sticky;top:120px;}'),
    # mobile breadcrumb: 90px → 110px
    ('.breadcrumb{padding:90px 20px 0;}', '.breadcrumb{padding:110px 20px 0;}'),
    # mobile product top padding: 24px → 36px
    ('padding:24px 20px 60px;}', 'padding:36px 20px 60px;}'),
]

files = glob.glob(os.path.join(ROOT, 'shop', '*.html'))

for path in sorted(files):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    changed = 0
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            changed += 1
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'{os.path.basename(path)}: {changed} replacements')
