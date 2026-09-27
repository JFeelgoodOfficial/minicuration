/* Minicuration — analytics + commerce event instrumentation.
   Pageviews and custom events go to Vercel Web Analytics (enable "Web Analytics"
   in the Vercel project dashboard) and to Google Analytics 4, and are mirrored
   to window.dataLayer. GA only loads on minicuration.com itself, so previews,
   localhost and CI don't count as visits. No PII is sent. */
(function () {
  // Vercel Web Analytics queue stub + loader (auto-tracks pageviews).
  // The insights script is only served by Vercel's edge, so load it only on
  // Vercel-hosted domains — otherwise it 404s on localhost/CI (and trips the
  // "zero console errors" e2e test). The va() stub + event tracking below still
  // work everywhere; events simply queue harmlessly off-Vercel.
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
  window.dataLayer = window.dataLayer || []
  const host = location.hostname
  const GA_ID = 'G-5NGLJ1RXVX'
  const onLive = host === 'minicuration.com' || host === 'www.minicuration.com'
  if (onLive && !window.gtag) {
    window.gtag = function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
    window.gtag('config', GA_ID)
    const g = document.createElement('script')
    g.async = true
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID
    document.head.appendChild(g)
  }
  const onVercel = host === 'minicuration.com' || host === 'www.minicuration.com' || /\.vercel\.app$/.test(host)
  if (onVercel && !document.querySelector('script[src*="/_vercel/insights/script.js"]')) {
    const s = document.createElement('script')
    s.defer = true
    s.src = '/_vercel/insights/script.js'
    document.head.appendChild(s)
  }

  function track(name, props) {
    props = props || {}
    try { window.va('event', { name: name, data: props }) } catch (e) { /* queued */ }
    if (window.gtag) window.gtag('event', name, props)
    const entry = { event: name }
    for (const k in props) {
      if (Object.prototype.hasOwnProperty.call(props, k)) entry[k] = props[k]
    }
    window.dataLayer.push(entry)
  }
  // Exposed so page scripts can fire their own events (e.g. mcTrack('flip_back', {...})).
  window.mcTrack = track

  function resolveSlug(el) {
    const card = el.closest && el.closest('[data-slug]')
    if (card && card.dataset.slug) return card.dataset.slug
    if (document.body.dataset.slug) return document.body.dataset.slug
    return undefined
  }

  // js/cart.js reports add_to_cart and begin_checkout itself; this only
  // catches clicks on a sold-out card's closed button.
  document.addEventListener('click', function (e) {
    const buy = e.target.closest && e.target.closest('.btn-buy')
    if (buy && (buy.classList.contains('sold') || buy.getAttribute('aria-disabled') === 'true')) {
      track('sold_out_click', { slug: resolveSlug(buy) })
    }
  }, true)

  // The thank-you page after a cart checkout: js/cart.js (loaded first) left
  // what was bought in window.mcOrder before emptying the cart.
  if (window.mcOrder) {
    track('purchase', { transaction_id: window.mcOrder.id, value: window.mcOrder.value, currency: 'USD', items: window.mcOrder.items })
  }

  // Newsletter / next-drop signups.
  document.addEventListener('submit', function (e) {
    const form = e.target.closest && e.target.closest('form')
    if (!form) return
    if (form.matches('.email-form, .next-drop-form, [data-newsletter-source]')) {
      track('newsletter_signup', {
        source: form.getAttribute('data-newsletter-source') || 'newsletter',
        slug: form.dataset.slug || undefined
      })
    }
  }, true)
})()
