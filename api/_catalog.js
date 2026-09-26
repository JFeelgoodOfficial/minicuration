'use strict'
// The cards sold through the cart: ten limited editions of 50 and the open
// (unlimited) run. The six original designs are not here: they still sell
// through their own Stripe Payment Links and live in api/_constants.js.
//
// This file is the one place a card's price, words and pictures are written.
// api/checkout.js prices every order from it, so nothing the browser sends can
// change what a card costs. scripts/build-cards.js turns it into the product
// pages, the shop grid and js/catalog-data.js. Change a card here, then run
//
//   node scripts/build-cards.js
//
// and commit what it writes.

// Prices in cents.
const PRICES = {
  limited: { price: 1000, was: 2300 },
  open:    { price: 600,  was: 1500 },
}

// "Buy 10 unlimited pieces for $50": every full set of this many open-edition
// cards in one order takes the discount off (10 cards $50, 20 cards $100,
// 13 cards $68).
const BUNDLE = { size: 10, discount: 1000 }

// US shipping is charged per order, by how it has to travel. Unlimited cards in
// their plastic slips go as a stamped letter (untracked). Anything rigid, which
// is every limited edition (it comes cased, with a stand) and any case or stand
// add-on, goes as a tracked Ground Advantage package. Any order whose
// merchandise comes to $50 or more after the bundle discount ships free, which
// includes every full bundle of ten.
const SHIPPING = {
  letter: 200, parcel: 700, freeFrom: 5000,
  letterLabel: 'US shipping (letter mail, untracked)',
  parcelLabel: 'US shipping (tracked package)',
  freeLabel: 'Free US shipping',
}

const LIMITED = [
  {
    slug: 'poetry-of-solace', wide: true, title: 'Poetry of Solace', medium: 'From the series “The Lost”',
    quote: 'All suffering has cracks and crevices where life grows new... whether in tribulation or solace, the grand treasure is truth.',
    description: [
      'A solitary figure on a vividly lit path beneath a star-studded sky – a meditation on solitude, resilience, and the way memory can still glow in the dark.',
    ],
    painting: 'assets/images/opt/poetry of solace.webp', zoom: 1.16,
  },
  {
    slug: 'adonis', wide: true, title: 'Adonis', medium: 'Acrylic on Canvas',
    quote: 'A simple, honest look at vulnerability, beauty, and the stories we carry behind our gaze.',
    description: [
      'A stylized face against a field of yellow, blue eyes holding a single tear. A simple, honest look at vulnerability, beauty, and the stories we carry behind our gaze.',
      'Featured in Thought Entropy.',
    ],
    painting: 'assets/images/opt/Adonis.webp', zoom: 1.2,
  },
  {
    slug: 'vanity', title: 'Vanity', medium: 'Acrylic on Canvas, Epoxy Resin',
    quote: 'When I am selective in hearing, I feed the monster only what it wants to hear, instead of being open to opportunities for growth.',
    description: [
      'The difficulties of having relationships that are honest and healthy when I am arrogant or narcissistic.',
      'When I am selective in hearing, I feed the monster only what it wants to hear, instead of being open to opportunities for growth.',
    ],
    original: '24" × 30"', series: 'Self Work',
    painting: 'assets/images/opt/Vanity by JFeelgood.webp',
  },
  {
    slug: 'the-king', title: 'The King', medium: 'Acrylic on Canvas, Epoxy Resin',
    quote: 'In being too bossy or vindictive, I lose sight of purpose and push others away due to uncouth behavior.',
    description: [
      'In being too bossy or vindictive, I lose sight of purpose and push others away due to uncouth behavior.',
    ],
    original: '24" × 28"', series: 'Self Work',
    painting: 'assets/images/opt/The King by JFeelgood.webp',
  },
  {
    slug: 'pride', title: 'Pride', medium: 'Acrylic on Canvas, Epoxy Resin',
    quote: 'Work, no matter the urgency or size, has purpose. If I do not enjoy it, then the effort means nothing and I miss out on life.',
    description: [
      'Work, no matter the urgency or size, has purpose.',
      'If I do not enjoy it, then the effort means nothing and I miss out on life.',
      'Wisdom suggests the importance of a devoted outlook.',
    ],
    original: '24" × 30"', series: 'Self Work',
    painting: 'assets/images/opt/Pride by JFeelgood.webp',
  },
  {
    slug: 'lush', title: 'Lush', medium: 'Acrylic on Canvas, Epoxy Resin',
    quote: 'Without them, I am the blank canvas… open to new ideas, new feelings, a new me.',
    description: [
      'The cycle of bad habits entertained by vices in excess, cleverly disguised as an aide in helping, and their various laborious, taxing, withdrawal periods.',
      'Without them, I am the blank canvas… open to new ideas, new feelings, a new me.',
    ],
    original: '24" × 30"', series: 'Self Work',
    painting: 'assets/images/opt/Lush by JFeelgood.webp',
  },
  {
    slug: 'businessman', title: 'Businessman', medium: 'Acrylic on Canvas, Wood Panel, Epoxy Resin',
    quote: 'Alignment solely with wealth building and material systems keeps my emotional and spiritual growth inhibited.',
    description: [
      'Alignment solely with wealth building and material systems keeps my emotional and spiritual growth inhibited.',
    ],
    original: '30" × 40"', series: 'Self Work',
    painting: 'assets/images/opt/Businessman by JFeelgood.webp',
  },
  {
    slug: 'best-friend', title: 'Best Friend', medium: 'Acrylic on Canvas, Wood Panel, Epoxy Resin',
    quote: 'Vulnerability is the precursor to authenticity. I grow bigger than my fears because I have them.',
    description: [
      'Always there.',
      'In the shadows or in the spotlight. The monster thrives on fear and will put me in positions that make me afraid and vulnerable.',
      'With patience, I face my fears as they present themselves.',
      'Vulnerability is the precursor to authenticity. I grow bigger than my fears because I have them.',
      'What feeds the monster, feeds me.',
    ],
    original: '30" × 40"', series: 'Self Work',
    painting: 'assets/images/opt/Best Friend by JFeelgood.webp',
  },
  {
    slug: 'vicarious', title: 'Vicarious', medium: 'Acrylic, Latex, Torn Canvas, Epoxy Resin',
    quote: 'Living in the throes of imagination, I am aged by experiences of a thousand lifetimes, at the cost of growing closer to real people.',
    description: [
      'Living in the throes of imagination, I am aged by experiences of a thousand lifetimes, at the cost of growing closer to real people.',
    ],
    original: '29.5" × 30.5"', series: 'Self Work',
    // The card was printed before this catalog existed: its images in
    // image/cards/ are the printed front and back, not re-rendered.
    painting: 'assets/images/opt/Vicarious by JFeelgood.webp',
  },
  {
    slug: 'permission', wide: true, title: 'Permission', medium: 'Acrylic on Canvas, Epoxy Resin',
    quote: 'Brilliant and mighty power. Sometimes, I seek it from others long before I consider it coming from myself.',
    description: [
      'Brilliant and mighty power. Sometimes, I seek it from others long before I consider it coming from myself.',
      'The burden of permission is great. Once I permit myself, I am then indebted to that permission.',
      'Without discipline, it is nearly impossible to return to the respect for the weight of what has been permitted.',
      'Familiarity is the greatest weakness of the evolving spirit and I long for it in all of my endeavors. Even in the unknown I find a familiar solace, a mirror of my imagination.',
      'Am I mindful of what my actions are that people consider permission in their lives?',
      'Am I mindful of the permissions I grant myself?',
    ],
    original: '40" × 30"', series: 'Self Work',
    painting: 'assets/images/opt/Permission by JFeelgood.webp',
  },
]

// Archive works with no description on jfeelgood.com: each carries the
// artist's line for it (`quote`, or `description` for a plain caption), and
// the untitled works were named for the cards. `wide` cards are printed landscape, like Veritas; `focus` and `zoom`
// set the crop.
const A = 'assets/images/archives/'
const OPEN = [
  { slug: 'affordable-housing', title: 'Affordable Housing', painting: A + 'full/Affordable Housing.webp', wide: true,
    quote: 'We can all go outside' },
  { slug: 'cornerstones', title: 'Cornerstones', painting: A + 'full/Cornerstones.webp', wide: true,
    quote: 'We often take for granted the most important things' },
  { slug: 'gentrification', title: 'Gentrification', painting: A + 'full/Gentrification.webp', wide: true,
    quote: 'Every change has a price' },
  { slug: 'grecia-monroc', title: 'Grecia Monroc', painting: A + 'full/Grecia Monroc.webp',
    description: ['Portrait of multidisciplinary artist Grecia Monroc.'] },
  { slug: 'ronin', title: 'Ronin', painting: A + 'full/Ronin.webp',
    quote: 'Some would have their spirit share their tale' },
  { slug: 'supernova', title: 'Supernova', painting: A + 'full/Supernova.webp',
    quote: 'We miss the beauty of the universe while lost in our thoughts' },
  { slug: 'reach', title: 'Reach', painting: A + 'full/JFeelgood painting 008.webp',
    quote: 'All adventure has an origin' },
  { slug: 'little-wanderer', title: 'Little Wanderer', painting: A + 'full/JFeelgood painting 077.webp', wide: true,
    quote: 'A good friend is a precious thing' },
  { slug: 'summer-field', title: 'Summer Field', painting: A + 'thumbs/JFeelgood painting 145.webp', wide: true,
    quote: 'You may not be here but I remember where you stood' },
  { slug: 'hidden-grove', title: 'Hidden Grove', painting: A + 'thumbs/JFeelgood painting 150.webp',
    quote: 'Love in the hardest of times' },
  { slug: 'moonsail', title: 'Moonsail', painting: A + 'thumbs/JFeelgood painting 155.webp', zoom: 1.1,
    quote: 'We don\'t always see what carries us.' },
  { slug: 'tidewatcher', title: 'Tidewatcher', painting: A + 'thumbs/JFeelgood painting 160.webp',
    quote: 'Curiosity is the universal language' },
  { slug: 'awakening', title: 'Awakening', painting: A + 'thumbs/JFeelgood painting 163.webp',
    quote: 'Always remember to stretch' },
  { slug: 'gilded-cage', title: 'Gilded Cage', painting: A + 'thumbs/JFeelgood painting 165.webp',
    quote: 'You can build anything but remember you are not bound to it.' },
  { slug: 'le-verbeux', title: 'Le Verbeux', painting: A + 'full/JFeelgood painting 166.webp',
    material: 'Charcoal on Canvas', focus: 'center 88%',
    quote: 'If a picture is worth a thousand words, how much is a dream?' },
]

// Two portrait images carry the open-edition backs; they alternate down the list.
OPEN.forEach((card, i) => { card.back = i % 2 ? 'b' : 'a' })

const CARDS = [
  ...LIMITED.map(c => ({ ...c, kind: 'limited', ...PRICES.limited })),
  ...OPEN.map(c => ({ ...c, kind: 'open', medium: 'Open Edition', ...PRICES.open })),
]
// Sold alongside the cards. Unlimited cards ship in a protective plastic slip;
// limited cards already come with a case and a stand. Each add-on upgrades one
// unlimited card, so an order holds at most one of each per unlimited card.
// Add-ons do not count toward the bundle. `offer` is the product-page checkbox,
// `note` the cart line, `upsell` the cart prompt.
const ADDONS = [
  { slug: 'acrylic-case', title: 'Magnetic Acrylic Case', kind: 'addon', price: 400, was: null,
    offer: 'Add a magnetically sealed acrylic case', note: 'Magnetically sealed, one per unlimited card',
    upsell: 'Upgrade a card from its plastic slip to a magnetically sealed acrylic case', short: 'Acrylic case' },
  { slug: 'acrylic-stand', title: 'Acrylic Stand', kind: 'addon', price: 100, was: null,
    offer: 'Add an acrylic display stand', note: 'Display stand, one per unlimited card',
    upsell: 'Stand a card up on your shelf with an acrylic display stand', short: 'Acrylic stand' },
]
const CASE = ADDONS[0]
const STAND = ADDONS[1]

const BY_SLUG = Object.fromEntries([...CARDS, ...ADDONS].map(c => [c.slug, c]))

const LIMITED_NAMES = Object.fromEntries(LIMITED.map(c => [c.slug, c.title]))

// Prices an order. `items` is [{ slug, qty }] straight from the browser, so
// anything unknown is rejected, a limited card is capped at one per order (the
// webhook reserves one numbered print per design per checkout), and each
// add-on is capped at one per unlimited card.
function quote(items) {
  if (!Array.isArray(items) || !items.length) return { error: 'empty_cart' }
  const lines = []
  const seen = new Set()
  for (const item of items) {
    const card = BY_SLUG[item && item.slug]
    if (!card) return { error: 'unknown_card', slug: item && item.slug }
    if (seen.has(card.slug)) return { error: 'duplicate_card', slug: card.slug }
    seen.add(card.slug)
    const qty = Number(item.qty)
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return { error: 'bad_quantity', slug: card.slug }
    if (card.kind === 'limited' && qty !== 1) return { error: 'one_per_limited', slug: card.slug }
    lines.push({ card, qty, amount: card.price * qty })
  }
  const count = (kind) => lines.filter(l => l.card.kind === kind).reduce((n, l) => n + l.qty, 0)
  const openCount = count('open')
  const extra = lines.find(l => l.card.kind === 'addon' && l.qty > openCount)
  if (extra) return { error: 'too_many_addons', slug: extra.card.slug }
  const bundles = Math.floor(openCount / BUNDLE.size)
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0)
  const discount = bundles * BUNDLE.discount
  const method = count('limited') + count('addon') ? 'parcel' : 'letter'
  const shipping = subtotal - discount >= SHIPPING.freeFrom ? 0 : SHIPPING[method]
  return {
    lines, openCount, bundles, subtotal, discount,
    method, shipping,
    total: subtotal - discount + shipping,
  }
}

module.exports = { CARDS, ADDONS, CASE, STAND, BY_SLUG, LIMITED_NAMES, PRICES, BUNDLE, SHIPPING, quote }
