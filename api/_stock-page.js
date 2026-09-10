'use strict'
// The human-readable face of /api/stock. Browsers navigating to the endpoint
// get this; anything calling it with fetch() still gets JSON (see api/stock.js).
//
// It links the site's real stylesheets rather than restating the palette, so
// it cannot drift out of step with the rest of minicuration.com, and reuses
// the same nav and footer markup so the chrome behaves identically.
const { PRODUCT_NAMES, EDITION_SIZE } = require('./_constants.js')

const escape = (value) => String(value).replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

// A tally of EDITION_SIZE marks — sold ones dimmed. It reads as a print run
// rather than a progress bar, and it is honest: the endpoint knows how many
// remain, not which numbers, so the marks are a count and never labelled.
function tally(remaining) {
  let marks = ''
  for (let n = 1; n <= EDITION_SIZE; n++) {
    marks += `<i class="${n <= remaining ? 'is-left' : 'is-gone'}"></i>`
  }
  return `<div class="tally" aria-hidden="true">${marks}</div>`
}

function card(slug, name, stock) {
  const soldOut = stock === 0
  return `
      <article class="edition${soldOut ? ' is-out' : ''}">
        <h2>${escape(name)}</h2>
        <p class="count">
          ${soldOut
            ? '<span class="out">Sold out</span>'
            : `<span class="num">${stock}</span><span class="of">of ${EDITION_SIZE} left</span>`}
        </p>
        ${tally(stock)}
        <a class="view" href="/shop/${escape(slug)}.html">
          ${soldOut ? 'View edition' : 'View print'}<span aria-hidden="true">&#8202;&rarr;</span>
        </a>
      </article>`
}

// `problem`, when given, is the safe one-line reason from api/_store.js. The
// page then explains itself instead of showing six sold-out editions, which
// would be a lie the shop owner might act on.
function renderStockPage(inventory, problem) {
  const entries = Object.entries(PRODUCT_NAMES)
    .map(([slug, name]) => ({ slug, name, stock: inventory[slug]?.stock ?? 0 }))
  const remaining = entries.reduce((sum, e) => sum + e.stock, 0)
  const total = entries.length * EDITION_SIZE
  const soldOutCount = entries.filter(e => e.stock === 0).length

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="theme-color" content="#f5efe4"/>
<link rel="icon" type="image/x-icon" href="/favicon.ico"/>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
<title>Editions Remaining | Minicuration</title>
<meta name="description" content="Live count of how many prints remain in each limited edition of 50."/>
<!-- A live inventory read-out is not a page for search results. -->
<meta name="robots" content="noindex, follow"/>
<link rel="stylesheet" href="/css/theme.css"/>
<link rel="stylesheet" href="/css/base.css"/>
<style>
  /* Site pages put a .sale-banner above the fixed nav, which is what
     --banner-h offsets it by. This page has no banner, so the nav sits flush
     at the top and the content clears its full height instead. */
  body{--banner-h:0px;}
  .stock-wrap{max-width:1040px;margin:0 auto;
    padding:clamp(104px,17vw,152px) clamp(18px,5vw,40px) 80px;}

  .stock-head{text-align:center;margin-bottom:clamp(30px,6vw,54px);}
  .stock-head h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(34px,7vw,54px);
    letter-spacing:.02em;line-height:1.1;}
  .stock-head .rule{width:52px;height:1px;background:var(--accent);margin:20px auto;opacity:.55;}
  .stock-head p{color:var(--muted);font-size:clamp(14px,2.4vw,16px);line-height:1.6;
    max-width:46ch;margin:0 auto;}
  .stock-head strong{color:var(--text);font-weight:500;}

  .grid{display:grid;gap:clamp(14px,2.6vw,22px);grid-template-columns:1fr;}
  @media (min-width:620px){ .grid{grid-template-columns:repeat(2,1fr);} }
  @media (min-width:960px){ .grid{grid-template-columns:repeat(3,1fr);} }

  .edition{background:var(--surface);border:1px solid var(--border);border-radius:3px;
    padding:clamp(20px,3.4vw,28px);display:flex;flex-direction:column;gap:14px;
    box-shadow:0 1px 2px var(--shadow-color);}
  .edition h2{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:clamp(21px,3.4vw,25px);
    letter-spacing:.01em;line-height:1.2;}

  .count{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;}
  .count .num{font-family:'Cormorant Garamond',serif;font-size:clamp(38px,7vw,46px);
    font-weight:300;line-height:1;color:var(--accent);}
  .count .of{color:var(--muted);font-size:13px;letter-spacing:.06em;text-transform:uppercase;}
  .count .out{color:var(--sold);font-size:13px;letter-spacing:.14em;text-transform:uppercase;
    background:var(--sold-bg);border:1px solid var(--sold-border);border-radius:2px;padding:7px 12px;}

  /* One mark per print, in a fixed 25-wide grid so every card reads as two
     even rows of 25 rather than a ragged wrap. The marks flex down on narrow
     screens instead of overflowing. */
  .tally{display:grid;grid-template-columns:repeat(25,1fr);gap:3px;justify-items:center;
    margin-top:auto;padding-top:4px;}
  .tally i{width:100%;max-width:8px;height:14px;border-radius:1px;background:var(--accent);opacity:.85;}
  .tally i.is-gone{background:var(--sold-border);opacity:.7;}
  .is-out .tally i{background:var(--sold-border);}

  .view{align-self:flex-start;color:var(--link);text-decoration:none;font-size:14px;
    letter-spacing:.04em;border-bottom:1px solid transparent;padding-bottom:2px;transition:border-color .2s;}
  .view:hover,.view:focus-visible{border-bottom-color:var(--link);}

  .stock-note{margin-top:clamp(30px,5vw,46px);text-align:center;color:var(--muted);
    font-size:13px;line-height:1.7;}
  .stock-note a{color:var(--link);}

  @media (prefers-reduced-motion:reduce){ .view{transition:none;} }
</style>
</head>
<body>
  <nav>
    <a href="/index.html" class="nav-logo">minicuration</a>
    <button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <ul class="nav-links">
      <li><a href="/shop.html">Shop</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/journal.html">Journal</a></li>
      <li><a href="/shop.html" class="nav-cta">Shop Prints</a></li>
    </ul>
  </nav>

  <main class="stock-wrap">
    <header class="stock-head">
      <h1>Editions Remaining</h1>
      <div class="rule"></div>
      ${problem
        ? `<p>Live counts are unavailable right now, so nothing is shown rather
             than something wrong. <a href="/shop.html">The shop</a> is still open.</p>`
        : `<p><strong>${remaining}</strong> of ${total} prints are still available${
            soldOutCount ? `, and ${soldOutCount} edition${soldOutCount > 1 ? 's have' : ' has'} closed for good` : ''
          }. Every print is hand-numbered; once a number is gone, no one else holds it.</p>`}
    </header>

    ${problem
      ? `<p class="stock-note" role="status">${escape(problem)}</p>`
      : `<div class="grid">${entries.map(e => card(e.slug, e.name, e.stock)).join('')}</div>`}

    <p class="stock-note">
      Counts refresh every few minutes.<br>
      <a href="/shop.html">Browse the shop</a> &middot; <a href="/api/stock?format=json">View as JSON</a>
    </p>
  </main>

  <footer>
    <a href="/index.html" class="footer-logo">minicuration</a>
    <ul class="footer-links">
      <li><a href="/shop.html">Shop</a></li>
      <li><a href="/about.html">About</a></li>
      <li><a href="/journal.html">Journal</a></li>
      <li><a href="/policies.html">Policies</a></li>
      <li><a href="https://jfeelgood.com" target="_blank" rel="noopener">jfeelgood.com</a></li>
    </ul>
    <span class="footer-copy">&copy; 2026 Minicuration. All rights reserved.</span>
  </footer>

  <script src="/js/nav.js"></script>
</body>
</html>`
}

module.exports = { renderStockPage }
