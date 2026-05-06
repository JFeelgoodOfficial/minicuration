const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOP_DIR = path.join(ROOT, 'shop');

// Maps old _case.jpg name to new case1/case2 webp names
const PRODUCTS = [
  { old: 'dreamfall',         prefix: 'dreamfall',         alt1: 'Dreamfall by JFeelgood — in magnetic acrylic collector\'s case',         alt2: 'Dreamfall by JFeelgood — collector\'s case, alternate view' },
  { old: 'dreammountain',     prefix: 'dreammountain',     alt1: 'Dream Mountain by JFeelgood — in magnetic acrylic collector\'s case',     alt2: 'Dream Mountain by JFeelgood — collector\'s case, alternate view' },
  { old: 'skymiles',          prefix: 'skymiles',          alt1: 'Sky Miles by JFeelgood — in magnetic acrylic collector\'s case',          alt2: 'Sky Miles by JFeelgood — collector\'s case, alternate view' },
  { old: 'pooh',              prefix: 'pooh',              alt1: 'Pooh. by JFeelgood — in magnetic acrylic collector\'s case',              alt2: 'Pooh. by JFeelgood — collector\'s case, alternate view' },
  { old: 'asimplemeditation', prefix: 'asimplemeditation', alt1: 'A Simple Meditation by JFeelgood — in magnetic acrylic collector\'s case', alt2: 'A Simple Meditation by JFeelgood — collector\'s case, alternate view' },
  { old: 'sisters',           prefix: 'sisters',           alt1: 'Sisters by JFeelgood — in magnetic acrylic collector\'s case',           alt2: 'Sisters by JFeelgood — collector\'s case, alternate view' },
  { old: 'sentiments',        prefix: 'sentiments',        alt1: 'Sentiments by JFeelgood — in magnetic acrylic collector\'s case',        alt2: 'Sentiments by JFeelgood — collector\'s case, alternate view' },
  { old: 'transcend',         prefix: 'transcend',         alt1: 'Transcend by JFeelgood — in magnetic acrylic collector\'s case',         alt2: 'Transcend by JFeelgood — collector\'s case, alternate view' },
  { old: 'veritas',           prefix: 'veritas',           alt1: 'Veritas by JFeelgood — in magnetic acrylic collector\'s case',           alt2: 'Veritas by JFeelgood — collector\'s case, alternate view' },
  { old: 'serenade',          prefix: 'serenade',          alt1: 'Serenade by JFeelgood — in magnetic acrylic collector\'s case',          alt2: 'Serenade by JFeelgood — collector\'s case, alternate view' },
  { old: 'worththetrip',      prefix: 'worththetrip',      alt1: 'Worth The Trip by JFeelgood — in magnetic acrylic collector\'s case',    alt2: 'Worth The Trip by JFeelgood — collector\'s case, alternate view' },
  { old: 'vicarious',         prefix: 'vicarious',         alt1: 'Vicarious by JFeelgood — in magnetic acrylic collector\'s case',         alt2: 'Vicarious by JFeelgood — collector\'s case, alternate view' },
  { old: 'crowned',           prefix: 'crowned',           alt1: 'Crowned by JFeelgood — in magnetic acrylic collector\'s case',           alt2: 'Crowned by JFeelgood — collector\'s case, alternate view' },
  { old: 'sweetdreams',       prefix: 'sweetdreams',       alt1: 'Sweet Dreams by JFeelgood — in magnetic acrylic collector\'s case',      alt2: 'Sweet Dreams by JFeelgood — collector\'s case, alternate view' },
];

function updateProductPage(file, product) {
  let html = fs.readFileSync(file, 'utf8');

  // Fix preload link
  html = html.replace(
    /href="\.\.\/image\/[^"]*_case\.jpg"/,
    `href="../image/${product.prefix}-case1.webp"`
  );

  // Replace main product-images section (single wrap → two wraps)
  const mainImgRegex = new RegExp(
    `(<div class="product-images">\\s*)<div class="product-image-wrap">\\s*<img[^>]*fetchpriority="high"[^>]*/>\\s*</div>(\\s*</div>)`
  );
  const twoWraps =
    `$1<div class="product-image-wrap">\n        <img src="../image/${product.prefix}-case1.webp" alt="${product.alt1}" fetchpriority="high" decoding="async"/>\n      </div>\n      <div class="product-image-wrap">\n        <img src="../image/${product.prefix}-case2.webp" alt="${product.alt2}" loading="lazy" decoding="async"/>\n      </div>$2`;
  html = html.replace(mainImgRegex, twoWraps);

  // Replace _case.jpg refs in more-from-collection with -case1.webp
  for (const p of PRODUCTS) {
    html = html.replace(new RegExp(`\\.\\./image/${p.old}_case\\.jpg`, 'g'), `../image/${p.prefix}-case1.webp`);
  }
  // Also fix veritas.webp → veritas-case1.webp in more sections
  html = html.replace(/\.\.\/image\/veritas\.webp/g, '../image/veritas-case1.webp');

  fs.writeFileSync(file, html, 'utf8');
  console.log(`updated ${path.basename(file)}`);
}

// Map page filenames to product prefixes
const PAGE_MAP = {
  'dreamfall.html':           'dreamfall',
  'dream-mountain.html':      'dreammountain',
  'sky-miles.html':           'skymiles',
  'pooh.html':                'pooh',
  'a-simple-meditation.html': 'asimplemeditation',
  'sisters.html':             'sisters',
  'sentiments.html':          'sentiments',
  'transcend.html':           'transcend',
  'veritas.html':             'veritas',
  'serenade.html':            'serenade',
  'worth-the-trip.html':      'worththetrip',
  'vicarious.html':           'vicarious',
  'crowned.html':             'crowned',
  'sweet-dreams.html':        'sweetdreams',
};

for (const [filename, prefix] of Object.entries(PAGE_MAP)) {
  const product = PRODUCTS.find(p => p.prefix === prefix);
  updateProductPage(path.join(SHOP_DIR, filename), product);
}

// Update shop.html spin images: .jpg → .webp, .png → .webp (only in image/spin/ paths)
const shopFile = path.join(ROOT, 'shop.html');
let shopHtml = fs.readFileSync(shopFile, 'utf8');
shopHtml = shopHtml.replace(/(image\/spin\/[^\s"]+)\.(jpg|jpeg|png)/gi, '$1.webp');
fs.writeFileSync(shopFile, shopHtml, 'utf8');
console.log('updated shop.html spin images');
