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

// "Buy 10 unlimited pieces for $50": every full set of this many open-edition
// cards in one order takes the discount off (10 cards $50, 20 cards $100,
// 13 cards $68), and any order holding a full set ships free.
const BUNDLE = { size: 10, discount: 1000 }

// One flat rate per order, the same $9 the Payment Links charge; free with a bundle.
const SHIPPING = { amount: 900, label: 'US shipping', freeLabel: 'Free US shipping' }

const LIMITED = [
  {
    slug: 'poetry-of-solace', wide: true, title: 'Poetry of Solace', medium: 'From the series “The Lost”',
    quote: 'A solitary figure on a vividly lit path beneath a star-studded sky – a meditation on solitude, resilience, and the way memory can still glow in the dark.',
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

// Archive works with no description on jfeelgood.com: the quotes and artist
// notes were written for the cards, and the untitled works were named for
// them. `wide` cards are printed landscape, like Veritas; `focus` and `zoom`
// set the crop.
const A = 'assets/images/archives/'
const OPEN = [
  { slug: 'affordable-housing', title: 'Affordable Housing', painting: A + 'full/Affordable Housing.webp', wide: true,
    quote: 'A roof is a promise. Some of us live in the fine print.',
    description: [
      'The tent is small, and for tonight it is enough.',
      'Beside it the tower climbs in rows of the same mark, window after window, a thousand doors that were never built to open for the one outside.',
      'I painted the grass as green as I could. The ground belongs to whoever is standing on it.',
    ] },
  { slug: 'cornerstones', title: 'Cornerstones', painting: A + 'full/Cornerstones.webp', wide: true,
    quote: 'Every house is built on the things we were told to sit quietly with.',
    description: [
      'A child\'s bear waits where two walls meet, the place you were sent to think about what you did.',
      'The outlet watches with its small, startled face.',
      'The corners of a room hold our first lessons: comfort and danger, an arm\'s length apart.',
    ] },
  { slug: 'gentrification', title: 'Gentrification', painting: A + 'full/Gentrification.webp', wide: true,
    quote: 'They raised the floor and called it progress. I held on to the string.',
    description: [
      'The block kept growing until the only place left to stand was the edge.',
      'Below there is only water.',
      'The balloon is what I carried out of the old neighborhood: light enough to take with me, too light to hold me up.',
    ] },
  { slug: 'grecia-monroc', title: 'Grecia Monroc', painting: A + 'full/Grecia Monroc.webp',
    quote: 'She wears her sorrow like jewelry: small, polished, close to the heart.',
    description: [
      'Her eyes are fixed somewhere above the frame, on something she was promised.',
      'Gold curls at the corners like the edge of an old invitation.',
      'Grace, sometimes, is only the practice of looking up.',
    ] },
  { slug: 'ronin', title: 'Ronin', painting: A + 'full/Ronin.webp',
    quote: 'A warrior without a master still keeps the code.',
    description: [
      'No lord, no banner. Only the rain, and paint piled on like armor.',
      'The face gives nothing away. The colors give everything away.',
      'Wandering is its own kind of loyalty.',
    ] },
  { slug: 'supernova', title: 'Supernova', painting: A + 'full/Supernova.webp',
    quote: 'A star is never brighter than the moment it lets go.',
    description: [
      'She kneels at the doorway of a world still bursting into color, trees dripping like candles, the ground blooming pink and gold.',
      'Everything beautiful in the room is in the middle of coming apart.',
      'She doesn\'t step in. She stays and watches it shine.',
    ] },
  { slug: 'reach', title: 'Reach', painting: A + 'full/JFeelgood painting 008.webp',
    quote: 'Growth is only reaching, repeated.',
    description: [
      'The canvas is tall and narrow as a hallway, and the tree doesn\'t know how high the ceiling goes.',
      'It keeps climbing through the violet, leaving a little green behind on every branch.',
      'That is what trying looks like from the outside.',
    ] },
  { slug: 'little-wanderer', title: 'Little Wanderer', painting: A + 'full/JFeelgood painting 077.webp', wide: true,
    quote: 'Every wanderer is loyal to something just past the horizon.',
    description: [
      'A small dog far from home, sparkling on a field that moves like weather.',
      'He isn\'t lost. He\'s listening.',
      'Home, for some of us, is simply the direction we\'re facing.',
    ] },
  { slug: 'portal', title: 'Portal', painting: A + 'full/JFeelgood painting 122.webp',
    quote: 'Every door I\'ve walked through was a shape I didn\'t understand yet.',
    description: [
      'A circle and a triangle float in the fog: two openings, two kinds of dark.',
      'Light crosses beneath them like a decision being made.',
      'Some doors are round and patient. Some come to a point.',
    ] },
  { slug: 'summer-field', title: 'Summer Field', painting: A + 'thumbs/JFeelgood painting 145.webp', wide: true,
    quote: 'Some memories are only a tree, a field, and a warmth I didn\'t know to keep.',
    description: [
      'The green tree stands here and now. The willow glows behind it like something remembered rather than seen.',
      'Summer does that. It paints the present and the past into the same afternoon.',
    ] },
  { slug: 'eye-of-the-storm', title: 'Eye of the Storm', painting: A + 'thumbs/JFeelgood painting 148.webp',
    quote: 'Peace isn\'t the absence of the storm. It\'s the center of it.',
    description: [
      'The wind is scratched in black and white, around and around.',
      'In the middle the world sits blue and green and quiet, and something reaches across the water toward it.',
      'The calm was always there. I only had to stop spinning to see it.',
    ] },
  { slug: 'hidden-grove', title: 'Hidden Grove', painting: A + 'thumbs/JFeelgood painting 150.webp',
    quote: 'Keep something growing where no one thinks to look.',
    description: [
      'The paint is heaped like stone: rust, silver and ash.',
      'Deep inside, a small white tree glows in its own clearing while dark branches reach in from the outside.',
      'What we protect most, we bury deepest.',
    ] },
  { slug: 'moonsail', title: 'Moonsail', painting: A + 'thumbs/JFeelgood painting 155.webp', zoom: 1.1,
    quote: 'What carries us is not always what we see.',
    description: [
      'The sail catches the moonlight and gets all the credit.',
      'Underneath, something larger moves through the dark water, unnoticed, keeping pace.',
      'Every crossing has its hidden companion.',
    ] },
  { slug: 'tidewatcher', title: 'Tidewatcher', painting: A + 'thumbs/JFeelgood painting 160.webp',
    quote: 'Stay still long enough and the tide comes to you.',
    description: [
      'Everything around her is motion, the sea folding over itself in marbled turns.',
      'She sits, collar bright, eyes bright, and waits.',
      'Patience isn\'t doing nothing. It\'s watching the ocean make up its mind.',
    ] },
  { slug: 'awakening', title: 'Awakening', painting: A + 'thumbs/JFeelgood painting 163.webp',
    quote: 'Waking up was the loudest quiet thing I ever did.',
    description: [
      'The rings spin outward like a held breath finally let go.',
      'At the center, a figure opens her arms inside the dark she has just come through.',
      'Every awakening looks like this from the inside: light at the edges, and the nerve to stand up in the middle of it.',
    ] },
  { slug: 'gilded-cage', title: 'Gilded Cage', painting: A + 'thumbs/JFeelgood painting 165.webp',
    quote: 'The bars were beautiful, so I stayed.',
    description: [
      'The cage is set into gold, and the gold is set into the sky.',
      'The door is shut and the cage is empty. Either the bird escaped, or it was never there.',
      'Comfort can be the most convincing lock.',
    ] },
  { slug: 'le-verbeux', title: 'Le Verbeux', painting: A + 'full/JFeelgood painting 166.webp',
    material: 'Charcoal on Canvas', focus: 'center 88%',
    quote: 'She hasn\'t said a word, and she has already told you everything.',
    description: [
      'Le Verbeux: the wordy one.',
      'Eyes closed, head resting on her hand, nothing but charcoal and bare canvas. She is the quietest thing I have drawn.',
      'A picture is worth a thousand words. This one uses every one of them.',
    ] },
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
    shipping: bundles ? 0 : SHIPPING.amount,
    total: subtotal - discount + (bundles ? 0 : SHIPPING.amount),
  }
}

module.exports = { CARDS, BY_SLUG, LIMITED_NAMES, PRICES, BUNDLE, SHIPPING, quote }
