#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

// Patterns that are now provided by base.css — remove from inline <style>
// Ordered so longer/more-specific patterns come first
const SHARED_PATTERNS = [
  // Reset
  /[ \t]*\*,\s*\*::before,\s*\*::after\s*\{[^}]+\}\n?/g,
  // :root vars (may be multi-line)
  /[ \t]*:root\s*\{[^}]+\}\n?/g,
  // html
  /[ \t]*html\s*\{[^}]+\}\n?/g,
  // body
  /[ \t]*body\s*\{[^}]+\}\n?/g,
  // nav block (may be multi-line; stop before next class)
  /[ \t]*nav\s*\{[^}]+\}\n?/g,
  // .nav-logo
  /[ \t]*\.nav-logo\s*\{[^}]+\}\n?/g,
  // .nav-links (but not .nav-links a or .nav-links a:hover)
  /[ \t]*\.nav-links\s*\{[^}]+\}\n?/g,
  // .nav-links a { ... } — careful not to match .nav-links a:hover
  /[ \t]*\.nav-links\s+a\s*\{[^}]+\}\n?/g,
  // .nav-links a:hover, .nav-links a.active
  /[ \t]*\.nav-links\s+a:hover[^{]*\{[^}]+\}\n?/g,
  // .nav-cta:hover (before .nav-cta so it doesn't get eaten)
  /[ \t]*\.nav-cta:hover\s*\{[^}]+\}\n?/g,
  // .nav-cta
  /[ \t]*\.nav-cta\s*\{[^}]+\}\n?/g,
  // footer
  /[ \t]*footer\s*\{[^}]+\}\n?/g,
  // .footer-logo
  /[ \t]*\.footer-logo\s*\{[^}]+\}\n?/g,
  // .footer-links a:hover (before .footer-links)
  /[ \t]*\.footer-links\s+a:hover\s*\{[^}]+\}\n?/g,
  // .footer-links a
  /[ \t]*\.footer-links\s+a\s*\{[^}]+\}\n?/g,
  // .footer-links
  /[ \t]*\.footer-links\s*\{[^}]+\}\n?/g,
  // .footer-copy
  /[ \t]*\.footer-copy\s*\{[^}]+\}\n?/g,
  // breadcrumb link/span styles (but NOT .breadcrumb { position/padding })
  /[ \t]*\.breadcrumb\s+a:hover\s*\{[^}]+\}\n?/g,
  /[ \t]*\.breadcrumb\s+a\s*\{[^}]+\}\n?/g,
  /[ \t]*\.breadcrumb\s+span\s*\{[^}]+\}\n?/g,
  // @media prefers-reduced-motion block
  /[ \t]*@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^}]+\}\n?/g,
]

// Nav/footer rules to strip from inside @media blocks
const MEDIA_NAV_FOOTER = [
  /\s*nav\s*\{[^}]+\}[ \t]*/g,
  /\s*\.nav-links\s*\{[^}]+\}[ \t]*/g,
  /\s*footer\s*\{[^}]+\}[ \t]*/g,
]

function stripNavFooterFromMedia(mediaBlock) {
  let cleaned = mediaBlock
  for (const re of MEDIA_NAV_FOOTER) {
    cleaned = cleaned.replace(re, '')
  }
  // If only whitespace remains inside the braces, drop the whole @media
  const inner = cleaned.replace(/@media[^{]+\{/, '').replace(/\}\s*$/, '').trim()
  if (!inner) return ''
  return cleaned
}

function processFile(relPath) {
  const filePath = path.join(ROOT, relPath)
  let html = fs.readFileSync(filePath, 'utf8')

  // 1. Remove Google Fonts preconnect + link tags
  html = html.replace(/[ \t]*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"[^>]*\/>\n?/g, '')
  html = html.replace(/[ \t]*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*\/>\n?/g, '')
  html = html.replace(/[ \t]*<link href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet"[^>]*\/?>\n?/g, '')

  // 2. Insert base.css link before <style>
  if (!html.includes('/css/base.css')) {
    html = html.replace(/(\s*)<style>/, '$1<link rel="stylesheet" href="/css/base.css"/>\n$1<style>')
  }

  // 3. Strip shared CSS rules from <style> block
  html = html.replace(/(<style>)([\s\S]*?)(<\/style>)/, (_, open, body, close) => {
    let cleaned = body

    // Apply shared pattern removals
    for (const re of SHARED_PATTERNS) {
      cleaned = cleaned.replace(re, '')
    }

    // Handle @media blocks: strip nav/footer from inside them
    cleaned = cleaned.replace(/@media\s*\([^)]+\)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, (mediaBlock) => {
      return stripNavFooterFromMedia(mediaBlock)
    })

    // Clean up excess blank lines (max 1 consecutive blank line)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

    return open + cleaned + close
  })

  fs.writeFileSync(filePath, html, 'utf8')
  console.log(`✓  ${relPath}`)
}

const targets = [
  'index.html',
  'about.html',
  'journal.html',
  'journal/what-is-aceo.html',
  'journal/how-paintings-become-prints.html',
  'journal/how-to-collect-aceo.html',
  '404.html',
  'policies.html',
  'artists/jfeelgood.html',
  'artists/index.html',
]

for (const f of targets) {
  processFile(f)
}

console.log('\nDone. Verify the output visually and with npm run audit:seo.')
