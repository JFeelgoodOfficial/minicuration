#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const IMAGE_DIR = path.join(__dirname, '..', 'image')
const MAX_BYTES = 500 * 1024 // 500 KB

if (!fs.existsSync(IMAGE_DIR)) {
  console.error('✗ /image/ directory not found')
  process.exit(1)
}

const files = fs.readdirSync(IMAGE_DIR).filter(f => {
  const stat = fs.statSync(path.join(IMAGE_DIR, f))
  return stat.isFile()
})

let totalBytes = 0
const violations = []
const pngWarnings = []

for (const file of files) {
  const filePath = path.join(IMAGE_DIR, file)
  const { size } = fs.statSync(filePath)
  totalBytes += size

  if (size > MAX_BYTES) {
    violations.push({ file, size })
  }

  if (file.toLowerCase().endsWith('.png')) {
    pngWarnings.push(file)
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\nImage Audit Summary')
console.log('===================')
console.log(`Total images : ${files.length}`)
console.log(`Folder size  : ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
console.log(`Limit per img: 500 KB`)

if (pngWarnings.length > 0) {
  console.warn(`\n⚠  PNG files that could be converted to WebP (${pngWarnings.length}):`)
  pngWarnings.forEach(f => console.warn(`   - ${f}`))
}

if (violations.length > 0) {
  console.error(`\n✗  Images exceeding 500 KB (${violations.length}):`)
  violations.forEach(({ file, size }) => {
    const kb = (size / 1024).toFixed(1)
    const over = ((size - MAX_BYTES) / 1024).toFixed(1)
    console.error(`   - ${file}: ${kb} KB  (+${over} KB over limit)`)
  })
  console.error('\nFailed: compress or convert the images listed above.')
  process.exit(1)
}

console.log('\n✓  All images are within the 500 KB limit.')
