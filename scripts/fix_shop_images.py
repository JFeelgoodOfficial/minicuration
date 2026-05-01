import re

path = r'C:\Users\john\Desktop\minicuration-site\shop.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# First card front image gets fetchpriority=high (LCP candidate)
content = content.replace(
    'alt="Dreamfall front" onerror=',
    'alt="Dreamfall by JFeelgood — limited edition art print" width="600" height="600" fetchpriority="high" decoding="async" onerror='
)

# All remaining onerror img tags get lazy loading + dimensions
def add_attrs(m):
    tag = m.group(0)
    if 'width=' in tag or 'fetchpriority' in tag:
        return tag
    return tag.replace('/>', ' width="600" height="600" loading="lazy" decoding="async"/>')

content = re.sub(r'<img src="image/[^"]+" alt="[^"]+" onerror="[^"]+"/>', add_attrs, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
