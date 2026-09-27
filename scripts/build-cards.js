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
const { CARDS, ADDONS, CASE, STAND, PRICES, BUNDLE, SHIPPING, PREORDER, unitPrice, bundleDiscount } = require('../api/_catalog.js')
const { PRODUCT_NAMES, ORIGINAL_SLUGS } = require('../api/_constants.js')

const ROOT = path.join(__dirname, '..')
const SITE = 'https://minicuration.com'
const TODAY = new Date().toISOString().slice(0, 10)

// "Ships on or before Nov 1" must never be printed after Nov 1.
if (PREORDER.active && PREORDER.ships < TODAY) {
  throw new Error(`PREORDER.ships (${PREORDER.ships}) has passed: set PREORDER.active to false in api/_catalog.js, or move the date, then build again.`)
}

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
// The open cards share one price and one pre-order state, so the bundle is
// priced from any one of them.
const OPEN_UNIT = unitPrice({ price: PRICES.open.price, preorder: PREORDER.active })
const BUNDLE_OFF = bundleDiscount()
const BUNDLE_PRICE = BUNDLE.size * OPEN_UNIT - BUNDLE_OFF
// A full bundle ships free only while it clears the free-shipping line.
const BUNDLE_FREE = BUNDLE_PRICE >= SHIPPING.freeFrom
const bundleOffer = () => `Buy ${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)} (save ${money(BUNDLE_OFF)}${BUNDLE_FREE ? ' &amp; it\'s free shipping!' : PREORDER.active ? ' &mdash; pre-order price' : ''})`
const bundleShipNote = () => (BUNDLE_FREE ? ', free shipping' : `; orders of ${money(SHIPPING.freeFrom)}+ ship free`)
const medium = (c) => (isLimited(c) ? c.medium : c.material ? `${c.material} · Open edition` : 'Open edition')
// Pre-order cards: what the buy button says and when the card ships.
const shipsText = (c) => (c.preorder ? `Ships ${esc(PREORDER.label)}` : 'Ships 5&ndash;7 days')
const buyLabel = (c) => `${c.preorder ? 'Pre-order' : 'Add to cart'} — ${money(c.unit)}`

function faqs(c) {
  const returns = {
    q: 'Can I return it?',
    a: 'Yes. Contact us within 14 days of delivery: if you are not satisfied, return the print unopened for a refund; if it arrives damaged, we will send a replacement at no charge. Full details at minicuration.com/policies.html.',
  }
  const size = {
    q: 'What size is the print?',
    a: '2.5 x 3.5 inches, the ACEO standard, identical in size to a trading card.',
  }
  // A pre-order card answers "when?" first.
  const preorder = c.preorder ? [{
    q: 'When does it ship?',
    a: `This card is a pre-order at ${Math.round(PREORDER.off * 100)}% off. Pre-orders ship ${PREORDER.label}, and we email you when yours is on its way. If that date changes we will tell you first, and you can cancel for a full refund at any time before it ships. The original six designs are in stock and ship within 5–7 business days; a mixed order goes out in two packages with shipping charged once.`,
  }] : []
  if (isLimited(c)) {
    return [
      ...preorder,
      { q: 'What comes in the box?', a: 'Your print arrives sealed in a magnetic acrylic collector\'s case with a matching display stand. The card back carries the artist\'s statement, the edition number, and the medium used.' },
      { q: 'Is this print numbered?', a: 'Yes. Each print is individually numbered on the card back, for example 07 of 50. When the edition of 50 is gone, it is never reprinted.' },
      size,
      returns,
    ]
  }
  return [
    ...preorder,
    { q: 'What does it come in?', a: `Every unlimited card ships in a protective plastic slip. You can add a magnetically sealed acrylic case for ${money(CASE.price)} and an acrylic display stand for ${money(STAND.price)}.` },
    { q: 'Is this card numbered?', a: 'No. Unlimited cards are an open edition: they are not numbered and they stay available. The back carries the painting\'s title, the artist\'s name and minicuration.com.' },
    { q: 'How does the bundle work?', a: `Buy ${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)}, mixed however you like: that saves ${money(BUNDLE_OFF)}${BUNDLE_FREE ? ', and the order ships free' : `, and orders of ${money(SHIPPING.freeFrom)} or more ship free`}. Every further ${BUNDLE.size} saves another ${money(BUNDLE_OFF)}, so ${BUNDLE.size * 2} are ${money(2 * BUNDLE_PRICE)}.` },
    size,
    returns,
  ]
}

// On pre-order the struck price is the list price the card returns to; the
// originals keep their sale price against the regular one.
function priceHtml(c) {
  const was = c.preorder ? c.price : c.was
  return was
    ? `${money(c.unit)} <s class="price-was"><span class="sr-only">regular price </span>${money(was)}</s>`
    : money(c.unit)
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
  const priceWords = c.preorder
    ? `${money(c.unit)} on pre-order (${Math.round(PREORDER.off * 100)}% off ${money(c.price)}), ships ${PREORDER.label}`
    : isLimited(c) ? money(c.price) : `${money(c.price)} (regularly ${money(c.was)})`
  const description = isLimited(c)
    ? `${c.title} by JFeelgood. ${c.medium}. Limited edition ACEO art card, one of 50 numbered prints, sealed in a magnetic acrylic collector's case. ${priceWords}.`
    : `${c.title} by JFeelgood. Unlimited open-edition ACEO art card, 2.5 x 3.5 in, in a protective plastic slip. ${priceWords}. ${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)}${BUNDLE_FREE ? ' with free shipping' : ''}.`
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
        offers: {
          '@type': 'Offer', price: decimal(c.unit), priceCurrency: 'USD',
          availability: c.preorder ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
          ...(c.preorder ? { availabilityStarts: PREORDER.ships } : {}),
          url,
        },
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
        ['Bundle', `${BUNDLE.size} unlimited pieces for ${money(BUNDLE_PRICE)}${bundleShipNote()}`],
      ]
  if (c.preorder) tableRows.unshift(['Availability', `Pre-order &mdash; ships ${esc(PREORDER.label)}`])

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
  <meta property="og:price:amount" content="${decimal(c.unit)}"/>
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
${c.preorder ? `      <span class="tag is-preorder">Pre-order &middot; ships ${esc(PREORDER.label)}</span>\n` : ''}      <h1>${esc(c.title)}</h1>
      <p class="product-meta">by <a href="../artists/jfeelgood.html">JFeelgood</a></p>
      <p class="product-medium">${esc(isLimited(c) ? c.medium : c.material ? `${c.material} · open edition from the JFeelgood archive` : 'Open edition · from the JFeelgood archive')}</p>
${c.quote ? `      <blockquote class="product-quote">&ldquo;${esc(c.quote)}&rdquo;</blockquote>\n` : ''}${c.description ? `      <div class="expanded-note">
        <div class="section-label">${c.quote ? 'Artist Note' : 'About the Painting'}</div>
${c.description.map(p => `        <p>${esc(p)}</p>`).join('\n')}
      </div>\n` : ''}      <div class="product-price">${priceHtml(c)} <span class="price-note">${c.preorder ? `Pre-order price, ${Math.round(PREORDER.off * 100)}% off. ` : ''}${isLimited(c)
        ? `+ ${money(SHIPPING.parcel)} tracked US shipping per order, free on orders of ${money(SHIPPING.freeFrom)}+`
        : `+ ${money(SHIPPING.letter)} US shipping per order by letter mail (${money(SHIPPING.parcel)} tracked with a limited card, case or stand), free on orders of ${money(SHIPPING.freeFrom)}+`}</span>${isLimited(c) ? '' : `<span class="bundle-line">${bundleOffer()}</span>`}</div>
${isLimited(c) ? '' : ADDONS.map(a => `      <label class="addon-opt"><input type="checkbox" data-addon-for="${c.slug}" value="${a.slug}"/> ${esc(a.offer)} <span>+${money(a.price)}</span></label>\n`).join('')}      <button type="button" class="btn-buy" data-add-to-cart="${c.slug}">${buyLabel(c)}</button>
      <p class="trust-row">Secure checkout via Stripe<span class="sep">&middot;</span>${c.preorder ? shipsText(c) : 'Ships in 5&ndash;7 days'}<span class="sep">&middot;</span>14-day guarantee<span class="sep">&middot;</span><a href="../cart.html">View cart</a></p>
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
        <div class="more-card-body"><h3>${esc(o.title)}</h3><p>by JFeelgood · ${money(o.unit)}${o.preorder ? ' · Pre-order' : ''}</p></div>
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
  return `    <div class="shop-card" data-slug="${c.slug}" data-kind="${c.kind}" data-status="available"${c.preorder ? ' data-preorder="1"' : ''} onclick="location.href='shop/${c.slug}.html'">
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
        <div class="card-top-row"><span class="card-edition${isLimited(c) ? '' : ' is-open'}">${isLimited(c) ? 'Ltd. Ed. of 50' : 'Unlimited'}</span>${c.preorder ? '<span class="card-preorder">Pre-order</span>' : ''}</div>
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
        <button type="button" class="btn-buy" data-add-to-cart="${c.slug}">${buyLabel(c)}</button>
        <p class="card-trust">Secure Stripe checkout &middot; ${shipsText(c)} &middot; 14-day guarantee</p>
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
// Same as splice(), between /* name */ … /* /name */ comments in a stylesheet.
function spliceCss(file, name, body) {
  const full = path.join(ROOT, file)
  const text = fs.readFileSync(full, 'utf8')
  const open = `/* ${name} */`
  const close = `    /* /${name} */`
  const a = text.indexOf(open)
  const b = text.indexOf(close)
  if (a < 0 || b < a) throw new Error(`${file} has no ${open} … ${close} markers`)
  fs.writeFileSync(full, text.slice(0, a + open.length) + '\n' + body + '\n\n' + text.slice(b))
}

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
  // The original six have hand-written pages and shop tiles; everything the
  // build writes covers the rest. The cart data below covers every card.
  const built = CARDS.filter(c => !c.handmade)
  const limited = built.filter(isLimited)
  const open = built.filter(c => !isLimited(c))

  for (const [i, c] of built.entries()) {
    fs.writeFileSync(path.join(ROOT, 'shop', `${c.slug}.html`), productPage(c, i, built))
  }

  splice('shop.html', 'cards:limited', limited.map(shopCard).join('\n'))
  splice('shop.html', 'cards:open', open.map(shopCard).join('\n'))
  // The price and bundle line under the Unlimited heading, and a notice at the
  // top of the shop while the pre-order runs.
  splice('shop.html', 'cards:shop-open-offer',
    `<strong>${money(OPEN_UNIT)}</strong> <s class="price-was"><span class="sr-only">regular price </span>${money(PREORDER.active ? PRICES.open.price : PRICES.open.was)}</s> each${PREORDER.active ? ' on pre-order' : ''}.<br/><span class="bundle-note">${bundleOffer()}</span>`)
  splice('shop.html', 'cards:shop-notice', PREORDER.active
    ? `  <p class="preorder-notice">Only the original six are in stock. Every other card is a pre-order at ${Math.round(PREORDER.off * 100)}% off and ships ${esc(PREORDER.label)}.</p>`
    : '')
  const items = [
    ...ORIGINAL_SLUGS.map(slug => ({ slug, name: PRODUCT_NAMES[slug] })),
    ...built.map(c => ({ slug: c.slug, name: c.title })),
  ]
  splice('shop.html', 'cards:itemlist', `  <script type="application/ld+json">
  ${json({
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: 'Minicuration — Limited Edition and Unlimited Art Cards', url: `${SITE}/shop.html`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/shop/${it.slug}.html`, name: it.name })),
  })}
  </script>`)
  splice('sitemap.xml', 'cards:sitemap', built.map(sitemapEntry).join('\n'))

  // Home page: a row of every limited edition, and the bundle fan of the
  // upright unlimited cards (a landscape card would be cropped in the fan).
  const picture = (c) => c.img || front(c)
  const pictureDims = (c) => (c.handmade ? 'width="500" height="700"' : dims(c))
  splice('index.html', 'cards:home-limited', CARDS.filter(isLimited).map(c =>
    `      <li><a class="ltd-item" href="shop/${c.slug}.html">
        <img ${pictureDims(c)} src="${picture(c)}" alt="${esc(c.title)} — limited edition card by JFeelgood" loading="lazy" decoding="async"/>
        <p class="ltd-name">${esc(c.title)}</p>
        <p class="ltd-meta">Ed. of 50 · ${money(c.unit)}${c.preorder ? ' · Pre-order' : ''}</p>
      </a></li>`).join('\n'))
  splice('index.html', 'cards:home-limited-price', PREORDER.active
    ? `        <p class="ltd-price"><strong>The original six: ${money(PRICES.limited.price)} each</strong>, in stock. <strong>Ten new designs: ${money(unitPrice({ price: PRICES.limited.price, preorder: true }))}</strong> on pre-order, shipping ${esc(PREORDER.label)}.</p>`
    : `        <p class="ltd-price"><strong>${money(PRICES.limited.price)} each</strong> <s class="price-was"><span class="sr-only">regular price </span>${money(PRICES.limited.was)}</s></p>`)
  splice('index.html', 'cards:home-bundle-offer',
    `        <div class="bundle-price-row">
          <span class="bundle-price">${money(BUNDLE_PRICE)}</span>
          <span class="bundle-ship">${BUNDLE_FREE ? 'Shipping free' : `+ ${money(SHIPPING.letter)} letter mail`}</span>
        </div>
        <p class="bundle-note">${bundleOffer()}</p>
        <a href="shop.html#unlimited" class="btn-primary">Choose your ten</a>
        <p class="bundle-terms">${PREORDER.active ? `Pre-order: ships ${esc(PREORDER.label)}. ` : ''}Any ten unlimited cards in one order; every further ten saves another ${money(BUNDLE_OFF)}.${BUNDLE_FREE ? '' : ` Free shipping on orders of ${money(SHIPPING.freeFrom)}+.`} Secure checkout via Stripe &middot; ${PREORDER.active ? '' : 'Ships in 5&ndash;7 days &middot; '}14-day guarantee.</p>`)
  const fan = open.filter(c => !c.wide)
  const mid = (fan.length - 1) / 2
  splice('index.html', 'cards:home-bundle', fan.map(c =>
    `        <div class="bundle-card"><img width="600" height="816" src="${front(c)}" alt="" loading="lazy" decoding="async"/></div>`).join('\n'))
  // Scatter offsets come from a fixed sequence, so the "messy" pile is the
  // same on every build and the page doesn't change without a card change.
  const jitter = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 43758.5453 % 1
  spliceCss('index.html', 'cards:home-bundle-css', fan.map((c, i) => {
    const d = i - mid
    const vars = [
      `--r:${(d * 3).toFixed(1)}deg`, `--y:${(d * d * 0.8).toFixed(1)}px`, `--x:${(d * 5).toFixed(0)}px`,
      `--i:${i}`, `--c:${i % 5}`, `--rw:${Math.floor(i / 5)}`,
      `--sx:${(d * 0.16 + jitter(i, 1) * 0.45).toFixed(2)}`, `--sy:${(jitter(i, 2) * 0.55).toFixed(2)}`,
      `--sr:${(jitter(i, 3) * 38).toFixed(0)}deg`,
    ]
    return `    .bundle-card:nth-child(${i + 1}) { ${vars.join('; ')}; }`
  }).join('\n'))

  // `unit` is what a card costs now (its pre-order price while on pre-order)
  // and `price` the list price it is shown against; the bundle figures are
  // the ones in force, so js/cart.js mirrors quote() without knowing why.
  const data = {
    root: '/',
    preorder: PREORDER,
    bundle: { size: BUNDLE.size, discount: BUNDLE_OFF, price: BUNDLE_PRICE, free: BUNDLE_FREE },
    shipping: SHIPPING,
    cards: Object.fromEntries([
      ...CARDS.map(c => [c.slug, {
        title: c.title, kind: c.kind, price: c.price, was: c.was, unit: c.unit, preorder: !!c.preorder,
        img: c.img || front(c), url: `shop/${c.slug}.html`, wide: !!c.wide,
      }]),
      ...ADDONS.map(a => [a.slug, { title: a.title, kind: a.kind, price: a.price, was: null, unit: a.unit, preorder: false, note: a.note, upsell: a.upsell, short: a.short }]),
    ]),
    addons: ADDONS.map(a => a.slug),
  }
  fs.writeFileSync(path.join(ROOT, 'js', 'catalog-data.js'),
    '/* Generated by scripts/build-cards.js from api/_catalog.js — do not edit by hand. */\n' +
    `window.MC_CATALOG = ${JSON.stringify(data, null, 1)}\n`)

  const preorders = CARDS.filter(c => c.preorder).length
  console.log(`✓ ${built.length} product pages (${limited.length} limited, ${open.length} unlimited${preorders ? `, ${preorders} on pre-order until ${PREORDER.ships}` : ''}), shop grid, sitemap, js/catalog-data.js`)

  // Ending a pre-order: everything above follows the switch, but some copy
  // is written by hand. Say which files still mention it.
  if (!PREORDER.active) {
    const stale = ['policies.html', 'about.html', 'llms.txt', 'journal/limited-vs-unlimited.html', 'cart.html', 'index.html', 'shop.html']
      .filter(f => /pre-?order/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    if (stale.length) console.warn(`! Pre-order is off, but these still mention it and are edited by hand:\n  ${stale.join('\n  ')}`)
  }
}

build()
