/* Minicuration — lightweight analytics + commerce event instrumentation.
   Pageviews and custom events go to Vercel Web Analytics (enable "Web Analytics"
   in the Vercel project dashboard) and are mirrored to window.dataLayer, so a
   GTM / GA4 container can be added later without editing any page. No cookies,
   no PII collected. */
(function () {
  // Vercel Web Analytics queue stub + loader (auto-tracks pageviews).
  // The insights script is only served by Vercel's edge, so load it only on
  // Vercel-hosted domains — otherwise it 404s on localhost/CI (and trips the
  // "zero console errors" e2e test). The va() stub + event tracking below still
  // work everywhere; events simply queue harmlessly off-Vercel.
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments) }
  window.dataLayer = window.dataLayer || []
  const host = location.hostname
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

  // Buy-button clicks → buy_click + begin_checkout (the Stripe handoff).
  document.addEventListener('click', function (e) {
    const buy = e.target.closest && e.target.closest('a.btn-buy, [data-buy]')
    if (!buy) return
    if (buy.classList.contains('sold') || buy.getAttribute('aria-disabled') === 'true') {
      track('sold_out_click', { slug: resolveSlug(buy) })
      return
    }
    const payload = { slug: resolveSlug(buy), value: 23, currency: 'USD' }
    track('buy_click', payload)
    track('begin_checkout', payload)
  }, true)

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
