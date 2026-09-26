/* Minicuration — the cart.
   Holds { slug: qty } in localStorage for the cards in js/catalog-data.js (the
   limited and open-edition cards sold through /api/checkout). Wires every
   [data-add-to-cart] button, keeps [data-cart-count] in the nav current,
   renders cart.html, and empties itself on thanks.html after a cart checkout.
   Prices shown here are a preview; /api/checkout prices the order for real. */
(function () {
  var KEY = 'mc-cart'
  var DATA = window.MC_CATALOG
  if (!DATA) return

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}')
      var cart = {}
      Object.keys(raw).forEach(function (slug) {
        var qty = parseInt(raw[slug], 10)
        if (DATA.cards[slug] && qty > 0) cart[slug] = DATA.cards[slug].kind === 'limited' ? 1 : Math.min(qty, 50)
      })
      return cart
    } catch (e) { return {} }
  }
  function unlimitedCount(c) {
    return Object.keys(c).reduce(function (n, slug) { return n + (DATA.cards[slug].kind === 'open' ? c[slug] : 0) }, 0)
  }

  // At most one of each add-on per unlimited card (api/_catalog.js enforces it too).
  function clampAddons(c) {
    var max = unlimitedCount(c)
    DATA.addons.forEach(function (slug) {
      if (c[slug] > max) { if (max) c[slug] = max; else delete c[slug] }
    })
    return c
  }

  function write(cart) {
    cart = clampAddons(cart)
    try { localStorage.setItem(KEY, JSON.stringify(cart)) } catch (e) { /* private mode: cart lasts the page */ }
    memory = cart
    refresh()
  }
  var memory = read()
  function cart() { return memory }

  function money(cents) {
    return '$' + (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100))
  }

  function count(c) {
    return Object.keys(c).reduce(function (n, slug) { return n + c[slug] }, 0)
  }

  // Mirrors quote() in api/_catalog.js.
  function totals(c) {
    var subtotal = 0, open = 0
    Object.keys(c).forEach(function (slug) {
      var card = DATA.cards[slug]
      subtotal += card.price * c[slug]
      if (card.kind === 'open') open += c[slug]
    })
    var bundles = Math.floor(open / DATA.bundle.size)
    var discount = bundles * DATA.bundle.discount
    var parcel = Object.keys(c).some(function (slug) { return DATA.cards[slug].kind !== 'open' })
    var shipping = subtotal - discount >= DATA.shipping.freeFrom ? 0 : DATA.shipping[parcel ? 'parcel' : 'letter']
    return { subtotal: subtotal, open: open, discount: discount, shipping: shipping, parcel: parcel,
      toFree: Math.max(0, DATA.shipping.freeFrom - (subtotal - discount)),
      total: subtotal - discount + shipping,
      toNext: DATA.bundle.size - (open % DATA.bundle.size) }
  }

  function add(slug, withAddons) {
    var c = Object.assign({}, cart())
    var card = DATA.cards[slug]
    if (!card) return false
    if (card.kind === 'limited' && c[slug]) return false
    if (card.kind === 'addon' && (c[slug] || 0) >= unlimitedCount(c)) return false
    c[slug] = card.kind === 'limited' ? 1 : Math.min((c[slug] || 0) + 1, 50)
    if (card.kind === 'open') (withAddons || []).forEach(function (a) { c[a] = (c[a] || 0) + 1 })
    write(c)
    if (window.mcTrack) window.mcTrack('add_to_cart', { slug: slug, kind: card.kind })
    return true
  }

  function setQty(slug, qty) {
    var c = Object.assign({}, cart())
    if (qty <= 0) delete c[slug]
    else c[slug] = DATA.cards[slug].kind === 'limited' ? 1 : Math.min(qty, 50)
    write(c)
  }

  // ── Buttons and nav badge ────────────────────────────────────────────────
  function refresh() {
    var n = count(cart())
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = n ? '(' + n + ')' : ''
    })
    document.querySelectorAll('[data-add-to-cart]').forEach(function (btn) {
      var slug = btn.getAttribute('data-add-to-cart')
      var card = DATA.cards[slug]
      if (!card || btn.classList.contains('sold') || btn.getAttribute('aria-disabled') === 'true') return
      var inCart = cart()[slug]
      if (card.kind === 'limited') {
        btn.textContent = inCart ? 'In your cart — view cart' : 'Add to cart — ' + money(card.price)
      } else {
        btn.textContent = inCart ? 'Add another — ' + inCart + ' in cart' : 'Add to cart — ' + money(card.price)
      }
    })
    if (document.getElementById('cart-page')) renderCart()
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add-to-cart]')
    if (!btn) return
    e.preventDefault()
    e.stopPropagation()
    if (btn.classList.contains('sold') || btn.getAttribute('aria-disabled') === 'true') return
    var slug = btn.getAttribute('data-add-to-cart')
    if (DATA.cards[slug] && DATA.cards[slug].kind === 'limited' && cart()[slug]) {
      location.href = DATA.root + 'cart.html'
      return
    }
    // An unlimited card's page offers the add-ons as checkboxes beside the button.
    var opts = [].slice.call(document.querySelectorAll('[data-addon-for="' + slug + '"]'))
    add(slug, opts.filter(function (o) { return o.checked }).map(function (o) { return o.value }))
    opts.forEach(function (o) { o.checked = false })
  // Capture phase: shop cards stop clicks from bubbling out of their buy area,
  // and the card itself navigates on click, so this must run first.
  }, true)

  // ── cart.html ────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function renderCart() {
    var page = document.getElementById('cart-page')
    var c = cart()
    var slugs = Object.keys(c)
    var list = page.querySelector('[data-cart-lines]')
    var summary = page.querySelector('[data-cart-summary]')
    if (!slugs.length) {
      list.innerHTML = '<p class="cart-empty">Your cart is empty. <a href="' + DATA.root + 'shop.html">Browse the cards</a>.</p>'
      summary.hidden = true
      return
    }
    summary.hidden = false
    var unlimited = unlimitedCount(c)
    // Cards first, the case add-on last.
    slugs.sort(function (a, b) { return (DATA.cards[a].kind === 'addon') - (DATA.cards[b].kind === 'addon') })
    list.innerHTML = slugs.map(function (slug) {
      var card = DATA.cards[slug], qty = c[slug]
      var addon = card.kind === 'addon'
      var control = card.kind === 'limited'
        ? '<span class="cart-qty-fixed">Numbered print &middot; one per order</span>'
        : '<div class="cart-qty" role="group" aria-label="Quantity of ' + esc(card.title) + '">' +
            '<button type="button" data-qty="' + slug + '" data-step="-1" aria-label="One fewer">&minus;</button>' +
            '<span>' + qty + '</span>' +
            '<button type="button" data-qty="' + slug + '" data-step="1" aria-label="One more"' + (addon && qty >= unlimited ? ' disabled' : '') + '>+</button></div>'
      var thumb = addon
        ? '<span class="cart-thumb-case" aria-hidden="true">' + esc(card.short) + '</span>'
        : '<a href="' + DATA.root + card.url + '" class="cart-thumb"><img src="' + DATA.root + card.img + '" ' + (card.wide ? 'width="816" height="600"' : 'width="600" height="816"') + ' alt="' + esc(card.title) + ' card front"/></a>'
      var title = addon
        ? '<span class="cart-line-title">' + esc(card.title) + '</span>'
        : '<a href="' + DATA.root + card.url + '" class="cart-line-title">' + esc(card.title) + '</a>'
      return '<div class="cart-line">' + thumb +
        '<div class="cart-line-body">' + title +
          '<p class="cart-line-kind">' + (addon ? esc(card.note) : card.kind === 'limited' ? 'Limited Edition' : 'Unlimited') + ' &middot; ' + money(card.price) +
            (card.was ? ' <s class="price-was"><span class="sr-only">regular price </span>' + money(card.was) + '</s>' : '') + '</p>' +
          control +
          '<button type="button" class="cart-remove" data-remove="' + slug + '">Remove</button>' +
        '</div>' +
        '<p class="cart-line-total">' + money(card.price * qty) + '</p>' +
      '</div>'
    }).join('') + DATA.addons.map(function (slug) {
      var a = DATA.cards[slug]
      return unlimited > (c[slug] || 0)
        ? '<div class="cart-upsell"><span>' + esc(a.upsell) + ' for ' + money(a.price) + '.</span>' +
          '<button type="button" data-add-addon="' + slug + '">Add ' + esc(a.short.toLowerCase()) + '</button></div>'
        : ''
    }).join('')

    var t = totals(c)
    summary.querySelector('[data-subtotal]').textContent = money(t.subtotal)
    var disc = summary.querySelector('[data-discount-row]')
    disc.hidden = !t.discount
    summary.querySelector('[data-discount]').textContent = '−' + money(t.discount)
    summary.querySelector('[data-shipping]').textContent = t.shipping ? money(t.shipping) : 'Free'
    summary.querySelector('[data-shipping-how]').textContent = t.parcel ? '(tracked)' : '(letter mail)'
    summary.querySelector('[data-total]').textContent = money(t.total)
    var hint = summary.querySelector('[data-bundle-hint]')
    var more = 'Add ' + t.toNext + ' more unlimited card' + (t.toNext === 1 ? '' : 's')
    var ship = t.shipping ? ' Add ' + money(t.toFree) + ' more for free shipping.' : ''
    hint.textContent = (t.discount
      ? 'Bundle applied: ' + money(t.discount) + ' off. ' + more + ' to save another ' + money(DATA.bundle.discount) + '.'
      : t.open
        ? more + ': ' + DATA.bundle.size + ' for ' + money(DATA.bundle.price) + ', shipped free.'
        : 'Buy ' + DATA.bundle.size + ' unlimited pieces for ' + money(DATA.bundle.price) + ' (save ' + money(DATA.bundle.discount) + ' & it\'s free shipping!)') + ship
  }

  function checkout(btn) {
    var c = cart()
    var status = document.querySelector('[data-cart-status]')
    btn.disabled = true
    btn.textContent = 'Opening secure checkout…'
    status.textContent = ''
    if (window.mcTrack) window.mcTrack('begin_checkout', { items: count(c), source: 'cart' })
    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: Object.keys(c).map(function (slug) { return { slug: slug, qty: c[slug] } }) }),
    }).then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body } }) })
      .then(function (res) {
        if (res.ok && res.body.url) { location.href = res.body.url; return }
        var body = res.body || {}
        if (body.error === 'sold_out') {
          var names = body.slugs.map(function (s) { return DATA.cards[s] ? DATA.cards[s].title : s })
          var next = Object.assign({}, c)
          body.slugs.forEach(function (s) { delete next[s] })
          write(next)
          status.textContent = names.join(', ') + (names.length > 1 ? ' have' : ' has') + ' just sold out and ' +
            (names.length > 1 ? 'were' : 'was') + ' removed from your cart.'
        } else {
          status.textContent = 'Checkout could not start. Please try again in a moment.'
        }
        btn.disabled = false
        btn.textContent = 'Checkout'
      })
      .catch(function () {
        status.textContent = 'Checkout could not start. Please check your connection and try again.'
        btn.disabled = false
        btn.textContent = 'Checkout'
      })
  }

  document.addEventListener('click', function (e) {
    var q = e.target.closest('[data-qty]')
    if (q) { var s = q.getAttribute('data-qty'); setQty(s, (cart()[s] || 0) + Number(q.getAttribute('data-step'))); return }
    var r = e.target.closest('[data-remove]')
    if (r) { setQty(r.getAttribute('data-remove'), 0); return }
    var extra = e.target.closest('[data-add-addon]')
    if (extra) { add(extra.getAttribute('data-add-addon')); return }
    var go = e.target.closest('[data-checkout]')
    if (go) checkout(go)
  })

  // A completed cart checkout returns to thanks.html?order=cs_…
  if (/\/thanks(\.html)?$/.test(location.pathname) && /[?&]order=cs_/.test(location.search)) write({})

  // Another tab changed the cart.
  window.addEventListener('storage', function (e) { if (e.key === KEY) { memory = read(); refresh() } })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh)
  else refresh()
})()
