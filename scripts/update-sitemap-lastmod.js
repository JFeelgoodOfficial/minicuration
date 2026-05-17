#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const sitemapPath = path.join(ROOT, 'sitemap.xml')

// Map each sitemap URL to the file it corresponds to
const urlToFile = {
  'https://minicuration.com/': 'index.html',
  'https://minicuration.com/shop.html': 'shop.html',
  'https://minicuration.com/about.html': 'about.html',
  'https://minicuration.com/artists/index.html': 'artists/index.html',
  'https://minicuration.com/artists/jfeelgood.html': 'artists/jfeelgood.html',
  'https://minicuration.com/policies.html': 'policies.html',
  'https://minicuration.com/journal.html': 'journal.html',
  'https://minicuration.com/journal/what-is-aceo.html': 'journal/what-is-aceo.html',
  'https://minicuration.com/journal/how-paintings-become-prints.html': 'journal/how-paintings-become-prints.html',
  'https://minicuration.com/journal/how-to-collect-aceo.html': 'journal/how-to-collect-aceo.html',
  'https://minicuration.com/shop/dreamfall.html': 'shop/dreamfall.html',
  'https://minicuration.com/shop/dream-mountain.html': 'shop/dream-mountain.html',
  'https://minicuration.com/shop/sky-miles.html': 'shop/sky-miles.html',
  'https://minicuration.com/shop/a-simple-meditation.html': 'shop/a-simple-meditation.html',
  'https://minicuration.com/shop/veritas.html': 'shop/veritas.html',
  'https://minicuration.com/shop/sweet-dreams.html': 'shop/sweet-dreams.html',
}

function toISODate(mtime) {
  return mtime.toISOString().slice(0, 10)
}

let xml = fs.readFileSync(sitemapPath, 'utf8')
let updatedCount = 0

for (const [url, relPath] of Object.entries(urlToFile)) {
  const filePath = path.join(ROOT, relPath)
  if (!fs.existsSync(filePath)) continue

  const mtime = fs.statSync(filePath).mtime
  const newDate = toISODate(mtime)

  // Replace the <lastmod> immediately following this <loc>
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(<loc>${escaped}</loc>[^]*?<lastmod>)([0-9-]+)(</lastmod>)`)
  const updated = xml.replace(re, (_, pre, _old, post) => {
    updatedCount++
    return `${pre}${newDate}${post}`
  })
  xml = updated
}

fs.writeFileSync(sitemapPath, xml, 'utf8')
console.log(`sitemap.xml: updated ${updatedCount} lastmod date(s) from file mtimes.`)
