'use strict'
// Shared constants, in their own module so api/_store.js can use them without
// requiring api/_lib.js (which requires the store — that would be a cycle).
const { LIMITED_NAMES } = require('./_catalog.js')

// The six original designs, sold through their own Stripe Payment Links.
const ORIGINAL_NAMES = {
  'dreamfall':           'Dreamfall',
  'dream-mountain':      'Dream Mountain',
  'sky-miles':           'Sky Miles',
  'a-simple-meditation': 'A Simple Meditation',
  'veritas':             'Veritas',
  'sweet-dreams':        'Sweet Dreams',
}
const ORIGINAL_SLUGS = Object.keys(ORIGINAL_NAMES)

// Every design with numbered editions in the spreadsheet: the six, plus the
// limited cards sold through the cart (api/_catalog.js). Open-edition cards
// have no inventory and are not here.
const PRODUCT_NAMES = { ...ORIGINAL_NAMES, ...LIMITED_NAMES }

const EDITION_SIZE = 50

// The values the `status` column in the editions tab accepts. You set these by
// hand in the spreadsheet; only 'available' and 'relisted' count as for sale.
const EDITION_STATUSES = ['available', 'sold', 'gifted', 'relisted']

module.exports = { PRODUCT_NAMES, ORIGINAL_SLUGS, EDITION_SIZE, EDITION_STATUSES }
