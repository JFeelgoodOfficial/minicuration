'use strict'
// Shared constants, in their own module so api/_store.js can use them without
// requiring api/_lib.js (which requires the store — that would be a cycle).

const PRODUCT_NAMES = {
  'dreamfall':           'Dreamfall',
  'dream-mountain':      'Dream Mountain',
  'sky-miles':           'Sky Miles',
  'a-simple-meditation': 'A Simple Meditation',
  'veritas':             'Veritas',
  'sweet-dreams':        'Sweet Dreams',
}

const EDITION_SIZE = 50

// The values the `status` column in the editions tab accepts. You set these by
// hand in the spreadsheet; only 'available' and 'relisted' count as for sale.
const EDITION_STATUSES = ['available', 'sold', 'gifted', 'relisted']

module.exports = { PRODUCT_NAMES, EDITION_SIZE, EDITION_STATUSES }
