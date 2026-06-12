# Conversion Audit — minicuration.com — 2026-06-11

> Note: the live site returned HTTP 403 to non-browser fetches (WebFetch blocked; curl denied in sandbox), so this audit is based on the deployed source in the repo. The 403 itself is a finding (see Pre-Conversion).

## Funnel Map

```
[Organic / AI search / direct]
  → index.html (hero, 2 product spotlights)
  → shop.html (6-card grid, Buy Now per card) ──┐
  → shop/{slug}.html (product detail) ──────────┤
                                                ▼
  → buy.stripe.com Payment Link (OFF-SITE checkout)
  → Stripe default success page (OFF-SITE, not site-controlled)
  → Fulfillment email via Resend (api/webhook.js)
```

Side paths: journal → products (broken — see below); newsletter (Formspree) on homepage bottom only; artist page reachable mainly from product pages. `builder.html` is an internal noindexed authoring tool, not a funnel stage. The funnel itself is short (1–2 clicks to checkout — good). The unmappable part is **measurement**: there is zero analytics anywhere in the repo, so no stage can be quantified.

## Pre-Conversion (SEO/Intent) Findings

- **Production 403 to non-browser agents.** If this is Vercel Bot Protection/Attack Challenge mode, it silently negates the site's deliberate AI-visibility strategy (`robots.txt` explicitly allows GPTBot/ClaudeBot/PerplexityBot/CCBot; `llms.txt` exists). Verify Vercel Firewall settings and Search Console crawl stats. Confidence the cause is bot protection: medium; that something non-browser is blocked: high.
- **Insider-first keyword strategy.** Every title/H1 leads with "ACEO" — a niche community that largely expects cheap *originals* on eBay/Etsy (partial intent mismatch even within the niche). Higher-volume commercial intents — "mini art prints," "small art gifts under $25," "trading card art" — are untargeted. No content serves the gift-buyer, where a $23 product converts best.
- **Journal doesn't close the loop:** `journal/what-is-aceo.html` and `journal/how-to-collect-aceo.html` contain **zero** links to any product page.
- **llms.txt factual drift:** claims "oil… by independent artists" (plural) and "fits in a wallet" — one artist, no oil works, rigid acrylic case. AI engines will repeat these.
- Technical SEO is otherwise strong: unique titles/descriptions, canonicals, sitemap with images, Product/FAQPage/VisualArtwork/Breadcrumb JSON-LD, www redirect.

## Top Interventions

| # | Stage | Intervention | Confidence | Effort |
|---|-------|-------------|------------|--------|
| 1 | All | **Install analytics + buy-click events.** Zero instrumentation exists; Buy buttons are plain `<a>` links to Stripe — users vanish untracked. Every other intervention is unverifiable without this. | High | Low |
| 2 | Checkout | **Fix scarcity enforcement + display.** (a) Payment Links stay active after sellout; `webhook.js` logs `OVERSELL BLOCKED` only *after the customer has paid* → manual refunds. Deactivate links at stock 0. (b) Every card sitewide hardcodes "Ltd. Ed. — **01 of 50**" but buyers receive edition `50 − remaining` — the most prominent claim on every surface is inaccurate, on a brand whose entire pitch is real scarcity. Use "Edition of 50" or live numbers. | High | Med |
| 3 | Product page | **Resolve contradictory return policy.** Product FAQs + FAQPage JSON-LD: "returns within **30 days** if damaged." `policies.html`: **14-day** satisfaction returns + 14-day damage guarantee. The contradiction sits directly under the Buy button, and the JSON-LD version is what Google/AI quote. The FAQ also hides the (better) satisfaction-return option. | High | Low |
| 4 | Checkout handoff | **Warm the Stripe handoff + reclaim post-purchase.** Add a micro-trust row under every Buy button ("Secure checkout via Stripe · Ships in 5–7 days · 14-day guarantee" — grid cards currently show nothing but a price), and redirect Payment Link completion to an on-site /thanks page with newsletter capture and a second-card pitch (the natural follow-on conversion in a 6-design collection; `sales` table already stores buyer_email for repeat-rate measurement). | Med-High | Med |
| 5 | Shop grid (mobile) | **Mobile users can't see card backs.** Card flip is hover-only; the `.flip-toggle` button has CSS (shop.html:118) but is never rendered — dead code. "The artist's story on every card back" is a headline differentiator invisible to touch devices. Also the header copy says "Hover… to **pause** the spin" while hover actually *starts* it. | High | Low |

Remaining ranked items:

6. Verify/fix the Vercel 403 for legitimate crawlers.
7. Sold-out states → "join the next drop" email capture + newsletter on shop/product pages + journal→product links (drops business model, list is the retention asset, capture exists in one place).
8. Trust-surface polish — no social proof exists anywhere at zero sales, founder/artist absent from homepage, typos beside Buy buttons ("It currently in artist's studio" on sweet-dreams.html; "intention,and" on index.html), "Artist" nav link exists only on about.html.
9. Correct llms.txt facts.

## What to Instrument

`page_view`, `buy_click{slug, surface}`, server-side `checkout_completed` (join for handoff drop-off), `newsletter_submit{page}`, `journal_to_shop_click`, `flip_interaction`, `soldout_view`, `filter_click`, plus monthly repeat-buyer query on the existing supabase `sales` table.

---

**What's already good:** value prop passes the 10-second test ($23, edition of 50, above the fold), 1–2 clicks to checkout, no email gate, descriptive CTAs, honest stock counters (wired, just invisible at zero sales), strong structured data.

No changes were implemented. The human decides which interventions become planner tasks.
