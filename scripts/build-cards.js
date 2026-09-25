#!/usr/bin/env node
'use strict'
// Writes everything the cart-sold cards need from api/_catalog.js:
//
//   shop/<slug>.html     one product page per card
//   shop.html            the card grids between the <!-- cards:… --> markers
//   sitemap.xml          the card URLs between the <!-- cards:sitemap --> markers
//   js/catalog-data.js   titles, prices and pictures for js/cart.js
//
// The card images themselves (image/cards/<slug>-front.webp and -back.webp)
// are rendered from the Minicuration card designs and committed as files.
//
//   node scripts/build-cards.js

const fs = require('fs')
const path = require('path')
const { CARDS, ADDONS, CASE, STAND, PRICES, BUNDLE, SHIPPING } = require('../api/_catalog.js')
const { PRODUCT_NAMES, SIX_PACK_SLUGS } = require('../api/_constants.js')

const ROOT = path.join(__dirname, '..')
const SITE = 'https://minicuration.com'
const TODAY = new Date().toISOString().slice(0, 10)

const esc = (s) => String(s).replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const money = (cents) => '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100))
const decimal = (cents) => (cents / 100).toFixed(2)
const json = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c')

const isLimited = (c) => c.kind === 'limited'
const kindLabel = (c) => (isLimited(c) ? 'Limited Edition' : 'Open Edition')
const front = (c) => `image/cards/${c.slug}-front.webp`
const back = (c) => `image/cards/${c.slug}-back.webp`
// Wide paintings get a landscape front; every back is portrait.
const dims = (c) => (c.wide ? 'width="816" height="600"' : 'width="600" height="816"')
const backDims = 'width="600" height="816"'
const BUNDLE_PRICE = BUNDLE.size * PRICES.open.price - BUNDLE.discount
const bundleOffer = () => `Buy ${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)} (save ${money(BUNDLE.discount)} &amp; it's free shipping!)`
const medium = (c) => (isLimited(c) ? c.medium : c.material ? `${c.material} · Open edition` : 'Open edition')

function faqs(c) {
  const returns = {
    q: 'Can I return it?',
    a: 'Yes. Contact us within 14 days of delivery: if you are not satisfied, return the print unopened for a refund; if it arrives damaged, we will send a replacement at no charge. Full details at minicuration.com/policies.html.',
  }
  const size = {
    q: 'What size is the print?',
    a: '2.5 x 3.5 inches, the ACEO standard, identical in size to a trading card.',
  }
  if (isLimited(c)) {
    return [
      { q: 'What comes in the box?', a: 'Your print arrives sealed in a magnetic acrylic collector\'s case with a matching display stand. The card back carries the artist\'s statement, the edition number, and the medium used.' },
      { q: 'Is this print numbered?', a: 'Yes. Each print is individually numbered on the card back, for example 07 of 50. When the edition of 50 is gone, it is never reprinted.' },
      size,
      returns,
    ]
  }
  return [
    { q: 'What does it come in?', a: `Every unlimited card ships in a protective plastic slip. You can add a magnetically sealed acrylic case for ${money(CASE.price)} and an acrylic display stand for ${money(STAND.price)}.` },
    { q: 'Is this card numbered?', a: 'No. Unlimited cards are an open edition: they are not numbered and they stay available. The back carries the painting\'s title, the artist\'s name and minicuration.com.' },
    { q: 'How does the bundle work?', a: `Buy ${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)}, mixed however you like: that saves ${money(BUNDLE.discount)}, and the order ships free. Every further ${BUNDLE.size} saves another ${money(BUNDLE.discount)}, so ${BUNDLE.size * 2} are ${money(2 * BUNDLE_PRICE)}.` },
    size,
    returns,
  ]
}

function priceHtml(c) {
  return c.was
    ? `${money(c.price)} <s class="price-was"><span class="sr-only">regular price </span>${money(c.was)}</s>`
    : money(c.price)
}

function nav(prefix) {
  return `  <nav aria-label="Main">
    <a href="${prefix}index.html" class="nav-logo">minicuration</a>
    <button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <ul class="nav-links">
      <li><a href="${prefix}shop.html">Shop</a></li>
      <li><a href="${prefix}about.html">About</a></li>
      <li><a href="${prefix}journal.html">Journal</a></li>
      <li><a href="${prefix}cart.html" class="nav-cart">Cart<span data-cart-count></span></a></li>
      <li><a href="${prefix}shop.html" class="nav-cta">Shop Prints</a></li>
    </ul>
  </nav>`
}

function footer(prefix) {
  return `  <footer>
    <a href="${prefix}index.html" class="footer-logo">minicuration</a>
    <ul class="footer-links">
      <li><a href="${prefix}shop.html">Shop</a></li>
      <li><a href="${prefix}about.html">About</a></li>
      <li><a href="${prefix}journal.html">Journal</a></li>
      <li><a href="${prefix}policies.html">Policies</a></li>
      <li><a href="https://jfeelgood.com" target="_blank" rel="noopener">jfeelgood.com</a></li>
    </ul>
    <span class="footer-copy">&copy; 2026 Minicuration. All rights reserved.</span>
  </footer>`
}

function productPage(c, i, list) {
  const url = `${SITE}/shop/${c.slug}.html`
  const title = `${c.title} by JFeelgood — ${kindLabel(c)} Mini Art Print`
  const description = isLimited(c)
    ? `${c.title} by JFeelgood. ${c.medium}. Limited edition ACEO art card, one of 50 numbered prints, sealed in a magnetic acrylic collector's case. ${money(c.price)}.`
    : `${c.title} by JFeelgood. Unlimited open-edition ACEO art card, 2.5 x 3.5 in, in a protective plastic slip. ${money(c.price)} (regularly ${money(c.was)}). ${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)} with free shipping.`
  const faq = faqs(c)
  const same = list.filter(o => o.kind === c.kind)
  const at = same.indexOf(c)
  const more = [1, 2, 3].map(n => same[(at + n) % same.length])

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: `${c.title} — ${kindLabel(c)} Mini Art Print`,
        sku: c.slug,
        description,
        image: [`${SITE}/${front(c)}`, `${SITE}/${back(c)}`],
        brand: { '@type': 'Brand', name: 'Minicuration' },
        offers: { '@type': 'Offer', price: decimal(c.price), priceCurrency: 'USD', availability: 'https://schema.org/InStock', url },
      },
      {
        '@type': 'VisualArtwork',
        name: c.title,
        image: `${SITE}/${front(c)}`,
        description: c.quote || c.description.join(' '),
        ...(isLimited(c) && !/series/i.test(c.medium) ? { artMedium: c.medium } : {}),
        ...(c.material ? { artMedium: c.material } : {}),
        artform: 'Painting',
        artist: { '@type': 'Person', name: 'JFeelgood', url: 'https://jfeelgood.com' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE}/shop.html` },
          { '@type': 'ListItem', position: 3, name: c.title },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  }

  const tableRows = isLimited(c)
    ? [
        ['Card dimensions', '2.5&quot; &times; 3.5&quot; &mdash; ACEO standard'],
        ['Case material', 'Acrylic with magnetic closure'],
        ['Stand', 'Acrylic display stand included'],
        ['Numbered', 'Yes &mdash; individually numbered on card back'],
        ['Notes', 'Artist statement printed on the card back'],
      ]
    : [
        ['Card dimensions', '2.5&quot; &times; 3.5&quot; &mdash; ACEO standard'],
        ['Edition', 'Open edition &mdash; not numbered'],
        ['Packaging', 'Protective plastic slip'],
        ['Acrylic case', `Magnetically sealed &mdash; add-on, ${money(CASE.price)}`],
        ['Stand', `Acrylic display stand &mdash; add-on, ${money(STAND.price)}`],
        ['Card back', 'Painting title, artist name and minicuration.com'],
        ...(c.material ? [['Original', esc(c.material)]] : []),
        ['Bundle', `${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)}, free shipping`],
      ]

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="icon" type="image/x-icon" href="/favicon.ico"/>
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="theme-color" content="#f5efe4"/>
  <title>${esc(c.title)} by JFeelgood — ${kindLabel(c)} Card | Minicuration</title>
  <meta name="description" content="${esc(description)}"/>
  <meta name="robots" content="index, follow"/>
  <link rel="canonical" href="${url}"/>
  <meta property="og:type" content="product"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:image" content="${SITE}/${front(c)}"/>
  <meta property="og:url" content="${url}"/>
  <meta property="og:site_name" content="Minicuration"/>
  <meta property="og:price:amount" content="${decimal(c.price)}"/>
  <meta property="og:price:currency" content="USD"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image" content="${SITE}/${front(c)}"/>
  <link rel="preload" as="image" href="../${front(c)}"/>
  <script type="application/ld+json">
  ${json(ld)}
  </script>
  <link rel="stylesheet" href="/css/theme.css"/>
  <link rel="stylesheet" href="/css/base.css"/>
  <link rel="stylesheet" href="/css/product.css"/>
  <link rel="stylesheet" href="/css/cart.css"/>
</head>
<body${isLimited(c) ? ` data-slug="${c.slug}"` : ''}>
${nav('../')}

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="../index.html">Home</a><span>›</span>
    <a href="../shop.html#${isLimited(c) ? 'limited' : 'unlimited'}">Shop</a><span>›</span>
    ${esc(c.title)}
  </nav>

  <div class="product">
    <div class="product-images">
      <div class="product-image-wrap">
        <img ${dims(c)} src="../${front(c)}" alt="${esc(c.title)} by JFeelgood — card front" fetchpriority="high" decoding="async"/>
      </div>
      <p class="card-face-label">Front</p>
      <div class="product-image-wrap">
        <img ${backDims} src="../${back(c)}" alt="${esc(c.title)} — card back${isLimited(c) ? ' with the artist statement and edition number' : ' with the title and artist name'}" loading="lazy" decoding="async"/>
      </div>
      <p class="card-face-label">Back</p>
    </div>

    <div class="product-info">
${isLimited(c)
    ? `      <span class="tag" id="product-edition-tag">Limited Edition of 50</span>
      <span class="product-stock-count" id="product-stock-count" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:16px;min-height:14px;"></span>`
    : '      <span class="tag is-open">Unlimited &middot; Open Edition</span>'}
      <h1>${esc(c.title)}</h1>
      <p class="product-meta">by <a href="../artists/jfeelgood.html">JFeelgood</a></p>
      <p class="product-medium">${esc(isLimited(c) ? c.medium : c.material ? `${c.material} · open edition from the JFeelgood archive` : 'Open edition · from the JFeelgood archive')}</p>
${c.quote ? `      <blockquote class="product-quote">&ldquo;${esc(c.quote)}&rdquo;</blockquote>\n` : ''}${c.description ? `      <div class="expanded-note">
        <div class="section-label">${c.quote ? 'Artist Note' : 'About the Painting'}</div>
${c.description.map(p => `        <p>${esc(p)}</p>`).join('\n')}
      </div>\n` : ''}      <div class="product-price">${priceHtml(c)} <span class="price-note">+ ${money(SHIPPING.perCard)} US shipping per card, free on orders of ${money(SHIPPING.freeFrom)}+</span>${isLimited(c) ? '' : `<span class="bundle-line">${bundleOffer()}</span>`}</div>
${isLimited(c) ? '' : ADDONS.map(a => `      <label class="addon-opt"><input type="checkbox" data-addon-for="${c.slug}" value="${a.slug}"/> ${esc(a.offer)} <span>+${money(a.price)}</span></label>\n`).join('')}      <button type="button" class="btn-buy" data-add-to-cart="${c.slug}">Add to cart — ${money(c.price)}</button>
      <p class="trust-row">Secure checkout via Stripe<span class="sep">&middot;</span>Ships in 5&ndash;7 days<span class="sep">&middot;</span>14-day guarantee<span class="sep">&middot;</span><a href="../cart.html">View cart</a></p>
${c.original ? `      <div class="original-painting content-section">
        <div class="section-label">The Original Painting</div>
        <p>The original ${esc(c.title)} is ${esc(c.medium.toLowerCase())}, ${esc(c.original)}, from the ${esc(c.series)} series.${c.series === 'Self Work' ? ' <a href="../journal/self-work-series.html">Read about the Self Work series</a>.' : ''}</p>
      </div>
` : ''}
      <div class="edition-details content-section">
        <div class="section-label">${isLimited(c) ? 'Edition Details' : 'Card Details'}</div>
        <table class="edition-table"><tbody>
${tableRows.map(([k, v]) => `          <tr><td>${k}</td><td>${v}</td></tr>`).join('\n')}
        </tbody></table>
      </div>
    </div>
  </div>

  <section class="product-faq content-section" style="padding:0 48px 60px;max-width:620px;margin:0 auto;">
    <div class="section-label">Common Questions</div>
${faq.map(f => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${esc(f.a)}</p>
    </div>`).join('\n')}
  </section>

  <section class="more">
    <p class="more-label">${isLimited(c) ? 'Limited Edition' : 'Unlimited'}</p>
    <h2>More from Minicuration</h2>
    <div class="more-grid">
${more.map(o => `      <a href="${o.slug}.html" class="more-card">
        <img class="card-img${o.wide ? ' landscape' : ''}" ${dims(o)} src="../${front(o)}" alt="${esc(o.title)} by JFeelgood — ${isLimited(o) ? 'limited edition' : 'open edition'} mini art print" loading="lazy" decoding="async"/>
        <div class="more-card-body"><h3>${esc(o.title)}</h3><p>by JFeelgood · ${money(o.price)}</p></div>
      </a>`).join('\n')}
    </div>
  </section>

${footer('../')}
  <script defer src="/js/catalog-data.js"></script>
  <script defer src="/js/cart.js"></script>
${isLimited(c) ? '  <script defer src="/js/store.js"></script>\n' : ''}  <script defer src="/js/analytics.js"></script>
  <script src="/js/nav.js"></script>
</body>
</html>
`
}

function shopCard(c) {
  const concept = c.quote ? `&ldquo;${esc(c.quote)}&rdquo;` : esc(c.description[0])
  return `    <div class="shop-card" data-slug="${c.slug}" data-kind="${c.kind}" data-status="available" onclick="location.href='shop/${c.slug}.html'">
      <div class="card-flipper" style="position:relative;">
        <div class="sc-spin-wrap${c.wide ? ' landscape' : ''}">
          <div class="sc-spin-scene">
            <div class="sc-spin-3d">
              <div class="sc-face sc-front">
                <img ${dims(c)} src="${front(c)}" alt="${esc(c.title)} — original painting by JFeelgood" loading="lazy" decoding="async"/>
              </div>
              <div class="sc-face sc-back">
                <img ${backDims} src="${back(c)}" alt="${esc(c.title)} — collector card back" loading="lazy" decoding="async"/>
              </div>
            </div>
          </div>
        </div>
        <div class="avail-dot"></div>
        <div class="cf-overlay"><span>View Details</span></div>
        <button type="button" class="flip-toggle" aria-label="Flip card to see the back">Flip &#10227;</button>
      </div>
      <div class="card-body">
        <div class="card-top-row"><span class="card-edition${isLimited(c) ? '' : ' is-open'}">${isLimited(c) ? 'Ltd. Ed. of 50' : 'Unlimited'}</span></div>
        <h3 class="card-title">${esc(c.title)}</h3>
        <p class="card-artist">by JFeelgood</p>
        <p class="card-medium">${esc(medium(c))}</p>
        <p class="card-concept">${concept}</p>
        <div class="card-price-row">
          <span class="card-price">${priceHtml(c)}</span>
        </div>
        <p class="card-stock-count"></p>
      </div>
      <div class="stripe-wrap" onclick="event.stopPropagation()">
        <button type="button" class="btn-buy" data-add-to-cart="${c.slug}">Add to cart — ${money(c.price)}</button>
        <p class="card-trust">Secure Stripe checkout &middot; Ships 5&ndash;7 days &middot; 14-day guarantee</p>
      </div>
    </div>`
}

function sitemapEntry(c) {
  return `  <url>
    <loc>${SITE}/shop/${c.slug}.html</loc>
    <image:image>
      <image:loc>${SITE}/${front(c)}</image:loc>
      <image:title>${esc(c.title)} by JFeelgood — ${kindLabel(c)} Mini Art Print</image:title>
    </image:image>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`
}

// Replaces what sits between <!-- name --> and <!-- /name --> in a file.
function splice(file, name, body) {
  const full = path.join(ROOT, file)
  const text = fs.readFileSync(full, 'utf8')
  const open = `<!-- ${name} -->`
  const close = `<!-- /${name} -->`
  const a = text.indexOf(open)
  const b = text.indexOf(close)
  if (a < 0 || b < a) throw new Error(`${file} has no ${open} … ${close} markers`)
  fs.writeFileSync(full, text.slice(0, a + open.length) + '\n' + body + '\n' + text.slice(b))
}

function build() {
  const limited = CARDS.filter(isLimited)
  const open = CARDS.filter(c => !isLimited(c))

  for (const [i, c] of CARDS.entries()) {
    fs.writeFileSync(path.join(ROOT, 'shop', `${c.slug}.html`), productPage(c, i, CARDS))
  }

  splice('shop.html', 'cards:limited', limited.map(shopCard).join('\n'))
  splice('shop.html', 'cards:open', open.map(shopCard).join('\n'))
  const items = [
    ...SIX_PACK_SLUGS.map(slug => ({ slug, name: PRODUCT_NAMES[slug] })),
    ...CARDS.map(c => ({ slug: c.slug, name: c.title })),
  ]
  splice('shop.html', 'cards:itemlist', `  <script type="application/ld+json">
  ${json({
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'Minicuration — Limited Edition and Unlimited Art Cards', url: `${SITE}/shop.html`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/shop/${it.slug}.html`, name: it.name })),
  })}
  </script>`)
  splice('sitemap.xml', 'cards:sitemap', CARDS.map(sitemapEntry).join('\n'))

  const data = {
    root: '/',
    bundle: { ...BUNDLE, price: BUNDLE.size * PRICES.open.price - BUNDLE.discount },
    shipping: SHIPPING,
    cards: Object.fromEntries([
      ...CARDS.map(c => [c.slug, {
        title: c.title, kind: c.kind, price: c.price, was: c.was,
        img: front(c), url: `shop/${c.slug}.html`, wide: !!c.wide,
      }]),
      ...ADDONS.map(a => [a.slug, { title: a.title, kind: a.kind, price: a.price, was: null, note: a.note, upsell: a.upsell, short: a.short }]),
    ]),
    addons: ADDONS.map(a => a.slug),
  }
  fs.writeFileSync(path.join(ROOT, 'js', 'catalog-data.js'),
    '/* Generated by scripts/build-cards.js from api/_catalog.js — do not edit by hand. */\n' +
    `window.MC_CATALOG = ${JSON.stringify(data, null, 1)}\n`)

  console.log(`✓ ${CARDS.length} product pages (${limited.length} limited, ${open.length} unlimited), shop grid, sitemap, js/catalog-data.js`)
}

build()
