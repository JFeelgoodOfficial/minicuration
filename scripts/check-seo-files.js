#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
let failed = false

function fail(msg) {
  console.error(`✗  ${msg}`)
  failed = true
}

function ok(msg) {
  console.log(`✓  ${msg}`)
}

// ── 1. sitemap.xml ───────────────────────────────────────────────────────────
const sitemapPath = path.join(ROOT, 'sitemap.xml')
if (!fs.existsSync(sitemapPath)) {
  fail('sitemap.xml not found at repo root')
} else {
  ok('sitemap.xml exists')
}

// ── 2. robots.txt ────────────────────────────────────────────────────────────
const robotsPath = path.join(ROOT, 'robots.txt')
if (!fs.existsSync(robotsPath)) {
  fail('robots.txt not found at repo root')
} else {
  ok('robots.txt exists')
}

// ── 3. Every shop page has a <loc> in sitemap.xml ────────────────────────────
const shopDir = path.join(ROOT, 'shop')
if (!fs.existsSync(shopDir)) {
  fail('/shop/ directory not found')
  process.exit(1)
}

const shopPages = fs
  .readdirSync(shopDir)
  .filter(f => f.endsWith('.html'))
  .sort()

if (shopPages.length === 0) {
  fail('No .html files found in /shop/')
  process.exit(1)
}

console.log(`\nChecking ${shopPages.length} shop pages against sitemap.xml…`)

let sitemapContent = ''
if (fs.existsSync(sitemapPath)) {
  sitemapContent = fs.readFileSync(sitemapPath, 'utf8')
}

const missing = []
for (const file of shopPages) {
  const expectedUrl = `https://minicuration.com/shop/${file}`
  if (!sitemapContent.includes(expectedUrl)) {
    missing.push(expectedUrl)
  }
}

if (missing.length > 0) {
  fail(`${missing.length} shop page(s) missing from sitemap.xml:`)
  missing.forEach(url => console.error(`     ${url}`))
} else {
  ok(`All ${shopPages.length} shop pages have <loc> entries in sitemap.xml`)
}

// ── 4. robots.txt references the sitemap ─────────────────────────────────────
if (fs.existsSync(robotsPath)) {
  const robotsContent = fs.readFileSync(robotsPath, 'utf8')
  if (!robotsContent.includes('Sitemap:')) {
    console.warn('⚠  robots.txt does not contain a Sitemap: directive')
  } else {
    ok('robots.txt contains a Sitemap: directive')
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
console.log('')
if (failed) {
  console.error('SEO files check FAILED — fix the issues above.')
  process.exit(1)
}
console.log('SEO files check passed.')
