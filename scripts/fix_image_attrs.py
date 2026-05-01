"""Remove width/height HTML attributes added in Phase 6 from index.html and shop.html.
Keeps loading, decoding, fetchpriority, alt, src, onerror untouched.
"""
import re, os

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

def strip_dim_attrs(content):
    # Remove width="..." and height="..." from <img> tags only
    def clean_img(m):
        tag = m.group(0)
        tag = re.sub(r'\s+width="[^"]*"', '', tag)
        tag = re.sub(r'\s+height="[^"]*"', '', tag)
        return tag
    return re.sub(r'<img\b[^>]+>', clean_img, content)

for fname in ['index.html', 'shop.html']:
    path = os.path.join(ROOT, fname)
    with open(path, 'r', encoding='utf-8') as f:
        before = f.read()
    after = strip_dim_attrs(before)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(after)
    changed = before.count('width=') - after.count('width=')
    print(f'{fname}: removed {changed} width/height pairs')
