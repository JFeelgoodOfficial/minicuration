import re, os, glob

shop_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shop')
files = glob.glob(os.path.join(shop_dir, '*.html'))

for path in sorted(files):
    with open(path, 'r', encoding='utf-8') as f:
        before = f.read()
    after = re.sub(r'\s+width="[^"]*"', '', before)
    after = re.sub(r'\s+height="[^"]*"', '', after)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(after)
    removed = before.count(' width=') - after.count(' width=')
    print(f'{os.path.basename(path)}: removed {removed} width/height pairs')
