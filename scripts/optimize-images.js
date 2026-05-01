/**
 * Phase 5 — Image optimization
 * Generates WebP versions of all JPEGs in /image/
 *
 * Usage:
 *   npm install sharp
 *   node scripts/optimize-images.js
 *
 * Output: image/*.webp alongside existing JPEGs.
 * HTML already uses <picture> with WebP sources where present;
 * browsers fall back to JPEG if the .webp file doesn't exist yet.
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.join(__dirname, '..', 'image');

const jpgs = fs.readdirSync(IMAGE_DIR).filter(f => /\.(jpg|jpeg)$/i.test(f));

(async () => {
  let converted = 0;
  for (const file of jpgs) {
    const src = path.join(IMAGE_DIR, file);
    const dest = path.join(IMAGE_DIR, file.replace(/\.(jpg|jpeg)$/i, '.webp'));

    if (fs.existsSync(dest)) {
      console.log(`skip  ${file} (webp exists)`);
      continue;
    }

    try {
      await sharp(src)
        .webp({ quality: 82, effort: 6 })
        .toFile(dest);
      const srcSize  = fs.statSync(src).size;
      const destSize = fs.statSync(dest).size;
      const saving   = (((srcSize - destSize) / srcSize) * 100).toFixed(1);
      console.log(`ok    ${file} → ${path.basename(dest)}  (${saving}% smaller)`);
      converted++;
    } catch (err) {
      console.error(`fail  ${file}: ${err.message}`);
    }
  }
  console.log(`\nDone. ${converted} of ${jpgs.length} files converted.`);
  if (converted < jpgs.length) {
    console.log('(Skipped files already had a .webp version.)');
  }
})();
