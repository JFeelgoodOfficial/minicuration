'use strict'
// Shared constants, in their own module so api/_store.js can use them without
// requiring api/_lib.js (which requires the store — that would be a cycle).
// api/_lib.js re-exports everything here, so existing imports keep working.

const PRODUCT_NAMES = {
  'dreamfall':           'Dreamfall',
  'dream-mountain':      'Dream Mountain',
  'sky-miles':           'Sky Miles',
  'a-simple-meditation': 'A Simple Meditation',
  'veritas':             'Veritas',
  'sweet-dreams':        'Sweet Dreams',
}

const EDITION_SIZE = 50

// The admin grid's click cycle, in order: each click on a box advances to the
// next status and the last wraps back to available. admin.html keeps its own
// copy (browser JS cannot require CommonJS) — change both together.
const EDITION_STATUSES = ['available', 'sold', 'gifted', 'relisted']

module.exports = { PRODUCT_NAMES, EDITION_SIZE, EDITION_STATUSES }
