/* Minicuration — product-page store logic.
   Reads the product slug from <body data-slug="…"> and uses live inventory from
   /api/stock to (1) show the accurate next edition number, (2) show how many of
   50 remain, and (3) when the edition is gone, close the Buy button and offer a
   next-drop email capture. Edition number = (50 − stock) + 1 — the number the
   next buyer actually receives, not the hardcoded "01 of 50". */
(function () {
  const slug = document.body.getAttribute('data-slug')
  if (!slug) return

  function setEditionTag(text, low) {
    const tag = document.getElementById('product-edition-tag')
    if (!tag) return
    tag.textContent = text
    if (low) { tag.style.borderColor = 'var(--crimson)'; tag.style.color = 'var(--crimson)' }
  }

  function closeEdition() {
    const btn = document.querySelector('.btn-buy')
    if (btn) {
      btn.classList.add('sold')
      btn.setAttribute('aria-disabled', 'true')
      btn.removeAttribute('href')
      btn.textContent = 'Sold Out — Edition Closed'
    }
    if (document.querySelector('.next-drop')) return
    const wrap = document.createElement('div')
    wrap.className = 'next-drop'
    wrap.innerHTML =
      '<p class="next-drop-label">This edition of 50 is gone. Be first to hear about the next drop.</p>' +
      '<form class="next-drop-form" data-newsletter-source="sold-out-product" data-slug="' + slug + '" ' +
      'action="https://formspree.io/f/mzdwrrpa" method="POST">' +
      '<input type="hidden" name="interest" value="' + slug + ' — next drop"/>' +
      '<input type="email" name="email" placeholder="your@email.com" aria-label="Email address" required/>' +
      '<button type="submit">Notify Me</button></form>'
    const trust = document.querySelector('.trust-row')
    const anchor = trust || btn
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling)
  }

  fetch('/api/stock').then(function (r) { return r.json() }).then(function (inv) {
    const item = inv[slug]
    if (!item) return
    const stock = item.stock
    const sold = 50 - stock
    const countEl = document.getElementById('product-stock-count')

    if (item.soldOut) {
      setEditionTag('Limited Edition — 50 of 50 · Sold Out', true)
      if (countEl) { countEl.textContent = 'Sold out — all 50 editions claimed'; countEl.style.color = 'var(--crimson)' }
      closeEdition()
      return
    }

    const next = sold + 1 // edition number the next buyer receives
    setEditionTag('Limited Edition — Edition ' + next + ' of 50', stock <= 10)
    if (countEl) {
      if (sold > 0) {
        countEl.textContent = sold + ' of 50 claimed · ' + stock + ' left'
        if (stock <= 10) countEl.style.color = 'var(--crimson)'
      } else {
        countEl.textContent = 'Edition of 50 · ' + stock + ' available'
      }
    }
  }).catch(function () { /* leave static fallbacks in place */ })
})()
