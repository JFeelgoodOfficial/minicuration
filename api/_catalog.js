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
  limited: { price: 2300, was: null },
  open:    { price: 600,  was: 1500 },
}

// Every full set of this many open-edition cards in one order takes the
// discount off: 10 cards $50, 20 cards $100, 13 cards $68.
const BUNDLE = { size: 10, discount: 1000 }

// One flat rate per order, the same $9 the Payment Links charge.
const SHIPPING = { amount: 900, label: 'US shipping' }

const LIMITED = [
  {
    slug: 'poetry-of-solace', title: 'Poetry of Solace', medium: 'From the series “The Lost”',
    quote: 'A solitary figure on a vividly lit path beneath a star-studded sky – a meditation on solitude, resilience, and the way memory can still glow in the dark.',
    description: [
      'A solitary figure on a vividly lit path beneath a star-studded sky – a meditation on solitude, resilience, and the way memory can still glow in the dark.',
    ],
    painting: 'assets/images/opt/poetry of solace.webp', zoom: 1.16,
  },
  {
    slug: 'adonis', title: 'Adonis', medium: 'Acrylic on Canvas',
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
    slug: 'permission', title: 'Permission', medium: 'Acrylic on Canvas, Epoxy Resin',
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

// Archive works with no description on jfeelgood.com. The descriptions are
// written from the paintings; the untitled ones were named for the cards.
const A = 'assets/images/archives/'
const OPEN = [
  { slug: 'affordable-housing', title: 'Affordable Housing', painting: A + 'full/Affordable Housing.webp',
    description: ['A small white tent sits alone on a strip of green grass against a flat orange wall. Beside it a white tower is stamped with rows of identical black marks, window after window. Two blocks of color, and the gap between them says the rest.'] },
  { slug: 'cornerstones', title: 'Cornerstones', painting: A + 'full/Cornerstones.webp',
    description: ['A white teddy bear outlined in thick black line sits in the corner where a red wall meets a blue floor. Beside it, a wall outlet looks back with a face of its own. A plain room made strange by who is keeping it company.'] },
  { slug: 'gentrification', title: 'Gentrification', painting: A + 'full/Gentrification.webp',
    description: ['A small figure perches at the very edge of a lavender block, a thin balloon string curling up into a pink sky. Below the ledge there is only a strip of pale water. Quiet colors for a picture about running out of room.'] },
  { slug: 'grecia-monroc', title: 'Grecia Monroc', painting: A + 'full/Grecia Monroc.webp',
    description: ['A portrait of a woman with long black hair, wide blue eyes and bright red lips, glancing up and to the side. A teardrop pendant hangs at her collarbone, and gold filigree curls across the corners of the canvas and her dark dress.'] },
  { slug: 'ronin', title: 'Ronin', painting: A + 'full/Ronin.webp',
    description: ['A standing figure with a simple mask-like face, built up in thick ridges of yellow, red and white paint. Blue streaks fall like rain behind them and green brush marks gather at their feet.'] },
  { slug: 'supernova', title: 'Supernova', painting: A + 'full/Supernova.webp',
    description: ['A canvas cut on a slant, as if seen through an open door: pastel splashes of pink, blue and gold under a row of dripping evergreen trees. In the corner a woman in black crouches at the edge of it all, looking in.'] },
  { slug: 'reach', title: 'Reach', painting: A + 'full/JFeelgood painting 008.webp',
    description: ['A tall, narrow canvas where a pale tree climbs through layers of violet and blue. Green leaves hang from its branches like drips of paint, and the trunk keeps stretching toward the light at the top of the frame.'] },
  { slug: 'little-wanderer', title: 'Little Wanderer', painting: A + 'full/JFeelgood painting 077.webp',
    description: ['A small glittered dog with a turquoise ear sits in the middle of a marbled field of cream, gold and red. It looks off to one side, as though it has wandered a long way and is deciding where to go next.'] },
  { slug: 'portal', title: 'Portal', painting: A + 'full/JFeelgood painting 122.webp',
    description: ['A black circle and a black triangle hang in a textured field of violet, green and cream. Beams of red and green light cross beneath them, and drips of grey paint spread like smoke across the surface.'] },
  { slug: 'summer-field', title: 'Summer Field', painting: A + 'thumbs/JFeelgood painting 145.webp',
    description: ['A green tree stands in an open field under a soft blue sky, with a yellow willow glowing in the distance behind it. Loose, bright strokes give the whole landscape the feel of a warm afternoon.'] },
  { slug: 'eye-of-the-storm', title: 'Eye of the Storm', painting: A + 'thumbs/JFeelgood painting 148.webp',
    description: ['Scratched swirls of black and white wind circle a calm center, where the blue and green earth hangs above a white shape reaching out over the water. The storm spins; the middle holds still.'] },
  { slug: 'hidden-grove', title: 'Hidden Grove', painting: A + 'thumbs/JFeelgood painting 150.webp',
    description: ['A small white tree glows inside a green hollow, buried in thick, craggy layers of silver, red and brown paint. Dark branches reach in from the edge. It feels like finding something alive inside rock.'] },
  { slug: 'moonsail', title: 'Moonsail', painting: A + 'thumbs/JFeelgood painting 155.webp',
    description: ['A tall triangular sail of marbled blue rises from grey-green waves under a white moon. Below the waterline, a pale shape swims past, unnoticed by the boat above it.'] },
  { slug: 'tidewatcher', title: 'Tidewatcher', painting: A + 'thumbs/JFeelgood painting 160.webp',
    description: ['A glittered cat with a turquoise collar and bright blue eyes sits calmly in a swirl of teal and white marbled paint, like a small watcher at the edge of the surf.'] },
  { slug: 'awakening', title: 'Awakening', painting: A + 'thumbs/JFeelgood painting 163.webp',
    description: ['A white figure with arms raised stands inside a dark blue oval, surrounded by rings of white brushwork that spin outward toward the edges. It reads like a first breath, or a door opening.'] },
  { slug: 'gilded-cage', title: 'Gilded Cage', painting: A + 'thumbs/JFeelgood painting 165.webp',
    description: ['A wire birdcage is set into a thick, rippled surface of bronze and sky blue. The door is shut and the cage is empty, and the gold around it is beautiful and heavy at once.'] },
  { slug: 'le-verbeux', title: 'Le Verbeux', painting: A + 'full/JFeelgood painting 166.webp',
    description: ['A pencil portrait of a woman with her eyes closed and her head tipped against her hand, long hair falling past her shoulders. Soft shading and a lot of empty paper keep the moment quiet.'] },
]

// Two portrait images carry the open-edition backs; they alternate down the list.
OPEN.forEach((card, i) => { card.back = i % 2 ? 'b' : 'a' })

const CARDS = [
  ...LIMITED.map(c => ({ ...c, kind: 'limited', ...PRICES.limited })),
  ...OPEN.map(c => ({ ...c, kind: 'open', medium: 'Open Edition', ...PRICES.open })),
]
const BY_SLUG = Object.fromEntries(CARDS.map(c => [c.slug, c]))

const LIMITED_NAMES = Object.fromEntries(LIMITED.map(c => [c.slug, c.title]))

// Prices an order. `items` is [{ slug, qty }] straight from the browser, so
// anything unknown is rejected and a limited card is capped at one per order
// (the webhook reserves one numbered print per design per checkout).
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
  const openCount = lines.filter(l => l.card.kind === 'open').reduce((n, l) => n + l.qty, 0)
  const bundles = Math.floor(openCount / BUNDLE.size)
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0)
  const discount = bundles * BUNDLE.discount
  return {
    lines, openCount, bundles, subtotal, discount,
    shipping: SHIPPING.amount,
    total: subtotal - discount + SHIPPING.amount,
  }
}

module.exports = { CARDS, BY_SLUG, LIMITED_NAMES, PRICES, BUNDLE, SHIPPING, quote }
